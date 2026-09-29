import React, { useState, useEffect } from 'react';
import api from '../../api';
import { Badge, EmptyState, LoadingState, fmtDate, fmtMoney } from '../../components/UI';
import { ReceiptText } from 'lucide-react';

/** MyBills — patient billing history with outstanding total. */
const MyBills = () => {
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const me = await api.get('/patients/me');
        if (me.success) {
          const res = await api.get(`/medical/bills/patient/${me.data.id}`);
          if (res.success) setBills(res.data);
        }
      } catch (e) { /* silent */ } finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <LoadingState label="Fetching bills…" />;

  const outstanding = bills.filter(b => b.status === 'PENDING').reduce((s, b) => s + (b.total_amount || 0), 0);

  return (
    <div className="animate-in">
      <div className="text-center mb-8">
        <h2 className="heading">Bills & Payments</h2>
        <p className="subtitle">Consultation and test charges</p>
      </div>

      {outstanding > 0 && (
        <div className="note note-warn" style={{ marginBottom: '20px' }}>
          Outstanding balance: <strong>{fmtMoney(outstanding)}</strong> — pay at the hospital counter.
        </div>
      )}

      {bills.length === 0 && <EmptyState icon={<ReceiptText size={26} />} title="No bills yet" hint="Bills appear after your consultation." />}

      <div className="flex-col gap-3" style={{ alignItems: 'stretch' }}>
        {bills.map(b => (
          <div key={b.id} className="list-row">
            <div className="row-main">
              <p className="row-title">{b.bill_number}</p>
              <p className="row-sub">{fmtDate(b.created_at)}{b.doctor_name ? ` · Dr. ${b.doctor_name}` : ''}</p>
              {b.description && <p style={{ fontSize: '10px', color: '#94A3B8', marginTop: '4px' }}>{b.description}</p>}
              <p className="row-sub" style={{ color: '#0F766E' }}>
                {[b.consultation_charge ? `Consult ${fmtMoney(b.consultation_charge)}` : null,
                  b.test_charges ? `Tests ${fmtMoney(b.test_charges)}` : null,
                  b.other_charges ? `Other ${fmtMoney(b.other_charges)}` : null].filter(Boolean).join(' + ')}
              </p>
            </div>
            <div className="row-side flex-col gap-2" style={{ alignItems: 'flex-end' }}>
              <p className="font-bold text-gray-900">{fmtMoney(b.total_amount)}</p>
              <Badge>{b.status}</Badge>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MyBills;
