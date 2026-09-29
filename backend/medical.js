/**
 * medical.js — Consultations / EMR / Prescriptions / Lab tests / Reports
 *
 * Access model:
 *  - Patients can only ever read records belonging to their own patient_id.
 *  - Doctors may write consultations/prescriptions/tests for their own appointments
 *    and read records for patients they are treating.
 *  - Admins have full read access.
 */

const express = require('express');
const { Q, dbAll, dbGet, dbRun, getEnrichedQueue, getTokenStatus } = require('./db');
const { requireAuth, requireRole } = require('./auth');

const LAB_PRICE = {
  'CBC': 300, 'Blood Sugar': 150, 'Lipid Profile': 500, 'X-Ray': 700, 'ECG': 400,
  'Ultrasound': 900, 'MRI': 2500, 'CT Scan': 2000, 'Thyroid Profile': 450, 'Urine Test': 120,
};

module.exports = function (io) {
  const router = express.Router();

  /** Resolve the patient id owned by the current session (patients only). */
  const ownPatientId = (req) => {
    const s = req.session;
    return (s.linked_id && Q.getPatientById(s.linked_id)?.id)
      || Q.getPatientByUserId(s.user_id)?.id || null;
  };

  const notifyPatient = (patientId, title, message, type) => {
    const p = Q.getPatientById(patientId);
    if (p && p.user_id) Q.createNotification(p.user_id, title, message, type || 'info');
  };

  const emitAll = (doctorId) => {
    if (doctorId) io.to(`queue_${doctorId}`).emit('queue_update', getEnrichedQueue(doctorId));
    io.emit('stats_update');
  };

  // ─── Consultations ──────────────────────────────────────────────────────

  // GET /api/medical/consultations/patient/:patientId
  router.get('/consultations/patient/:patientId', requireAuth, (req, res) => {
    const pid = parseInt(req.params.patientId);
    if (req.session.role === 'patient' && ownPatientId(req) !== pid)
      return res.status(403).json({ success: false, error: 'Forbidden' });
    res.json({ success: true, data: Q.getConsultationsByPatient(pid) });
  });

  // GET /api/medical/consultations/:id — full detail (vitals, prescriptions, tests, follow-ups)
  router.get('/consultations/:id', requireAuth, (req, res) => {
    const c = Q.getConsultationById(req.params.id);
    if (!c) return res.status(404).json({ success: false, error: 'Consultation not found' });

    if (req.session.role === 'patient' && ownPatientId(req) !== c.patient_id)
      return res.status(403).json({ success: false, error: 'Forbidden' });
    if (req.session.role === 'doctor' && req.session.linked_id !== c.doctor_id)
      return res.status(403).json({ success: false, error: 'Forbidden' });

    const full = {
      ...c,
      vitals: Q.getVitalsByConsultation(c.id),
      prescriptions: Q.getPrescriptionsByConsultation(c.id),
      tests: dbAll(`SELECT * FROM lab_tests WHERE consultation_id = ? ORDER BY id`, [c.id]),
      reports: dbAll(`SELECT * FROM medical_reports WHERE consultation_id = ? ORDER BY id`, [c.id]),
      follow_ups: dbAll(`SELECT * FROM follow_ups WHERE consultation_id = ? ORDER BY id`, [c.id]),
    };
    res.json({ success: true, data: full });
  });

  // POST /api/medical/consultations — create the EMR record for a consultation
  // Body: { appointment_id, symptoms, vitals:{...}, diagnosis, clinical_notes,
  //         prescriptions:[{medicine_name,dosage,frequency,duration_days,instructions}],
  //         tests:[{test_name,test_type,price}], follow_up_days, follow_up_instructions }
  router.post('/consultations', requireRole(['doctor', 'admin']), (req, res) => {
    const { appointment_id, symptoms, vitals, diagnosis, clinical_notes, prescriptions, tests,
      follow_up_days, follow_up_instructions } = req.body;

    const appt = Q.getAppointmentById(appointment_id);
    if (!appt) return res.status(404).json({ success: false, error: 'Appointment not found' });
    if (req.session.role === 'doctor' && req.session.linked_id !== appt.doctor_id)
      return res.status(403).json({ success: false, error: 'You can only record consultations for your own patients' });

    if (Q.getConsultationByAppointment(appt.id))
      return res.status(409).json({ success: false, error: 'A consultation already exists for this appointment' });

    let patientId = appt.patient_id;
    if (!patientId) {
      const digits = String(appt.patient_phone || '').replace(/\D/g, '');
      let p = Q.getPatientByPhone(digits);
      if (!p) {
        const { nextMrn } = require('./db');
        const created = Q.createPatient({
          $mrn: nextMrn(), $user_id: null, $full_name: appt.patient_name, $dob: null, $gender: null,
          $phone: digits, $email: null, $address: null, $emergency_contact: null, $blood_group: null,
          $allergies: null, $chronic_conditions: null, $past_surgeries: null,
          $current_medications: null, $insurance_provider: null, $insurance_number: null,
        });
        p = Q.getPatientById(created.lastInsertRowid);
      }
      dbRun(`UPDATE appointments SET patient_id = ? WHERE id = ?`, [p.id, appt.id]);
      patientId = p.id;
    }

    const visitDate = appt.appt_date;
    const followUpDate = follow_up_days
      ? new Date(new Date(visitDate).getTime() + Number(follow_up_days) * 86400000).toISOString().split('T')[0]
      : null;

    const result = Q.createConsultation({
      $appointment_id: appt.id,
      $patient_id: patientId,
      $doctor_id: appt.doctor_id,
      $visit_date: visitDate,
      $symptoms: symptoms || null,
      $diagnosis: diagnosis || null,
      $clinical_notes: clinical_notes || null,
      $follow_up_days: follow_up_days ? Number(follow_up_days) : null,
      $follow_up_date: followUpDate,
      $follow_up_instructions: follow_up_instructions || null,
    });
    const consultationId = result.lastInsertRowid;

    if (vitals) {
      Q.upsertVitals({
        $consultation_id: consultationId, $patient_id: patientId,
        $temperature_c: vitals.temperature_c || null,
        $blood_pressure: vitals.blood_pressure || null,
        $heart_rate: vitals.heart_rate || null,
        $respiratory_rate: vitals.respiratory_rate || null,
        $spo2: vitals.spo2 || null,
        $weight_kg: vitals.weight_kg || null,
        $height_cm: vitals.height_cm || null,
      });
    }

    for (const rx of (Array.isArray(prescriptions) ? prescriptions : [])) {
      if (!rx.medicine_name) continue;
      Q.createPrescription({
        $consultation_id: consultationId, $patient_id: patientId, $doctor_id: appt.doctor_id,
        $medicine_name: rx.medicine_name, $dosage: rx.dosage || null, $frequency: rx.frequency || null,
        $duration_days: rx.duration_days || null, $instructions: rx.instructions || null,
      });
    }

    for (const t of (Array.isArray(tests) ? tests : [])) {
      if (!t.test_name) continue;
      Q.createLabTest({
        $consultation_id: consultationId, $patient_id: patientId, $doctor_id: appt.doctor_id,
        $appointment_id: appt.id, $test_name: t.test_name,
        $test_type: t.test_type || 'Laboratory',
        $price: t.price != null ? Number(t.price) : (LAB_PRICE[t.test_name] ?? 0),
      });
    }

    if (follow_up_days) {
      Q.createFollowUp({
        $patient_id: patientId, $doctor_id: appt.doctor_id, $consultation_id: consultationId,
        $recommended_date: followUpDate,
        $reason: follow_up_instructions || diagnosis || 'Follow-up visit',
      });
    }

    if (diagnosis) {
      Q.createReport({
        $patient_id: patientId, $consultation_id: consultationId, $lab_test_id: null,
        $title: `Consultation — ${appt.appt_date}`,
        $report_type: 'Consultation Summary',
        $notes: diagnosis,
        $content: `Symptoms: ${symptoms || '—'}\nDiagnosis: ${diagnosis}\nNotes: ${clinical_notes || '—'}`,
      });
    }

    notifyPatient(patientId, 'Consultation recorded',
      `Visit on ${visitDate}: ${diagnosis || 'record updated'}.`, 'success');

    // Mark the appointment completed
    Q.markDone(appt.id);
    Q.logEvent(appt.id, 'consultation recorded');
    emitAll(appt.doctor_id);

    res.status(201).json({ success: true, data: Q.getConsultationById(consultationId) });
  });

  // PUT /api/medical/consultations/:id — doctor may correct the record the same day
  router.put('/consultations/:id', requireRole(['doctor', 'admin']), (req, res) => {
    const c = Q.getConsultationById(req.params.id);
    if (!c) return res.status(404).json({ success: false, error: 'Consultation not found' });
    if (req.session.role === 'doctor' && req.session.linked_id !== c.doctor_id)
      return res.status(403).json({ success: false, error: 'Forbidden' });

    const { symptoms, diagnosis, clinical_notes, follow_up_days, follow_up_instructions } = req.body;
    const followUpDate = follow_up_days
      ? new Date(new Date(c.visit_date).getTime() + Number(follow_up_days) * 86400000).toISOString().split('T')[0]
      : null;
    Q.updateConsultation(c.id, {
      $symptoms: symptoms ?? c.symptoms, $diagnosis: diagnosis ?? c.diagnosis,
      $clinical_notes: clinical_notes ?? c.clinical_notes,
      $follow_up_days: follow_up_days ? Number(follow_up_days) : c.follow_up_days,
      $follow_up_date: followUpDate || c.follow_up_date,
      $follow_up_instructions: follow_up_instructions ?? c.follow_up_instructions,
    });
    if (req.body.vitals) {
      Q.upsertVitals({
        $consultation_id: c.id, $patient_id: c.patient_id,
        $temperature_c: req.body.vitals.temperature_c || null,
        $blood_pressure: req.body.vitals.blood_pressure || null,
        $heart_rate: req.body.vitals.heart_rate || null,
        $respiratory_rate: req.body.vitals.respiratory_rate || null,
        $spo2: req.body.vitals.spo2 || null,
        $weight_kg: req.body.vitals.weight_kg || null,
        $height_cm: req.body.vitals.height_cm || null,
      });
    }
    res.json({ success: true, data: Q.getConsultationById(c.id) });
  });

  // ─── Prescriptions ──────────────────────────────────────────────────────

  router.post('/prescriptions', requireRole(['doctor', 'admin']), (req, res) => {
    const { consultation_id, medicine_name, dosage, frequency, duration_days, instructions } = req.body;
    const c = Q.getConsultationById(consultation_id);
    if (!c) return res.status(404).json({ success: false, error: 'Consultation not found' });
    if (req.session.role === 'doctor' && req.session.linked_id !== c.doctor_id)
      return res.status(403).json({ success: false, error: 'Forbidden' });
    if (!medicine_name) return res.status(400).json({ success: false, error: 'medicine_name required' });

    const rx = Q.createPrescription({
      $consultation_id: c.id, $patient_id: c.patient_id, $doctor_id: c.doctor_id,
      '$medicine_name': medicine_name, $dosage: dosage || null, $frequency: frequency || null,
      $duration_days: duration_days || null, $instructions: instructions || null,
    });
    notifyPatient(c.patient_id, 'New prescription',
      `${medicine_name} added to your prescription.`, 'info');
    res.status(201).json({ success: true, data: Q.getPrescriptionsByConsultation(c.id) });
  });

  // DELETE /api/medical/prescriptions/:id
  router.delete('/prescriptions/:id', requireRole(['doctor', 'admin']), (req, res) => {
    const rx = dbGet(`SELECT * FROM prescriptions WHERE id = ?`, [req.params.id]);
    if (!rx) return res.status(404).json({ success: false, error: 'Prescription not found' });
    if (req.session.role === 'doctor' && req.session.linked_id !== rx.doctor_id)
      return res.status(403).json({ success: false, error: 'Forbidden' });
    Q.deletePrescription(rx.id);
    res.json({ success: true });
  });

  // ─── Lab tests ──────────────────────────────────────────────────────────

  // POST /api/medical/lab-tests — doctor requests a test for an appointment
  router.post('/lab-tests', requireRole(['doctor', 'admin']), (req, res) => {
    const { appointment_id, test_name, test_type, price } = req.body;
    if (!appointment_id || !test_name)
      return res.status(400).json({ success: false, error: 'appointment_id and test_name required' });

    const appt = Q.getAppointmentById(appointment_id);
    if (!appt) return res.status(404).json({ success: false, error: 'Appointment not found' });
    if (req.session.role === 'doctor' && req.session.linked_id !== appt.doctor_id)
      return res.status(403).json({ success: false, error: 'Forbidden' });

    let patientId = appt.patient_id;
    if (!patientId) {
      const digits = String(appt.patient_phone || '').replace(/\D/g, '');
      let p = Q.getPatientByPhone(digits);
      if (!p) {
        const { nextMrn } = require('./db');
        const created = Q.createPatient({
          $mrn: nextMrn(), $user_id: null, $full_name: appt.patient_name, $dob: null, $gender: null,
          $phone: digits, $email: null, $address: null, $emergency_contact: null, $blood_group: null,
          $allergies: null, $chronic_conditions: null, $past_surgeries: null,
          $current_medications: null, $insurance_provider: null, $insurance_number: null,
        });
        p = Q.getPatientById(created.lastInsertRowid);
      }
      dbRun(`UPDATE appointments SET patient_id = ? WHERE id = ?`, [p.id, appt.id]);
      patientId = p.id;
    }

    const t = Q.createLabTest({
      $consultation_id: req.body.consultation_id || null,
      $patient_id: patientId, $doctor_id: appt.doctor_id, $appointment_id: appt.id,
      '$test_name': test_name, $test_type: test_type || 'Laboratory',
      $price: price != null ? Number(price) : (LAB_PRICE[test_name] ?? 0),
    });
    notifyPatient(patientId, 'Test requested',
      `${test_name} has been requested by Dr. ${Q.getDoctorById(appt.doctor_id)?.name || ''}.`, 'info');
    res.status(201).json({ success: true, data: Q.getLabTestById(t.lastInsertRowid) });
  });

  // GET /api/medical/lab-tests/patient/:patientId
  router.get('/lab-tests/patient/:patientId', requireAuth, (req, res) => {
    const pid = parseInt(req.params.patientId);
    if (req.session.role === 'patient' && ownPatientId(req) !== pid)
      return res.status(403).json({ success: false, error: 'Forbidden' });
    res.json({ success: true, data: Q.getLabTestsByPatient(pid) });
  });

  // GET /api/medical/lab-tests/doctor/:doctorId
  router.get('/lab-tests/doctor/:doctorId', requireRole(['doctor', 'admin']), (req, res) => {
    if (req.session.role === 'doctor' && req.session.linked_id !== parseInt(req.params.doctorId))
      return res.status(403).json({ success: false, error: 'Forbidden' });
    res.json({ success: true, data: Q.getLabTestsByDoctor(req.params.doctorId) });
  });

  // PATCH /api/medical/lab-tests/:id/status — staff workflow
  // Body: { status, result?, result_notes? }
  router.patch('/lab-tests/:id/status', requireRole(['admin', 'doctor']), (req, res) => {
    const { status, result, result_notes } = req.body;
    const allowed = ['REQUESTED', 'SAMPLE_COLLECTED', 'PROCESSING', 'COMPLETED', 'CANCELLED'];
    if (!allowed.includes(status))
      return res.status(400).json({ success: false, error: `status must be one of ${allowed.join(', ')}` });

    const t = Q.getLabTestById(req.params.id);
    if (!t) return res.status(404).json({ success: false, error: 'Test not found' });
    if (req.session.role === 'doctor' && req.session.linked_id !== t.doctor_id)
      return res.status(403).json({ success: false, error: 'Forbidden' });

    Q.updateLabTestStatus(t.id, status, result, result_notes);
    if (status === 'COMPLETED') {
      Q.createReport({
        $patient_id: t.patient_id, $consultation_id: t.consultation_id, $lab_test_id: t.id,
        $title: `${t.test_name} — result`, $report_type: 'Lab Report',
        $notes: result_notes || null, $content: result || null,
      });
    }
    notifyPatient(t.patient_id, `Test ${status.toLowerCase().replace('_', ' ')}`,
      `${t.test_name}: ${status === 'COMPLETED' ? 'result available' : 'status updated'}.`,
      status === 'COMPLETED' ? 'success' : 'info');
    res.json({ success: true, data: Q.getLabTestById(t.id) });
  });

  // ─── Medical reports / documents ────────────────────────────────────────

  router.get('/reports/patient/:patientId', requireAuth, (req, res) => {
    const pid = parseInt(req.params.patientId);
    if (req.session.role === 'patient' && ownPatientId(req) !== pid)
      return res.status(403).json({ success: false, error: 'Forbidden' });
    res.json({ success: true, data: Q.getReportsByPatient(pid) });
  });

  router.get('/reports/:id', requireAuth, (req, res) => {
    const r = Q.getReportById(req.params.id);
    if (!r) return res.status(404).json({ success: false, error: 'Report not found' });
    if (req.session.role === 'patient' && ownPatientId(req) !== r.patient_id)
      return res.status(403).json({ success: false, error: 'Forbidden' });
    res.json({ success: true, data: r });
  });

  // POST /api/medical/reports — admin/staff or doctor can attach a document
  router.post('/reports', requireRole(['admin', 'doctor']), (req, res) => {
    const { patient_id, consultation_id, lab_test_id, title, report_type, notes, content } = req.body;
    if (!patient_id || !title)
      return res.status(400).json({ success: false, error: 'patient_id and title required' });
    const p = Q.getPatientById(patient_id);
    if (!p) return res.status(404).json({ success: false, error: 'Patient not found' });
    const r = Q.createReport({
      '$patient_id': patient_id, $consultation_id: consultation_id || null, $lab_test_id: lab_test_id || null,
      '$title': title, $report_type: report_type || 'General', $notes: notes || null, $content: content || null,
    });
    notifyPatient(patient_id, 'New medical report', `${title} added to your records.`, 'info');
    res.status(201).json({ success: true, data: Q.getReportById(r.lastInsertRowid) });
  });

  // ─── Follow-ups ─────────────────────────────────────────────────────────

  router.get('/follow-ups/patient/:patientId', requireAuth, (req, res) => {
    const pid = parseInt(req.params.patientId);
    if (req.session.role === 'patient' && ownPatientId(req) !== pid)
      return res.status(403).json({ success: false, error: 'Forbidden' });
    res.json({ success: true, data: Q.getFollowUpsByPatient(pid) });
  });

  // POST /api/medical/follow-ups/:id/book — patient converts a recommendation into an appointment
  router.post('/follow-ups/:id/book', requireAuth, (req, res) => {
    const f = Q.getFollowUpById(req.params.id);
    if (!f) return res.status(404).json({ success: false, error: 'Follow-up not found' });
    if (req.session.role === 'patient' && ownPatientId(req) !== f.patient_id)
      return res.status(403).json({ success: false, error: 'Forbidden' });
    if (f.status !== 'RECOMMENDED')
      return res.status(400).json({ success: false, error: `Follow-up is already ${f.status}` });

    const { appt_date, time_slot } = req.body;
    if (!appt_date || !time_slot)
      return res.status(400).json({ success: false, error: 'Pick a date and time slot first' });

    const doctor = Q.getDoctorById(f.doctor_id);
    if (!doctor) return res.status(404).json({ success: false, error: 'Doctor not found' });
    if (Q.getSlotConflict(f.doctor_id, appt_date, time_slot))
      return res.status(409).json({ success: false, error: 'This slot is already booked' });

    const prefix = doctor.department.substring(0, 3).toUpperCase();
    const existing = dbGet(
      `SELECT MAX(CAST(SUBSTR(token, INSTR(token,'-')+1) AS INTEGER)) as max_num
       FROM appointments WHERE token LIKE ?`, [`${prefix}-%`]);
    const token = `${prefix}-${String((existing?.max_num || 0) + 1).padStart(3, '0')}`;

    const result = Q.createAppointment({
      '$patient_name': (Q.getPatientById(f.patient_id)).full_name,
      '$patient_phone': (Q.getPatientById(f.patient_id)).phone,
      '$doctor_id': f.doctor_id, '$appt_date': appt_date, '$time_slot': time_slot,
      '$token': token, '$queue_position': Q.getMaxPosition(f.doctor_id) + 1,
      '$reason': `Follow-up: ${f.reason || ''}`,
    });
    const apptId = result.lastInsertRowid;
    dbRun(`UPDATE appointments SET patient_id = ? WHERE id = ?`, [f.patient_id, apptId]);
    Q.logEvent(apptId, 'booked (follow-up)');
    Q.setFollowUpStatus(f.id, 'SCHEDULED', apptId);

    notifyPatient(f.patient_id, 'Follow-up booked',
      `Follow-up with Dr. ${doctor.name} on ${appt_date} at ${time_slot}. Token ${token}.`, 'success');
    io.to(`queue_${f.doctor_id}`).emit('queue_update', getEnrichedQueue(f.doctor_id));
    io.emit('stats_update');

    res.status(201).json({ success: true, data: Q.getAppointmentById(apptId) });
  });

  return router;
};
