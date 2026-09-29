import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { LogOut, Activity, UserCircle } from 'lucide-react';
import NotificationsBell from '../components/NotificationsBell';

import PatientHome from './tabs/PatientHome';
import MyQueue from './tabs/MyQueue';
import BookingForm from './tabs/BookingForm';
import MyVisits from './tabs/MyVisits';
import MyRecords from './tabs/MyRecords';
import MyBills from './tabs/MyBills';
import MyProfile from './tabs/MyProfile';
import DoctorPanel from './tabs/DoctorPanel';
import AdminDashboard from './tabs/AdminDashboard';

const Dashboard = () => {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState(
    user?.role === 'doctor' ? 'doctor' :
    user?.role === 'admin' ? 'admin' : 'home'
  );

  const tabs = [
    { id: 'home', label: 'Home', roles: ['patient'] },
    { id: 'queue', label: 'Queue', roles: ['patient'] },
    { id: 'book', label: 'Book', roles: ['patient'] },
    { id: 'visits', label: 'Visits', roles: ['patient'] },
    { id: 'records', label: 'Records', roles: ['patient'] },
    { id: 'bills', label: 'Bills', roles: ['patient'] },
    { id: 'profile', label: 'Profile', roles: ['patient'] },
    { id: 'doctor', label: 'Console', roles: ['doctor'] },
    { id: 'admin', label: 'Portal', roles: ['admin'] },
    // Admin also gets monitoring + booking (preserved from v1)
    { id: 'queue', label: 'Monitor', roles: ['admin'], adminQueue: true },
    { id: 'book', label: 'Booking', roles: ['admin'], adminBook: true },
  ];

  const visibleTabs = tabs.filter(t => t.roles.includes(user?.role));
  // dedupe by display label
  const seen = new Set();
  const finalTabs = visibleTabs.filter(t => { const k = t.label; if (seen.has(k)) return false; seen.add(k); return true; });

  const goTab = (id) => setActiveTab(id);

  const renderTab = () => {
    switch (activeTab) {
      case 'home': return <PatientHome goTab={goTab} />;
      case 'queue': return <MyQueue />;
      case 'book': return <BookingForm onBooked={() => goTab('home')} />;
      case 'visits': return <MyVisits />;
      case 'records': return <MyRecords />;
      case 'bills': return <MyBills />;
      case 'profile': return <MyProfile />;
      case 'doctor': return <DoctorPanel />;
      case 'admin': return <AdminDashboard />;
      default: return <PatientHome goTab={goTab} />;
    }
  };

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
            <span style={{ fontSize: '8px', color: '#94A3B8', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Patient Care Suite</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <NotificationsBell />
          <button onClick={logout} className="logout-btn">
            <LogOut size={20} />
          </button>
        </div>
      </header>

      {/* Pill Toggle Navigation */}
      <nav className="tab-nav">
        <div className="pill-toggle" style={finalTabs.length > 5 ? { maxWidth: '380px' } : {}}>
          {finalTabs.map(t => (
            <button key={t.label} onClick={() => setActiveTab(t.id)} className={activeTab === t.id ? 'active' : ''}>
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Dynamic Main Body */}
      <main>
        {renderTab()}
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
