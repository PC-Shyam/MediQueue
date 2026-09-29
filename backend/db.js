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

  // ── Patient Management System tables (v2) ──

  _db.run(`CREATE TABLE IF NOT EXISTS departments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
  )`);

  _db.run(`CREATE TABLE IF NOT EXISTS patients (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    mrn                 TEXT UNIQUE,             -- Medical Record Number, e.g. P10234
    user_id             INTEGER,
    full_name           TEXT NOT NULL,
    dob                 TEXT,
    gender              TEXT,
    phone               TEXT NOT NULL UNIQUE,
    email               TEXT,
    address             TEXT,
    emergency_contact   TEXT,
    blood_group         TEXT,
    allergies           TEXT,
    chronic_conditions  TEXT,
    past_surgeries      TEXT,
    current_medications TEXT,
    insurance_provider  TEXT,
    insurance_number    TEXT,
    created_at          TEXT DEFAULT (datetime('now')),
    updated_at          TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);

  _db.run(`CREATE TABLE IF NOT EXISTS consultations (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    appointment_id        INTEGER,
    patient_id            INTEGER NOT NULL,
    doctor_id             INTEGER NOT NULL,
    visit_date            TEXT NOT NULL,
    symptoms              TEXT,
    diagnosis             TEXT,
    clinical_notes        TEXT,
    follow_up_days        INTEGER,
    follow_up_date        TEXT,
    follow_up_instructions TEXT,
    created_at            TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (appointment_id) REFERENCES appointments(id),
    FOREIGN KEY (patient_id) REFERENCES patients(id),
    FOREIGN KEY (doctor_id) REFERENCES doctors(id)
  )`);

  _db.run(`CREATE TABLE IF NOT EXISTS vitals (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    consultation_id  INTEGER NOT NULL,
    patient_id       INTEGER,
    temperature_c    TEXT,
    blood_pressure   TEXT,
    heart_rate       TEXT,
    respiratory_rate TEXT,
    spo2             TEXT,
    weight_kg        TEXT,
    height_cm        TEXT,
    recorded_at      TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (consultation_id) REFERENCES consultations(id)
  )`);

  _db.run(`CREATE TABLE IF NOT EXISTS prescriptions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    consultation_id INTEGER NOT NULL,
    patient_id      INTEGER NOT NULL,
    doctor_id       INTEGER NOT NULL,
    medicine_name   TEXT NOT NULL,
    dosage          TEXT,
    frequency       TEXT,
    duration_days   TEXT,
    instructions    TEXT,
    created_at      TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (consultation_id) REFERENCES consultations(id),
    FOREIGN KEY (patient_id) REFERENCES patients(id),
    FOREIGN KEY (doctor_id) REFERENCES doctors(id)
  )`);

  _db.run(`CREATE TABLE IF NOT EXISTS lab_tests (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    consultation_id INTEGER,
    patient_id      INTEGER NOT NULL,
    doctor_id       INTEGER NOT NULL,
    appointment_id  INTEGER,
    test_name       TEXT NOT NULL,
    test_type       TEXT DEFAULT 'Laboratory',
    status          TEXT DEFAULT 'REQUESTED'
                    CHECK(status IN ('REQUESTED','SAMPLE_COLLECTED','PROCESSING','COMPLETED','CANCELLED')),
    result          TEXT,
    result_notes    TEXT,
    price           INTEGER DEFAULT 0,
    requested_at    TEXT DEFAULT (datetime('now')),
    completed_at    TEXT,
    FOREIGN KEY (consultation_id) REFERENCES consultations(id),
    FOREIGN KEY (patient_id) REFERENCES patients(id),
    FOREIGN KEY (doctor_id) REFERENCES doctors(id),
    FOREIGN KEY (appointment_id) REFERENCES appointments(id)
  )`);

  _db.run(`CREATE TABLE IF NOT EXISTS medical_reports (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id      INTEGER NOT NULL,
    consultation_id INTEGER,
    lab_test_id     INTEGER,
    title           TEXT NOT NULL,
    report_type     TEXT DEFAULT 'General',
    notes           TEXT,
    content         TEXT,
    created_at      TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (patient_id) REFERENCES patients(id),
    FOREIGN KEY (consultation_id) REFERENCES consultations(id),
    FOREIGN KEY (lab_test_id) REFERENCES lab_tests(id)
  )`);

  _db.run(`CREATE TABLE IF NOT EXISTS bills (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    bill_number        TEXT UNIQUE,
    patient_id         INTEGER NOT NULL,
    appointment_id     INTEGER,
    consultation_charge INTEGER DEFAULT 0,
    test_charges       INTEGER DEFAULT 0,
    other_charges      INTEGER DEFAULT 0,
    description        TEXT,
    total_amount       INTEGER NOT NULL,
    status             TEXT DEFAULT 'PENDING'
                       CHECK(status IN ('PAID','PENDING','CANCELLED')),
    created_at         TEXT DEFAULT (datetime('now')),
    paid_at            TEXT,
    FOREIGN KEY (patient_id) REFERENCES patients(id),
    FOREIGN KEY (appointment_id) REFERENCES appointments(id)
  )`);

  _db.run(`CREATE TABLE IF NOT EXISTS follow_ups (
    id                       INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id               INTEGER NOT NULL,
    doctor_id                INTEGER NOT NULL,
    consultation_id          INTEGER,
    recommended_date         TEXT,
    reason                   TEXT,
    status                   TEXT DEFAULT 'RECOMMENDED'
                             CHECK(status IN ('RECOMMENDED','SCHEDULED','COMPLETED','CANCELLED')),
    converted_appointment_id INTEGER,
    created_at               TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (patient_id) REFERENCES patients(id),
    FOREIGN KEY (doctor_id) REFERENCES doctors(id),
    FOREIGN KEY (consultation_id) REFERENCES consultations(id)
  )`);

  _db.run(`CREATE TABLE IF NOT EXISTS notifications (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    title      TEXT NOT NULL,
    message    TEXT,
    type       TEXT DEFAULT 'info',
    is_read    INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);

  _db.run(`CREATE TABLE IF NOT EXISTS doctor_schedules (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    doctor_id   INTEGER NOT NULL,
    day_of_week INTEGER NOT NULL,          -- 0=Sunday .. 6=Saturday
    start_time  TEXT DEFAULT '08:00 AM',
    end_time    TEXT DEFAULT '05:30 PM',
    is_available INTEGER DEFAULT 1,
    UNIQUE(doctor_id, day_of_week),
    FOREIGN KEY (doctor_id) REFERENCES doctors(id)
  )`);

  migrateColumns();
  seedDefaultDepartments();
  save();
}

/** sql.js has no ADD COLUMN IF NOT EXISTS — guard each migration. */
function migrateColumns() {
  const alters = [
    ['appointments', 'patient_id INTEGER REFERENCES patients(id)'],
    ['doctors', 'fee INTEGER DEFAULT 500'],
    ['doctors', 'consult_days TEXT DEFAULT NULL'],
    ['appointments', 'cancelled_at TEXT'],
    ['appointments', 'cancel_reason TEXT'],
  ];
  for (const [table, colDef] of alters) {
    try { _db.run(`ALTER TABLE ${table} ADD COLUMN ${colDef}`); }
    catch (e) { /* column already exists */ }
  }
}

/** Ensure the departments table has rows; derives initial list from existing doctors. */
function seedDefaultDepartments() {
  try {
    const existing = _db.exec('SELECT COUNT(*) as c FROM departments');
    if (existing[0]?.values[0][0] > 0) return;
    const DEFAULTS = [
      ['General Medicine', 'Primary care and everyday illness'],
      ['Cardiology',       'Heart and blood vessel care'],
      ['Orthopaedics',     'Bones, joints and muscles'],
      ['Paediatrics',      'Child healthcare'],
      ['Dermatology',      'Skin, hair and nails'],
      ['ENT',              'Ear, nose and throat'],
    ];
    for (const [name, description] of DEFAULTS) {
      _db.run(`INSERT INTO departments (name, description) VALUES (?, ?)`, [name, description]);
    }
  } catch (e) { /* ignore */ }
}

// ─── Domain Queries ────────────────────────────────────────────────────────

const Q = {
  getAllDoctors: () => dbAll(`
    SELECT d.*,
      (SELECT COUNT(*) FROM appointments a
       WHERE a.doctor_id = d.id AND a.status IN ('waiting','arrived','in_consultation')
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
       WHERE a.doctor_id = d.id AND a.status IN ('waiting','arrived','in_consultation')
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
      AND a.status IN ('waiting', 'arrived', 'in_consultation')
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
        WHEN 'arrived' THEN 2
        WHEN 'waiting' THEN 3
        WHEN 'booked' THEN 4
        WHEN 'done' THEN 5
        ELSE 6
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

  getHistoryForPatient: (patientId) => dbAll(`
    SELECT a.*, d.name as doctor_name, d.department, d.room
    FROM appointments a JOIN doctors d ON d.id = a.doctor_id
    WHERE a.patient_id = ?
    ORDER BY a.appt_date DESC, a.time_slot DESC
  `, [patientId]),

  updateAppointment: (id, apptDate, timeSlot) => dbRun(
    `UPDATE appointments SET appt_date = ?, time_slot = ?, status = 'booked' WHERE id = ?`,
    [apptDate, timeSlot, id]
  ),

  getTodayAppointmentForPatient: (patientId) => dbGet(`
    SELECT a.*, d.name as doctor_name, d.department, d.room, d.avg_consult_minutes
    FROM appointments a JOIN doctors d ON d.id = a.doctor_id
    WHERE a.patient_id = ? AND a.appt_date = date('now')
      AND a.status NOT IN ('done', 'cancelled')
    ORDER BY a.created_at DESC LIMIT 1
  `, [patientId]),

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
    WHERE doctor_id = ? AND appt_date = date('now') AND status IN ('waiting','arrived')
    ORDER BY queue_position ASC LIMIT 1
  `, [doctorId]),

  getNextBooked: (doctorId) => dbGet(`
    SELECT * FROM appointments
    WHERE doctor_id = ? AND appt_date = date('now') AND status = 'booked'
    ORDER BY queue_position ASC LIMIT 1
  `, [doctorId]),

  getStats: () => dbGet(`
    SELECT
      (SELECT COUNT(*) FROM appointments WHERE status IN ('waiting','arrived','in_consultation')) as active_tokens,
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
  getUserByUsername: (username) => {
    const u = dbGet(`SELECT * FROM users WHERE username = ?`, [username]);
    // Patients log in with their phone number — auto-link to their patient record.
    if (u && u.role === 'patient' && !u.linked_id) {
      const p = dbGet(`SELECT id FROM patients WHERE phone = ?`, [username]);
      if (p) {
        dbRun(`UPDATE users SET linked_id = ? WHERE id = ?`, [p.id, u.id]);
        u.linked_id = p.id;
      }
    }
    return u;
  },
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

  // ── Departments (configurable, database-driven) ───────────────────────────
  getDepartmentsAll: () => dbAll(`SELECT * FROM departments ORDER BY name`),
  getDepartmentByName: (name) => dbGet(`SELECT * FROM departments WHERE name = ?`, [name]),
  insertDepartment: (name, description) => dbRun(
    `INSERT INTO departments (name, description) VALUES (?, ?)`, [name, description || null]
  ),
  deleteDepartment: (id) => dbRun(`DELETE FROM departments WHERE id = ?`, [id]),

  // ── Patients ───────────────────────────────────────────────────────────
  getAllPatients: (search) => {
    if (search) {
      const like = `%${search}%`;
      return dbAll(`SELECT * FROM patients
        WHERE full_name LIKE ? OR phone LIKE ? OR mrn LIKE ?
        ORDER BY full_name`, [like, like, like]);
    }
    return dbAll(`SELECT * FROM patients ORDER BY created_at DESC`);
  },
  getPatientById: (id) => dbGet(`SELECT * FROM patients WHERE id = ?`, [id]),
  getPatientByPhone: (phone) => dbGet(`SELECT * FROM patients WHERE phone = ?`, [phone]),
  getPatientByUserId: (userId) => dbGet(`SELECT * FROM patients WHERE user_id = ?`, [userId]),
  createPatient: (p) => dbRunNamed(`
    INSERT INTO patients (mrn, user_id, full_name, dob, gender, phone, email, address,
      emergency_contact, blood_group, allergies, chronic_conditions, past_surgeries,
      current_medications, insurance_provider, insurance_number)
    VALUES ($mrn, $user_id, $full_name, $dob, $gender, $phone, $email, $address,
      $emergency_contact, $blood_group, $allergies, $chronic_conditions, $past_surgeries,
      $current_medications, $insurance_provider, $insurance_number)
  `, p),
  updatePatient: (id, p) => dbRunNamed(`
    UPDATE patients SET
      full_name = $full_name, dob = $dob, gender = $gender, phone = $phone, email = $email,
      address = $address, emergency_contact = $emergency_contact, blood_group = $blood_group,
      allergies = $allergies, chronic_conditions = $chronic_conditions,
      past_surgeries = $past_surgeries, current_medications = $current_medications,
      insurance_provider = $insurance_provider, insurance_number = $insurance_number,
      updated_at = datetime('now')
    WHERE id = $id
  `, { ...p, $id: id }),

  // ── Consultations ──────────────────────────────────────────────────────
  createConsultation: (c) => dbRunNamed(`
    INSERT INTO consultations (appointment_id, patient_id, doctor_id, visit_date, symptoms,
      diagnosis, clinical_notes, follow_up_days, follow_up_date, follow_up_instructions)
    VALUES ($appointment_id, $patient_id, $doctor_id, $visit_date, $symptoms,
      $diagnosis, $clinical_notes, $follow_up_days, $follow_up_date, $follow_up_instructions)
  `, c),
  updateConsultation: (id, c) => dbRunNamed(`
    UPDATE consultations SET symptoms = $symptoms, diagnosis = $diagnosis,
      clinical_notes = $clinical_notes, follow_up_days = $follow_up_days,
      follow_up_date = $follow_up_date, follow_up_instructions = $follow_up_instructions
    WHERE id = $id
  `, { ...c, $id: id }),
  getConsultationsByPatient: (patientId) => dbAll(`
    SELECT c.*, d.name as doctor_name, d.department, d.room
    FROM consultations c JOIN doctors d ON d.id = c.doctor_id
    WHERE c.patient_id = ? ORDER BY c.visit_date DESC, c.id DESC
  `, [patientId]),
  getConsultationById: (id) => dbGet(`
    SELECT c.*, d.name as doctor_name, d.department, p.full_name as patient_name, p.mrn
    FROM consultations c
    JOIN doctors d ON d.id = c.doctor_id
    JOIN patients p ON p.id = c.patient_id
    WHERE c.id = ?
  `, [id]),
  getConsultationByAppointment: (appointmentId) => dbGet(
    `SELECT * FROM consultations WHERE appointment_id = ?`, [appointmentId]
  ),

  // ── Vitals ─────────────────────────────────────────────────────────────
  upsertVitals: (v) => {
    const existing = dbGet(`SELECT id FROM vitals WHERE consultation_id = ?`, [v.$consultation_id]);
    if (existing) {
      dbRunNamed(`UPDATE vitals SET temperature_c = $temperature_c, blood_pressure = $blood_pressure,
        heart_rate = $heart_rate, respiratory_rate = $respiratory_rate, spo2 = $spo2,
        weight_kg = $weight_kg, height_cm = $height_cm WHERE id = $id`,
        { ...v, $id: existing.id });
      return { lastInsertRowid: existing.id };
    }
    return dbRunNamed(`INSERT INTO vitals (consultation_id, patient_id, temperature_c, blood_pressure,
      heart_rate, respiratory_rate, spo2, weight_kg, height_cm)
      VALUES ($consultation_id, $patient_id, $temperature_c, $blood_pressure, $heart_rate,
      $respiratory_rate, $spo2, $weight_kg, $height_cm)`, v);
  },
  getVitalsByConsultation: (consultationId) => dbGet(
    `SELECT * FROM vitals WHERE consultation_id = ?`, [consultationId]
  ),

  // ── Prescriptions ──────────────────────────────────────────────────────
  createPrescription: (p) => dbRunNamed(`
    INSERT INTO prescriptions (consultation_id, patient_id, doctor_id, medicine_name,
      dosage, frequency, duration_days, instructions)
    VALUES ($consultation_id, $patient_id, $doctor_id, $medicine_name,
      $dosage, $frequency, $duration_days, $instructions)
  `, p),
  getPrescriptionsByConsultation: (consultationId) => dbAll(
    `SELECT * FROM prescriptions WHERE consultation_id = ? ORDER BY id`, [consultationId]
  ),
  getPrescriptionsByPatient: (patientId) => dbAll(`
    SELECT pr.*, c.visit_date, d.name as doctor_name, d.department
    FROM prescriptions pr
    JOIN consultations c ON c.id = pr.consultation_id
    JOIN doctors d ON d.id = pr.doctor_id
    WHERE pr.patient_id = ? ORDER BY pr.created_at DESC, pr.id DESC
  `, [patientId]),
  deletePrescription: (id) => dbRun(`DELETE FROM prescriptions WHERE id = ?`, [id]),

  // ── Lab tests ──────────────────────────────────────────────────────────
  createLabTest: (t) => dbRunNamed(`
    INSERT INTO lab_tests (consultation_id, patient_id, doctor_id, appointment_id, test_name, test_type, price)
    VALUES ($consultation_id, $patient_id, $doctor_id, $appointment_id, $test_name, $test_type, $price)
  `, t),
  updateLabTestStatus: (id, status, result, resultNotes) => {
    if (result !== undefined) {
      dbRun(`UPDATE lab_tests SET status = ?, result = ?, result_notes = ?,
        completed_at = CASE WHEN ? = 'COMPLETED' THEN datetime('now') ELSE completed_at END
        WHERE id = ?`, [status, result, resultNotes || null, status, id]);
    } else {
      dbRun(`UPDATE lab_tests SET status = ? WHERE id = ?`, [status, id]);
    }
  },
  getLabTestById: (id) => dbGet(`
    SELECT t.*, p.full_name as patient_name, p.mrn, d.name as doctor_name
    FROM lab_tests t
    JOIN patients p ON p.id = t.patient_id
    JOIN doctors d ON d.id = t.doctor_id
    WHERE t.id = ?
  `, [id]),
  getLabTestsByPatient: (patientId) => dbAll(`
    SELECT t.*, d.name as doctor_name, d.department
    FROM lab_tests t JOIN doctors d ON d.id = t.doctor_id
    WHERE t.patient_id = ? ORDER BY t.requested_at DESC, t.id DESC
  `, [patientId]),
  getAllLabTests: (status) => {
    if (status) {
      return dbAll(`
        SELECT t.*, p.full_name as patient_name, p.mrn, d.name as doctor_name, d.department
        FROM lab_tests t
        JOIN patients p ON p.id = t.patient_id
        JOIN doctors d ON d.id = t.doctor_id
        WHERE t.status = ? ORDER BY t.requested_at DESC, t.id DESC
      `, [status]);
    }
    return dbAll(`
      SELECT t.*, p.full_name as patient_name, p.mrn, d.name as doctor_name, d.department
      FROM lab_tests t
      JOIN patients p ON p.id = t.patient_id
      JOIN doctors d ON d.id = t.doctor_id
      ORDER BY t.requested_at DESC, t.id DESC
    `);
  },
  getLabTestsByDoctor: (doctorId) => dbAll(`
    SELECT t.*, p.full_name as patient_name, p.mrn
    FROM lab_tests t JOIN patients p ON p.id = t.patient_id
    WHERE t.doctor_id = ? ORDER BY t.requested_at DESC, t.id DESC
  `, [doctorId]),

  // ── Medical reports / documents ────────────────────────────────────────
  createReport: (r) => dbRunNamed(`
    INSERT INTO medical_reports (patient_id, consultation_id, lab_test_id, title, report_type, notes, content)
    VALUES ($patient_id, $consultation_id, $lab_test_id, $title, $report_type, $notes, $content)
  `, r),
  getReportsByPatient: (patientId) => dbAll(`
    SELECT * FROM medical_reports WHERE patient_id = ? ORDER BY created_at DESC, id DESC
  `, [patientId]),
  getReportById: (id) => dbGet(`SELECT * FROM medical_reports WHERE id = ?`, [id]),

  // ── Billing ────────────────────────────────────────────────────────────
  createBill: (b) => dbRunNamed(`
    INSERT INTO bills (bill_number, patient_id, appointment_id, consultation_charge,
      test_charges, other_charges, description, total_amount, status)
    VALUES ($bill_number, $patient_id, $appointment_id, $consultation_charge,
      $test_charges, $other_charges, $description, $total_amount, $status)
  `, b),
  getBillByAppointment: (appointmentId) => dbGet(
    `SELECT * FROM bills WHERE appointment_id = ? ORDER BY id DESC LIMIT 1`, [appointmentId]
  ),
  getBillsByPatient: (patientId) => dbAll(`
    SELECT b.*, a.token, a.time_slot, d.name as doctor_name, d.department
    FROM bills b
    LEFT JOIN appointments a ON a.id = b.appointment_id
    LEFT JOIN doctors d ON d.id = a.doctor_id
    WHERE b.patient_id = ? ORDER BY b.created_at DESC, b.id DESC
  `, [patientId]),
  getAllBills: (status) => {
    if (status) return dbAll(`
      SELECT b.*, p.full_name as patient_name, p.mrn
      FROM bills b JOIN patients p ON p.id = b.patient_id
      WHERE b.status = ? ORDER BY b.created_at DESC, b.id DESC
    `, [status]);
    return dbAll(`
      SELECT b.*, p.full_name as patient_name, p.mrn
      FROM bills b JOIN patients p ON p.id = b.patient_id
      ORDER BY b.created_at DESC, b.id DESC
    `);
  },
  getBillById: (id) => dbGet(`SELECT * FROM bills WHERE id = ?`, [id]),
  updateBillStatus: (id, status) => dbRun(`
    UPDATE bills SET status = ?, paid_at = CASE WHEN ? = 'PAID' THEN datetime('now') ELSE paid_at END
    WHERE id = ?
  `, [status, status, id]),

  // ── Follow-ups ─────────────────────────────────────────────────────────
  createFollowUp: (f) => dbRunNamed(`
    INSERT INTO follow_ups (patient_id, doctor_id, consultation_id, recommended_date, reason)
    VALUES ($patient_id, $doctor_id, $consultation_id, $recommended_date, $reason)
  `, f),
  getFollowUpsByPatient: (patientId) => dbAll(`
    SELECT f.*, d.name as doctor_name, d.department, c.diagnosis
    FROM follow_ups f
    JOIN doctors d ON d.id = f.doctor_id
    LEFT JOIN consultations c ON c.id = f.consultation_id
    WHERE f.patient_id = ? ORDER BY f.recommended_date DESC, f.id DESC
  `, [patientId]),
  getAllFollowUps: () => dbAll(`
    SELECT f.*, p.full_name as patient_name, p.mrn, d.name as doctor_name, d.department
    FROM follow_ups f
    JOIN patients p ON p.id = f.patient_id
    JOIN doctors d ON d.id = f.doctor_id
    ORDER BY f.recommended_date DESC, f.id DESC
  `),
  getFollowUpById: (id) => dbGet(`SELECT * FROM follow_ups WHERE id = ?`, [id]),
  setFollowUpStatus: (id, status, convertedAppointmentId) => {
    if (convertedAppointmentId !== undefined) {
      dbRun(`UPDATE follow_ups SET status = ?, converted_appointment_id = ? WHERE id = ?`,
        [status, convertedAppointmentId, id]);
    } else {
      dbRun(`UPDATE follow_ups SET status = ? WHERE id = ?`, [status, id]);
    }
  },

  // ── Notifications ──────────────────────────────────────────────────────
  createNotification: (userId, title, message, type) => dbRun(
    `INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)`,
    [userId, title, message || null, type || 'info']
  ),
  getNotifications: (userId, limit = 15) => dbAll(
    `SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?`,
    [userId, limit]
  ),
  countUnreadNotifications: (userId) => {
    const r = dbGet(`SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND is_read = 0`, [userId]);
    return r?.c || 0;
  },
  markNotificationsRead: (userId) => dbRun(`UPDATE notifications SET is_read = 1 WHERE user_id = ?`, [userId]),

  // ── Doctor schedules (day-of-week availability) ────────────────────────
  getSchedulesForDoctor: (doctorId) => dbAll(
    `SELECT * FROM doctor_schedules WHERE doctor_id = ? ORDER BY day_of_week`, [doctorId]
  ),
  getSchedulesForDay: (doctorId, dayOfWeek) => dbGet(
    `SELECT * FROM doctor_schedules WHERE doctor_id = ? AND day_of_week = ?`, [doctorId, dayOfWeek]
  ),
  upsertSchedule: (doctorId, dayOfWeek, start, end, avail) => {
    const existing = dbGet(
      `SELECT id FROM doctor_schedules WHERE doctor_id = ? AND day_of_week = ?`, [doctorId, dayOfWeek]
    );
    if (existing) {
      dbRun(`UPDATE doctor_schedules SET start_time = ?, end_time = ?, is_available = ? WHERE id = ?`,
        [start, end, avail, existing.id]);
    } else {
      dbRun(`INSERT INTO doctor_schedules (doctor_id, day_of_week, start_time, end_time, is_available)
        VALUES (?, ?, ?, ?, ?)`, [doctorId, dayOfWeek, start, end, avail]);
    }
  },

  // ── Doctor fee ─────────────────────────────────────────────────────────
  updateDoctorFee: (id, fee) => dbRun(`UPDATE doctors SET fee = ? WHERE id = ?`, [fee, id]),
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
  let appt = Q.getAppointmentByToken(token);
  // Sessions created before patient linking: fall back to name+phone match.
  if (appt && !appt.patient_id && appt.patient_name && appt.patient_phone) {
    try {
      const pat = Q.getPatientByPhone(appt.patient_phone);
      const nameKey = appt.patient_name.toLowerCase().replace(/[^a-z]/g, '');
      if (pat && pat.full_name.toLowerCase().replace(/[^a-z]/g, '') === nameKey) {
        _db.run(`UPDATE appointments SET patient_id = ? WHERE id = ?`, [pat.id, appt.id]);
        save();
        appt = { ...appt, patient_id: pat.id };
      }
    } catch (e) { /* ignore */ }
  }
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

function nextMrn() {
  const r = dbGet(`SELECT MAX(CAST(SUBSTR(mrn, 2) AS INTEGER)) as max_id FROM patients WHERE mrn LIKE 'P%'`);
  return `P${String((r?.max_id || 10000) + 1)}`;
}

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

module.exports = { initDb, Q, dbRun, dbGet, dbAll, dbExec, dbRunNamed, getEnrichedQueue, getTokenStatus, nextMrn };
