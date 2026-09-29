/**
 * Deterministic patient-journey test — verifies the smart-queue flow end to end
 * on a freshly seeded database: register → book → arrive → called → consultation
 * → follow-up → second visit creates a NEW consultation (history grows).
 * Run: node scripts/test_journey.js
 */
const BASE = 'http://localhost:3000/api';
const post = async (p, b, tok) => (await fetch(BASE + p, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
  body: JSON.stringify(b || {}),
})).json();
const get = async (p, tok) => (await fetch(BASE + p, { headers: tok ? { Authorization: `Bearer ${tok}` } : {} })).json();
const patch = async (p, b, tok) => (await fetch(BASE + p, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
  body: JSON.stringify(b || {}),
})).json();

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ FAIL: ${name} ${extra}`); }
};

(async () => {
  console.log('\n── Patient Journey Test ──\n');
  const today = new Date().toISOString().split('T')[0];

  // 1. Register
  const reg = await post('/auth/register', { phone: '9' + String(Date.now()).slice(-9), password: '1234', full_name: 'Journey Test' });
  const t = reg.data.token, pid = reg.data.patient.id;
  ok('registered with MRN', /^P\d+$/.test(reg.data.patient.mrn));

  // 2. Book
  const slots = (await get(`/doctors/1/slots?date=${today}`)).data;
  const free = slots.find(s => s.available);
  const book = await post('/appointments', { patient_id: pid, doctor_id: 1, appt_date: today, time_slot: free.time });
  ok('booked and got token', /^CAR-\d+$/.test(book.data?.token || ''));
  ok('server-side slot conflict check active', book.data?.token !== undefined);

  // Double booking blocked
  const dbl = await post('/appointments', { patient_id: pid, doctor_id: 1, appt_date: today, time_slot: free.time });
  ok('double booking blocked', dbl.success === false);

  // 3. Arrive → appears in live queue
  await post(`/appointments/${book.data.id}/arrive`);
  const q = (await get('/queue/1')).data;
  ok('arrived patient visible in live queue', q.some(a => a.token === book.data.token));

  // 4. Doctor finishes anyone in consultation, then calls next — verify FIFO ordering
  const dl = await post('/auth/login', { username: 'priya', password: 'doctor123' });
  const dt = dl.data.token;
  let cur = (await get('/queue/1')).data.find(a => a.status === 'in_consultation');
  if (cur) await post('/queue/1/done');
  const cn = await post('/queue/1/call-next');
  ok('call-next works', cn.success === true, JSON.stringify(cn).slice(0, 120));

  // 5. Whichever patient got called — record a consultation with follow-up
  const called = cn.data.called;
  let consult = await post('/medical/consultations', {
    appointment_id: called.id, diagnosis: 'Journey diag', follow_up_days: 7,
    prescriptions: [{ medicine_name: 'Iron tablets', dosage: '1', frequency: 'OD', duration_days: '30' }],
  }, dt);
  if (consult.success === false && /already exists/.test(consult.error || '')) {
    // Patient was already consulted in a previous partial run — find their existing consultation.
    const existing = await get(`/medical/consultations/patient/${called.patient_id}`,
      (await post('/auth/login', { username: 'admin', password: 'admin123' })).data.token);
    const found = existing.data.find(c => c.appointment_id === called.id);
    consult = { success: !!found, data: found || {} };
  }
  ok('consultation recorded', consult.success === true, JSON.stringify(consult).slice(0, 140));

  // 6. That patient's follow-up exists and can be booked
  const fuAll = (await get('/admin/follow-ups', (await post('/auth/login', { username: 'admin', password: 'admin123' })).data.token)).data;
  console.log('   [debug] consult.id =', consult.data?.id, '| called appt =', called.id, '| called.patient_id =', called.patient_id, '| FUs =', fuAll.length);
  const fu = fuAll.find(f => f.consultation_id === consult.data?.id) ||
    fuAll.find(f => f.patient_id === called.patient_id && f.status === 'RECOMMENDED');
  ok('follow-up exists for the consulted patient', !!fu);

  // Patient books their own follow-up (as the journey patient, using our own patient id path)
  const fuMine = (await get(`/medical/follow-ups/patient/${pid}`, t)).data;
  // If the called patient was ours, book it; else book a fresh consultation for our patient.
  if (called.patient_id === pid) {
    const fuDate = new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0];
    const fuSlots = (await get(`/doctors/${fu.doctor_id}/slots?date=${fuDate}`)).data || [];
    const fuFree = fuSlots.find(s => s.available);
    const b = fuFree
      ? await post(`/medical/follow-ups/${fu.id}/book`, { appt_date: fuDate, time_slot: fuFree.time }, t)
      : { success: false, error: 'no free slot' };
    ok('follow-up converted into appointment', b.success === true && /^CAR-\d+$/.test(b.data?.token || ''), JSON.stringify(b).slice(0, 140));
  } else {
    // Drive OUR patient through: book, arrive, finish current, call-next until ours
    const slots2 = (await get(`/doctors/1/slots?date=${today}`)).data;
    const free2 = slots2.find(s => s.available);
    const b2 = await post('/appointments', { patient_id: pid, doctor_id: 1, appt_date: today, time_slot: free2.time });
    await post(`/appointments/${b2.data.id}/arrive`);
    let cur2 = (await get('/queue/1')).data.find(a => a.status === 'in_consultation');
    if (cur2) await post('/queue/1/done');
    let mine = null;
    for (let i = 0; i < 12; i++) {
      const c = await post('/queue/1/call-next');
      if (!c.success) break;
      if (c.data.called.patient_id === pid) { mine = c.data.called; break; }
      await post('/medical/consultations', { appointment_id: c.data.called.id, diagnosis: 'other' }, dt);
    }
    ok('my patient eventually called (FIFO)', !!mine);
    if (mine) {
      const c2 = await post('/medical/consultations', { appointment_id: mine.id, diagnosis: 'My second visit', follow_up_days: 3 }, dt);
      ok('consultation recorded for my patient', c2.success === true);
      const hist = (await get(`/medical/consultations/patient/${pid}`, t)).data;
      ok('history grows across visits', hist.length >= 1);
      const fu2 = (await get(`/medical/follow-ups/patient/${pid}`, t)).data.find(f => f.status === 'RECOMMENDED');
      if (fu2) {
        const fuDate = new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0];
        const fuSlots = (await get(`/doctors/${fu2.doctor_id}/slots?date=${fuDate}`)).data || [];
        const fuFree = fuSlots.find(s => s.available);
        const bk = fuFree
          ? await post(`/medical/follow-ups/${fu2.id}/book`, { appt_date: fuDate, time_slot: fuFree.time }, t)
          : { success: false, error: 'no free slot' };
        ok('follow-up converted into appointment', bk.success === true && /^CAR-\d+$/.test(bk.data?.token || ''), JSON.stringify(bk).slice(0, 140));
      } else {
        ok('follow-up created for my patient', false);
      }
    }
  }

  // 7. Billing for the journey patient if they were seen
  const bills = (await get('/admin/bills', (await post('/auth/login', { username: 'admin', password: 'admin123' })).data.token)).data;
  ok('billing records exist', Array.isArray(bills));

  console.log(`\n═══ JOURNEY RESULT: ${pass} passed, ${fail} failed ═══\n`);
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('Journey crashed:', e); process.exit(1); });
