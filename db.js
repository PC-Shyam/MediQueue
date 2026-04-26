/**
 * db.js — SQLite via sql.js (pure JavaScript, no native compilation needed)
 * Persists to mediqueue.db file on disk after every write.
 */

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'mediqueue.db');
let _db = null;

// ─── Core Query Helpers ────────────────────────────────────────────────────

function save() {
  const data = _db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function lastInsertId() {
  const res = _db.exec('SELECT last_insert_rowid() as id');
  return res[0]?.values[0][0];
}

function dbRun(sql, params = []) {
  _db.run(sql, params);
  const id = lastInsertId();
  save();
  return { lastInsertRowid: id };
}

function dbExec(sql) {
  _db.run(sql);
  save();
}

function dbAll(sql, params = []) {
  const stmt = _db.prepare(sql);
  if (params && params.length > 0) stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function dbGet(sql, params = []) {
  return dbAll(sql, params)[0] || null;
}

function dbRunNamed(sql, obj = {}) {
  _db.run(sql, obj);
  const id = lastInsertId();
  save();
  return { lastInsertRowid: id };
}

// ─── Schema ────────────────────────────────────────────────────────────────

function setupSchema() {
  _db.run(`PRAGMA foreign_keys = ON`);

  _db.run(`CREATE TABLE IF NOT EXISTS doctors (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    name                  TEXT NOT NULL,
    department            TEXT NOT NULL,
    room                  TEXT NOT NULL,
    max_patients          INTEGER DEFAULT 20,
    avg_consult_minutes   INTEGER DEFAULT 7,
    is_available          INTEGER DEFAULT 1
  )`);

  _db.run(`CREATE TABLE IF NOT EXISTS appointments (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_name    TEXT NOT NULL,
    patient_phone   TEXT NOT NULL,
    doctor_id       INTEGER NOT NULL,
    appt_date       TEXT NOT NULL,
    time_slot       TEXT NOT NULL,
    token           TEXT NOT NULL UNIQUE,
    status          TEXT DEFAULT 'booked',
    queue_position  INTEGER,
    reason          TEXT,
    created_at      TEXT DEFAULT (datetime('now')),
    consulted_at    TEXT,
    completed_at    TEXT,
    FOREIGN KEY (doctor_id) REFERENCES doctors(id)
  )`);

  _db.run(`CREATE TABLE IF NOT EXISTS queue_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    appointment_id  INTEGER NOT NULL,
    event           TEXT NOT NULL,
    timestamp       TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (appointment_id) REFERENCES appointments(id)
  )`);

  _db.run(`CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    role          TEXT NOT NULL CHECK(role IN ('doctor','patient','admin')),
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    linked_id     INTEGER,
    display_name  TEXT,
    created_at    TEXT DEFAULT (datetime('now'))
  )`);

  _db.run(`CREATE TABLE IF NOT EXISTS sessions (
    token       TEXT PRIMARY KEY,
    user_id     INTEGER NOT NULL,
    expires_at  TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);

  save();
}

// ─── Domain Queries ────────────────────────────────────────────────────────

const Q = {
  getAllDoctors: () => dbAll(`
    SELECT d.*,
      (SELECT COUNT(*) FROM appointments a
       WHERE a.doctor_id = d.id AND a.status IN ('waiting','in_consultation')
         AND a.appt_date = date('now')) as active_queue,
      (SELECT COUNT(*) FROM appointments a
       WHERE a.doctor_id = d.id AND a.status = 'done'
         AND a.appt_date = date('now')) as seen_today,
      (SELECT COUNT(*) FROM appointments a
       WHERE a.doctor_id = d.id AND a.status = 'booked'
         AND a.appt_date = date('now')) as upcoming_today
    FROM doctors d
    ORDER BY d.department, d.name
  `),

  getDoctorById: (id) => dbGet(`SELECT * FROM doctors WHERE id = ?`, [id]),

  getDoctorsByDept: (dept) => dbAll(`
    SELECT d.*,
      (SELECT COUNT(*) FROM appointments a
       WHERE a.doctor_id = d.id AND a.status IN ('waiting','in_consultation')
         AND a.appt_date = date('now')) as active_queue
    FROM doctors d
    WHERE d.department = ? AND d.is_available = 1
    ORDER BY d.name
  `, [dept]),

  getDepartments: () => dbAll(`SELECT DISTINCT department FROM doctors ORDER BY department`),

  getQueueForDoctor: (doctorId) => dbAll(`
    SELECT a.*, d.name as doctor_name, d.department, d.room, d.avg_consult_minutes
    FROM appointments a
    JOIN doctors d ON d.id = a.doctor_id
    WHERE a.doctor_id = ? AND a.appt_date = date('now')
      AND a.status IN ('waiting', 'in_consultation')
    ORDER BY a.queue_position ASC
  `, [doctorId]),

  getFullDayForDoctor: (doctorId) => dbAll(`
    SELECT a.*, d.name as doctor_name, d.avg_consult_minutes
    FROM appointments a
    JOIN doctors d ON d.id = a.doctor_id
    WHERE a.doctor_id = ? AND a.appt_date = date('now')
    ORDER BY
      CASE a.status
        WHEN 'in_consultation' THEN 1
        WHEN 'waiting' THEN 2
        WHEN 'booked' THEN 3
        WHEN 'done' THEN 4
        ELSE 5
      END, a.queue_position ASC
  `, [doctorId]),

  getAppointmentByToken: (token) => dbGet(`
    SELECT a.*, d.name as doctor_name, d.department, d.room, d.avg_consult_minutes
    FROM appointments a
    JOIN doctors d ON d.id = a.doctor_id
    WHERE a.token = ?
  `, [token]),

  getAppointmentByPhone: (phone) => dbGet(`
    SELECT a.*, d.name as doctor_name, d.department, d.room, d.avg_consult_minutes
    FROM appointments a
    JOIN doctors d ON d.id = a.doctor_id
    WHERE a.patient_phone = ? AND a.appt_date = date('now')
    ORDER BY a.created_at DESC
    LIMIT 1
  `, [phone]),

  getAppointmentById: (id) => dbGet(`SELECT * FROM appointments WHERE id = ?`, [id]),

  createAppointment: (p) => dbRunNamed(`
    INSERT INTO appointments
      (patient_name, patient_phone, doctor_id, appt_date, time_slot, token, queue_position, reason)
    VALUES
      ($patient_name, $patient_phone, $doctor_id, $appt_date, $time_slot, $token, $queue_position, $reason)
  `, p),

  updateStatus: (status, id) => dbRun(`UPDATE appointments SET status = ? WHERE id = ?`, [status, id]),

  markInConsultation: (id) => dbRun(`
    UPDATE appointments SET status = 'in_consultation', consulted_at = datetime('now') WHERE id = ?
  `, [id]),

  markDone: (id) => dbRun(`
    UPDATE appointments SET status = 'done', completed_at = datetime('now') WHERE id = ?
  `, [id]),

  moveToWaiting: (id) => dbRun(`UPDATE appointments SET status = 'waiting' WHERE id = ?`, [id]),

  getMaxPosition: (doctorId) => {
    const r = dbGet(`
      SELECT MAX(queue_position) as max_pos FROM appointments
      WHERE doctor_id = ? AND appt_date = date('now')
    `, [doctorId]);
    return r?.max_pos || 0;
  },

  getSlotBookings: (doctorId, date) => dbAll(`
    SELECT time_slot, COUNT(*) as booked_count
    FROM appointments
    WHERE doctor_id = ? AND appt_date = ? AND status != 'cancelled'
    GROUP BY time_slot
  `, [doctorId, date]),

  getSlotConflict: (doctorId, date, slot) => dbGet(`
    SELECT id FROM appointments
    WHERE doctor_id = ? AND appt_date = ? AND time_slot = ? AND status != 'cancelled'
  `, [doctorId, date, slot]),

  countForDoctor: (doctorId, date) => {
    const r = dbGet(`SELECT COUNT(*) as cnt FROM appointments WHERE doctor_id = ? AND appt_date = ?`, [doctorId, date]);
    return r?.cnt || 0;
  },

  getCurrentInConsultation: (doctorId) => dbGet(`
    SELECT * FROM appointments
    WHERE doctor_id = ? AND appt_date = date('now') AND status = 'in_consultation'
  `, [doctorId]),

  getNextWaiting: (doctorId) => dbGet(`
    SELECT * FROM appointments
    WHERE doctor_id = ? AND appt_date = date('now') AND status = 'waiting'
    ORDER BY queue_position ASC LIMIT 1
  `, [doctorId]),

  getNextBooked: (doctorId) => dbGet(`
    SELECT * FROM appointments
    WHERE doctor_id = ? AND appt_date = date('now') AND status = 'booked'
    ORDER BY queue_position ASC LIMIT 1
  `, [doctorId]),

  getStats: () => dbGet(`
    SELECT
      (SELECT COUNT(*) FROM appointments WHERE status IN ('waiting','in_consultation')) as active_tokens,
      (SELECT COUNT(*) FROM appointments WHERE status = 'done' AND appt_date = date('now')) as seen_today,
      (SELECT COUNT(*) FROM appointments WHERE status = 'booked' AND appt_date = date('now')) as upcoming,
      (SELECT AVG(CAST((strftime('%s', completed_at) - strftime('%s', consulted_at)) AS REAL) / 60.0)
       FROM appointments
       WHERE status = 'done' AND appt_date = date('now')
         AND consulted_at IS NOT NULL AND completed_at IS NOT NULL) as avg_consult_minutes
  `),

  logEvent: (appointmentId, event) => dbRun(
    `INSERT INTO queue_log (appointment_id, event) VALUES (?, ?)`,
    [appointmentId, event]
  ),

  clearAll: () => {
    _db.run(`DELETE FROM queue_log`);
    _db.run(`DELETE FROM appointments`);
    _db.run(`DELETE FROM doctors`);
    try { _db.run(`DELETE FROM sqlite_sequence WHERE name IN ('doctors','appointments','queue_log')`); } catch(e) {}
    save();
  },

  insertDoctor: (d) => dbRunNamed(`
    INSERT INTO doctors (name, department, room, max_patients, avg_consult_minutes, is_available)
    VALUES ($name, $department, $room, $max_patients, $avg_consult_minutes, $is_available)
  `, d),

  deleteDoctor: (id) => {
    _db.run(`UPDATE appointments SET status = 'cancelled' WHERE doctor_id = ? AND status IN ('booked','waiting','in_consultation')`, [id]);
    _db.run(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE linked_id = ? AND role = 'doctor')`, [id]);
    _db.run(`DELETE FROM users WHERE linked_id = ? AND role = 'doctor'`, [id]);
    _db.run(`DELETE FROM doctors WHERE id = ?`, [id]);
    save();
  },

  // ── Users ──────────────────────────────────────────────────────────────
  getUserByUsername: (username) => dbGet(`SELECT * FROM users WHERE username = ?`, [username]),
  getUserById:       (id)       => dbGet(`SELECT * FROM users WHERE id = ?`, [id]),
  createUser: (role, username, passwordHash, linkedId, displayName) => dbRun(
    `INSERT INTO users (role, username, password_hash, linked_id, display_name) VALUES (?, ?, ?, ?, ?)`,
    [role, username, passwordHash, linkedId, displayName]
  ),
  updateUserPassword: (id, passwordHash) => dbRun(`UPDATE users SET password_hash = ? WHERE id = ?`, [passwordHash, id]),
  deleteUserByLinkedId: (linkedId, role) => dbRun(`DELETE FROM users WHERE linked_id = ? AND role = ?`, [linkedId, role]),

  // ── Sessions ───────────────────────────────────────────────────────────
  createSession: (token, userId, expiresAt) => dbRun(
    `INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)`,
    [token, userId, expiresAt]
  ),
  getSession: (token) => dbGet(
    `SELECT s.*, u.role, u.username, u.display_name, u.linked_id
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > datetime('now')`,
    [token]
  ),
  deleteSession: (token) => dbRun(`DELETE FROM sessions WHERE token = ?`, [token]),
  cleanExpiredSessions: () => { _db.run(`DELETE FROM sessions WHERE expires_at <= datetime('now')`); save(); },
};

// ─── Business Logic ────────────────────────────────────────────────────────

function recalcPositions(doctorId) {
  const queue = Q.getQueueForDoctor(doctorId);
  queue.forEach((appt, idx) => {
    _db.run(`UPDATE appointments SET queue_position = ? WHERE id = ?`, [idx + 1, appt.id]);
  });
  save();
}

function getEnrichedQueue(doctorId) {
  recalcPositions(doctorId);
  const queue = Q.getQueueForDoctor(doctorId);
  const doctor = Q.getDoctorById(doctorId);
  const avgMins = doctor?.avg_consult_minutes || 7;

  return queue.map((appt, idx) => {
    const waitMins = idx === 0 ? 0 : idx * avgMins;
    const callTime = new Date(Date.now() + waitMins * 60000);
    return {
      ...appt,
      queue_position: idx + 1,
      estimated_wait_minutes: waitMins,
      estimated_call_time: callTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    };
  });
}

function getTokenStatus(token) {
  const appt = Q.getAppointmentByToken(token);
  if (!appt) return null;

  if (appt.status === 'done' || appt.status === 'cancelled') {
    return { ...appt, estimated_wait_minutes: 0 };
  }
  if (appt.status === 'in_consultation') {
    return { ...appt, estimated_wait_minutes: 0, queue_position: 1 };
  }

  const queue = getEnrichedQueue(appt.doctor_id);
  const inQueue = queue.find(q => q.token === token);
  if (inQueue) return inQueue;

  // Still 'booked' — they haven't arrived at the hospital yet.
  // Their call time should be their scheduled time slot, unless the doctor's current
  // physical queue is delayed and extends past their slot time.
  const doctor = Q.getDoctorById(appt.doctor_id);
  const avgMins = doctor?.avg_consult_minutes || 7;

  // Predict when the current waiting room will be empty
  const queueEndMins = queue.length * avgMins;
  const expectedQueueEnd = new Date(Date.now() + queueEndMins * 60000);

  // Parse their scheduled slot date and time
  let slotTime = new Date();
  if (appt.appt_date) {
    const [y, m, d] = appt.appt_date.split('-').map(Number);
    slotTime.setFullYear(y, m - 1, d);
  }
  
  if (appt.time_slot) {
    const parts = appt.time_slot.split(' ');
    if (parts.length === 2) {
      let [h, m] = parts[0].split(':').map(Number);
      if (parts[1] === 'PM' && h !== 12) h += 12;
      if (parts[1] === 'AM' && h === 12) h = 0;
      slotTime.setHours(h, m, 0, 0);
    }
  }

  // They will be called at their slot time.
  // If the appointment is TODAY, we check if the physical queue is delayed past their slot.
  // We use expectedQueueEnd only if the appointment is today.
  const todayStr = new Date().toISOString().split('T')[0];
  let callTime = slotTime;
  if (appt.appt_date === todayStr && expectedQueueEnd > slotTime) {
    callTime = expectedQueueEnd;
  }

  const isToday = appt.appt_date === todayStr;
  const callFormat = isToday 
    ? callTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    : callTime.toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return {
    ...appt,
    estimated_wait_minutes: null, // UI will show '—' because they haven't arrived yet
    estimated_call_time: callFormat,
  };
}

// ─── Init ──────────────────────────────────────────────────────────────────

async function initDb() {
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    _db = new SQL.Database(fs.readFileSync(DB_PATH));
    console.log('  ✓ Loaded existing database:', DB_PATH);
  } else {
    _db = new SQL.Database();
    console.log('  ✓ Created new database:', DB_PATH);
  }
  setupSchema();
  return true;
}

module.exports = { initDb, Q, dbRun, dbGet, dbAll, dbExec, dbRunNamed, getEnrichedQueue, getTokenStatus };
