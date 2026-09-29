/**
 * admin.js — Hospital administration: statistics, billing, lab workflow,
 * departments and doctor schedules.
 */

const express = require('express');
const { Q, dbAll, dbGet } = require('./db');
const { requireRole } = require('./auth');

module.exports = function (io) {
  const router = express.Router();

  // ─── Statistics ─────────────────────────────────────────────────────────

  // GET /api/admin/stats — full hospital dashboard numbers (real data only)
  router.get('/stats', requireRole('admin'), (req, res) => {
    const stats = dbGet(`
      SELECT
        (SELECT COUNT(*) FROM patients)                                                          AS total_patients,
        (SELECT COUNT(*) FROM appointments WHERE appt_date = date('now'))                        AS todays_appointments,
        (SELECT COUNT(*) FROM appointments WHERE appt_date = date('now')
           AND status IN ('waiting','arrived'))                                                  AS currently_waiting,
        (SELECT COUNT(*) FROM appointments WHERE status = 'in_consultation')                     AS in_consultation,
        (SELECT COUNT(*) FROM appointments WHERE status = 'done'
           AND appt_date = date('now'))                                                          AS completed_today,
        (SELECT COUNT(*) FROM appointments WHERE status = 'cancelled'
           AND appt_date = date('now'))                                                          AS cancelled_today,
        (SELECT COUNT(*) FROM doctors WHERE is_available = 1)                                    AS doctors_available,
        (SELECT COUNT(*) FROM doctors)                                                           AS doctors_total,
        (SELECT COUNT(*) FROM lab_tests WHERE status IN ('REQUESTED','SAMPLE_COLLECTED','PROCESSING'))
                                                                                                 AS pending_lab_tests,
        (SELECT COUNT(*) FROM bills WHERE status = 'PENDING')                                    AS pending_bills,
        (SELECT COALESCE(SUM(total_amount),0) FROM bills WHERE status = 'PENDING')               AS pending_amount,
        (SELECT COALESCE(SUM(total_amount),0) FROM bills WHERE status = 'PAID')                  AS revenue_collected,
        (SELECT COUNT(*) FROM follow_ups WHERE status = 'RECOMMENDED')                           AS pending_follow_ups
    `);
    res.json({ success: true, data: stats });
  });

  // ─── Departments (database-driven) ──────────────────────────────────────

  router.get('/departments', requireRole('admin'), (req, res) => {
    res.json({ success: true, data: Q.getDepartmentsAll() });
  });

  router.post('/departments', requireRole('admin'), (req, res) => {
    const { name, description } = req.body;
    if (!name || !name.trim())
      return res.status(400).json({ success: false, error: 'Department name required' });
    if (Q.getDepartmentByName(name.trim()))
      return res.status(409).json({ success: false, error: 'Department already exists' });
    const r = Q.insertDepartment(name.trim(), description || null);
    res.status(201).json({ success: true, data: Q.getDepartmentsAll().find(d => d.id === r.lastInsertRowid) });
  });

  router.delete('/departments/:id', requireRole('admin'), (req, res) => {
    const dept = dbGet(`SELECT * FROM departments WHERE id = ?`, [req.params.id]);
    if (!dept) return res.status(404).json({ success: false, error: 'Department not found' });
    const inUse = dbGet(`SELECT COUNT(*) as c FROM doctors WHERE department = ?`, [dept.name]);
    if (inUse.c > 0)
      return res.status(409).json({ success: false, error: `Cannot delete — ${inUse.c} doctor(s) belong to ${dept.name}` });
    Q.deleteDepartment(dept.id);
    res.json({ success: true });
  });

  // ─── Doctor schedules (availability per weekday) ─────────────────────────

  router.get('/schedules/:doctorId', requireRole(['admin', 'doctor']), (req, res) => {
    res.json({ success: true, data: Q.getSchedulesForDoctor(req.params.doctorId) });
  });

  router.put('/schedules/:doctorId', requireRole(['admin', 'doctor']), (req, res) => {
    if (req.session.role === 'doctor' && req.session.linked_id !== parseInt(req.params.doctorId))
      return res.status(403).json({ success: false, error: 'Forbidden' });
    const { days } = req.body;
    if (!Array.isArray(days)) return res.status(400).json({ success: false, error: 'days array required' });
    for (const d of days) {
      if (typeof d.day_of_week !== 'number' || d.day_of_week < 0 || d.day_of_week > 6) continue;
      Q.upsertSchedule(req.params.doctorId, d.day_of_week, d.start_time || '08:00 AM',
        d.end_time || '05:30 PM', d.is_available ? 1 : 0);
    }
    res.json({ success: true, data: Q.getSchedulesForDoctor(req.params.doctorId) });
  });

  // ─── Billing ────────────────────────────────────────────────────────────

  router.get('/bills', requireRole('admin'), (req, res) => {
    res.json({ success: true, data: Q.getAllBills(req.query.status) });
  });

  router.post('/bills', requireRole('admin'), (req, res) => {
    const { patient_id, appointment_id, consultation_charge, test_charges, other_charges, description } = req.body;
    if (!patient_id) return res.status(400).json({ success: false, error: 'patient_id required' });
    const p = Q.getPatientById(patient_id);
    if (!p) return res.status(404).json({ success: false, error: 'Patient not found' });

    const consult = Number(consultation_charge) || 0;
    const tests = Number(test_charges) || 0;
    const other = Number(other_charges) || 0;
    const total = consult + tests + other;

    const bill = Q.createBill({
      $bill_number: `BILL-M${String(Date.now()).slice(-6)}`,
      '$patient_id': patient_id, $appointment_id: appointment_id || null,
      $consultation_charge: consult, $test_charges: tests, $other_charges: other,
      $description: description || 'Manual bill',
      $total_amount: total, $status: 'PENDING',
    });
    if (p.user_id) Q.createNotification(p.user_id, 'New bill generated', `₹${total} due.`, 'info');
    res.status(201).json({ success: true, data: Q.getBillById(bill.lastInsertRowid) });
  });

  router.patch('/bills/:id/status', requireRole('admin'), (req, res) => {
    const { status } = req.body;
    if (!['PAID', 'PENDING', 'CANCELLED'].includes(status))
      return res.status(400).json({ success: false, error: 'status must be PAID, PENDING or CANCELLED' });
    const bill = Q.getBillById(req.params.id);
    if (!bill) return res.status(404).json({ success: false, error: 'Bill not found' });
    Q.updateBillStatus(bill.id, status);
    if (bill.patient_id) {
      const p = Q.getPatientById(bill.patient_id);
      if (p && p.user_id) Q.createNotification(p.user_id, `Bill ${status.toLowerCase()}`,
        `${bill.bill_number}: ₹${bill.total_amount} marked ${status}.`, 'info');
    }
    res.json({ success: true, data: Q.getBillById(bill.id) });
  });

  // GET /api/admin/bills/:id — bill detail (admin)
  router.get('/bills/:id', requireRole('admin'), (req, res) => {
    const bill = Q.getBillById(req.params.id);
    if (!bill) return res.status(404).json({ success: false, error: 'Bill not found' });
    res.json({ success: true, data: { ...bill, patient: Q.getPatientById(bill.patient_id) } });
  });

  // ─── Lab workflow (staff side) ──────────────────────────────────────────

  router.get('/lab-tests', requireRole('admin'), (req, res) => {
    res.json({ success: true, data: Q.getAllLabTests(req.query.status) });
  });

  // ─── Follow-ups overview ────────────────────────────────────────────────

  router.get('/follow-ups', requireRole('admin'), (req, res) => {
    res.json({ success: true, data: Q.getAllFollowUps() });
  });

  // ─── Patients overview ──────────────────────────────────────────────────

  router.get('/patients', requireRole('admin'), (req, res) => {
    res.json({ success: true, data: Q.getAllPatients(req.query.q || '') });
  });

  return router;
};
