/**
 * Seed script — populates departments, doctors, patients with profiles,
 * today's appointments, demo medical history (consultations, prescriptions,
 * lab tests, bills, follow-ups) and default users.
 *
 * Run standalone: node seed.js
 */
const bcrypt = require('bcryptjs');
const { initDb, Q, dbRun, nextMrn } = require('./db');

const today = () => new Date().toISOString().split('T')[0];
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().split('T')[0];
const daysAhead = (n) => new Date(Date.now() + n * 86400000).toISOString().split('T')[0];

const DOCTORS = [
  { $name: 'Dr. Priya Nair',      $department: 'Cardiology',       $room: 'Room 101', $max_patients: 20, $avg_consult_minutes: 8,  $is_available: 1 },
  { $name: 'Dr. Karthik Rajan',   $department: 'Cardiology',       $room: 'Room 102', $max_patients: 20, $avg_consult_minutes: 7,  $is_available: 1 },
  { $name: 'Dr. Meena Iyer',      $department: 'General Medicine', $room: 'Room 201', $max_patients: 25, $avg_consult_minutes: 6,  $is_available: 1 },
  { $name: 'Dr. Suresh Kumar',    $department: 'General Medicine', $room: 'Room 202', $max_patients: 25, $avg_consult_minutes: 6,  $is_available: 1 },
  { $name: 'Dr. Ananya Krishnan', $department: 'Orthopaedics',     $room: 'Room 301', $max_patients: 15, $avg_consult_minutes: 10, $is_available: 1 },
  { $name: 'Dr. Ramesh Babu',     $department: 'Dermatology',      $room: 'Room 401', $max_patients: 18, $avg_consult_minutes: 7,  $is_available: 1 },
  { $name: 'Dr. Lakshmi Devi',    $department: 'Paediatrics',      $room: 'Room 501', $max_patients: 20, $avg_consult_minutes: 8,  $is_available: 1 },
];

const DOCTOR_FEES = [600, 600, 400, 400, 700, 500, 500];

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

// Demo patient profiles: [name, phone, gender, dob, blood_group, allergies, conditions, medications]
const PATIENT_PROFILES = [
  ['Arjun Mehta', '9876543214', 'Male',   '1995-04-12', 'O+',  'Dust',           'Mild asthma',        'Salbutamol inhaler'],
  ['Preethi L.',  '9876543233', 'Female', '1988-11-03', 'B+',  'Penicillin',     'Gastritis',          'Pantoprazole'],
  ['Geetha P.',   '9876543241', 'Female', '1972-06-25', 'A+',  'None known',     'Lower back pain',    'Ibuprofen'],
  ['Mohan R.',    '9876543216', 'Male',   '1980-01-30', 'AB+', 'None known',     'Hypertension',       'Amlodipine 5mg'],
  ['S. Ramesh',   '9876543210', 'Male',   '1965-09-14', 'O-',  'Sulfa drugs',    'Coronary artery disease', 'Aspirin, Atorvastatin'],
];

const DOCTOR_USERNAMES = ['priya', 'karthik', 'meena', 'suresh', 'ananya', 'ramesh', 'lakshmi'];

async function seedAll() {
  await initDb();
  console.log('\n🌱  Seeding MediQueue...\n');

  Q.clearAll();
  console.log('✓  Cleared existing data');

  // ── Departments (configurable, database-driven) ──
  const DEPARTMENTS = [
    ['General Medicine', 'Primary care and everyday illness'],
    ['Cardiology',       'Heart and blood vessel care'],
    ['Orthopaedics',     'Bones, joints and muscles'],
    ['Paediatrics',      'Child healthcare'],
    ['Dermatology',      'Skin, hair and nails'],
    ['ENT',              'Ear, nose and throat'],
  ];
  DEPARTMENTS.forEach(([name, description]) => {
    if (!Q.getDepartmentByName(name)) Q.insertDepartment(name, description);
  });
  console.log(`✓  Inserted ${DEPARTMENTS.length} departments`);

  // ── Doctors ──
  DOCTORS.forEach(d => Q.insertDoctor(d));
  DOCTOR_FEES.forEach((fee, i) => Q.updateDoctorFee(i + 1, fee));
  console.log(`✓  Inserted ${DOCTORS.length} doctors`);

  // ── Appointments for today (preserves original queue demo) ──
  APPOINTMENTS.forEach(([patient_name, patient_phone, doctor_id, time_slot, token, status, queue_position, reason]) => {
    dbRun(`
      INSERT INTO appointments
        (patient_name, patient_phone, doctor_id, appt_date, time_slot, token, status, queue_position, reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [patient_name, patient_phone, doctor_id, today(), time_slot, token, status, queue_position, reason]);
  });
  console.log(`✓  Inserted ${APPOINTMENTS.length} appointments for ${today()}`);

  // ── Persistent patient records + demo medical history ──
  const patientIds = {};
  for (const [name, phone, gender, dob, blood, allergies, conditions, meds] of PATIENT_PROFILES) {
    const r = Q.createPatient({
      '$mrn': nextMrn(), '$user_id': null, '$full_name': name, '$dob': dob, '$gender': gender,
      '$phone': phone, '$email': null, '$address': 'Chennai', '$emergency_contact': null,
      '$blood_group': blood, '$allergies': allergies, '$chronic_conditions': conditions,
      '$past_surgeries': null, '$current_medications': meds,
      '$insurance_provider': null, '$insurance_number': null,
    });
    patientIds[phone] = r.lastInsertRowid;
  }
  // Link seeded appointments to their patient records
  for (const [patient_name, patient_phone] of APPOINTMENTS) {
    if (patientIds[patient_phone]) {
      dbRun(`UPDATE appointments SET patient_id = ? WHERE patient_phone = ? AND appt_date = ?`,
        [patientIds[patient_phone], patient_phone, today()]);
    }
  }
  console.log(`✓  Created ${PATIENT_PROFILES.length} patient profiles with persistent records`);

  // ── Demo medical history for S. Ramesh (2 past consultations) & Arjun Mehta (1) ──
  const rameshId = patientIds['9876543210'];
  const arjunId  = patientIds['9876543214'];

  // Past consultation 1 — Ramesh, Cardiology (12 Sep style history)
  const c1 = Q.createConsultation({
    $appointment_id: null, $patient_id: rameshId, $doctor_id: 1,
    $visit_date: daysAgo(30), $symptoms: 'Chest heaviness on exertion, breathlessness',
    $diagnosis: 'Stable angina — coronary artery disease',
    $clinical_notes: 'ECG shows ST depression. Continue medication, lifestyle modification advised.',
    $follow_up_days: 30, $follow_up_date: today(), $follow_up_instructions: 'Review with ECG report',
  });
  Q.upsertVitals({ '$consultation_id': c1.lastInsertRowid, '$patient_id': rameshId,
    '$temperature_c': '98.2', '$blood_pressure': '140/90', '$heart_rate': '88', '$respiratory_rate': '18',
    '$spo2': '97', '$weight_kg': '78', '$height_cm': '170' });
  Q.createPrescription({ '$consultation_id': c1.lastInsertRowid, '$patient_id': rameshId, '$doctor_id': 1,
    '$medicine_name': 'Aspirin 75mg', '$dosage': '1 tablet', '$frequency': 'Once daily', '$duration_days': '30', '$instructions': 'After breakfast' });
  Q.createPrescription({ '$consultation_id': c1.lastInsertRowid, '$patient_id': rameshId, '$doctor_id': 1,
    '$medicine_name': 'Atorvastatin 20mg', '$dosage': '1 tablet', '$frequency': 'At night', '$duration_days': '30', '$instructions': null });
  const t1 = Q.createLabTest({ '$consultation_id': c1.lastInsertRowid, '$patient_id': rameshId, '$doctor_id': 1,
    '$appointment_id': null, '$test_name': 'Lipid Profile', '$test_type': 'Laboratory', '$price': 500 });
  Q.updateLabTestStatus(t1.lastInsertRowid, 'COMPLETED',
    'Total cholesterol: 240 mg/dL (high). LDL: 160 mg/dL (high). HDL: 38 mg/dL (low).',
    'Consistent with dyslipidemia. Continue statin therapy.');
  Q.createFollowUp({ '$patient_id': rameshId, '$doctor_id': 1, '$consultation_id': c1.lastInsertRowid,
    '$recommended_date': today(), '$reason': 'Review with ECG report' });

  // Past consultation 2 — Ramesh, General Medicine
  const c2 = Q.createConsultation({
    $appointment_id: null, $patient_id: rameshId, $doctor_id: 3,
    $visit_date: daysAgo(90), $symptoms: 'Fever, body ache for 3 days',
    $diagnosis: 'Viral fever', $clinical_notes: 'Symptomatic treatment. Hydration advised.',
    $follow_up_days: null, $follow_up_date: null, $follow_up_instructions: null,
  });
  Q.upsertVitals({ '$consultation_id': c2.lastInsertRowid, '$patient_id': rameshId,
    '$temperature_c': '101.4', '$blood_pressure': '130/85', '$heart_rate': '96', '$respiratory_rate': '20',
    '$spo2': '98', '$weight_kg': '77', '$height_cm': '170' });
  Q.createPrescription({ '$consultation_id': c2.lastInsertRowid, '$patient_id': rameshId, '$doctor_id': 3,
    '$medicine_name': 'Paracetamol 500mg', '$dosage': '1 tablet', '$frequency': '3 times/day', '$duration_days': '5', '$instructions': 'Only if fever' });
  const b1 = Q.createBill({ '$bill_number': 'BILL-00001', '$patient_id': rameshId, '$appointment_id': null,
    '$consultation_charge': 400, '$test_charges': 0, '$other_charges': 0,
    '$description': 'Consultation — Dr. Meena Iyer (General Medicine)', '$total_amount': 400, '$status': 'PAID' });
  dbRun(`UPDATE bills SET paid_at = datetime('now') WHERE id = ?`, [b1.lastInsertRowid]);

  // Past consultation — Arjun, Cardiology
  const c3 = Q.createConsultation({
    $appointment_id: null, $patient_id: arjunId, $doctor_id: 2,
    $visit_date: daysAgo(14), $symptoms: 'Palpitations after climbing stairs',
    $diagnosis: 'Sinus tachycardia — benign', $clinical_notes: 'Reassuring ECG. Asthma reviewed.',
    $follow_up_days: 14, $follow_up_date: today(), $follow_up_instructions: 'Review if symptoms persist',
  });
  Q.upsertVitals({ '$consultation_id': c3.lastInsertRowid, '$patient_id': arjunId,
    '$temperature_c': '98.6', '$blood_pressure': '118/76', '$heart_rate': '102', '$respiratory_rate': '16',
    '$spo2': '99', '$weight_kg': '68', '$height_cm': '175' });
  Q.createPrescription({ '$consultation_id': c3.lastInsertRowid, '$patient_id': arjunId, '$doctor_id': 2,
    '$medicine_name': 'Cetirizine 10mg', '$dosage': '1 tablet', '$frequency': 'Once daily at night', '$duration_days': '7', '$instructions': null });
  const t2 = Q.createLabTest({ '$consultation_id': c3.lastInsertRowid, '$patient_id': arjunId, '$doctor_id': 2,
    '$appointment_id': null, '$test_name': 'CBC', '$test_type': 'Laboratory', '$price': 300 });
  Q.updateLabTestStatus(t2.lastInsertRowid, 'COMPLETED', 'Hemoglobin: 14.2 g/dL. WBC: 7,800/µL. Platelets: 2.4 lakh/µL. All within normal limits.', null);
  Q.createFollowUp({ '$patient_id': arjunId, '$doctor_id': 2, '$consultation_id': c3.lastInsertRowid,
    '$recommended_date': daysAhead(7), '$reason': 'Review palpitations' });
  console.log('✓  Created demo medical history (consultations, prescriptions, lab results, bills)');

  // ── Users ──
  const doctorHash  = await bcrypt.hash('doctor123', 10);
  const adminHash   = await bcrypt.hash('admin123',  10);
  const patientHash = await bcrypt.hash('1234',      10);

  Q.createUser('admin', 'admin', adminHash, null, 'Administrator');
  console.log('✓  Created admin user (admin / admin123)');

  for (let i = 0; i < DOCTORS.length; i++) {
    Q.createUser('doctor', DOCTOR_USERNAMES[i], doctorHash, i + 1, DOCTORS[i].$name);
  }
  console.log(`✓  Created ${DOCTORS.length} doctor users (password: doctor123)`);

  // Patient accounts — linked to their patient records
  for (const [phone, name] of PATIENT_PHONES) {
    const user = Q.createUser('patient', phone, patientHash, patientIds[phone] || null, name);
    if (!patientIds[phone] && patientIds[phone] !== 0) {
      // No profile existed — create one and link it
      const r = Q.createPatient({
        '$mrn': nextMrn(), '$user_id': user.lastInsertRowid, '$full_name': name, '$dob': null, '$gender': null,
        '$phone': phone, '$email': null, '$address': null, '$emergency_contact': null, '$blood_group': null,
        '$allergies': null, '$chronic_conditions': null, '$past_surgeries': null,
        '$current_medications': null, '$insurance_provider': null, '$insurance_number': null,
      });
      dbRun(`UPDATE users SET linked_id = ? WHERE id = ?`, [r.lastInsertRowid, user.lastInsertRowid]);
    } else {
      dbRun(`UPDATE patients SET user_id = ? WHERE id = ?`, [user.lastInsertRowid, patientIds[phone]]);
    }
  }
  console.log(`✓  Created ${PATIENT_PHONES.length} patient accounts (PIN: 1234)`);

  console.log('\n📋  Login credentials:');
  console.log('   Admin:       admin         / admin123');
  console.log('   Dr. Priya:   priya         / doctor123');
  console.log('   Dr. Meena:   meena         / doctor123');
  console.log('   Patient:     9876543214    / 1234  (Arjun Mehta — CAR-005)');
  console.log('\n✅  Done! Now run:  npm start\n');
}

const PATIENT_PHONES = [
  ['9876543214', 'Arjun Mehta'],
  ['9876543233', 'Preethi L.'],
  ['9876543241', 'Geetha P.'],
  ['9876543216', 'Mohan R.'],
];

async function seed() {
  await seedAll();
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });

module.exports = { seedAll };
