const express = require('express');
const { Q, getEnrichedQueue, getTokenStatus } = require('./db');

module.exports = function (io) {
  const router = express.Router();

  // POST /api/appointments — book
  router.post('/', (req, res) => {
    const { patient_name, patient_phone, doctor_id, appt_date, time_slot, reason } = req.body;
    if (!patient_name || !patient_phone || !doctor_id || !appt_date || !time_slot)
      return res.status(400).json({ success: false, error: 'Missing required fields' });

    const todayStr = new Date().toISOString().split('T')[0];
    if (appt_date < todayStr) {
      return res.status(400).json({ success: false, error: 'Cannot book appointments in the past' });
    }
    if (appt_date === todayStr) {
      const parts = time_slot.split(' ');
      if (parts.length === 2) {
        let [h, m] = parts[0].split(':').map(Number);
        if (parts[1] === 'PM' && h !== 12) h += 12;
        if (parts[1] === 'AM' && h === 12) h = 0;
        const slotDate = new Date();
        slotDate.setHours(h, m, 0, 0);
        if (new Date() > slotDate) {
          return res.status(400).json({ success: false, error: 'This time slot has already passed today' });
        }
      }
    }

    const doctor = Q.getDoctorById(doctor_id);
    if (!doctor) return res.status(404).json({ success: false, error: 'Doctor not found' });

    if (Q.getSlotConflict(doctor_id, appt_date, time_slot))
      return res.status(409).json({ success: false, error: 'This slot is already booked' });

    // Generate unique token: find highest existing number for this prefix
    const prefix = doctor.department.substring(0, 3).toUpperCase();
    const { dbGet } = require('./db');
    const existing = dbGet(
      `SELECT MAX(CAST(SUBSTR(token, INSTR(token,'-')+1) AS INTEGER)) as max_num
       FROM appointments WHERE token LIKE ?`,
      [`${prefix}-%`]
    );
    const nextNum = (existing?.max_num || 0) + 1;
    const token = `${prefix}-${String(nextNum).padStart(3, '0')}`;

    const queue_position = Q.getMaxPosition(doctor_id) + 1;

    try {
      const result = Q.createAppointment({
        $patient_name:  patient_name,
        $patient_phone: patient_phone,
        $doctor_id:     parseInt(doctor_id),
        $appt_date:     appt_date,
        $time_slot:     time_slot,
        $token:         token,
        $queue_position: queue_position,
        $reason:        reason || 'General consultation',
      });

      Q.logEvent(result.lastInsertRowid, 'booked');

      io.to(`queue_${doctor_id}`).emit('queue_update', getEnrichedQueue(doctor_id));
      io.emit('stats_update');

      const newAppt = Q.getAppointmentByToken(token);
      res.status(201).json({ success: true, data: newAppt });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, error: 'Booking failed: ' + err.message });
    }
  });

  // GET /api/appointments/token/:token
  router.get('/token/:token', (req, res) => {
    const status = getTokenStatus(req.params.token.toUpperCase());
    if (!status) return res.status(404).json({ success: false, error: 'Token not found' });
    res.json({ success: true, data: status });
  });

  // GET /api/appointments/phone/:phone
  router.get('/phone/:phone', (req, res) => {
    const appt = Q.getAppointmentByPhone(req.params.phone);
    if (!appt) return res.status(404).json({ success: false, error: 'No appointment found today' });
    res.json({ success: true, data: getTokenStatus(appt.token) });
  });

  // GET /api/appointments/doctor/:id — full day list
  router.get('/doctor/:id', (req, res) => {
    res.json({ success: true, data: Q.getFullDayForDoctor(req.params.id) });
  });

  // PATCH /api/appointments/:id/cancel
  router.patch('/:id/cancel', (req, res) => {
    const appt = Q.getAppointmentById(req.params.id);
    if (!appt) return res.status(404).json({ success: false, error: 'Not found' });
    Q.updateStatus('cancelled', req.params.id);
    Q.logEvent(req.params.id, 'cancelled');
    io.to(`queue_${appt.doctor_id}`).emit('queue_update', getEnrichedQueue(appt.doctor_id));
    io.emit('stats_update');
    res.json({ success: true });
  });

  return router;
};
