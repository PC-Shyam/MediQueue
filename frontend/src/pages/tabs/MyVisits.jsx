import React, { useState, useEffect } from 'react';
import api from '../../api';
import { useSocket } from '../../context/SocketContext';
import { Card, Button, Badge, EmptyState, fmtDate } from '../../components/UI';
import PatientHistory from '../../components/PatientHistory';

/**
 * MyVisits — appointment history (upcoming / past / cancelled) + pending follow-ups
 * with one-tap booking of a recommended follow-up.
 */
const MyVisits = () => {
  const [history, setHistory] = useState([]);
  const [followUps, setFollowUps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('upcoming');

  useEffect(() => {
    (async () => {
      try {
        const me = await api.get('/patients/me');
        if (me.success) {
          const [h, f] = await Promise.all([
            api.get(`/appointments/patient/${me.data.id}`),
            api.get(`/medical/follow-ups/patient/${me.data.id}`),
          ]);
          if (h.success) setHistory(h.data);
          if (f.success) setFollowUps(f.data.filter(x => x.status === 'RECOMMENDED'));
        }
      } catch (e) { /* silent */ } finally { setLoading(false); }
    })();
  }, []);

  const upcoming = history.filter(a => ['booked', 'waiting', 'arrived', 'in_consultation'].includes(a.status));
  const past = history.filter(a => ['done', 'no_show'].includes(a.status));
  const cancelled = history.filter(a => a.status === 'cancelled');
  const shown = filter === 'upcoming' ? upcoming : filter === 'past' ? past : cancelled;

  const cancel = async (id) => {
    if (!confirm('Cancel this appointment?')) return;
    try {
      await api.patch(`/appointments/${id}/cancel`, { cancel_reason: 'Cancelled by patient' });
      setHistory(prev => prev.map(a => a.id === id ? { ...a, status: 'cancelled' } : a));
    } catch (e) { alert(e.error || 'Could not cancel'); }
  };

  const bookFollowUp = async (fu) => {
    // Book on the recommended date, first available slot
    try {
      const date = fu.recommended_date || new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
      const slots = await api.get(`/doctors/${fu.doctor_id}/slots?date=${date}`);
      const free = (slots.data || []).find(s => s.available);
      if (!free) { alert('No free slots on the recommended date. Try Booking tab for another day.'); return; }
      await api.post(`/medical/follow-ups/${fu.id}/book`, { appt_date: date, time_slot: free.time });
      alert(`Follow-up booked: ${date} ${free.time}`);
      window.location.reload();
    } catch (e) { alert(e.error || 'Could not book follow-up'); }
  };

  if (loading) return <div className="p-12 text-center subtitle italic">Loading visits…</div>;

  return (
    <div className="animate-in">
      <div className="text-center mb-8">
        <h2 className="heading">My Visits</h2>
        <p className="subtitle">Appointments & Follow-ups</p>
      </div>

      {followUps.length > 0 && (
        <Card style={{ background: '#F0FDFA', border: '1px solid #CCFBF1', marginBottom: '24px' }}>
          <p className="consult-sec-title" style={{ textAlign: 'center' }}>Follow-up Recommended</p>
          {followUps.map(fu => (
            <div key={fu.id} className="flex-col gap-2" style={{ marginBottom: '10px' }}>
              <p style={{ fontSize: '12px', fontWeight: 700 }}>
                {fmtDate(fu.recommended_date)} — Dr. {fu.doctor_name} ({fu.department})
              </p>
              {fu.reason && <p style={{ fontSize: '10px', color: '#6B7280' }}>{fu.reason}</p>}
              <Button className="btn-sm" onClick={() => bookFollowUp(fu)}>Book This Follow-up →</Button>
            </div>
          ))}
        </Card>
      )}

      <div className="pill-toggle mb-10">
        {[['upcoming', `Upcoming (${upcoming.length})`], ['past', `Past (${past.length})`], ['cancelled', `Cancelled (${cancelled.length})`]].map(([id, label]) => (
          <button key={id} onClick={() => setFilter(id)} className={filter === id ? 'active' : ''} style={{ fontSize: '8px' }}>{label}</button>
        ))}
      </div>

      {shown.length === 0 && <EmptyState title={`No ${filter} visits`} />}

      <div className="flex-col gap-3" style={{ alignItems: 'stretch' }}>
        {shown.map(a => (
          <div key={a.id} className="list-row">
            <div className="row-main">
              <p className="row-title">{a.doctor_name}</p>
              <p className="row-sub">{a.department} • Room {a.room}</p>
              <p className="row-sub" style={{ color: '#0F766E' }}>{fmtDate(a.appt_date)} · {a.time_slot} · Token {a.token}</p>
              {a.reason && <p style={{ fontSize: '10px', color: '#94A3B8', marginTop: '4px' }}>{a.reason}</p>}
            </div>
            <div className="row-side flex-col gap-2" style={{ alignItems: 'flex-end' }}>
              <Badge>{a.status}</Badge>
              {['booked', 'waiting', 'arrived'].includes(a.status) && (
                <button className="notif-clear" style={{ color: '#DC2626' }} onClick={() => cancel(a.id)}>Cancel</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MyVisits;
