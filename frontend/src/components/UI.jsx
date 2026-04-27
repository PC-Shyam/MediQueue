import React from 'react';

export const Badge = ({ children, variant, className = '' }) => {
  // Map internal status to visual variants
  const variants = {
    booked:  'bg-blue-50',
    waiting: 'bg-amber-50',
    arrived: 'bg-emerald-50',
    in_consultation: 'bg-emerald-50',
    done:    'bg-gray-100',
    cancelled: 'bg-red-50',
    gray:    'bg-gray-100',
  };

  const labels = {
    booked: 'Scheduled',
    waiting: 'In Queue',
    arrived: 'At Hospital',
    in_consultation: 'In Session',
    done: 'Completed',
    cancelled: 'Cancelled'
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
