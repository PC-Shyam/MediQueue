import React, { useState, useEffect } from 'react';
import api from '../../api';
import { useSocket } from '../../context/SocketContext';
import { Card, Button, Badge } from '../../components/UI';
import CustomSelect from '../../components/CustomSelect';
import { Plus, Trash2, ShieldCheck, Activity, Users, Clock, Settings, UserPlus } from 'lucide-react';

const AdminDashboard = () => {
  const [stats, setStats] = useState(null);
  const [doctors, setDoctors] = useState([]);
  const [selectedDrId, setSelectedDrId] = useState('');
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newDoctor, setNewDoctor] = useState({ name: '', department: '', room: '', max_patients: 20, avg_consult_minutes: 7 });
  const socket = useSocket();

  const fetchStats = async () => {
    try {
      const res = await api.get('/queue/stats/overview');
      if (res.success) { 
        setStats(res.data.stats); 
        setDoctors(res.data.doctors); 
      }
    } catch (e) {} finally { setLoading(false); }
  };

  useEffect(() => {
    fetchStats();
    if (socket) {
      socket.on('stats_update', fetchStats);
      socket.on('doctor_update', fetchStats);
      return () => { socket.off('stats_update'); socket.off('doctor_update'); };
    }
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
      if (res.success) { setShowAddForm(false); fetchStats(); }
    } catch (e) { alert(e.error); }
  };

  const selectedDoctor = doctors.find(d => d.id === parseInt(selectedDrId));
  const formatRoom = (room) => room.toString().toLowerCase().startsWith('room') ? room : `Room ${room}`;

  if (loading) return <div className="p-12 text-center subtitle italic">Analyzing hospital pulse...</div>;

  return (
    <div className="animate-in">
       {/* Master Stats */}
       <div className="grid grid-cols-2 gap-3 mb-10">
        {[
          { label: 'ACTIVE', val: stats?.active_tokens, icon: <Activity size={12} className="text-teal-600" /> },
          { label: 'SEEN TODAY', val: stats?.seen_today, icon: <ShieldCheck size={12} className="text-emerald-600" /> },
          { label: 'UPCOMING', val: stats?.upcoming, icon: <Users size={12} className="text-amber-500" /> },
          { label: 'WAIT AVG', val: Math.round(stats?.avg_consult_minutes || 0) + 'm', icon: <Clock size={12} className="text-blue-500" /> },
        ].map((s, i) => (
          <div key={i} className="p-5 bg-white border-sleek rounded-3xl text-center shadow-sm">
            <div className="flex items-center justify-center gap-2 mb-2">
               {s.icon}
               <p className="subtitle" style={{ marginBottom: '0', fontSize: '9px' }}>{s.label}</p>
            </div>
            <p className="text-xl font-bold text-gray-900">{s.val ?? '—'}</p>
          </div>
        ))}
      </div>

      <div className="flex-col gap-6">
        {/* ACTION HEADER */}
        <div className="flex items-center justify-between mb-8 pb-4 border-b border-gray-50">
           <div className="flex items-center gap-3">
              <Settings size={16} className="text-gray-400" />
              <p className="subtitle" style={{ marginBottom: '0' }}>Staff Management</p>
           </div>
           <button 
              onClick={() => setShowAddForm(!showAddForm)}
              style={{
                width: '42px', height: '42px', borderRadius: '50%', background: showAddForm ? '#FEF2F2' : '#F0FDFA',
                color: showAddForm ? '#EF4444' : '#0D9488', border: 'none', display: 'flex', alignItems: 'center', 
                justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 4px 12px rgba(0,0,0,0.03)'
              }}
           >
              {showAddForm ? <Plus size={20} style={{ transform: 'rotate(45deg)' }} /> : <UserPlus size={20} />}
           </button>
        </div>

        {showAddForm && (
          <Card className="mb-10 animate-in" style={{ border: '1px solid var(--primary)', background: '#F0FDFA' }}>
             <p className="subtitle mb-6">Register New Specialist</p>
             <form onSubmit={handleAddDoctor} className="flex-col gap-4">
               <input className="input-sleek" placeholder="Dr. Full Name" value={newDoctor.name} onChange={e => setNewDoctor({...newDoctor, name: e.target.value})} required />
               <input className="input-sleek" placeholder="Department" value={newDoctor.department} onChange={e => setNewDoctor({...newDoctor, department: e.target.value})} required />
               <input className="input-sleek" placeholder="Room Number" value={newDoctor.room} onChange={e => setNewDoctor({...newDoctor, room: e.target.value})} required />
               <div className="mt-4">
                 <Button type="submit">SAVE DATA</Button>
               </div>
             </form>
          </Card>
        )}

        {/* SPECIALIST PICKER */}
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
                <button 
                   onClick={() => removeDoctor(selectedDoctor.id, selectedDoctor.name)} 
                   style={{
                     width: '42px', height: '42px', borderRadius: '50%', border: '1px solid #F1F5F9',
                     background: '#F8FAFB', display: 'flex', alignItems: 'center', justifyContent: 'center',
                     color: '#CBD5E1', cursor: 'pointer', transition: 'all 0.2s'
                   }}
                   className="delete-btn-hover"
                >
                   <Trash2 size={18} />
                </button>
             </div>
             <div className="flex justify-between items-center pt-6 border-t border-gray-50">
                <p className="text-[11px] font-bold text-gray-900">
                  <span className="text-teal-600">{selectedDoctor.seen_today}</span> SEEN &bull; <span className="text-amber-500">{selectedDoctor.active_queue}</span> WAITING
                </p>
                <Badge variant="gray">{formatRoom(selectedDoctor.room)}</Badge>
             </div>
          </div>
        )}

        {!selectedDoctor && !showAddForm && (
          <div className="py-12 border border-dashed border-gray-200 rounded-3xl text-center">
             <p className="subtitle" style={{ marginBottom: '0', fontStyle: 'italic', opacity: 0.5 }}>Select a specialist above to manage roster</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
