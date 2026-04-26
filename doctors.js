const express = require('express');
const bcrypt  = require('bcryptjs');
const { Q }   = require('./db');
const { requireRole } = require('./auth');

module.exports = function (io) {
  const router = express.Router();

  // GET /api/doctors
  router.get('/', (req, res) => {
    res.json({ success: true, data: Q.getAllDoctors() });
  });

  // GET /api/doctors/departments
  router.get('/departments', (req, res) => {
    res.json({ success: true, data: Q.getDepartments().map(r => r.department) });
  });

  // GET /api/doctors/by-dept/:dept
  router.get('/by-dept/:dept', (req, res) => {
    res.json({ success: true, data: Q.getDoctorsByDept(req.params.dept) });
  });

  // GET /api/doctors/:id
  router.get('/:id', (req, res) => {
    const doc = Q.getDoctorById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, error: 'Doctor not found' });
    res.json({ success: true, data: doc });
  });

  // GET /api/doctors/:id/slots?date=YYYY-MM-DD
  router.get('/:id/slots', (req, res) => {
    const { date } = req.query;
    if (!date) return res.status(400).json({ success: false, error: 'date required' });
    const doc = Q.getDoctorById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, error: 'Doctor not found' });

    const booked = Q.getSlotBookings(req.params.id, date);
    const bookedSet = new Set(booked.map(b => b.time_slot));

    const todayStr = new Date().toISOString().split('T')[0];
    const isPastDate = date < todayStr;
    const isToday = date === todayStr;
    const now = new Date();

    const slots = generateSlots().map(time => {
      let passed = isPastDate;
      if (isToday) {
        const parts = time.split(' ');
        let [h, m] = parts[0].split(':').map(Number);
        if (parts[1] === 'PM' && h !== 12) h += 12;
        if (parts[1] === 'AM' && h === 12) h = 0;
        const slotDate = new Date();
        slotDate.setHours(h, m, 0, 0);
        passed = now > slotDate;
      }

      return {
        time,
        available: !passed && !bookedSet.has(time),
      };
    });
    res.json({ success: true, data: slots });
  });

  // PATCH /api/doctors/:id/availability  (admin or doctor)
  router.patch('/:id/availability', requireRole(['admin','doctor']), (req, res) => {
    const { is_available } = req.body;
    const { dbRun } = require('./db');
    dbRun(`UPDATE doctors SET is_available = ? WHERE id = ?`, [is_available ? 1 : 0, req.params.id]);
    const doc = Q.getDoctorById(req.params.id);
    io.emit('doctor_update', doc);
    res.json({ success: true, data: doc });
  });

  // POST /api/doctors  (admin only — add new doctor)
  router.post('/', requireRole('admin'), async (req, res) => {
    const { name, department, room, max_patients, avg_consult_minutes } = req.body;
    if (!name || !department || !room)
      return res.status(400).json({ success: false, error: 'name, department, room are required' });

    const result = Q.insertDoctor({
      $name: name,
      $department: department,
      $room: room,
      $max_patients: max_patients || 20,
      $avg_consult_minutes: avg_consult_minutes || 7,
      $is_available: 1,
    });

    const doctorId  = result.lastInsertRowid;
    const username  = name.split(' ').find(w => w.match(/^[A-Za-z]/))?.toLowerCase() || `doc${doctorId}`;
    // ensure unique username
    let finalUsername = username;
    let attempt = 1;
    while (Q.getUserByUsername(finalUsername)) {
      finalUsername = username + attempt;
      attempt++;
    }

    const hash = await bcrypt.hash('doctor123', 10);
    Q.createUser('doctor', finalUsername, hash, doctorId, name);

    const doc = Q.getDoctorById(doctorId);
    io.emit('doctor_update', doc);
    res.status(201).json({ success: true, data: { doctor: doc, username: finalUsername, defaultPassword: 'doctor123' } });
  });

  // DELETE /api/doctors/:id  (admin only)
  router.delete('/:id', requireRole('admin'), (req, res) => {
    const doc = Q.getDoctorById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, error: 'Doctor not found' });
    Q.deleteDoctor(req.params.id);
    io.emit('doctor_removed', { id: parseInt(req.params.id) });
    res.json({ success: true, message: `${doc.name} removed successfully` });
  });

  return router;
};

function generateSlots() {
  const slots = [];
  const fmt = (h, m) => {
    const ap = h < 12 ? 'AM' : 'PM';
    const dh = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${dh}:${String(m).padStart(2, '0')} ${ap}`;
  };
  for (let h = 8; h <= 12; h++)
    for (let m = 0; m < 60; m += 15) {
      if (h === 12 && m > 30) break;
      slots.push(fmt(h, m));
    }
  for (let h = 14; h <= 17; h++)
    for (let m = 0; m < 60; m += 15) {
      if (h === 17 && m > 30) break;
      slots.push(fmt(h, m));
    }
  return slots;
}
