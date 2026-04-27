import React, { useState, useEffect } from 'react';
import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';
import api from '../../api';
import { Card, Button, Badge } from '../../components/UI';
import { ChevronRight, CheckCircle2, User } from 'lucide-react';

const DoctorPanel = () => {
  const { user } = useAuth();
  const socket = useSocket();
  const [appointments, setAppointments] = useState([]);
  const [doctorInfo, setDoctorInfo] = useState(null);

  useEffect(() => {
    if (!user?.linkedId) return;
    const fetchData = async () => {
      const [docRes, apptRes] = await Promise.all([
        api.get(`/doctors/${user.linkedId}`),
        api.get(`/appointments/doctor/${user.linkedId}`)
      ]);
      if (docRes.success) setDoctorInfo(docRes.data);
      if (apptRes.success) setAppointments(apptRes.data);
    };
    fetchData();
    if (socket) {
      socket.emit('subscribe_queue', user.linkedId);
      socket.on('queue_update', (queue) => setAppointments(queue));
      return () => socket.off('queue_update');
    }
  }, [user, socket]);

  const callNext = async () => api.post(`/queue/${user.linkedId}/call-next`);
  const markDone = async () => api.post(`/queue/${user.linkedId}/done`);

  const seen     = appointments.filter(a => a.status === 'done').length;
  const inQueue  = appointments.filter(a => a.status === 'waiting' || a.status === 'arrived' || a.status === 'booked').length;
  const current  = appointments.find(a => a.status === 'in_consultation');

  return (
    <div className="animate-in">
      {/* Centered Doctor Header */}
      <div className="text-center mb-8">
        <h2 className="heading">{doctorInfo?.name || user.displayName}</h2>
        <p className="subtitle">{doctorInfo?.department} • Room {doctorInfo?.room}</p>
      </div>

      <div className="flex-col gap-6">
        {/* Statistics Cards */}
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

        {/* Action Central */}
        <Card className="text-center">
          {current ? (
            <div className="py-2">
              <div className="mb-6">
                <p className="subtitle" style={{ color: '#10B981', marginBottom: '8px' }}>CONSULTING NOW</p>
                <h3 className="text-xl font-bold text-gray-900">{current.patient_name}</h3>
                <p className="subtitle mt-1">ID: {current.token}</p>
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

        {/* Waitlist View */}
        <div className="mt-10">
          <p className="subtitle mb-6 text-center">Upcoming Patients</p>
          <div className="flex-col gap-3">
            {appointments.filter(a => ['waiting', 'arrived', 'booked'].includes(a.status)).slice(0, 10).map((a, i) => (
              <div key={a.id} className="p-4 bg-white border-sleek rounded-2xl flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-[10px] font-bold text-teal-600 border border-teal-50">
                    {i+1}
                  </div>
                  <div style={{ textAlign: 'left' }}>
                    <p className="text-sm font-bold text-gray-800">{a.patient_name}</p>
                    <p className="subtitle mt-0.5" style={{ marginBottom: '0', fontSize: '8px' }}>{a.token} • {a.time_slot}</p>
                  </div>
                </div>
                <Badge variant={a.status}>{a.status}</Badge>
              </div>
            ))}
            {inQueue === 0 && <p className="text-center py-10 subtitle italic">The hallway is quiet...</p>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DoctorPanel;
