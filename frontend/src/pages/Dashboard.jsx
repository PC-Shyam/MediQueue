import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { LogOut, Activity, UserCircle } from 'lucide-react';

import QueueTracker from './tabs/QueueTracker';
import BookingForm from './tabs/BookingForm';
import DoctorPanel from './tabs/DoctorPanel';
import AdminDashboard from './tabs/AdminDashboard';

const Dashboard = () => {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState(
    user?.role === 'doctor' ? 'doctor' : 
    user?.role === 'admin' ? 'admin' : 'queue'
  );

  const tabs = [
    { id: 'queue', label: 'Monitor', roles: ['patient', 'admin'] },
    { id: 'book', label: 'Booking', roles: ['patient', 'admin'] },
    { id: 'doctor', label: 'Console', roles: ['doctor', 'admin'] },
    { id: 'admin', label: 'Portal', roles: ['admin'] },
  ];

  const visibleTabs = tabs.filter(t => t.roles.includes(user?.role));

  return (
    <div className="app-card animate-in">
      {/* Premium Glass Header */}
      <header className="header">
        <div className="flex items-center gap-3">
          <div className="logo-icon">
            <Activity size={20} />
          </div>
          <div style={{ textAlign: 'left' }}>
            <span className="title" style={{ fontSize: '16px', display: 'block' }}>MediQueue</span>
            <span style={{ fontSize: '8px', color: '#94A3B8', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Clinical Pulse</span>
          </div>
        </div>
        <button onClick={logout} className="logout-btn">
          <LogOut size={20} />
        </button>
      </header>

      {/* Pill Toggle Navigation */}
      <nav className="tab-nav">
        <div className="pill-toggle">
          {visibleTabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} className={activeTab === t.id ? 'active' : ''}>
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Dynamic Main Body */}
      <main>
        {activeTab === 'queue' && <QueueTracker />}
        {activeTab === 'book' && <BookingForm onBooked={() => setActiveTab('queue')} />}
        {activeTab === 'doctor' && <DoctorPanel />}
        {activeTab === 'admin' && <AdminDashboard />}
      </main>

      {/* Centered User Footer */}
      <footer className="footer shadow-sm">
        <div className="flex items-center justify-center gap-3">
          <div className="w-8 h-8 rounded-full bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-600">
            <UserCircle size={20} />
          </div>
          <div style={{ textAlign: 'left' }}>
            <p className="font-bold text-gray-900" style={{ fontSize: '12px', lineHeight: '1.2' }}>{user?.displayName || user?.username}</p>
            <p className="subtitle" style={{ fontSize: '8px', marginBottom: '0', letterSpacing: '0.05em' }}>Access: {user?.role} Mode</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Dashboard;
