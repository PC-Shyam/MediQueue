import React, { useState, useEffect } from 'react';
import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';
import api from '../../api';
import { Card, Button, Badge, Modal, EmptyState, fmtDate, fmtMoney } from '../../components/UI';
import { ChevronRight, CheckCircle2, Stethoscope, FlaskConical, FileText } from 'lucide-react';
import ConsultationForm from './ConsultationForm';

const DoctorPanel = () => {
  const { user } = useAuth();
  const socket = useSocket();
  const [appointments, setAppointments] = useState([]);
  const [doctorInfo, setDoctorInfo] = useState(null);
  const [consulting, setConsulting] = useState(null);   // appointment being consulted
  const [recordView, setRecordView] = useState(null);   // full record modal data
  const [tests, setTests] = useState([]);

  const load = async () => {
    if (!user?.linkedId) return;
    const [docRes, apptRes] = await Promise.all([
      api.get(`/doctors/${user.linkedId}`),
      api.get(`/appointments/doctor/${user.linkedId}`),
    ]);
    if (docRes.success) setDoctorInfo(docRes.data);
    if (apptRes.success) setAppointments(apptRes.data);
  };

  useEffect(() => { load(); }, [user]);

  useEffect(() => {
    if (!user?.linkedId) return;
    api.get(`/medical/lab-tests/doctor/${user.linkedId}`).then(res => { if (res.success) setTests(res.data); }).catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!socket || !user?.linkedId) return;
    socket.emit('subscribe_queue', user.linkedId);
    const onQueue = (queue) => setAppointments(prev => {
      // merge live queue statuses into the full-day list
      const map = new Map(queue.map(q => [q.id, q]));
      return prev.map(a => map.get(a.id) || a);
    });
    socket.on('queue_update', onQueue);
    return () => socket.off('queue_update', onQueue);
  }, [socket, user]);

  const callNext = async () => { await api.post(`/queue/${user.linkedId}/call-next`); load(); };
  const markDone = async () => {
    try {
      await api.post(`/queue/${user.linkedId}/done`);
      await api.post(`/queue/${user.linkedId}/bill`, {}).catch(() => {});
      load();
    } catch (e) { alert(e.error || 'Could not complete'); }
  };
  const markNoShow = async (id) => {
    if (!confirm('Mark this patient as no-show?')) return;
    await api.patch(`/appointments/${id}/no-show`, {});
    load();
  };

  const openRecord = async (appt) => {
    if (!appt.patient_id) { alert('No linked patient record yet'); return; }
    try {
      const res = await api.get(`/patients/${appt.patient_id}/record`);
      if (res.success) setRecordView(res.data);
    } catch (e) { alert(e.error || 'Could not open record'); }
  };

  const seen = appointments.filter(a => a.status === 'done').length;
  const inQueue = appointments.filter(a => ['waiting', 'arrived', 'booked'].includes(a.status)).length;
  const current = appointments.find(a => a.status === 'in_consultation');

  return (
    <div className="animate-in">
      <div className="text-center mb-8">
        <h2 className="heading">{doctorInfo?.name || user.displayName}</h2>
        <p className="subtitle">{doctorInfo?.department} • Room {doctorInfo?.room}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="p-6 bg-white border-sleek rounded-3xl text-center">
          <p className="subtitle" style={{ marginBottom: '8px' }}>Total Seen</p>
          <p className="text-2xl font-bold text-teal-600">{seen}</p>
        </div>
        <div className="p-6 bg-white border-sleek rounded-3xl text-center">
          <p className="subtitle" style={{ marginBottom: '8px' }}>In Queue</p>
          <p className="text-2xl font-bold text-amber-500">{inQueue}</p>
        </div>
      </div>

      {/* Action central */}
      <Card className="text-center">
        {current ? (
          <div className="py-2">
            <div className="mb-6">
              <p className="subtitle" style={{ color: '#10B981', marginBottom: '8px' }}>CONSULTING NOW</p>
              <h3 className="text-xl font-bold text-gray-900">{current.patient_name}</h3>
              <p className="subtitle mt-1">Token: {current.token}{current.mrn ? ` · ${current.mrn}` : ''}</p>
              {current.patient_allergies && current.patient_allergies !== 'None known' && (
                <div className="note note-warn" style={{ marginTop: '10px', textAlign: 'center' }}>⚠ Allergies: {current.patient_allergies}</div>
              )}
            </div>
            <div className="btn-row" style={{ marginBottom: '14px' }}>
              <Button onClick={() => setConsulting(current)} className="btn-sm">
                <Stethoscope size={14} /> Record Consultation
              </Button>
              {current.patient_id && (
                <Button variant="secondary" onClick={() => openRecord(current)} className="btn-sm">
                  <FileText size={14} /> Full Record
                </Button>
              )}
            </div>
            <Button onClick={markDone} className="btn-primary">
              <CheckCircle2 size={16} style={{ marginRight: '8px', display: 'inline' }} /> Complete Session
            </Button>
          </div>
        ) : (
          <div className="py-6">
            <p className="subtitle" style={{ marginBottom: '24px' }}>Waitlist Management</p>
            <Button onClick={callNext} disabled={inQueue === 0} className="btn-primary">
              <ChevronRight size={16} style={{ marginRight: '8px', display: 'inline' }} /> Call Next Patient
            </Button>
            {inQueue === 0 && <p className="text-[10px] text-gray-300 font-bold uppercase mt-4">Queue Empty</p>}
          </div>
        )}
      </Card>

      {/* Pending test results to review */}
      {tests.filter(t => t.status === 'COMPLETED').length > 0 && (
        <div style={{ marginTop: '24px' }}>
          <div className="section-head">
            <span className="sh-title"><FlaskConical size={11} style={{ verticalAlign: '-2px' }} /> Completed Test Results</span>
          </div>
          <div className="flex-col gap-3" style={{ alignItems: 'stretch' }}>
            {tests.filter(t => t.status === 'COMPLETED').slice(0, 4).map(t => (
              <div key={t.id} className="list-row">
                <div className="row-main">
                  <p className="row-title">🔬 {t.test_name} — {t.patient_name}</p>
                  <p className="row-sub">{fmtDate(t.requested_at)}</p>
                  {t.result && <p style={{ fontSize: '10px', color: '#374151', marginTop: '4px' }}>{t.result}</p>}
                </div>
                <Badge>{t.status}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Waitlist */}
      <div className="mt-10">
        <p className="subtitle mb-6 text-center">Upcoming Patients</p>
        <div className="flex-col gap-3" style={{ alignItems: 'stretch' }}>
          {appointments.filter(a => ['waiting', 'arrived', 'booked'].includes(a.status)).slice(0, 10).map((a, i) => (
            <div key={a.id} className="list-row">
              <div className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-[10px] font-bold text-teal-600 border border-teal-50">
                  {i + 1}
                </div>
                <div style={{ textAlign: 'left' }}>
                  <p className="text-sm font-bold text-gray-800">{a.patient_name}</p>
                  <p className="subtitle mt-0.5" style={{ marginBottom: '0', fontSize: '8px' }}>{a.token} • {a.time_slot}{a.reason ? ` • ${a.reason}` : ''}</p>
                </div>
              </div>
              <div className="row-side flex-col gap-2" style={{ alignItems: 'flex-end' }}>
                <Badge variant={a.status}>{a.status}</Badge>
                <div className="btn-row">
                  {a.patient_id && <button className="notif-clear" onClick={() => openRecord(a)}>Record</button>}
                  {['booked', 'waiting', 'arrived'].includes(a.status) && (
                    <button className="notif-clear" style={{ color: '#DC2626' }} onClick={() => markNoShow(a.id)}>No-show</button>
                  )}
                </div>
              </div>
            </div>
          ))}
          {inQueue === 0 && <p className="text-center py-10 subtitle italic">The hallway is quiet...</p>}
        </div>
      </div>

      {/* Completed today */}
      {appointments.filter(a => a.status === 'done').length > 0 && (
        <div style={{ marginTop: '24px' }}>
          <p className="subtitle mb-6 text-center">Completed Today</p>
          <div className="flex-col gap-3" style={{ alignItems: 'stretch' }}>
            {appointments.filter(a => a.status === 'done').map(a => (
              <div key={a.id} className="list-row">
                <div className="row-main">
                  <p className="row-title">{a.patient_name}</p>
                  <p className="row-sub">{a.token} • {a.time_slot}</p>
                </div>
                <Badge>{a.status}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Consultation modal */}
      <Modal open={!!consulting} onClose={() => setConsulting(null)} title="Record Consultation" wide>
        {consulting && (
          <ConsultationForm
            appointment={consulting}
            onClose={() => setConsulting(null)}
            onSaved={() => { setConsulting(null); load(); }}
          />
        )}
      </Modal>

      {/* Full record modal */}
      <Modal open={!!recordView} onClose={() => setRecordView(null)} title="Patient Record" wide>
        {recordView && (
          <>
            <div style={{ textAlign: 'center', marginBottom: '14px' }}>
              <p style={{ fontSize: '15px', fontWeight: 800 }}>{recordView.patient.full_name}</p>
              <p className="subtitle" style={{ marginBottom: '8px' }}>
                {recordView.patient.mrn} · {recordView.patient.gender || '—'} {recordView.patient.dob ? `· DOB ${recordView.patient.dob}` : ''}
              </p>
              <span className="mrn-chip">🩸 {recordView.patient.blood_group || '—'}</span>
            </div>
            {(recordView.patient.allergies || recordView.patient.chronic_conditions) && (
              <div className="note note-warn" style={{ marginBottom: '12px' }}>
                {recordView.patient.allergies ? `⚠ Allergies: ${recordView.patient.allergies}` : ''}
                {recordView.patient.allergies && recordView.patient.chronic_conditions ? ' · ' : ''}
                {recordView.patient.chronic_conditions ? `Conditions: ${recordView.patient.chronic_conditions}` : ''}
              </div>
            )}
            <p className="consult-sec-title">Past Consultations ({recordView.consultations.length})</p>
            {recordView.consultations.length === 0 && <p className="empty-hint">First visit — no history yet.</p>}
            <div className="flex-col gap-3" style={{ alignItems: 'stretch', marginTop: '8px' }}>
              {recordView.consultations.map(c => (
                <div key={c.id} className="consult-card">
                  <p className="consult-date">{fmtDate(c.visit_date)}</p>
                  <p className="consult-doctor">{c.department}</p>
                  <p style={{ fontSize: '12px', fontWeight: 700, color: '#374151', marginTop: '6px' }}>{c.diagnosis}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </Modal>
    </div>
  );
};

export default DoctorPanel;
