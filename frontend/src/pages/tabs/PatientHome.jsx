import React, { useState, useEffect } from 'react';
import api from '../../api';
import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';
import { Card, Button, Badge, EmptyState, LoadingState, fmtDate, fmtMoney } from '../../components/UI';
import { CalendarDays, Activity, Pill, FlaskConical, ReceiptText, Repeat2, ClipboardList } from 'lucide-react';

/** Patient home — next appointment, live queue, recent history snapshot. */
const PatientHome = ({ goTab }) => {
  const { user } = useAuth();
  const socket = useSocket();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const res = await api.get('/patients/me/dashboard');
      if (res.success) setData(res.data);
    } catch (e) { /* handled by empty state */ } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  // Live queue refresh for today's appointment
  useEffect(() => {
    if (!socket || !data?.today?.token) return;
    const onToken = (t) => {
      if (t.token === data.today.token) {
        setData(prev => ({ ...prev, today: { ...prev.today, status: t.status, queue_position: t.queue_position, estimated_wait_minutes: t.estimated_wait_minutes, estimated_call_time: t.estimated_call_time } }));
      }
    };
    socket.on('token_update', onToken);
    return () => socket.off('token_update', onToken);
  }, [socket, data?.today?.token]);

  if (loading) return <LoadingState label="Preparing your dashboard…" />;
  if (!data) {
    return (
      <EmptyState icon={<ClipboardList size={30} />} title="No patient profile linked"
        hint="Ask the hospital front desk to link your account to a patient record." />
    );
  }

  const d = data;
  const today = d.today;

  return (
    <div className="animate-in">
      {/* Hero */}
      <div className="home-hero">
        <p className="hi-name">Hello, {d.patient.full_name.split(' ')[0]} 👋</p>
        <p className="hi-sub">Patient ID · {d.patient.mrn}</p>

        {today && (
          <div className="token-live">
            <p className="subtitle" style={{ marginBottom: '6px', fontSize: '8px' }}>Live Queue — {today.doctor_name}</p>
            <p className="tok-big">{today.token}</p>
            <div className="flex justify-center gap-4" style={{ marginTop: '8px' }}>
              <div>
                <p className="subtitle" style={{ marginBottom: '2px', fontSize: '7px' }}>Position</p>
                <p className="font-bold text-sm" style={{ color: '#0F766E' }}>{today.queue_position ?? '—'}</p>
              </div>
              <div>
                <p className="subtitle" style={{ marginBottom: '2px', fontSize: '7px' }}>Wait</p>
                <p className="font-bold text-sm text-gray-800">{today.estimated_wait_minutes != null ? `${today.estimated_wait_minutes}m` : '—'}</p>
              </div>
              <div>
                <p className="subtitle" style={{ marginBottom: '2px', fontSize: '7px' }}>Call ~</p>
                <p className="font-bold text-sm text-gray-800">{today.estimated_call_time || '—'}</p>
              </div>
            </div>
            <Badge>{today.status}</Badge>
          </div>
        )}
      </div>

      {/* Next appointment */}
      <div className="section-head">
        <span className="sh-title">Next Appointment</span>
        <button className="notif-clear" onClick={() => goTab('visits')}>All visits →</button>
      </div>
      {d.next_appointment ? (
        <div className="list-row" style={{ marginBottom: '8px' }}>
          <div className="row-main">
            <p className="row-title">{d.next_appointment.doctor_name}</p>
            <p className="row-sub">{d.next_appointment.department} • Room {d.next_appointment.room}</p>
            <p className="row-sub" style={{ color: '#0F766E' }}>{fmtDate(d.next_appointment.appt_date)} · {d.next_appointment.time_slot}</p>
          </div>
          <div className="row-side">
            <p className="tok-big" style={{ fontSize: '18px' }}>{d.next_appointment.token}</p>
          </div>
        </div>
      ) : (
        <EmptyState title="No upcoming appointment" hint="Book your next visit from the Booking tab." />
      )}

      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-4" style={{ marginTop: '20px' }}>
        <StatTile icon={<Activity size={13} className="text-teal-600" />} label="Consultations" value={d.counts.consultations} onClick={() => goTab('records')} />
        <StatTile icon={<Pill size={13} className="text-blue-500" />} label="Prescriptions" value={d.recent_prescriptions.length} onClick={() => goTab('records')} />
        <StatTile icon={<FlaskConical size={13} className="text-amber-500" />} label="Pending Tests" value={d.counts.pending_tests} onClick={() => goTab('records')} />
        <StatTile icon={<ReceiptText size={13} className="text-red-500" />} label="Due Amount" value={fmtMoney(d.counts.outstanding_amount)} onClick={() => goTab('bills')} />
      </div>

      {/* Recent medical history */}
      <div className="section-head" style={{ marginTop: '28px' }}>
        <span className="sh-title">Recent Medical History</span>
        <button className="notif-clear" onClick={() => goTab('records')}>Full record →</button>
      </div>
      {d.last_consultation ? (
        <div className="consult-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="consult-date">{fmtDate(d.last_consultation.visit_date)}</p>
              <p className="consult-doctor">Dr. {d.last_consultation.doctor_name} • {d.last_consultation.department}</p>
            </div>
          </div>
          <div style={{ marginTop: '10px' }}>
            <p style={{ fontSize: '12px', color: '#374151', fontWeight: 700, textAlign: 'left' }}>{d.last_consultation.diagnosis}</p>
            {d.last_consultation.symptoms && <p style={{ fontSize: '10px', color: '#94A3B8', marginTop: '4px', textAlign: 'left' }}>{d.last_consultation.symptoms}</p>}
          </div>
        </div>
      ) : (
        <EmptyState title="No consultations yet" hint="Your visit history will appear here after your first consultation." />
      )}

      {/* Follow-up + latest prescription */}
      <div className="flex-col gap-4" style={{ marginTop: '24px', alignItems: 'stretch' }}>
        {d.next_follow_up && (
          <div className="note note-info flex items-center justify-between" style={{ alignItems: 'center' }}>
            <span><Repeat2 size={12} style={{ verticalAlign: '-2px' }} /> Follow-up recommended: {fmtDate(d.next_follow_up.recommended_date)}</span>
            <button className="notif-clear" onClick={() => goTab('visits')}>Book →</button>
          </div>
        )}
        {d.recent_prescriptions.length > 0 && (
          <div className="consult-card">
            <p className="consult-sec-title">Latest Prescription</p>
            {d.recent_prescriptions.slice(0, 2).map(rx => (
              <div key={rx.id} className="rx-line">
                <span className="rx-name">💊 {rx.medicine_name}</span>
                <span className="rx-detail">{[rx.dosage, rx.frequency, rx.duration_days && `${rx.duration_days} days`].filter(Boolean).join(' • ')}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div className="btn-row" style={{ marginTop: '28px' }}>
        <Button onClick={() => goTab('book')} className="btn-sm"><CalendarDays size={13} /> Book Visit</Button>
        <Button variant="secondary" onClick={() => goTab('queue')} className="btn-sm">Track Queue</Button>
      </div>
    </div>
  );
};

const StatTile = ({ icon, label, value, onClick }) => (
  <button onClick={onClick} className="p-5 bg-white border-sleek rounded-3xl text-center shadow-sm" style={{ border: '1px solid #F1F5F9', cursor: 'pointer' }}>
    <div className="flex items-center justify-center gap-2 mb-2">{icon}
      <p className="subtitle" style={{ marginBottom: 0, fontSize: '9px' }}>{label}</p>
    </div>
    <p className="text-xl font-bold text-gray-900">{value}</p>
  </button>
);

export default PatientHome;
