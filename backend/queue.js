const express = require('express');
const { Q, dbGet, dbRun, dbAll, getEnrichedQueue, getTokenStatus } = require('./db');
const { requireRole } = require('./auth');

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
    const queue = getEnrichedQueue(req.params.doctorId).map(a => {
      if (a.patient_id) {
        const p = Q.getPatientById(a.patient_id);
        if (p) return { ...a, mrn: p.mrn, patient_blood_group: p.blood_group, patient_allergies: p.allergies };
      }
      return a;
    });
    res.json({ success: true, data: queue });
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

  // POST /api/queue/:doctorId/no-show  — mark next waiting/booked patient as missed
  router.post('/:doctorId/no-show', requireRole(['doctor', 'admin']), (req, res) => {
    const { doctorId } = req.params;
    const { appointment_id } = req.body || {};

    let target = appointment_id
      ? Q.getAppointmentById(appointment_id)
      : (Q.getNextWaiting(doctorId) || Q.getNextBooked(doctorId));
    if (!target || target.doctor_id !== parseInt(doctorId))
      return res.status(404).json({ success: false, error: 'No matching patient found' });
    if (!['booked', 'waiting', 'arrived'].includes(target.status))
      return res.status(400).json({ success: false, error: `Cannot no-show a ${target.status} appointment` });

    Q.updateStatus('no_show', target.id);
    Q.logEvent(target.id, 'marked no-show');
    if (target.patient_id) {
      const p = Q.getPatientById(target.patient_id);
      if (p && p.user_id) Q.createNotification(p.user_id, 'Marked as no-show',
        `Appointment ${target.token} was marked as missed. Contact the hospital to rebook.`, 'warning');
    }
    io.to(`queue_${doctorId}`).emit('queue_update', getEnrichedQueue(doctorId));
    io.emit('stats_update');
    res.json({ success: true, data: { no_show: target } });
  });

  // GET /api/queue/consultation-context/:appointmentId — patient history for the doctor
  router.get('/consultation-context/:appointmentId', (req, res) => {
    const appt = Q.getAppointmentById(req.params.appointmentId);
    if (!appt) return res.status(404).json({ success: false, error: 'Appointment not found' });

    let patient = null;
    if (appt.patient_id) {
      patient = Q.getPatientById(appt.patient_id);
    } else {
      patient = Q.getPatientByPhone(String(appt.patient_phone || '').replace(/\D/g, ''));
    }
    if (!patient) return res.json({ success: true, data: { patient: null, consultations: [] } });

    const consultations = Q.getConsultationsByPatient(patient.id).slice(0, 5).map(c => ({
      ...c,
      vitals: Q.getVitalsByConsultation(c.id),
      prescriptions: Q.getPrescriptionsByConsultation(c.id),
    }));
    res.json({ success: true, data: { patient, consultations } });
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

    // Ensure a persistent patient record exists for every consultation patient
    if (!next.patient_id) {
      const digits = String(next.patient_phone || '').replace(/\D/g, '');
      let p = Q.getPatientByPhone(digits);
      if (!p) {
        const { nextMrn } = require('./db');
        const created = Q.createPatient({
          $mrn: nextMrn(), $user_id: null, $full_name: next.patient_name, $dob: null, $gender: null,
          $phone: digits, $email: null, $address: null, $emergency_contact: null, $blood_group: null,
          $allergies: null, $chronic_conditions: null, $past_surgeries: null,
          $current_medications: null, $insurance_provider: null, $insurance_number: null,
        });
        p = Q.getPatientById(created.lastInsertRowid);
      }
      dbRun(`UPDATE appointments SET patient_id = ? WHERE id = ?`, [p.id, next.id]);
    }

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

  // POST /api/queue/:doctorId/bill  — generate bill for the completed consultation
  router.post('/:doctorId/bill', (req, res) => {
    const { appointment_id } = req.body || {};
    const appt = appointment_id ? Q.getAppointmentById(appointment_id) : Q.getCurrentInConsultation(doctorId);
    if (!appt) return res.status(404).json({ success: false, error: 'Appointment not found' });
    if (!appt.patient_id)
      return res.status(400).json({ success: false, error: 'Appointment is not linked to a patient record' });
    if (Q.getBillByAppointment(appt.id))
      return res.status(409).json({ success: false, error: 'Bill already generated for this appointment' });

    const doctor = Q.getDoctorById(appt.doctor_id);
    const tests = dbAll(`SELECT price FROM lab_tests WHERE appointment_id = ? AND status != 'CANCELLED'`, [appt.id]);
    const testCharges = tests.reduce((s, t) => s + (t.price || 0), 0);
    const consultFee = doctor?.fee || 500;
    const total = consultFee + testCharges;

    const bill = Q.createBill({
      $bill_number: `BILL-${String(appt.id).padStart(5, '0')}`,
      $patient_id: appt.patient_id,
      $appointment_id: appt.id,
      $consultation_charge: consultFee,
      $test_charges: testCharges,
      $other_charges: 0,
      $description: `Consultation with Dr. ${doctor?.name || ''} (${doctor?.department || ''})`,
      $total_amount: total,
      $status: 'PENDING',
    });
    if (appt.patient_id) {
      const p = Q.getPatientById(appt.patient_id);
      if (p && p.user_id) Q.createNotification(p.user_id, 'New bill generated',
        `₹${total} due for visit ${appt.token}.`, 'info');
    }
    io.emit('stats_update');
    res.status(201).json({ success: true, data: Q.getBillById(bill.lastInsertRowid) });
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
