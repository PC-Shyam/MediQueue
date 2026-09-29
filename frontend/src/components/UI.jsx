import React from 'react';

export const fmtMoney = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

export const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(String(d).length === 10 ? `${d}T00:00:00` : d);
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

export const Badge = ({ children, variant, className = '' }) => {
  // Map internal status to visual variants
  const variants = {
    booked:  'bg-blue-50',
    waiting: 'bg-amber-50',
    arrived: 'bg-emerald-50',
    in_consultation: 'bg-emerald-50',
    done:    'bg-gray-100',
    cancelled: 'bg-red-50',
    no_show: 'bg-red-50',
    gray:    'bg-gray-100',
    // Lab test / bill / follow-up statuses
    REQUESTED: 'bg-blue-50',
    SAMPLE_COLLECTED: 'bg-amber-50',
    PROCESSING: 'bg-amber-50',
    COMPLETED: 'bg-emerald-50',
    CANCELLED: 'bg-red-50',
    PAID: 'bg-emerald-50',
    PENDING: 'bg-amber-50',
    RECOMMENDED: 'bg-blue-50',
    SCHEDULED: 'bg-blue-50',
  };

  const labels = {
    booked: 'Scheduled',
    waiting: 'In Queue',
    arrived: 'At Hospital',
    in_consultation: 'In Session',
    done: 'Completed',
    cancelled: 'Cancelled',
    no_show: 'No Show',
    SAMPLE_COLLECTED: 'Sample Collected',
    IN_CONSULTATION: 'In Session',
  };

  // If no variant is provided, use the value of children as the variant key
  const vKey = variant || children || 'gray';

  return (
    <span className={`badge ${variants[vKey] || variants.gray} ${className}`}>
      {labels[children] || children}
    </span>
  );
};

export const Card = ({ children, className = '', style = {} }) => (
  <div className={`card ${className}`} style={style}>
    {children}
  </div>
);

export const Button = ({ children, variant = 'primary', className = '', ...props }) => {
  const v = variant === 'secondary' ? 'btn-secondary' : 'btn-primary';
  return (
    <button className={`btn ${v} ${className}`} {...props}>
      {children}
    </button>
  );
};

export const StatCard = ({ label, value, icon, accent = 'teal', sub }) => (
  <div className="p-5 bg-white border-sleek rounded-3xl text-center shadow-sm">
    <div className="flex items-center justify-center gap-2 mb-2">
      {icon}
      <p className="subtitle" style={{ marginBottom: '0', fontSize: '9px' }}>{label}</p>
    </div>
    <p className={`text-xl font-bold stat-${accent}`}>{value ?? '—'}</p>
    {sub && <p className="stat-sub">{sub}</p>}
  </div>
);

export const EmptyState = ({ icon, title, hint }) => (
  <div className="py-10 border border-dashed border-gray-200 rounded-3xl text-center">
    {icon && <div className="empty-icon">{icon}</div>}
    <p className="subtitle" style={{ marginBottom: '4px' }}>{title}</p>
    {hint && <p className="empty-hint">{hint}</p>}
  </div>
);

export const LoadingState = ({ label = 'Loading…' }) => (
  <div className="p-12 text-center">
    <div className="spinner mx-auto" />
    <p className="subtitle" style={{ marginTop: '16px', marginBottom: 0 }}>{label}</p>
  </div>
);

export const Modal = ({ open, onClose, title, children, wide }) => (
  open ? (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal-sheet ${wide ? 'modal-wide' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <p className="modal-title">{title}</p>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  ) : null
);

/** Simple row label/value used across record views. */
export const Row = ({ label, value }) => (
  <div className="record-row">
    <span className="record-label">{label}</span>
    <span className="record-value">{value || '—'}</span>
  </div>
);
