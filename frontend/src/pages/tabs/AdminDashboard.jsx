import React, { useState, useEffect } from 'react';
import api from '../../api';
import { useSocket } from '../../context/SocketContext';
import { Card, Button, Badge, Modal, EmptyState, LoadingState, fmtDate, fmtMoney } from '../../components/UI';
import CustomSelect from '../../components/CustomSelect';
import { Plus, Trash2, ShieldCheck, Activity, Users, Clock, Settings, UserPlus, FlaskConical, ReceiptText, Building2 } from 'lucide-react';

const AdminDashboard = () => {
  const [section, setSection] = useState('overview');
  const [stats, setStats] = useState(null);
  const [doctors, setDoctors] = useState([]);
  const [selectedDrId, setSelectedDrId] = useState('');
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newDoctor, setNewDoctor] = useState({ name: '', department: '', room: '', fee: 500 });
  const socket = useSocket();

  // section data
  const [patients, setPatients] = useState([]);
  const [patientQ, setPatientQ] = useState('');
  const [labTests, setLabTests] = useState([]);
  const [bills, setBills] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [newDept, setNewDept] = useState('');

  const fetchStats = async () => {
    try {
      const res = await api.get('/queue/stats/overview');
      if (res.success) { setStats(res.data.stats); setDoctors(res.data.doctors); }
      const a = await api.get('/admin/stats');
      if (a.success) setAdminStats(a.data);
    } catch (e) { /* silent */ } finally { setLoading(false); }
  };
  const [adminStats, setAdminStats] = useState(null);

  const loadSection = async (s) => {
    try {
      if (s === 'patients') { const r = await api.get(`/admin/patients?q=${encodeURIComponent(patientQ)}`); if (r.success) setPatients(r.data); }
      if (s === 'labs') { const r = await api.get('/admin/lab-tests'); if (r.success) setLabTests(r.data); }
      if (s === 'billing') { const r = await api.get('/admin/bills'); if (r.success) setBills(r.data); }
      if (s === 'departments') { const r = await api.get('/admin/departments'); if (r.success) setDepartments(r.data); }
    } catch (e) { /* silent */ }
  };

  useEffect(() => { fetchStats(); }, []);
  useEffect(() => { loadSection(section); }, [section, patientQ]);
  useEffect(() => {
    if (!socket) return;
    socket.on('stats_update', fetchStats);
    socket.on('doctor_update', fetchStats);
    return () => { socket.off('stats_update'); socket.off('doctor_update'); };
  }, [socket]);

  const removeDoctor = async (id, name) => {
    if (!confirm(`Remove Dr. ${name}?`)) return;
    await api.delete(`/doctors/${id}`);
    setSelectedDrId('');
    fetchStats();
  };

  const handleAddDoctor = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/doctors', newDoctor);
      if (res.success) { setShowAddForm(false); fetchStats(); alert(`Doctor added. Login: ${res.data.username} / doctor123`); }
    } catch (e) { alert(e.error); }
  };

  const updateTest = async (id, status, extra = {}) => {
    try {
      await api.patch(`/medical/lab-tests/${id}/status`, { status, ...extra });
      loadSection('labs');
    } catch (e) { alert(e.error || 'Update failed'); }
  };

  const markPaid = async (id) => {
    try { await api.patch(`/admin/bills/${id}/status`, { status: 'PAID' }); loadSection('billing'); fetchStats(); }
    catch (e) { alert(e.error || 'Update failed'); }
  };

  const addDepartment = async () => {
    if (!newDept.trim()) return;
    try { await api.post('/admin/departments', { name: newDept }); setNewDept(''); loadSection('departments'); }
    catch (e) { alert(e.error || 'Could not add'); }
  };

  const selectedDoctor = doctors.find(d => d.id === parseInt(selectedDrId));

  if (loading) return <LoadingState label="Analyzing hospital pulse…" />;

  return (
    <div className="animate-in">
      <div className="pill-toggle mb-10">
        {[['overview', 'Overview'], ['patients', 'Patients'], ['labs', 'Labs'], ['billing', 'Billing'], ['departments', 'Depts']].map(([id, label]) => (
          <button key={id} onClick={() => setSection(id)} className={section === id ? 'active' : ''} style={{ fontSize: '7.5px' }}>{label}</button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {section === 'overview' && (
        <>
          <div className="grid grid-cols-2 gap-3 mb-6">
            <Stat icon={<Users size={12} className="text-teal-600" />} label="PATIENTS" val={adminStats?.total_patients} />
            <Stat icon={<Activity size={12} className="text-blue-500" />} label="TODAY'S APPTS" val={adminStats?.todays_appointments} />
            <Stat icon={<Clock size={12} className="text-amber-500" />} label="WAITING NOW" val={adminStats?.currently_waiting} />
            <Stat icon={<ShieldCheck size={12} className="text-emerald-600" />} label="COMPLETED" val={adminStats?.completed_today} />
            <Stat icon={<Activity size={12} className="text-emerald-500" />} label="IN CONSULT" val={adminStats?.in_consultation} />
            <Stat icon={<Users size={12} className="text-gray-400" />} label="DOCTORS ON" val={adminStats?.doctors_available} />
            <Stat icon={<FlaskConical size={12} className="text-purple-500" />} label="LABS PENDING" val={adminStats?.pending_lab_tests} />
            <Stat icon={<ReceiptText size={12} className="text-red-500" />} label="BILLS DUE" val={adminStats?.pending_bills} sub={fmtMoney(adminStats?.pending_amount)} />
          </div>
          {adminStats?.cancelled_today > 0 && (
            <div className="note note-info" style={{ marginBottom: '20px' }}>{adminStats.cancelled_today} appointment(s) cancelled today.</div>
          )}

          <div className="flex items-center justify-between mb-8 pb-4 border-b border-gray-50">
            <div className="flex items-center gap-3">
              <Settings size={16} className="text-gray-400" />
              <p className="subtitle" style={{ marginBottom: '0' }}>Staff Management</p>
            </div>
            <button className="add-round-btn" onClick={() => setShowAddForm(!showAddForm)}>
              {showAddForm ? <Plus size={20} style={{ transform: 'rotate(45deg)' }} /> : <UserPlus size={20} />}
            </button>
          </div>

          {showAddForm && (
            <Card className="mb-10 animate-in" style={{ border: '1px solid var(--primary)', background: '#F0FDFA' }}>
              <p className="subtitle mb-6">Register New Specialist</p>
              <form onSubmit={handleAddDoctor} className="flex-col gap-4">
                <input className="input-sleek" placeholder="Dr. Full Name" value={newDoctor.name} onChange={e => setNewDoctor({ ...newDoctor, name: e.target.value })} required />
                <input className="input-sleek" placeholder="Department" value={newDoctor.department} onChange={e => setNewDoctor({ ...newDoctor, department: e.target.value })} required />
                <input className="input-sleek" placeholder="Room Number" value={newDoctor.room} onChange={e => setNewDoctor({ ...newDoctor, room: e.target.value })} required />
                <input className="input-sleek" placeholder="Consultation Fee (₹)" value={newDoctor.fee} onChange={e => setNewDoctor({ ...newDoctor, fee: e.target.value })} />
                <div className="mt-4"><Button type="submit">SAVE DATA</Button></div>
              </form>
            </Card>
          )}

          <div className="mb-8">
            <p className="subtitle text-center mb-4">View Specialist Details</p>
            <CustomSelect
              options={doctors.map(d => ({ value: d.id, label: `${d.name} (${d.department})` }))}
              value={selectedDrId}
              onChange={(val) => setSelectedDrId(val)}
              placeholder="— Select a Doctor to Manage —"
            />
          </div>

          {selectedDoctor && (
            <div className="animate-in p-6 bg-white border-sleek rounded-3xl shadow-sm mb-10">
              <div className="flex justify-between items-center mb-8">
                <div style={{ textAlign: 'left' }}>
                  <p className="text-lg font-bold text-gray-900" style={{ marginBottom: '6px' }}>{selectedDoctor.name}</p>
                  <p className="subtitle" style={{ marginBottom: '0', color: '#94A3B8', fontSize: '10px' }}>{selectedDoctor.department}</p>
                </div>
                <button className="delete-btn-hover round-btn" onClick={() => removeDoctor(selectedDoctor.id, selectedDoctor.name)}>
                  <Trash2 size={18} />
                </button>
              </div>
              <div className="flex justify-between items-center pt-6 border-t border-gray-50">
                <p className="text-[11px] font-bold text-gray-900">
                  <span className="text-teal-600">{selectedDoctor.seen_today}</span> SEEN &bull; <span className="text-amber-500">{selectedDoctor.active_queue}</span> WAITING
                </p>
                <Badge variant="gray">{selectedDoctor.room}</Badge>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── PATIENTS ── */}
      {section === 'patients' && (
        <>
          <input className="input-sleek" placeholder="Search name / phone / patient ID…" value={patientQ} onChange={e => setPatientQ(e.target.value)} />
          {patients.length === 0 && <EmptyState title="No patients found" />}
          <div className="flex-col gap-3" style={{ alignItems: 'stretch' }}>
            {patients.slice(0, 30).map(p => (
              <div key={p.id} className="list-row">
                <div className="row-main">
                  <p className="row-title">{p.full_name}</p>
                  <p className="row-sub">{p.mrn} · {p.phone}</p>
                </div>
                <div className="row-side">
                  <span className="mrn-chip">🩸 {p.blood_group || '—'}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── LABS ── */}
      {section === 'labs' && (
        <>
          {labTests.length === 0 && <EmptyState icon={<FlaskConical size={26} />} title="No lab tests" />}
          <div className="flex-col gap-3" style={{ alignItems: 'stretch' }}>
            {labTests.map(t => (
              <div key={t.id} className="list-row">
                <div className="row-main">
                  <p className="row-title">🔬 {t.test_name} — {t.patient_name}</p>
                  <p className="row-sub">{t.mrn} · Dr. {t.doctor_name} · {fmtDate(t.requested_at)} · {fmtMoney(t.price)}</p>
                  {t.result && <p style={{ fontSize: '10px', color: '#374151', marginTop: '4px' }}>Result: {t.result}</p>}
                </div>
                <div className="row-side flex-col gap-2" style={{ alignItems: 'flex-end' }}>
                  <Badge>{t.status}</Badge>
                  {t.status === 'REQUESTED' && <button className="notif-clear" onClick={() => updateTest(t.id, 'SAMPLE_COLLECTED')}>Collect →</button>}
                  {t.status === 'SAMPLE_COLLECTED' && <button className="notif-clear" onClick={() => updateTest(t.id, 'PROCESSING')}>Process →</button>}
                  {(t.status === 'PROCESSING' || t.status === 'SAMPLE_COLLECTED') && (
                    <button className="notif-clear" style={{ color: '#059669' }} onClick={() => {
                      const result = prompt(`Result for ${t.test_name} (${t.patient_name}):`);
                      if (result) updateTest(t.id, 'COMPLETED', { result });
                    }}>Complete…</button>
                  )}
                  {t.status !== 'COMPLETED' && t.status !== 'CANCELLED' && (
                    <button className="notif-clear" style={{ color: '#DC2626' }} onClick={() => updateTest(t.id, 'CANCELLED')}>Cancel</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── BILLING ── */}
      {section === 'billing' && (
        <>
          {bills.length === 0 && <EmptyState icon={<ReceiptText size={26} />} title="No bills" />}
          <div className="flex-col gap-3" style={{ alignItems: 'stretch' }}>
            {bills.map(b => (
              <div key={b.id} className="list-row">
                <div className="row-main">
                  <p className="row-title">{b.bill_number} · {fmtMoney(b.total_amount)}</p>
                  <p className="row-sub">{b.patient_name} · {fmtDate(b.created_at)}</p>
                  {b.description && <p style={{ fontSize: '10px', color: '#94A3B8', marginTop: '4px' }}>{b.description}</p>}
                </div>
                <div className="row-side flex-col gap-2" style={{ alignItems: 'flex-end' }}>
                  <Badge>{b.status}</Badge>
                  {b.status === 'PENDING' && <button className="notif-clear" style={{ color: '#059669' }} onClick={() => markPaid(b.id)}>Mark Paid</button>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── DEPARTMENTS ── */}
      {section === 'departments' && (
        <>
          <div className="btn-row" style={{ marginBottom: '16px' }}>
            <input className="input-sleek" style={{ maxWidth: '200px', marginBottom: 0 }} placeholder="New department" value={newDept} onChange={e => setNewDept(e.target.value)} />
            <Button className="btn-sm" onClick={addDepartment}><Building2 size={13} /> Add</Button>
          </div>
          <div className="flex-col gap-3" style={{ alignItems: 'stretch' }}>
            {departments.map(d => (
              <div key={d.id} className="list-row">
                <div className="row-main">
                  <p className="row-title">{d.name}</p>
                  {d.description && <p style={{ fontSize: '10px', color: '#94A3B8', marginTop: '3px' }}>{d.description}</p>}
                </div>
                <button className="notif-clear" style={{ color: '#DC2626' }} onClick={async () => {
                  if (!confirm(`Delete ${d.name}?`)) return;
                  try { await api.delete(`/admin/departments/${d.id}`); loadSection('departments'); }
                  catch (e) { alert(e.error || 'Cannot delete'); }
                }}><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

const Stat = ({ icon, label, val, sub }) => (
  <div className="p-5 bg-white border-sleek rounded-3xl text-center shadow-sm">
    <div className="flex items-center justify-center gap-2 mb-2">
      {icon}
      <p className="subtitle" style={{ marginBottom: '0', fontSize: '9px' }}>{label}</p>
    </div>
    <p className="text-xl font-bold text-gray-900">{val ?? '—'}</p>
    {sub && <p className="stat-sub">{sub}</p>}
  </div>
);

export default AdminDashboard;
