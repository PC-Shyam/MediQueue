/**
 * End-to-end validation of the MediQueue Patient Management System API.
 * Run with the server up on :3000 (fresh seeded DB): node scripts/test_e2e.js
 */
const BASE = 'http://localhost:3000/api';
let pass = 0, fail = 0;

const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ FAIL: ${name} ${extra}`); }
};

const req = async (method, path, body, token) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
};

(async () => {
  console.log('\n── MediQueue E2E ──\n');

  // ── 1. Patient registration ──
  const e2ePhone = '99' + String(Date.now()).slice(-8); // unique per run
  const reg = await req('POST', '/auth/register', {
    phone: e2ePhone, password: '1234', full_name: 'Rahul Kumar', gender: 'Male', blood_group: 'O+',
  });
  ok('patient registration', reg.status === 201 && reg.json.data?.patient?.mrn?.startsWith('P'), JSON.stringify(reg.json));
  const pTok = reg.json.data.token;
  const pId = reg.json.data.patient.id;

  const dup = await req('POST', '/auth/register', { phone: e2ePhone, password: '1234', full_name: 'X' });
  ok('duplicate registration rejected', dup.status === 409);

  // ── 2. Login flows ──
  const login = await req('POST', '/auth/login', { username: '9876543214', password: '1234' }); // seeded patient Arjun
  ok('patient login (phone/PIN)', login.status === 200 && login.json.data.role === 'patient');
  const arjunTok = login.json.data.token;
  const arjunId = login.json.data.linkedId;
  ok('seeded patient auto-linked', arjunId > 0, `linkedId=${arjunId}`);

  const docLogin = await req('POST', '/auth/login', { username: 'priya', password: 'doctor123' });
  ok('doctor login', docLogin.status === 200 && docLogin.json.data.role === 'doctor');
  const dTok = docLogin.data || docLogin.json.data.token;

  const admLogin = await req('POST', '/auth/login', { username: 'admin', password: 'admin123' });
  ok('admin login', admLogin.status === 200);
  const aTok = admLogin.json.data.token;

  const bad = await req('POST', '/auth/login', { username: 'admin', password: 'wrong' });
  ok('wrong password rejected', bad.status === 401);

  // ── 3. Appointment booking (patient session) ──
  const docId = 1;
  const slots = await req('GET', `/doctors/${docId}/slots?date=${new Date().toISOString().split('T')[0]}`);
  ok('slot list works', slots.status === 200 && Array.isArray(slots.json.data));
  const free = slots.json.data.find(s => s.available);
  ok('a free slot exists', !!free);

  const book = await req('POST', '/appointments', {
    patient_id: pId, doctor_id: docId, appt_date: new Date().toISOString().split('T')[0],
    time_slot: free.time, reason: 'Chest pain',
  });
  ok('patient books appointment', book.status === 201 && /^CAR-\d+$/.test(book.json.data.token), JSON.stringify(book.json));
  const apptId = book.json.data.id;
  const apptToken = book.json.data.token;

  const dbl = await req('POST', '/appointments', {
    patient_id: pId, doctor_id: docId, appt_date: new Date().toISOString().split('T')[0],
    time_slot: free.time, reason: 'Again',
  });
  ok('double-booking blocked', dbl.status === 409);

  // Legacy guest booking still works (pick a genuinely free slot for doctor 3)
  const gSlots = (await req('GET', `/doctors/3/slots?date=${new Date().toISOString().split('T')[0]}`)).json?.data || (await req('GET', `/doctors/3/slots?date=${new Date().toISOString().split('T')[0]}`)).data;
  const gFree = (gSlots || []).find(s => s.available);
  const guest = gFree ? await req('POST', '/appointments', {
    patient_name: 'Walk-in Guest', patient_phone: '9000000001', doctor_id: 3,
    appt_date: new Date().toISOString().split('T')[0], time_slot: gFree.time, reason: 'Cold',
  }) : { status: 404 };
  ok('legacy guest booking works', guest.status === 201);

  // ── 4. Token / queue preserved ──
  const tok = await req('GET', `/appointments/token/${apptToken}`);
  ok('token lookup works', tok.status === 200 && tok.json.data.token === apptToken);

  const arrive = await req('POST', `/appointments/${apptId}/arrive`);
  ok('patient marks arrived', arrive.status === 200);

  const queue = await req('GET', `/queue/${docId}`);
  ok('queue shows arrived patient', queue.json.data.some(q => q.token === apptToken));

  // Complete any seeded in-consultation patient first (call-next refuses while one is in the room)
  const curDoc = await req('POST', `/queue/${docId}/done`);
  const call = await req('POST', `/queue/${docId}/call-next`);
  ok('doctor calls next', call.status === 200, JSON.stringify(call.json).slice(0, 120));

  // ── 5. Consultation context + EMR creation ──
  const ctx = await req('GET', `/queue/consultation-context/${apptId}`, null, dTok);
  ok('consultation context (patient history for doctor)',
    ctx.status === 200 && ctx.json.data.patient?.mrn?.startsWith('P'), JSON.stringify(ctx.json).slice(0, 120));

  const rx = await req('POST', '/medical/consultations', {
    appointment_id: apptId,
    symptoms: 'Fever, sore throat',
    vitals: { temperature_c: '100.8', blood_pressure: '120/80', heart_rate: '92', spo2: '98', weight_kg: '70' },
    diagnosis: 'Viral infection',
    clinical_notes: 'Rest and hydration advised.',
    prescriptions: [
      { medicine_name: 'Paracetamol', dosage: '500 mg', frequency: '3 times/day', duration_days: '5', instructions: 'After food' },
      { medicine_name: 'Cetirizine', dosage: '10 mg', frequency: '1 time/day', duration_days: '3' },
    ],
    tests: [{ test_name: 'CBC' }, { test_name: 'Blood Sugar' }],
    follow_up_days: 14,
    follow_up_instructions: 'Review with reports',
  }, dTok);
  ok('doctor records consultation', rx.status === 201 && rx.json.data?.id > 0, JSON.stringify(rx.json).slice(0, 160));
  const consultId = rx.json.data?.id;

  const apptAfter = await req('GET', `/appointments/${apptId}`);
  ok('appointment marked done after consultation', apptAfter.json.data?.status === 'done');

  // New consultation created, not overwriting history
  const hist = await req('GET', `/medical/consultations/patient/${pId}`, null, pTok);
  ok('medical history has past + new consultations',
    hist.json.data?.length >= 1 && hist.json.data.some(c => c.id === consultId));

  // Double consultation blocked
  const dupConsult = await req('POST', '/medical/consultations', {
    appointment_id: apptId, diagnosis: 'X',
  }, dTok);
  ok('duplicate consultation blocked', dupConsult.status === 409);

  // ── 6. Patient views own records ──
  const meDash = await req('GET', '/patients/me/dashboard', null, pTok);
  ok('patient dashboard bundle', meDash.status === 200 && meDash.json.data?.patient?.mrn?.startsWith('P'), JSON.stringify(meDash.json).slice(0, 120));
  ok('dashboard shows last consultation', !!meDash.json.data?.last_consultation);
  ok('dashboard shows prescriptions', meDash.json.data?.recent_prescriptions?.length >= 1);
  ok('dashboard shows tests', meDash.json.data?.recent_tests?.length >= 1);
  ok('dashboard shows follow-up', !!meDash.json.data?.next_follow_up);

  const detail = await req('GET', `/medical/consultations/${consultId}`, null, pTok);
  ok('consultation detail (vitals + rx + tests)', detail.json.data?.vitals?.blood_pressure === '120/80' && detail.json.data?.prescriptions?.length === 2);

  // ── 7. Lab workflow ──
  const labList = await req('GET', '/medical/lab-tests/patient/' + pId, null, pTok);
  ok('patient lab tests list', labList.status === 200 && labList.json.data.length === 2);

  const labAdm = await req('GET', '/admin/lab-tests?status=REQUESTED', null, aTok);
  ok('admin sees requested tests', labAdm.status === 200 && labAdm.json.data.length >= 2);

  const t0 = labAdm.json.data[0];
  const up1 = await req('PATCH', `/medical/lab-tests/${t0.id}/status`, { status: 'SAMPLE_COLLECTED' }, aTok);
  ok('test status → SAMPLE_COLLECTED', up1.status === 200 && up1.json.data.status === 'SAMPLE_COLLECTED');
  const up2 = await req('PATCH', `/medical/lab-tests/${t0.id}/status`, { status: 'COMPLETED', result: 'Hemoglobin 13.5, normal counts', result_notes: 'Within normal limits' }, aTok);
  ok('test completed with result', up2.json.data?.status === 'COMPLETED' && !!up2.json.data?.result);

  const rep = await req('GET', `/medical/reports/patient/${pId}`, null, pTok);
  ok('lab report auto-added to patient documents', rep.json.data?.some(r => r.report_type === 'Lab Report'));

  // ── 8. Billing ──
  const bill = await req('POST', `/queue/${docId}/bill`, { appointment_id: apptId }, dTok);
  ok('auto bill generated', bill.status === 201 && bill.json.data?.total_amount > 0, JSON.stringify(bill.json).slice(0, 140));
  ok('bill includes test charges', bill.json.data?.test_charges === 450);

  const bills = await req('GET', `/admin/bills?status=PENDING`, null, aTok);
  ok('admin pending bills list', bills.json.data?.some(b => b.appointment_id === apptId));
  const bid = bills.json.data.find(b => b.appointment_id === apptId)?.id;
  const pay = await req('PATCH', `/admin/bills/${bid}/status`, { status: 'PAID' }, aTok);
  ok('admin marks bill PAID', pay.json.data?.status === 'PAID');

  // ── 9. Follow-up booking ──
  const fu = await req('GET', `/medical/follow-ups/patient/${pId}`, null, pTok);
  const rec = fu.json.data?.find(f => f.status === 'RECOMMENDED');
  ok('follow-up recommended', !!rec);
  // Find a genuinely free slot for the follow-up doctor on the recommended date
  const fuDate = new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0];
  const fuSlots = (await req('GET', `/doctors/${rec.doctor_id}/slots?date=${fuDate}`)).json?.data
    || (await req('GET', `/doctors/${rec.doctor_id}/slots?date=${fuDate}`)).data;
  const fuFree = (fuSlots || []).find(s => s.available);
  const fuBook = fuFree ? await req('POST', `/medical/follow-ups/${rec.id}/book`,
    { appt_date: fuDate, time_slot: fuFree.time }, pTok) : { status: 404 };
  ok('follow-up converted to appointment', fuBook.status === 201 && /^CAR-\d+$/.test(fuBook.json.data?.token || ''), JSON.stringify(fuBook.json).slice(0, 120));

  // ── 10. Security ──
  const other = await req('GET', `/medical/consultations/patient/1`, null, pTok);
  ok('patient cannot read another patient history', other.status === 403);

  const otherRec = await req('GET', '/patients/1/record', null, pTok);
  ok('patient cannot read another patient record', otherRec.status === 403);

  const noAuth = await req('GET', '/patients/me/dashboard');
  ok('unauthenticated blocked', noAuth.status === 401);

  const dr = await req('GET', '/admin/stats', null, dTok);
  ok('doctor cannot read admin stats', dr.status === 403);

  // Doctor reading only treatable patient
  const docDir = await req('GET', `/doctors/${docId}/patients`, null, dTok);
  ok('doctor patient directory', docDir.status === 200 && docDir.json.data.length >= 1);

  // ── 11. Admin stats are real ──
  const st = await req('GET', '/admin/stats', null, aTok);
  ok('admin stats total_patients counted', st.json.data?.total_patients >= 8, `got ${st.json.data?.total_patients}`);
  ok('admin stats completed_today >= 1', st.json.data?.completed_today >= 1);

  // ── 12. Profile update ──
  const upd = await req('PUT', '/patients/me', { address: '12 Anna Nagar', emergency_contact: 'Amma 9812345678' }, pTok);
  ok('patient profile update', upd.status === 200 && upd.json.data?.address === '12 Anna Nagar');

  // ── 13. Notifications ──
  const notif = await req('GET', '/auth/notifications', null, pTok);
  ok('notifications generated', notif.status === 200 && notif.json.data.length > 0);

  // ── 14. Cancel + reschedule ──
  const c1 = await req('POST', '/appointments', {
    patient_id: pId, doctor_id: 3, appt_date: new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0],
    time_slot: '3:00 PM', reason: 'Checkup',
  });
  ok('future booking ok', c1.status === 201);
  const resh = await req('POST', `/appointments/${c1.json.data.id}/reschedule`,
    { appt_date: new Date(Date.now() + 6 * 86400000).toISOString().split('T')[0], time_slot: '3:15 PM' }, pTok);
  ok('reschedule works', resh.status === 200 && resh.json.data?.time_slot === '3:15 PM');
  const cancel = await req('PATCH', `/appointments/${c1.json.data.id}/cancel`, { cancel_reason: 'Plans changed' }, pTok);
  ok('cancel works', cancel.status === 200);
  const hist2 = await req('GET', `/appointments/patient/${pId}`, null, pTok);
  ok('appointment history includes cancelled', hist2.json.data?.some(a => a.status === 'cancelled'));

  console.log(`\n═══ RESULT: ${pass} passed, ${fail} failed ═══\n`);
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('E2E crashed:', e); process.exit(1); });
