import React, { useState, useEffect } from 'react';
import api from '../../api';
import { Card, Button, Badge, EmptyState, Modal, LoadingState, fmtDate, fmtMoney } from '../../components/UI';
import PatientHistory from '../../components/PatientHistory';
import { Pill, FlaskConical, FileText, ClipboardList } from 'lucide-react';

/** MyRecords — the patient's electronic medical record. */
const MyRecords = () => {
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('consultations');
  const [detail, setDetail] = useState(null);   // consultation detail modal
  const [report, setReport] = useState(null);   // report viewer modal

  useEffect(() => {
    (async () => {
      try {
        const me = await api.get('/patients/me');
        if (me.success) {
          const res = await api.get(`/patients/${me.data.id}/record`);
          if (res.success) setRecord(res.data);
        }
      } catch (e) { /* silent */ } finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <LoadingState label="Opening your medical record…" />;
  if (!record) return <EmptyState icon={<ClipboardList size={30} />} title="No medical record found" />;

  // Enrich consultations for the shared history component
  const consultations = record.consultations;

  const openConsult = async (id) => {
    try {
      const res = await api.get(`/medical/consultations/${id}`);
      if (res.success) setDetail(res.data);
    } catch (e) { alert(e.error || 'Could not open consultation'); }
  };

  const openReport = async (id) => {
    try {
      const res = await api.get(`/medical/reports/${id}`);
      if (res.success) setReport(res.data);
    } catch (e) { alert(e.error || 'Could not open report'); }
  };

  return (
    <div className="animate-in">
      <div className="text-center mb-6">
        <h2 className="heading">Medical Record</h2>
        <p className="subtitle" style={{ marginBottom: '10px' }}>{record.patient.full_name} · {record.patient.mrn}</p>
        <span className="mrn-chip">🩸 {record.patient.blood_group || '—'}</span>
      </div>

      <div className="pill-toggle mb-10">
        {[['consultations', 'Visits'], ['prescriptions', 'Rx'], ['tests', 'Tests'], ['reports', 'Reports']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={tab === id ? 'active' : ''} style={{ fontSize: '8px' }}>{label}</button>
        ))}
      </div>

      {tab === 'consultations' && (
        consultations.length === 0
          ? <EmptyState icon={<ClipboardList size={26} />} title="No consultations yet" />
          : <PatientHistory consultations={consultations} />
      )}

      {tab === 'prescriptions' && (
        record.prescriptions.length === 0
          ? <EmptyState icon={<Pill size={26} />} title="No prescriptions" />
          : (
            <div className="flex-col gap-3" style={{ alignItems: 'stretch' }}>
              {record.prescriptions.map(rx => (
                <div key={rx.id} className="list-row">
                  <div className="row-main">
                    <p className="row-title">💊 {rx.medicine_name}</p>
                    <p className="row-sub">{[rx.dosage, rx.frequency, rx.duration_days && `${rx.duration_days} days`].filter(Boolean).join(' • ')}</p>
                    {rx.instructions && <p style={{ fontSize: '10px', color: '#6B7280', marginTop: '3px' }}>{rx.instructions}</p>}
                    <p className="row-sub" style={{ color: '#0F766E' }}>{fmtDate(rx.visit_date)} · Dr. {rx.doctor_name}</p>
                  </div>
                </div>
              ))}
            </div>
          )
      )}

      {tab === 'tests' && (
        record.tests.length === 0
          ? <EmptyState icon={<FlaskConical size={26} />} title="No lab tests" />
          : (
            <div className="flex-col gap-3" style={{ alignItems: 'stretch' }}>
              {record.tests.map(t => (
                <div key={t.id} className="list-row">
                  <div className="row-main">
                    <p className="row-title">🔬 {t.test_name}</p>
                    <p className="row-sub">{fmtDate(t.requested_at)} · Dr. {t.doctor_name} · {fmtMoney(t.price)}</p>
                    {t.result && <p style={{ fontSize: '11px', color: '#374151', marginTop: '6px' }}>{t.result}</p>}
                  </div>
                  <div className="row-side"><Badge>{t.status}</Badge></div>
                </div>
              ))}
            </div>
          )
      )}

      {tab === 'reports' && (
        record.reports.length === 0
          ? <EmptyState icon={<FileText size={26} />} title="No reports" hint="Lab and consultation reports will appear here." />
          : (
            <div className="flex-col gap-3" style={{ alignItems: 'stretch' }}>
              {record.reports.map(r => (
                <div key={r.id} className="list-row">
                  <div className="row-main">
                    <p className="row-title">📄 {r.title}</p>
                    <p className="row-sub">{r.report_type} · {fmtDate(r.created_at)}</p>
                  </div>
                  <div className="row-side">
                    <button className="notif-clear" onClick={() => openReport(r.id)}>View</button>
                  </div>
                </div>
              ))}
            </div>
          )
      )}

      {/* Consultation detail modal */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title="Consultation Detail" wide>
        {detail && (
          <>
            <p className="consult-date">{fmtDate(detail.visit_date)}</p>
            <p className="consult-doctor">Dr. {detail.doctor_name} • {detail.department}</p>
            <div style={{ marginTop: '12px' }}>
              <PatientHistory consultations={[detail]} />
            </div>
          </>
        )}
      </Modal>

      {/* Report viewer */}
      <Modal open={!!report} onClose={() => setReport(null)} title={report?.title} wide>
        {report && (
          <>
            <p className="consult-doctor">{report.report_type} · {fmtDate(report.created_at)}</p>
            {report.content && <pre className="report-pre">{report.content}</pre>}
            {report.notes && <div className="note note-info" style={{ marginTop: '12px' }}>{report.notes}</div>}
          </>
        )}
      </Modal>
    </div>
  );
};

export default MyRecords;
