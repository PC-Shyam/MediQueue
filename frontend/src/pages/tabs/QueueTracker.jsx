import React, { useState, useEffect } from 'react';
import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';
import api from '../../api';
import { Card, Button, Badge } from '../../components/UI';

const QueueTracker = () => {
  const [trackInput, setTrackInput] = useState('');
  const [appointment, setAppointment] = useState(null);
  const [aheadList, setAheadList] = useState([]);
  const [loading, setLoading] = useState(false);
  const socket = useSocket();
  const { user } = useAuth();

  useEffect(() => {
    if (user?.role === 'patient' && user.username && !trackInput) setTrackInput(user.username);
  }, [user]);

  useEffect(() => {
    if (!socket) return;
    const handleTokenUpdate = (data) => {
      if (appointment && data.token === appointment.token) setAppointment({ ...appointment, ...data });
    };
    const handleQueueUpdate = (queue) => {
      if (appointment) {
        const me = queue.find(q => q.token === appointment.token);
        if (me) {
          setAppointment(prev => ({ ...prev, ...me }));
          const myIdx = queue.findIndex(q => q.token === appointment.token);
          setAheadList(queue.slice(0, myIdx));
        }
      }
    };
    socket.on('token_update', handleTokenUpdate);
    socket.on('queue_update', handleQueueUpdate);
    return () => {
      socket.off('token_update', handleTokenUpdate);
      socket.off('queue_update', handleQueueUpdate);
    };
  }, [socket, appointment]);

  const handleTrack = async () => {
    if (!trackInput) return;
    setLoading(true);
    try {
      // Intelligent detection: If contains '-', it's a token, else it's a phone
      const path = trackInput.includes('-') 
        ? `/appointments/token/${trackInput.toUpperCase()}` 
        : `/appointments/phone/${trackInput}`;
      
      const res = await api.get(path);
      if (res.success) {
        setAppointment(res.data);
        socket.emit('subscribe_token', res.data.token);
        socket.emit('subscribe_queue', res.data.doctor_id);
      }
    } catch (err) { 
      alert(err.error || 'No appointment found with that info'); 
    } finally { setLoading(false); }
  };

  const markArrived = async () => {
    try {
      const res = await api.post(`/appointments/${appointment.id}/arrive`);
      if (res.success) {
        setAppointment({ ...appointment, status: 'arrived' });
      }
    } catch (err) { alert(err.error || 'Could not update status'); }
  };

  return (
    <div className="animate-in">
       <div className="text-center mb-10">
        <h2 className="heading">Track Status</h2>
        <p className="subtitle">Enter Mobile Number or Token</p>
      </div>

      <Card>
        <div style={{ padding: '8px 0' }}>
          <label className="input-label">Identity / Token</label>
          <input 
            type="text" 
            placeholder="Mobile or e.g. CAR-123" 
            value={trackInput} 
            onChange={(e) => setTrackInput(e.target.value)} 
            className="input-sleek" 
          />
          <Button onClick={handleTrack} disabled={loading}>
            {loading ? 'Searching...' : 'Check My Turn →'}
          </Button>
        </div>
      </Card>

      {appointment && (
        <Card className="animate-in" style={{ border: '1px solid var(--primary)', background: '#F0FDFA', marginTop: '48px' }}>
           <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
              <h3 className="text-lg font-bold text-gray-900">{appointment.patient_name}</h3>
              <p className="subtitle" style={{ marginBottom: '8px' }}>{appointment.doctor_name} • Room {appointment.room}</p>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <Badge variant={appointment.status}>{appointment.status}</Badge>
              </div>
           </div>

           {/* ARRIVAL ACTION */}
           {appointment.status === 'booked' && (
             <div style={{ marginBottom: '32px' }}>
               <Button onClick={markArrived} className="btn-primary" style={{ background: '#0D9488', color: 'white' }}>
                 I HAVE ARRIVED AT HOSPITAL
               </Button>
             </div>
           )}
           
           <div className="grid grid-cols-3 gap-2 py-8 bg-white rounded-2xl shadow-sm" style={{ border: '1px solid #E5E9EB' }}>
              <div>
                 <p className="subtitle" style={{ fontSize: '7px', marginBottom: '4px' }}>Position</p>
                 <p className="text-2xl font-bold text-teal-600">{appointment.queue_position || "—"}</p>
              </div>
              <div style={{ borderLeft: '1px solid #F1F5F9', borderRight: '1px solid #F1F5F9' }}>
                 <p className="subtitle" style={{ fontSize: '7px', marginBottom: '4px' }}>Wait (min)</p>
                 <p className="text-2xl font-bold text-gray-900">{appointment.estimated_wait_minutes || "—"}</p>
              </div>
              <div>
                 <p className="subtitle" style={{ fontSize: '7px', marginBottom: '4px' }}>Call Time</p>
                 <p className="text-2xl font-bold text-gray-900">{appointment.estimated_call_time || "—"}</p>
              </div>
           </div>

           {aheadList.length > 0 && (
             <div style={{ marginTop: '40px', paddingTop: '32px', borderTop: '1px solid #F1F5F9' }}>
                <p className="subtitle" style={{ marginBottom: '24px' }}>Currently in Consulting</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {aheadList.map((p, i) => (
                    <div key={i} style={{ 
                      display: 'flex', 
                      justifyContent: 'between', 
                      alignItems: 'center', 
                      padding: '16px', 
                      background: '#FFF', 
                      borderRadius: '16px', 
                      border: '1px solid #E5E9EB', 
                      fontSize: '11px', 
                      fontWeight: '800' 
                    }}>
                      <span style={{ flex: 1, textAlign: 'left', color: '#6B7280' }}>{p.patient_name}</span>
                      <span style={{ color: '#0D9488', fontFamily: 'monospace' }}>{p.token}</span>
                    </div>
                  ))}
                </div>
             </div>
           )}
        </Card>
      )}
    </div>
  );
};

export default QueueTracker;
