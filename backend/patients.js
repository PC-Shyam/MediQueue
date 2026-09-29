/**
 * patients.js — Patient profiles, dashboard bundle, and patient directory.
 *
 * Security:
 *  - Patients can only read/update their own profile (session-linked patient_id).
 *  - Doctors can read profiles of patients they are treating.
 *  - Admins can manage all patients.
 */

const express = require('express');
const { Q, dbRun } = require('./db');
const { requireAuth, requireRole } = require('./auth');

module.exports = function (io) {
  const router = express.Router();

  const ownPatientId = (req) => {
    const s = req.session;
    return (s.linked_id && Q.getPatientById(s.linked_id)?.id)
      || Q.getPatientByUserId(s.user_id)?.id || null;
  };

  /** Everything the patient home screen needs, in one authenticated call. */
  const buildDashboard = (patient) => {
    const history = Q.getHistoryForPatient(patient.id);
    const upcoming = history.filter(a => ['booked', 'waiting', 'arrived', 'in_consultation'].includes(a.status));
    const completed = history.filter(a => a.status === 'done');
    const todayAppt = Q.getTodayAppointmentForPatient(patient.id);
    const todayStatus = todayAppt ? getTokenStatus(todayAppt.token) : null;

    const consultations = Q.getConsultationsByPatient(patient.id);
    const prescriptions = Q.getPrescriptionsByPatient(patient.id);
    const tests = Q.getLabTestsByPatient(patient.id);
    const reports = Q.getReportsByPatient(patient.id);
    const followUps = Q.getFollowUpsByPatient(patient.id);
    const bills = Q.getBillsByPatient(patient.id);

    const outstanding = bills.filter(b => b.status === 'PENDING')
      .reduce((s, b) => s + (b.total_amount || 0), 0);

    return {
      patient: {
        id: patient.id, mrn: patient.mrn, full_name: patient.full_name,
        dob: patient.dob, gender: patient.gender, phone: patient.phone,
        email: patient.email, blood_group: patient.blood_group,
        allergies: patient.allergies, chronic_conditions: patient.chronic_conditions,
      },
      counts: {
        upcoming: upcoming.length, completed: completed.length,
        consultations: consultations.length, pending_tests: tests.filter(t => !['COMPLETED', 'CANCELLED'].includes(t.status)).length,
        pending_bills: bills.filter(b => b.status === 'PENDING').length,
        outstanding_amount: outstanding,
      },
      next_appointment: upcoming[0] || null,
      today: todayStatus ? {
        token: todayStatus.token, status: todayStatus.status,
        queue_position: todayStatus.queue_position,
        estimated_wait_minutes: todayStatus.estimated_wait_minutes,
        estimated_call_time: todayStatus.estimated_call_time,
        doctor_name: todayStatus.doctor_name, room: todayStatus.room,
      } : null,
      last_consultation: consultations[0] || null,
      recent_prescriptions: prescriptions.slice(0, 3),
      recent_tests: tests.slice(0, 3),
      next_follow_up: followUps.find(f => f.status === 'RECOMMENDED') || null,
      reports_count: reports.length,
    };
  };

  // GET /api/patients/me/dashboard — one call for the patient home screen
  router.get('/me/dashboard', requireAuth, (req, res) => {
    const pid = ownPatientId(req);
    if (!pid) return res.status(404).json({ success: false, error: 'No patient profile is linked to this account' });
    res.json({ success: true, data: buildDashboard(Q.getPatientById(pid)) });
  });

  // GET /api/patients/me — own profile
  router.get('/me', requireAuth, (req, res) => {
    const pid = ownPatientId(req);
    if (!pid) return res.status(404).json({ success: false, error: 'No patient profile is linked to this account' });
    res.json({ success: true, data: Q.getPatientById(pid) });
  });

  // PUT /api/patients/me — update own profile
  router.put('/me', requireAuth, (req, res) => {
    const pid = ownPatientId(req);
    if (!pid) return res.status(404).json({ success: false, error: 'No patient profile is linked to this account' });

    const cur = Q.getPatientById(pid);
    const b = req.body || {};
    const digits = b.phone ? String(b.phone).replace(/\D/g, '') : cur.phone;

    if (b.phone && digits !== cur.phone) {
      const clash = Q.getPatientByPhone(digits);
      if (clash && clash.id !== pid)
        return res.status(409).json({ success: false, error: 'Another patient already uses this mobile number' });
    }

    Q.updatePatient(pid, {
      $full_name: (b.full_name || cur.full_name).trim(),
      $dob: b.dob ?? cur.dob, $gender: b.gender ?? cur.gender,
      $phone: digits, $email: b.email ?? cur.email, $address: b.address ?? cur.address,
      $emergency_contact: b.emergency_contact ?? cur.emergency_contact,
      $blood_group: b.blood_group ?? cur.blood_group, $allergies: b.allergies ?? cur.allergies,
      $chronic_conditions: b.chronic_conditions ?? cur.chronic_conditions,
      $past_surgeries: b.past_surgeries ?? cur.past_surgeries,
      $current_medications: b.current_medications ?? cur.current_medications,
      $insurance_provider: b.insurance_provider ?? cur.insurance_provider,
      $insurance_number: b.insurance_number ?? cur.insurance_number,
    });
    res.json({ success: true, data: Q.getPatientById(pid) });
  });

  // ── Doctor/admin directory ────────────────────────────────────────────────

  // GET /api/patients/search?q=  (admin & doctors)
  router.get('/search', requireRole(['admin', 'doctor']), (req, res) => {
    res.json({ success: true, data: Q.getAllPatients(req.query.q || '') });
  });

  // GET /api/patients/:id/record — full medical record (summary + consultations)
  router.get('/:id/record', requireAuth, (req, res) => {
    const pid = parseInt(req.params.id);
    if (req.session.role === 'patient' && ownPatientId(req) !== pid)
      return res.status(403).json({ success: false, error: 'Forbidden' });
    if (req.session.role === 'doctor') {
      const treated = Q.getHistoryForPatient(pid).some(a => a.doctor_id === req.session.linked_id);
      if (!treated)
        return res.status(403).json({ success: false, error: 'You can only view records of patients you treat' });
    }

    const patient = Q.getPatientById(pid);
    if (!patient) return res.status(404).json({ success: false, error: 'Patient not found' });

    res.json({
      success: true,
      data: {
        patient,
        history: Q.getHistoryForPatient(pid),
        consultations: Q.getConsultationsByPatient(pid),
        prescriptions: Q.getPrescriptionsByPatient(pid),
        tests: Q.getLabTestsByPatient(pid),
        reports: Q.getReportsByPatient(pid),
        follow_ups: Q.getFollowUpsByPatient(pid),
        bills: Q.getBillsByPatient(pid),
      },
    });
  });

  // ── Admin/staff management ────────────────────────────────────────────────

  // POST /api/patients — admin registers a walk-in patient
  router.post('/', requireRole('admin'), (req, res) => {
    const { full_name, phone, dob, gender, email, address, emergency_contact, blood_group,
      allergies, chronic_conditions, past_surgeries, current_medications,
      insurance_provider, insurance_number } = req.body;

    if (!full_name || !phone)
      return res.status(400).json({ success: false, error: 'full_name and phone are required' });
    const digits = String(phone).replace(/\D/g, '');
    if (digits.length < 10)
      return res.status(400).json({ success: false, error: 'A valid 10-digit mobile number is required' });
    if (Q.getPatientByPhone(digits))
      return res.status(409).json({ success: false, error: 'A patient with this mobile number already exists' });

    const { nextMrn } = require('./db');
    const result = Q.createPatient({
      $mrn: nextMrn(), $user_id: null, $full_name: full_name.trim(), $dob: dob || null,
      $gender: gender || null, $phone: digits, $email: email || null, $address: address || null,
      $emergency_contact: emergency_contact || null, $blood_group: blood_group || null,
      $allergies: allergies || null, $chronic_conditions: chronic_conditions || null,
      $past_surgeries: past_surgeries || null, $current_medications: current_medications || null,
      $insurance_provider: insurance_provider || null, $insurance_number: insurance_number || null,
    });
    res.status(201).json({ success: true, data: Q.getPatientById(result.lastInsertRowid) });
  });

  // PUT /api/patients/:id — admin updates any profile
  router.put('/:id', requireRole('admin'), (req, res) => {
    const pid = parseInt(req.params.id);
    const cur = Q.getPatientById(pid);
    if (!cur) return res.status(404).json({ success: false, error: 'Patient not found' });
    const b = req.body || {};
    const digits = b.phone ? String(b.phone).replace(/\D/g, '') : cur.phone;
    if (b.phone && digits !== cur.phone) {
      const clash = Q.getPatientByPhone(digits);
      if (clash && clash.id !== pid)
        return res.status(409).json({ success: false, error: 'Another patient already uses this mobile number' });
    }
    Q.updatePatient(pid, {
      $full_name: (b.full_name || cur.full_name).trim(),
      $dob: b.dob ?? cur.dob, $gender: b.gender ?? cur.gender,
      $phone: digits, $email: b.email ?? cur.email, $address: b.address ?? cur.address,
      $emergency_contact: b.emergency_contact ?? cur.emergency_contact,
      $blood_group: b.blood_group ?? cur.blood_group, $allergies: b.allergies ?? cur.allergies,
      $chronic_conditions: b.chronic_conditions ?? cur.chronic_conditions,
      $past_surgeries: b.past_surgeries ?? cur.past_surgeries,
      $current_medications: b.current_medications ?? cur.current_medications,
      $insurance_provider: b.insurance_provider ?? cur.insurance_provider,
      $insurance_number: b.insurance_number ?? cur.insurance_number,
    });
    res.json({ success: true, data: Q.getPatientById(pid) });
  });

  return router;
};
