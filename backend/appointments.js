const express = require('express');
const { Q, dbGet, dbRun, nextMrn, getEnrichedQueue, getTokenStatus } = require('./db');
const { requireAuth } = require('./auth');

module.exports = function (io) {
  const router = express.Router();

  const addMinutes = (date, mins) => new Date(date.getTime() + mins * 60000);

  const parseSlotToDate = (apptDate, timeSlot) => {
    const d = new Date(`${apptDate}T00:00:00`);
    const parts = String(timeSlot).split(' ');
    if (parts.length === 2) {
      let [h, m] = parts[0].split(':').map(Number);
      if (parts[1] === 'PM' && h !== 12) h += 12;
      if (parts[1] === 'AM' && h === 12) h = 0;
      d.setHours(h, m, 0, 0);
    }
    return d;
  };

  /** Book for a registered patient (with server-side duplicate-slot validation). */
  const bookForPatient = (patient, doctorId, apptDate, timeSlot, reason) => {
    const doctor = Q.getDoctorById(doctorId);
    if (!doctor) return { error: 'Doctor not found', code: 404 };
    if (!doctor.is_available) return { error: 'Doctor is currently unavailable', code: 409 };
    if (!doctor.consult_days || doctor.consult_days.split(',').includes(String(new Date(apptDate).getDay()))) {
      // consult_days null = every day
    } else {
      return { error: 'Doctor does not consult on this day', code: 409 };
    }
    if (Q.getSlotConflict(doctorId, apptDate, timeSlot))
      return { error: 'This slot is already booked', code: 409 };

    const prefix = doctor.department.substring(0, 3).toUpperCase();
    const existing = dbGet(
      `SELECT MAX(CAST(SUBSTR(token, INSTR(token,'-')+1) AS INTEGER)) as max_num
       FROM appointments WHERE token LIKE ?`,
      [`${prefix}-%`]
    );
    const nextNum = (existing?.max_num || 0) + 1;
    const token = `${prefix}-${String(nextNum).padStart(3, '0')}`;
    const queue_position = Q.getMaxPosition(doctorId) + 1;

    const result = Q.createAppointment({
      $patient_name:  patient.full_name,
      $patient_phone: patient.phone,
      $doctor_id:     doctorId,
      $appt_date:     apptDate,
      $time_slot:     timeSlot,
      $token:         token,
      $queue_position: queue_position,
      $reason:        reason || 'General consultation',
    });
    const apptId = result.lastInsertRowid;
    if (patient.id) dbRun(`UPDATE appointments SET patient_id = ? WHERE id = ?`, [patient.id, apptId]);
    Q.logEvent(apptId, 'booked');
    return { apptId, token, doctor };
  };

  const notifyUserByPatient = (patientId, title, message, type) => {
    const p = Q.getPatientById(patientId);
    if (p && p.user_id) Q.createNotification(p.user_id, title, message, type || 'info');
  };

  const emitQueueEvents = (doctorId) => {
    io.to(`queue_${doctorId}`).emit('queue_update', getEnrichedQueue(doctorId));
    io.emit('stats_update');
  };

  // POST /api/appointments — book (accepts legacy guest fields, patient_id, or linked session)
  router.post('/', (req, res) => {
    const { patient_name, patient_phone, patient_id, doctor_id, appt_date, time_slot, reason } = req.body;

    let patient = null;
    if (patient_id) patient = Q.getPatientById(patient_id);
    if (!patient && patient_phone && patient_name) {
      // Legacy guest booking — auto-create a patient record so history persists.
      patient = Q.getPatientByPhone(String(patient_phone).replace(/\D/g, ''));
      if (!patient) {
        const created = Q.createPatient({
          $mrn: nextMrn(),
          $user_id: null,
          $full_name: patient_name,
          $dob: null, $gender: null,
          $phone: String(patient_phone).replace(/\D/g, ''),
          $email: null, $address: null, $emergency_contact: null, $blood_group: null,
          $allergies: null, $chronic_conditions: null, $past_surgeries: null,
          $current_medications: null, $insurance_provider: null, $insurance_number: null,
        });
        patient = Q.getPatientById(created.lastInsertRowid);
      }
    }
    if (!patient && req.session) {
      patient = (req.session.linked_id && Q.getPatientById(req.session.linked_id))
        || Q.getPatientByUserId(req.session.user_id) || null;
    }

    let name, phone;
    if (patient) { name = patient.full_name; phone = patient.phone; }
    else {
      name = patient_name; phone = patient_phone;
      if (!name || !phone)
        return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    if (!doctor_id || !appt_date || !time_slot)
      return res.status(400).json({ success: false, error: 'Missing required fields' });

    const todayStr = new Date().toISOString().split('T')[0];
    if (appt_date < todayStr) {
      return res.status(400).json({ success: false, error: 'Cannot book appointments in the past' });
    }
    if (appt_date === todayStr) {
      const slotDate = parseSlotToDate(appt_date, time_slot);
      if (new Date() > slotDate) {
        return res.status(400).json({ success: false, error: 'This time slot has already passed today' });
      }
    }

    try {
      const outcome = bookForPatient(
        patient || { full_name: name, phone: String(phone).replace(/\D/g, '') },
        parseInt(doctor_id), appt_date, time_slot, reason
      );
      if (outcome.error) return res.status(outcome.code).json({ success: false, error: outcome.error });

      if (patient && patient.user_id) {
        Q.createNotification(patient.user_id, 'Appointment booked',
          `Token ${outcome.token} with Dr. ${outcome.doctor.name} on ${appt_date} at ${time_slot}.`, 'success');
      }
      emitQueueEvents(outcome.doctor.id);

      const newAppt = Q.getAppointmentByToken(outcome.token);
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

  // GET /api/appointments/patient/:patientId — persistent appointment history
  router.get('/patient/:patientId', requireAuth, (req, res) => {
    const pid = parseInt(req.params.patientId);
    if (req.session.role === 'patient' && req.session.linked_id !== pid)
      return res.status(403).json({ success: false, error: 'Forbidden' });
    res.json({ success: true, data: Q.getHistoryForPatient(pid) });
  });

  // GET /api/appointments/doctor/:id — full day list (with patient linkage)
  router.get('/doctor/:id', (req, res) => {
    const rows = Q.getFullDayForDoctor(req.params.id).map(a => {
      if (a.patient_id) {
        const p = Q.getPatientById(a.patient_id);
        if (p) return { ...a, mrn: p.mrn, patient_dob: p.dob, patient_gender: p.gender, patient_blood_group: p.blood_group, patient_allergies: p.allergies };
      }
      return a;
    });
    res.json({ success: true, data: rows });
  });

  // GET /api/appointments/:id — single appointment
  router.get('/:id', (req, res) => {
    const appt = Q.getAppointmentById(req.params.id);
    if (!appt) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: appt });
  });

  // PATCH /api/appointments/:id/cancel
  router.patch('/:id/cancel', (req, res) => {
    const appt = Q.getAppointmentById(req.params.id);
    if (!appt) return res.status(404).json({ success: false, error: 'Not found' });
    if (['done', 'cancelled'].includes(appt.status))
      return res.status(400).json({ success: false, error: `Cannot cancel a ${appt.status} appointment` });

    Q.updateStatus('cancelled', req.params.id);
    dbRun(`UPDATE appointments SET cancelled_at = datetime('now'), cancel_reason = ? WHERE id = ?`,
      [req.body?.cancel_reason || null, req.params.id]);
    Q.logEvent(req.params.id, 'cancelled');
    if (appt.patient_id) {
      notifyUserByPatient(appt.patient_id, 'Appointment cancelled',
        `Your appointment ${appt.token} on ${appt.appt_date} was cancelled.`, 'warning');
    }
    emitQueueEvents(appt.doctor_id);
    res.json({ success: true });
  });

  // POST /api/appointments/:id/reschedule
  router.post('/:id/reschedule', (req, res) => {
    const appt = Q.getAppointmentById(req.params.id);
    if (!appt) return res.status(404).json({ success: false, error: 'Not found' });
    if (['in_consultation', 'done', 'cancelled'].includes(appt.status))
      return res.status(400).json({ success: false, error: `Cannot reschedule a ${appt.status} appointment` });

    const { appt_date, time_slot } = req.body;
    if (!appt_date || !time_slot)
      return res.status(400).json({ success: false, error: 'New date and time slot required' });

    const todayStr = new Date().toISOString().split('T')[0];
    if (appt_date < todayStr)
      return res.status(400).json({ success: false, error: 'Cannot reschedule into the past' });
    if (Q.getSlotConflict(appt.doctor_id, appt_date, time_slot))
      return res.status(409).json({ success: false, error: 'This slot is already booked' });

    Q.updateAppointment(appt.id, appt_date, time_slot);
    Q.logEvent(appt.id, `rescheduled to ${appt_date} ${time_slot}`);
    if (appt.patient_id) {
      notifyUserByPatient(appt.patient_id, 'Appointment rescheduled',
        `Appointment ${appt.token} moved to ${appt_date} at ${time_slot}.`, 'info');
    }
    emitQueueEvents(appt.doctor_id);
    res.json({ success: true, data: Q.getAppointmentById(appt.id) });
  });

  // PATCH /api/appointments/:id/no-show
  router.patch('/:id/no-show', requireAuth, (req, res) => {
    const appt = Q.getAppointmentById(req.params.id);
    if (!appt) return res.status(404).json({ success: false, error: 'Not found' });
    if (req.session.role === 'doctor' && req.session.linked_id !== appt.doctor_id)
      return res.status(403).json({ success: false, error: 'Forbidden' });
    if (!['booked', 'waiting', 'arrived'].includes(appt.status))
      return res.status(400).json({ success: false, error: `Cannot no-show a ${appt.status} appointment` });

    Q.updateStatus('no_show', req.params.id);
    Q.logEvent(req.params.id, 'marked no-show');
    if (appt.patient_id) {
      notifyUserByPatient(appt.patient_id, 'Marked as no-show',
        `Appointment ${appt.token} was marked as missed. Contact the hospital to rebook.`, 'warning');
    }
    emitQueueEvents(appt.doctor_id);
    res.json({ success: true });
  });

  // POST /api/appointments/:id/arrive
  router.post('/:id/arrive', (req, res) => {
    const appt = Q.getAppointmentById(req.params.id);
    if (!appt) return res.status(404).json({ success: false, error: 'Not found' });
    
    Q.updateStatus('arrived', req.params.id);
    Q.logEvent(req.params.id, 'arrived');
    
    io.to(`queue_${appt.doctor_id}`).emit('queue_update', getEnrichedQueue(appt.doctor_id));
    io.to(`token_${appt.token}`).emit('token_update', getTokenStatus(appt.token));
    io.emit('stats_update');
    
    res.json({ success: true });
  });

  return router;
};
