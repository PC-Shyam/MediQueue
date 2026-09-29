import React, { useState, useEffect, useRef } from 'react';
import { Bell } from 'lucide-react';
import api from '../api';

const NotificationsBell = () => {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef(null);

  const load = async () => {
    try {
      const res = await api.get('/auth/notifications');
      if (res.success) { setItems(res.data || []); setUnread(res.unread || 0); }
    } catch (e) { /* silent */ }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const markRead = async () => {
    try { await api.post('/auth/notifications/read'); await load(); } catch (e) { /* silent */ }
  };

  return (
    <div className="notif-wrap" ref={ref}>
      <button className="notif-btn" onClick={() => setOpen(!open)} aria-label="Notifications">
        <Bell size={18} />
        {unread > 0 && <span className="notif-dot">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="notif-panel animate-in">
          <div className="flex items-center justify-between" style={{ padding: '12px 16px 4px' }}>
            <p className="notif-title">Notifications</p>
            {unread > 0 && <button className="notif-clear" onClick={markRead}>Mark all read</button>}
          </div>
          <div className="notif-list">
            {items.length === 0 && <p className="empty-hint" style={{ padding: '20px' }}>Nothing yet.</p>}
            {items.map((n) => (
              <div key={n.id} className={`notif-item ${n.is_read ? '' : 'unread'}`}>
                <p className="notif-item-title">{n.title}</p>
                {n.message && <p className="notif-item-msg">{n.message}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationsBell;
