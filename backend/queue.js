const express = require('express');
const { Q, dbGet, dbRun, getEnrichedQueue, getTokenStatus } = require('./db');

module.exports = function (io) {
  const router = express.Router();

  // GET /api/queue/stats/overview  — must be before /:doctorId
  router.get('/stats/overview', (req, res) => {
    const stats   = Q.getStats();
    const doctors = Q.getAllDoctors();
    res.json({ success: true, data: { stats, doctors } });
  });

  // POST /api/queue/reassign
  router.post('/reassign', (req, res) => {
    const { appointment_id, new_doctor_id } = req.body;
    const appt = Q.getAppointmentById(appointment_id);
    if (!appt) return res.status(404).json({ success: false, error: 'Appointment not found' });

    const newDoc = Q.getDoctorById(new_doctor_id);
    if (!newDoc) return res.status(404).json({ success: false, error: 'New doctor not found' });

    const newPos = Q.getMaxPosition(new_doctor_id) + 1;
    dbRun(`UPDATE appointments SET doctor_id = ?, queue_position = ?, status = 'booked' WHERE id = ?`,
      [new_doctor_id, newPos, appointment_id]);
    Q.logEvent(appointment_id, `reassigned to Dr. ${newDoc.name}`);

    io.to(`queue_${appt.doctor_id}`).emit('queue_update', getEnrichedQueue(appt.doctor_id));
    io.to(`queue_${new_doctor_id}`).emit('queue_update', getEnrichedQueue(new_doctor_id));
    io.emit('stats_update');

    res.json({ success: true, message: `Reassigned to Dr. ${newDoc.name}` });
  });

  // GET /api/queue/:doctorId
  router.get('/:doctorId', (req, res) => {
    res.json({ success: true, data: getEnrichedQueue(req.params.doctorId) });
  });

  // POST /api/queue/:doctorId/arrive
  router.post('/:doctorId/arrive', (req, res) => {
    const { token } = req.body;
    const appt = Q.getAppointmentByToken(token?.toUpperCase());
    if (!appt)               return res.status(404).json({ success: false, error: 'Token not found' });
    if (appt.status !== 'booked')
      return res.status(400).json({ success: false, error: `Status is already '${appt.status}'` });

    Q.moveToWaiting(appt.id);
    Q.logEvent(appt.id, 'arrived');

    const updatedQueue = getEnrichedQueue(appt.doctor_id);
    io.to(`queue_${appt.doctor_id}`).emit('queue_update', updatedQueue);

    const tokenStatus = getTokenStatus(token.toUpperCase());
    io.to(`token_${token.toUpperCase()}`).emit('token_update', tokenStatus);

    res.json({ success: true, data: tokenStatus });
  });

  // POST /api/queue/:doctorId/call-next
  router.post('/:doctorId/call-next', (req, res) => {
    const { doctorId } = req.params;

    const inConsult = Q.getCurrentInConsultation(doctorId);
    if (inConsult)
      return res.status(400).json({ success: false, error: 'A patient is still in consultation. Mark them done first.', current: inConsult });

    const next = Q.getNextWaiting(doctorId) || Q.getNextBooked(doctorId);
    if (!next)
      return res.status(404).json({ success: false, error: 'No patients in queue' });

    Q.markInConsultation(next.id);
    Q.logEvent(next.id, 'called');

    const updatedQueue = getEnrichedQueue(doctorId);
    io.to(`queue_${doctorId}`).emit('queue_update', updatedQueue);
    io.to(`queue_${doctorId}`).emit('patient_called', { token: next.token, name: next.patient_name });

    // Notify the called patient
    io.to(`token_${next.token}`).emit('token_update', {
      ...next,
      status: 'in_consultation',
      message: "It's your turn! Please proceed to the doctor's room.",
    });

    // Alert the next-in-line
    if (updatedQueue.length > 0) {
      const nextUp = updatedQueue[0];
      io.to(`token_${nextUp.token}`).emit('token_update', {
        ...nextUp,
        alert: 'You are next! Please be ready at the waiting area.',
      });
    }

    res.json({ success: true, data: { called: next, updated_queue: updatedQueue } });
  });

  // POST /api/queue/:doctorId/done
  router.post('/:doctorId/done', (req, res) => {
    const { doctorId } = req.params;
    const current = Q.getCurrentInConsultation(doctorId);
    if (!current)
      return res.status(404).json({ success: false, error: 'No patient currently in consultation' });

    Q.markDone(current.id);
    Q.logEvent(current.id, 'done');

    io.to(`token_${current.token}`).emit('token_update', {
      ...current,
      status: 'done',
      message: 'Consultation complete. Thank you for visiting!',
    });

    const updatedQueue = getEnrichedQueue(doctorId);
    io.to(`queue_${doctorId}`).emit('queue_update', updatedQueue);

    // Update wait-time estimates for everyone still in queue
    updatedQueue.forEach(appt => {
      const ts = getTokenStatus(appt.token);
      if (ts) io.to(`token_${appt.token}`).emit('token_update', ts);
    });

    io.emit('stats_update');
    res.json({ success: true, data: { done: current, updated_queue: updatedQueue } });
  });

  return router;
};
