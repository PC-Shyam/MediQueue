/* ═══════════════════════════════════════════════════════════
   MediQueue — Frontend Application
   Auth-aware: reads token from localStorage, sends to API.
═══════════════════════════════════════════════════════════ */

const socket = io();

// ─── Auth helpers ──────────────────────────────────────────────────────────

const MQ = {
  get token()       { return localStorage.getItem('mq_token'); },
  get role()        { return localStorage.getItem('mq_role'); },
  get displayName() { return localStorage.getItem('mq_displayName'); },
  get linkedId()    { return localStorage.getItem('mq_linkedId'); },
  clear() {
    ['mq_token','mq_role','mq_displayName','mq_linkedId'].forEach(k => localStorage.removeItem(k));
  },
};

function authHeaders() {
  return {
    'Content-Type':  'application/json',
    'Authorization': `Bearer ${MQ.token}`,
  };
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST', headers: authHeaders() }).catch(() => {});
  MQ.clear();
  window.location.href = '/login.html';
}

// ─── Utility ──────────────────────────────────────────────────────────────

async function api(method, path, body) {
  const opts = { method, headers: authHeaders() };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  if (res.status === 401) { MQ.clear(); window.location.href = '/login.html'; return null; }
  return res.json();
}

function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type}`;
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 3000);
}

function initials(name) {
  return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2);
}

function avatarColor(name) {
  const colors = [
    ['#E0F2FE','#0369A1'], ['#F0FDF4','#166534'], ['#FEF9C3','#854D0E'],
    ['#FDF2F8','#9D174D'], ['#F5F3FF','#5B21B6'], ['#FFF7ED','#9A3412'],
  ];
  const idx = name.charCodeAt(0) % colors.length;
  return colors[idx];
}

function badgeHTML(status) {
  const map = {
    booked:          ['badge-blue',  'Booked'],
    waiting:         ['badge-amber', 'Waiting'],
    in_consultation: ['badge-green', 'In room'],
    done:            ['badge-gray',  'Done'],
    cancelled:       ['badge-red',   'Cancelled'],
  };
  const [cls, label] = map[status] || ['badge-gray', status];
  return `<span class="status-badge ${cls}">${label}</span>`;
}

// ─── Tab routing ───────────────────────────────────────────────────────────

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => {
      p.classList.remove('active');
      p.classList.add('hidden');
    });
    btn.classList.add('active');
    const pane = document.getElementById(`tab-${btn.dataset.tab}`);
    pane.classList.add('active');
    pane.classList.remove('hidden');
  });
});

// ─── Auth guard + Role-based UI ──────────────────────────────────────────

async function initAuth() {
  if (!MQ.token) { window.location.href = '/login.html'; return false; }

  const me = await api('GET', '/api/auth/me');
  if (!me) return false; // redirected to login by api()

  const role        = me.data.role;
  const displayName = me.data.displayName;
  const linkedId    = me.data.linkedId;

  // Show user badge
  const badge = document.getElementById('user-badge');
  badge.style.display = 'flex';
  document.getElementById('user-display-name').textContent = displayName || me.data.username;

  const chip = document.getElementById('user-role-chip');
  const roleStyles = {
    doctor:  { bg: '#10b98120', color: '#10b981', label: 'Doctor' },
    admin:   { bg: '#8b5cf620', color: '#8b5cf6', label: 'Admin'  },
    patient: { bg: '#3b82f620', color: '#3b82f6', label: 'Patient'},
  };
  const rs = roleStyles[role] || roleStyles.patient;
  chip.textContent = rs.label;
  chip.style.background = rs.bg;
  chip.style.color      = rs.color;

  // Show/hide tabs based on role
  const showTab = (id, show) => {
    const el = document.getElementById('nav-' + id);
    if (el) el.style.display = show ? '' : 'none';
  };

  if (role === 'patient') {
    showTab('queue',  true);
    showTab('book',   true);
    showTab('doctor', false);
    showTab('admin',  false);
    // Pre-fill queue with their phone
    if (me.data.username) {
      document.getElementById('phone-input').value = me.data.username;
    }
  } else if (role === 'doctor') {
    showTab('queue',  false);
    showTab('book',   false);
    showTab('doctor', true);
    showTab('admin',  false);
    // Auto-open doctor tab and their own queue
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => { p.classList.remove('active'); p.classList.add('hidden'); });
    const docTab = document.getElementById('nav-doctor');
    if (docTab) { docTab.classList.add('active'); }
    const pane = document.getElementById('tab-doctor');
    pane.classList.add('active');
    pane.classList.remove('hidden');
    // Auto-login to their queue if linkedId is known
    if (linkedId) {
      openDoctorDashboard(linkedId);
    }
  } else if (role === 'admin') {
    showTab('queue',  true);
    showTab('book',   true);
    showTab('doctor', true);
    showTab('admin',  true);
  }

  return { role, linkedId };
}

// ═══════════════════════════════════════════════════════════
//  TAB 1 — MY QUEUE
// ═══════════════════════════════════════════════════════════

let currentToken    = null;
let trackedDoctorId = null;

document.getElementById('track-btn').addEventListener('click', () => {
  const val = document.getElementById('token-input').value.trim().toUpperCase();
  if (!val) return showToast('Please enter a token', 'error');
  trackToken(val);
});

document.getElementById('track-phone-btn').addEventListener('click', async () => {
  const phone = document.getElementById('phone-input').value.trim();
  if (!phone) return showToast('Please enter your mobile number', 'error');
  const res = await api('GET', `/api/appointments/phone/${phone}`);
  if (!res || !res.success) return showToast((res && res.error) || 'Not found', 'error');
  document.getElementById('token-input').value = res.data.token;
  renderQueueStatus(res.data);
  subscribeToToken(res.data.token, res.data.doctor_id);
});

document.getElementById('token-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('track-btn').click();
});

async function trackToken(token) {
  const res = await api('GET', `/api/appointments/token/${token}`);
  if (!res || !res.success) return showToast((res && res.error) || 'Token not found', 'error');
  renderQueueStatus(res.data);
  subscribeToToken(token, res.data.doctor_id);
}

function subscribeToToken(token, doctorId) {
  if (currentToken === token) return;
  currentToken    = token;
  trackedDoctorId = doctorId;
  socket.emit('subscribe_token', token);
  socket.emit('subscribe_queue', doctorId);
}

socket.on('token_update', (data) => {
  if (data.token === currentToken) {
    renderQueueStatus(data);
    if (data.alert)   showToast(data.alert,   'success');
    if (data.message) showToast(data.message, 'success');
  }
});

socket.on('queue_update', (queue) => {
  if (!currentToken) return;
  const me = queue.find(q => q.token === currentToken);
  if (me) {
    document.getElementById('sq-position').textContent  = me.queue_position;
    document.getElementById('sq-wait').textContent      = me.estimated_wait_minutes || '< 1';
    document.getElementById('sq-calltime').textContent  = me.estimated_call_time || '—';
    renderAheadList(queue, currentToken);
  }
});

function renderQueueStatus(data) {
  document.getElementById('queue-status').classList.remove('hidden');
  document.getElementById('sq-patient-name').textContent = data.patient_name;
  document.getElementById('sq-doctor-info').textContent  =
    `${data.doctor_name} · ${data.department} · ${data.room}`;
  document.getElementById('sq-status-badge').innerHTML   = badgeHTML(data.status);

  document.getElementById('sq-position').textContent =
    data.status === 'done' ? '✓' : (data.queue_position || '—');
  document.getElementById('sq-wait').textContent =
    data.status === 'done' ? '0' : (data.estimated_wait_minutes ?? '—');
  document.getElementById('sq-calltime').textContent =
    data.status === 'done' ? 'Done' : (data.estimated_call_time || '—');

  const arriveBtn = document.getElementById('arrive-btn');
  const cancelBtn = document.getElementById('cancel-appt-btn');
  
  if (data.status === 'booked') {
    arriveBtn.classList.remove('hidden');
    arriveBtn.onclick = async () => {
      const res = await api('POST', `/api/queue/${data.doctor_id}/arrive`, { token: data.token });
      if (!res || !res.success) return showToast(res?.error, 'error');
      showToast("Arrival confirmed! You're in the queue.", 'success');
      arriveBtn.classList.add('hidden');
    };
    
    cancelBtn.classList.remove('hidden');
    cancelBtn.onclick = async () => {
      if (!confirm('Are you sure you want to cancel this appointment?')) return;
      const res = await api('PATCH', `/api/appointments/${data.id}/cancel`);
      if (!res || !res.success) return showToast(res?.error || 'Failed to cancel', 'error');
      showToast("Appointment cancelled successfully.", 'success');
      cancelBtn.classList.add('hidden');
      arriveBtn.classList.add('hidden');
      // The socket event will trigger a UI update automatically
    };
  } else {
    arriveBtn.classList.add('hidden');
    cancelBtn.classList.add('hidden');
  }

  const alertBox = document.getElementById('alert-box');
  if (data.status === 'in_consultation') {
    alertBox.textContent = "🎉 It's your turn! Please proceed to " + data.room;
    alertBox.classList.remove('hidden');
  } else if (data.status === 'done') {
    alertBox.textContent = '✓ Consultation complete. Thank you for visiting!';
    alertBox.classList.remove('hidden');
  } else if (data.queue_position === 1 && data.status === 'waiting') {
    alertBox.textContent = '⚡ You are next! Please be at the waiting area near ' + data.room;
    alertBox.classList.remove('hidden');
  } else {
    alertBox.classList.add('hidden');
  }
}

async function renderAheadList(queue, myToken) {
  const myIdx    = queue.findIndex(q => q.token === myToken);
  const aheadList = document.getElementById('ahead-list');
  aheadList.innerHTML = '';

  if (myIdx <= 0 && queue[0]?.token === myToken) {
    aheadList.innerHTML = '<p style="color:var(--primary);font-size:13px;font-weight:500;padding:8px 0">You are next!</p>';
    return;
  }

  const ahead = queue.slice(0, myIdx < 0 ? queue.length : myIdx);
  if (ahead.length === 0) {
    aheadList.innerHTML = '<p style="color:var(--text-hint);font-size:13px;padding:8px 0">No one currently ahead of you.</p>';
    return;
  }

  ahead.forEach((p, i) => {
    const [bg, fg] = avatarColor(p.patient_name);
    const posColors = [['#D1FAE5','#065F46'],['#FEF3C7','#92400E'],['#DBEAFE','#1E40AF']];
    const [posBg, posFg] = posColors[i] || posColors[2];
    aheadList.innerHTML += `
      <div class="ahead-item">
        <div class="ahead-pos" style="background:${posBg};color:${posFg}">${i+1}</div>
        <div class="ahead-avatar" style="background:${bg};color:${fg}">${initials(p.patient_name)}</div>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:500">${p.patient_name}</div>
          <div style="font-size:11px;color:var(--text-sub)">Token ${p.token}</div>
        </div>
        ${badgeHTML(p.status)}
      </div>`;
  });
}

// ═══════════════════════════════════════════════════════════
//  TAB 2 — BOOK APPOINTMENT
// ═══════════════════════════════════════════════════════════

let selectedSlot     = null;
let selectedDoctorId = null;

async function loadDepts() {
  const res = await api('GET', '/api/doctors/departments');
  if (!res) return;
  const sel = document.getElementById('dept-select');
  sel.innerHTML = '<option value="">Select department</option>';
  (res.data || []).forEach(d => {
    sel.innerHTML += `<option value="${d}">${d}</option>`;
  });
}

document.getElementById('dept-select').addEventListener('change', async function() {
  const dept = this.value;
  if (!dept) return;
  const res = await api('GET', `/api/doctors/by-dept/${encodeURIComponent(dept)}`);
  if (!res) return;
  const docSel = document.getElementById('doctor-select');
  docSel.innerHTML = '<option value="">Select doctor</option>';
  docSel.disabled  = false;
  (res.data || []).forEach(d => {
    docSel.innerHTML += `<option value="${d.id}">${d.name} — ${d.room}</option>`;
  });
  selectedDoctorId = null;
  selectedSlot     = null;
  document.getElementById('slots-grid').innerHTML = '<p class="hint-text">Select a doctor and date</p>';
});

document.getElementById('doctor-select').addEventListener('change', fetchSlots);
document.getElementById('appt-date').addEventListener('change',    fetchSlots);

async function fetchSlots() {
  const docId = document.getElementById('doctor-select').value;
  const date  = document.getElementById('appt-date').value;
  selectedDoctorId = docId;
  if (!docId || !date) return;
  const res = await api('GET', `/api/doctors/${docId}/slots?date=${date}`);
  if (!res) return;
  renderSlots(res.data || []);
}

function renderSlots(slots) {
  selectedSlot = null;
  const grid   = document.getElementById('slots-grid');
  grid.innerHTML = '';
  if (!slots.length) {
    grid.innerHTML = '<p class="hint-text">No slots available</p>';
    return;
  }
  slots.forEach(s => {
    const btn = document.createElement('button');
    btn.className = `slot-btn${s.available ? '' : ' taken'}`;
    btn.textContent = s.time;
    btn.disabled    = !s.available;
    if (s.available) {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedSlot = s.time;
      });
    }
    grid.appendChild(btn);
  });
}

document.getElementById('book-btn').addEventListener('click', async () => {
  const name   = document.getElementById('patient-name').value.trim();
  const phone  = document.getElementById('patient-phone').value.trim();
  const date   = document.getElementById('appt-date').value;
  const reason = document.getElementById('visit-reason').value.trim();

  if (!name)             return showToast('Please enter your name', 'error');
  if (!phone)            return showToast('Please enter your mobile number', 'error');
  if (!selectedDoctorId) return showToast('Please select a doctor', 'error');
  if (!date)             return showToast('Please select a date', 'error');
  if (!selectedSlot)     return showToast('Please select a time slot', 'error');

  const res = await api('POST', '/api/appointments', {
    patient_name: name, patient_phone: phone,
    doctor_id: parseInt(selectedDoctorId), appt_date: date,
    time_slot: selectedSlot, reason,
  });

  if (!res || !res.success) return showToast((res && res.error) || 'Booking failed', 'error');

  const d = res.data;
  document.getElementById('booking-form-wrap').classList.add('hidden');
  document.getElementById('booking-success').classList.remove('hidden');
  document.getElementById('confirmed-token').textContent = d.token;
  document.getElementById('confirmed-details').innerHTML = `
    <strong>${d.doctor_name}</strong> · ${d.department}<br>
    ${d.room} &nbsp;·&nbsp; ${d.time_slot} &nbsp;·&nbsp; ${d.appt_date}<br>
    Reason: ${d.reason || 'General consultation'}
  `;

  document.getElementById('book-another-btn').onclick = () => {
    document.getElementById('booking-form-wrap').classList.remove('hidden');
    document.getElementById('booking-success').classList.add('hidden');
    document.getElementById('patient-name').value  = '';
    document.getElementById('patient-phone').value = '';
    document.getElementById('visit-reason').value  = '';
    selectedSlot = null;
    fetchSlots(); // Refresh the slot list so the booked one disappears
  };

  document.getElementById('track-booked-btn').onclick = () => {
    document.getElementById('token-input').value = d.token;
    document.querySelectorAll('.tab-btn').forEach(b => { if (b.dataset.tab === 'queue') b.click(); });
    trackToken(d.token);
  };
});

// ═══════════════════════════════════════════════════════════
//  TAB 3 — DOCTOR VIEW
// ═══════════════════════════════════════════════════════════

let activeDoctorId = null;

async function loadDoctorLoginList() {
  const res = await api('GET', '/api/doctors');
  if (!res) return;
  const sel = document.getElementById('doctor-login-select');
  sel.innerHTML = '<option value="">Select your name</option>';
  (res.data || []).forEach(d => {
    sel.innerHTML += `<option value="${d.id}">${d.name} — ${d.department}</option>`;
  });
}

document.getElementById('doctor-login-btn').addEventListener('click', () => {
  const id = document.getElementById('doctor-login-select').value;
  if (!id) return showToast('Please select a doctor', 'error');
  openDoctorDashboard(id);
});

document.getElementById('doctor-logout-btn').addEventListener('click', () => {
  if (activeDoctorId) socket.off('queue_update');
  activeDoctorId = null;
  document.getElementById('doctor-select-wrap').classList.remove('hidden');
  document.getElementById('doctor-dashboard').classList.add('hidden');
});

async function openDoctorDashboard(doctorId) {
  activeDoctorId = doctorId;
  const doc = await api('GET', `/api/doctors/${doctorId}`);
  if (!doc) return;
  document.getElementById('d-name').textContent = doc.data.name;
  document.getElementById('d-dept').textContent = `${doc.data.department} · ${doc.data.room}`;
  document.getElementById('doctor-select-wrap').classList.add('hidden');
  document.getElementById('doctor-dashboard').classList.remove('hidden');

  socket.emit('subscribe_queue', doctorId);
  socket.on('queue_update', (queue) => {
    if (String(activeDoctorId) === String(doctorId)) renderDoctorQueue(queue);
  });
  socket.on('patient_called', ({ token, name }) => {
    showToast(`Calling ${name} — ${token}`, 'success');
  });

  await refreshDoctorQueue(doctorId);
}

async function refreshDoctorQueue(doctorId) {
  const res = await api('GET', `/api/appointments/doctor/${doctorId}`);
  if (!res) return;
  renderDoctorQueue(res.data || []);
}

function renderDoctorQueue(appts) {
  const seen     = appts.filter(a => a.status === 'done').length;
  const inQueue  = appts.filter(a => a.status === 'waiting').length;
  const upcoming = appts.filter(a => a.status === 'booked').length;
  const current  = appts.find(a => a.status === 'in_consultation');

  document.getElementById('d-seen').textContent     = seen;
  document.getElementById('d-queue').textContent    = inQueue;
  document.getElementById('d-upcoming').textContent = upcoming;

  const curCard = document.getElementById('current-patient-card');
  if (current) {
    const [bg, fg] = avatarColor(current.patient_name);
    document.getElementById('d-avatar').textContent        = initials(current.patient_name);
    document.getElementById('d-avatar').style.background   = bg;
    document.getElementById('d-avatar').style.color        = fg;
    document.getElementById('d-current-name').textContent   = current.patient_name;
    document.getElementById('d-current-reason').textContent = current.reason || 'Consultation';
    document.getElementById('d-current-token').textContent  = current.token;
    curCard.classList.remove('hidden');
  } else {
    curCard.classList.add('hidden');
  }

  const list      = document.getElementById('doctor-queue-list');
  list.innerHTML  = '';
  const activeAppts = appts.filter(a => a.status !== 'done');
  if (activeAppts.length === 0) {
    list.innerHTML = '<p style="color:var(--text-hint);font-size:13px;padding:12px 0;text-align:center">No more patients today 🎉</p>';
    return;
  }

  activeAppts.forEach((a, idx) => {
    const dotClass = {
      in_consultation: 'dot-active',
      waiting:         'dot-waiting',
      booked:          'dot-booked',
      done:            'dot-done',
    }[a.status] || 'dot-booked';

    const waitLabel = a.status === 'in_consultation' ? 'In room' :
                      a.status === 'waiting' ? `~${idx * (a.avg_consult_minutes || 7)} min` :
                      a.time_slot;

    list.innerHTML += `
      <div class="queue-item">
        <div class="queue-dot ${dotClass}"></div>
        <div class="queue-item-info">
          <div class="queue-item-name">${a.patient_name}</div>
          <div class="queue-item-sub">${a.token} &nbsp;·&nbsp; ${a.reason || 'Consultation'}</div>
        </div>
        <div class="queue-item-right">
          ${badgeHTML(a.status)}
          <div class="wait-time" style="margin-top:4px">${waitLabel}</div>
        </div>
      </div>`;
  });
}

document.getElementById('call-next-btn').addEventListener('click', async () => {
  if (!activeDoctorId) return;
  const res = await api('POST', `/api/queue/${activeDoctorId}/call-next`);
  if (!res || !res.success) return showToast((res && res.error) || 'Error', 'error');
  showToast(`Calling: ${res.data.called.patient_name}`, 'success');
  await refreshDoctorQueue(activeDoctorId);
});

document.getElementById('mark-done-btn').addEventListener('click', async () => {
  if (!activeDoctorId) return;
  const res = await api('POST', `/api/queue/${activeDoctorId}/done`);
  if (!res || !res.success) return showToast((res && res.error) || 'Error', 'error');
  showToast('Consultation marked as done ✓', 'success');
  await refreshDoctorQueue(activeDoctorId);
});

// ═══════════════════════════════════════════════════════════
//  TAB 4 — ADMIN
// ═══════════════════════════════════════════════════════════

async function loadAdminStats() {
  const res = await api('GET', '/api/queue/stats/overview');
  if (!res || !res.success) return;
  const { stats, doctors } = res.data;

  document.getElementById('a-active').textContent   = stats.active_tokens || 0;
  document.getElementById('a-seen').textContent     = stats.seen_today || 0;
  document.getElementById('a-upcoming').textContent = stats.upcoming || 0;
  document.getElementById('a-avg').textContent      = stats.avg_consult_minutes
    ? Math.round(stats.avg_consult_minutes) : '—';

  renderAdminDoctors(doctors);
  renderAdminAlerts(doctors);
  renderManageDoctors(doctors);
}

function renderAdminDoctors(doctors) {
  const list = document.getElementById('admin-doctors-list');
  list.innerHTML = '';
  doctors.forEach(d => {
    const total  = d.active_queue + d.seen_today + d.upcoming_today;
    const load   = total > 0 ? Math.round((d.active_queue / d.max_patients) * 100) : 0;
    const barCls = load >= 80 ? 'red' : load >= 50 ? 'amber' : '';
    const badge  = d.active_queue >= d.max_patients * 0.8
      ? `<span class="status-badge badge-red">Overloaded</span>`
      : d.active_queue >= d.max_patients * 0.5
      ? `<span class="status-badge badge-amber">Near capacity</span>`
      : `<span class="status-badge badge-green">Available</span>`;

    list.innerHTML += `
      <div class="doctor-card">
        <div class="doctor-card-header">
          <div>
            <div class="doctor-card-name">${d.name}</div>
            <div class="doctor-card-dept">${d.department} · ${d.room}</div>
          </div>
          ${badge}
        </div>
        <div class="doctor-card-stats">
          <span>✓ Seen: <strong>${d.seen_today}</strong></span>
          <span>⏳ Queue: <strong>${d.active_queue}</strong></span>
          <span>📋 Upcoming: <strong>${d.upcoming_today}</strong></span>
          <span>Max: ${d.max_patients}</span>
        </div>
        <div class="load-bar">
          <div class="load-fill ${barCls}" style="width:${Math.min(load,100)}%"></div>
        </div>
      </div>`;
  });
}

function renderAdminAlerts(doctors) {
  const alerts = document.getElementById('admin-alerts');
  alerts.innerHTML = '';

  const overloaded = doctors.filter(d => d.active_queue >= d.max_patients * 0.8 && d.is_available);
  const available  = doctors.filter(d => d.active_queue <  d.max_patients * 0.4 && d.is_available);

  if (overloaded.length === 0) {
    alerts.innerHTML = '<p style="color:var(--text-hint);font-size:13px;padding:8px 0">No alerts — all queues within normal capacity ✓</p>';
    return;
  }

  overloaded.forEach(doc => {
    const helper = available.find(a => a.department === doc.department && a.id !== doc.id) || available[0];
    alerts.innerHTML += `
      <div class="alert-item">
        <strong>⚠ ${doc.name} is overloaded</strong>
        <p>${doc.active_queue} patients in active queue (max: ${doc.max_patients}).
        ${helper
          ? `Consider reassigning non-urgent patients to ${helper.name} who has capacity (${helper.active_queue} in queue).`
          : 'No other available doctor found for redistribution.'
        }</p>
      </div>`;
  });
}

// ── Manage Doctors ────────────────────────────────────────────────────────

function renderManageDoctors(doctors) {
  const list = document.getElementById('manage-doctors-list');
  list.innerHTML = '';
  if (!doctors.length) {
    list.innerHTML = '<p style="color:var(--text-hint);font-size:13px">No doctors registered.</p>';
    return;
  }
  doctors.forEach(d => {
    list.innerHTML += `
      <div class="doctor-card" style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px">
        <div>
          <div style="font-weight:600;font-size:14px">${d.name}</div>
          <div style="font-size:12px;color:var(--text-sub)">${d.department} · ${d.room} · Max: ${d.max_patients}</div>
        </div>
        <button onclick="removeDoctor(${d.id}, '${d.name.replace(/'/g,"\\'")}')}"
          style="background:#ef444415;border:1px solid #ef444440;color:#ef4444;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;transition:all 0.15s"
          onmouseover="this.style.background='#ef444430'" onmouseout="this.style.background='#ef444415'">
          Remove
        </button>
      </div>`;
  });
}

function toggleAddDoctorForm() {
  const form = document.getElementById('add-doctor-form');
  form.classList.toggle('hidden');
  document.getElementById('add-doctor-result').style.display = 'none';
}

async function submitAddDoctor() {
  const name  = document.getElementById('new-doc-name').value.trim();
  const dept  = document.getElementById('new-doc-dept').value.trim();
  const room  = document.getElementById('new-doc-room').value.trim();
  const max   = parseInt(document.getElementById('new-doc-max').value) || 20;
  const avg   = parseInt(document.getElementById('new-doc-avg').value) || 7;

  if (!name || !dept || !room) return showToast('Name, department and room are required', 'error');

  const res = await api('POST', '/api/doctors', {
    name, department: dept, room, max_patients: max, avg_consult_minutes: avg,
  });
  if (!res || !res.success) return showToast((res && res.error) || 'Failed to add doctor', 'error');

  const result = document.getElementById('add-doctor-result');
  result.style.display = 'block';
  result.style.color   = '#10b981';
  result.innerHTML = `✓ ${res.data.doctor.name} added!<br>
    Login: <strong>${res.data.username}</strong> / <strong>doctor123</strong>`;

  // Clear form
  ['new-doc-name','new-doc-dept','new-doc-room'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('new-doc-max').value = 20;
  document.getElementById('new-doc-avg').value = 7;

  showToast(`${res.data.doctor.name} added successfully!`, 'success');
  await loadAdminStats();
}

async function removeDoctor(id, name) {
  if (!confirm(`Remove ${name} from MediQueue?\n\nThis will cancel their active appointments and remove their login.`)) return;
  const res = await api('DELETE', `/api/doctors/${id}`);
  if (!res || !res.success) return showToast((res && res.error) || 'Failed to remove doctor', 'error');
  showToast(`${name} removed successfully`, 'success');
  await loadAdminStats();
}

socket.on('stats_update',    () => loadAdminStats());
socket.on('doctor_update',   () => loadAdminStats());
socket.on('doctor_removed',  () => loadAdminStats());

// ─── Init ──────────────────────────────────────────────────────────────────

(async function init() {
  const authResult = await initAuth();
  if (!authResult) return;

  document.getElementById('appt-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('appt-date').min   = new Date().toISOString().split('T')[0];

  await Promise.all([
    loadDepts(),
    loadDoctorLoginList(),
    loadAdminStats(),
  ]);

  setInterval(loadAdminStats, 30_000);
})();
