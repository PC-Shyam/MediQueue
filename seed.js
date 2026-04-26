/**
 * Seed script — run once to populate doctors + today's sample appointments + default users.
 * node seed.js
 */
const bcrypt = require('bcryptjs');
const { initDb, Q } = require('./db');

const today = new Date().toISOString().split('T')[0];

const DOCTORS = [
  { $name: 'Dr. Priya Nair',      $department: 'Cardiology',       $room: 'Room 101', $max_patients: 20, $avg_consult_minutes: 8,  $is_available: 1 },
  { $name: 'Dr. Karthik Rajan',   $department: 'Cardiology',       $room: 'Room 102', $max_patients: 20, $avg_consult_minutes: 7,  $is_available: 1 },
  { $name: 'Dr. Meena Iyer',      $department: 'General Medicine', $room: 'Room 201', $max_patients: 25, $avg_consult_minutes: 6,  $is_available: 1 },
  { $name: 'Dr. Suresh Kumar',    $department: 'General Medicine', $room: 'Room 202', $max_patients: 25, $avg_consult_minutes: 6,  $is_available: 1 },
  { $name: 'Dr. Ananya Krishnan', $department: 'Orthopaedics',     $room: 'Room 301', $max_patients: 15, $avg_consult_minutes: 10, $is_available: 1 },
  { $name: 'Dr. Ramesh Babu',     $department: 'Dermatology',      $room: 'Room 401', $max_patients: 18, $avg_consult_minutes: 7,  $is_available: 1 },
  { $name: 'Dr. Lakshmi Devi',    $department: 'Paediatrics',      $room: 'Room 501', $max_patients: 20, $avg_consult_minutes: 8,  $is_available: 1 },
];

// [patient_name, phone, doctor_id (1-indexed), time_slot, token, status, queue_pos, reason]
const APPOINTMENTS = [
  // Dr. Priya Nair — Cardiology
  ['S. Ramesh',     '9876543210', 1, '8:00 AM',  'CAR-001', 'done',            1, 'Chest pain follow-up'],
  ['Lakshmi K.',    '9876543211', 1, '8:15 AM',  'CAR-002', 'done',            2, 'BP check'],
  ['Vijay T.',      '9876543212', 1, '8:30 AM',  'CAR-003', 'done',            3, 'ECG review'],
  ['P. Sundaram',   '9876543213', 1, '9:00 AM',  'CAR-004', 'in_consultation', 4, 'Palpitations'],
  ['Arjun Mehta',   '9876543214', 1, '9:15 AM',  'CAR-005', 'waiting',         5, 'Routine checkup'],
  ['Deepa S.',      '9876543215', 1, '9:30 AM',  'CAR-006', 'waiting',         6, 'Cholesterol review'],
  ['Mohan R.',      '9876543216', 1, '10:00 AM', 'CAR-007', 'booked',          7, 'Follow-up'],
  ['Kavitha M.',    '9876543217', 1, '10:15 AM', 'CAR-008', 'booked',          8, 'Heart scan review'],
  // Dr. Karthik Rajan — Cardiology
  ['Bala S.',       '9876543220', 2, '8:00 AM',  'CAR-101', 'done',            1, 'Follow-up'],
  ['Saranya P.',    '9876543221', 2, '9:00 AM',  'CAR-102', 'waiting',         2, 'Routine checkup'],
  ['Dinesh K.',     '9876543222', 2, '9:30 AM',  'CAR-103', 'booked',          3, 'BP monitoring'],
  // Dr. Meena Iyer — General Medicine
  ['Rajesh V.',     '9876543230', 3, '8:00 AM',  'GEN-001', 'done',            1, 'Fever'],
  ['Uma N.',        '9876543231', 3, '8:15 AM',  'GEN-002', 'done',            2, 'Cold & cough'],
  ['Arun M.',       '9876543232', 3, '8:30 AM',  'GEN-003', 'in_consultation', 3, 'Diabetes follow-up'],
  ['Preethi L.',    '9876543233', 3, '9:00 AM',  'GEN-004', 'waiting',         4, 'Stomach pain'],
  ['Muthu K.',      '9876543234', 3, '9:15 AM',  'GEN-005', 'booked',          5, 'Routine checkup'],
  // Dr. Ananya Krishnan — Orthopaedics
  ['Shankar R.',    '9876543240', 5, '8:30 AM',  'ORT-001', 'in_consultation', 1, 'Knee pain'],
  ['Geetha P.',     '9876543241', 5, '9:30 AM',  'ORT-002', 'waiting',         2, 'Back pain'],
  ['Ravi T.',       '9876543242', 5, '10:00 AM', 'ORT-003', 'booked',          3, 'Fracture follow-up'],
  // Dr. Ramesh Babu — Dermatology
  ['Nisha R.',      '9876543250', 6, '9:00 AM',  'DER-001', 'waiting',         1, 'Skin rash'],
  ['Priya V.',      '9876543251', 6, '9:30 AM',  'DER-002', 'booked',          2, 'Acne treatment'],
];

// Mapping of first name -> doctor index (1-based) for login
const DOCTOR_USERNAMES = ['priya', 'karthik', 'meena', 'suresh', 'ananya', 'ramesh', 'lakshmi'];

// Sample patient phones that get login accounts
const PATIENT_PHONES = [
  ['9876543214', 'Arjun Mehta'],
  ['9876543233', 'Preethi L.'],
  ['9876543241', 'Geetha P.'],
  ['9876543216', 'Mohan R.'],
];

async function seed() {
  await initDb();
  console.log('\n🌱  Seeding MediQueue...\n');

  Q.clearAll();
  console.log('✓  Cleared existing data');

  // ── Seed doctors ──
  DOCTORS.forEach(d => Q.insertDoctor(d));
  console.log(`✓  Inserted ${DOCTORS.length} doctors`);

  // ── Seed appointments ──
  const { dbRun } = require('./db');
  APPOINTMENTS.forEach(([patient_name, patient_phone, doctor_id, time_slot, token, status, queue_position, reason]) => {
    dbRun(`
      INSERT INTO appointments
        (patient_name, patient_phone, doctor_id, appt_date, time_slot, token, status, queue_position, reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [patient_name, patient_phone, doctor_id, today, time_slot, token, status, queue_position, reason]);
  });
  console.log(`✓  Inserted ${APPOINTMENTS.length} appointments for ${today}`);

  // ── Seed users ──
  const doctorHash  = await bcrypt.hash('doctor123', 10);
  const adminHash   = await bcrypt.hash('admin123',  10);
  const patientHash = await bcrypt.hash('1234',      10);

  // Admin account
  Q.createUser('admin', 'admin', adminHash, null, 'Administrator');
  console.log('✓  Created admin user (admin / admin123)');

  // Doctor accounts
  for (let i = 0; i < DOCTORS.length; i++) {
    const doctorId = i + 1;
    const username = DOCTOR_USERNAMES[i];
    const name     = DOCTORS[i].$name;
    Q.createUser('doctor', username, doctorHash, doctorId, name);
  }
  console.log(`✓  Created ${DOCTORS.length} doctor users (password: doctor123)`);

  // Patient accounts
  for (const [phone, name] of PATIENT_PHONES) {
    Q.createUser('patient', phone, patientHash, null, name);
  }
  console.log(`✓  Created ${PATIENT_PHONES.length} patient accounts (PIN: 1234)`);

  console.log('\n📋  Login credentials:');
  console.log('   Admin:       admin         / admin123');
  console.log('   Dr. Priya:   priya         / doctor123');
  console.log('   Dr. Meena:   meena         / doctor123');
  console.log('   Patient:     9876543214    / 1234  (Arjun Mehta — CAR-005)');
  console.log('\n✅  Done! Now run:  npm start\n');
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
