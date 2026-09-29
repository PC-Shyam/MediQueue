import React, { useState, useEffect } from 'react';
import api from '../../api';
import { Badge, Button, fmtDate, fmtMoney } from '../../components/UI';
import PatientHistory from '../../components/PatientHistory';

const VITAL_FIELDS = [
  ['temperature_c', 'Temp °C'], ['blood_pressure', 'BP (120/80)'], ['heart_rate', 'Heart rate'],
  ['respiratory_rate', 'Resp rate'], ['spo2', 'SpO₂ %'], ['weight_kg', 'Weight kg'], ['height_cm', 'Height cm'],
];

const COMMON_TESTS = ['CBC', 'Blood Sugar', 'Lipid Profile', 'X-Ray', 'ECG', 'Ultrasound', 'Thyroid Profile', 'Urine Test'];

/**
 * ConsultationForm — doctor records the full visit: symptoms, vitals, diagnosis,
 * prescriptions, lab requests, follow-up. Shows patient history context.
 */
const ConsultationForm = ({ appointment, onClose, onSaved }) => {
  const [ctx, setCtx] = useState(null); // { patient, consultations }
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    symptoms: appointment.reason || '', diagnosis: '', clinical_notes: '',
    vitals: {}, prescriptions: [], tests: [], follow_up_days: '', follow_up_instructions: '',
  });
  const [rx, setRx] = useState({ medicine_name: '', dosage: '', frequency: '', duration_days: '', instructions: '' });
  const [testName, setTestName] = useState('');

  useEffect(() => {
    api.get(`/queue/consultation-context/${appointment.id}`)
      .then(res => { if (res.success) setCtx(res.data); })
      .catch(() => setCtx(null));
  }, [appointment.id]);

  const setF = (k, v) => setForm(prev => ({ ...prev, [k]: v }));
  const setVital = (k) => (e) => setForm(prev => ({ ...prev, vitals: { ...prev.vitals, [k]: e.target.value } }));

  const addRx = () => {
    if (!rx.medicine_name.trim()) return;
    setF('prescriptions', [...form.prescriptions, { ...rx }]);
    setRx({ medicine_name: '', dosage: '', frequency: '', duration_days: '', instructions: '' });
  };
  const addTest = (name) => {
    const t = (name || testName).trim();
    if (!t || form.tests.some(x => x.test_name === t)) return;
    setF('tests', [...form.tests, { test_name: t }]);
    setTestName('');
  };
  const removeRx = (i) => setF('prescriptions', form.prescriptions.filter((_, idx) => idx !== i));
  const removeTest = (i) => setF('tests', form.tests.filter((_, idx) => idx !== i));

  const save = async () => {
    if (!form.diagnosis.trim()) { setError('Diagnosis is required'); return; }
    setSaving(true); setError('');
    try {
      const res = await api.post('/medical/consultations', {
        appointment_id: appointment.id,
        symptoms: form.symptoms, diagnosis: form.diagnosis, clinical_notes: form.clinical_notes,
        vitals: form.vitals, prescriptions: form.prescriptions, tests: form.tests,
        follow_up_days: form.follow_up_days || null,
        follow_up_instructions: form.follow_up_instructions || null,
      });
      if (res.success) onSaved(res.data);
      else setError(res.error || 'Could not save');
    } catch (e) { setError(e.error || 'Could not save'); } finally { setSaving(false); }
  };

  const past = ctx?.consultations || [];

  return (
    <div>
      {/* Patient header */}
      <div style={{ textAlign: 'center', marginBottom: '18px' }}>
        <p style={{ fontSize: '16px', fontWeight: 800 }}>{appointment.patient_name}</p>
        <p className="subtitle" style={{ marginBottom: '6px' }}>
          {ctx?.patient?.mrn ? `Patient ID · ${ctx.patient.mrn}` : appointment.patient_phone}
          {ctx?.patient?.blood_group ? ` · 🩸 ${ctx.patient.blood_group}` : ''}
        </p>
        {ctx?.patient?.allergies && ctx.patient.allergies !== 'None known' && (
          <div className="note note-warn" style={{ textAlign: 'center' }}>⚠ Allergies: {ctx.patient.allergies}</div>
        )}
      </div>

      {/* Previous history */}
      {past.length > 0 && (
        <details className="prev-history" open={false}>
          <summary className="consult-sec-title" style={{ cursor: 'pointer', marginBottom: '10px' }}>
            Past consultations ({past.length})
          </summary>
          <PatientHistory consultations={past.slice(0, 3)} compact />
        </details>
      )}

      {/* Symptoms */}
      <label className="input-label" style={{ textAlign: 'left' }}>Symptoms</label>
      <textarea className="textarea-sleek textarea-wide" rows={2} value={form.symptoms} onChange={(e) => setF('symptoms', e.target.value)} placeholder="e.g. Fever, sore throat" />

      {/* Vitals */}
      <label className="input-label" style={{ textAlign: 'left' }}>Vitals (all optional)</label>
      <div className="vitals-grid">
        {VITAL_FIELDS.map(([k, label]) => (
          <div key={k} className="vital-input">
            <input value={form.vitals[k] || ''} onChange={setVital(k)} placeholder={label} />
          </div>
        ))}
      </div>

      {/* Diagnosis */}
      <label className="input-label" style={{ textAlign: 'left' }}>Diagnosis *</label>
      <input className="input-sleek" style={{ maxWidth: '100%', textAlign: 'left' }} value={form.diagnosis} onChange={(e) => setF('diagnosis', e.target.value)} placeholder="e.g. Viral infection" />

      {/* Notes */}
      <label className="input-label" style={{ textAlign: 'left' }}>Clinical Notes</label>
      <textarea className="textarea-sleek textarea-wide" rows={2} value={form.clinical_notes} onChange={(e) => setF('clinical_notes', e.target.value)} />

      {/* Prescriptions */}
      <label className="input-label" style={{ textAlign: 'left' }}>Prescriptions</label>
      {form.prescriptions.length > 0 && (
        <div style={{ marginBottom: '10px' }}>
          {form.prescriptions.map((p, i) => (
            <div key={i} className="list-row" style={{ marginBottom: '6px' }}>
              <div className="row-main">
                <p className="row-title">💊 {p.medicine_name}</p>
                <p className="row-sub">{[p.dosage, p.frequency, p.duration_days && `${p.duration_days} days`].filter(Boolean).join(' • ')}</p>
              </div>
              <button className="notif-clear" style={{ color: '#DC2626' }} onClick={() => removeRx(i)}>Remove</button>
            </div>
          ))}
        </div>
      )}
      <div className="rx-add">
        <input placeholder="Medicine (e.g. Paracetamol 500mg)" value={rx.medicine_name} onChange={(e) => setRx({ ...rx, medicine_name: e.target.value })} />
        <div className="rx-add-row">
          <input placeholder="Dosage" value={rx.dosage} onChange={(e) => setRx({ ...rx, dosage: e.target.value })} />
          <input placeholder="Frequency" value={rx.frequency} onChange={(e) => setRx({ ...rx, frequency: e.target.value })} />
          <input placeholder="Days" value={rx.duration_days} onChange={(e) => setRx({ ...rx, duration_days: e.target.value })} />
        </div>
        <button className="notif-clear" onClick={addRx}>+ Add medicine</button>
      </div>

      {/* Tests */}
      <label className="input-label" style={{ textAlign: 'left' }}>Lab / Diagnostic Tests</label>
      <div className="test-chips">
        {COMMON_TESTS.map(t => (
          <button key={t} className={`test-chip ${form.tests.some(x => x.test_name === t) ? 'on' : ''}`} onClick={() => addTest(t)}>{t}</button>
        ))}
      </div>
      {form.tests.length > 0 && (
        <div style={{ margin: '10px 0' }}>
          {form.tests.map((t, i) => (
            <div key={i} className="list-row" style={{ marginBottom: '6px' }}>
              <div className="row-main"><p className="row-title">🔬 {t.test_name}</p></div>
              <button className="notif-clear" style={{ color: '#DC2626' }} onClick={() => removeTest(i)}>Remove</button>
            </div>
          ))}
        </div>
      )}

      {/* Follow-up */}
      <label className="input-label" style={{ textAlign: 'left' }}>Follow-up (days, optional)</label>
      <div className="btn-row" style={{ justifyContent: 'flex-start', marginBottom: '8px' }}>
        {['', '7', '14', '30'].map(d => (
          <button key={String(d)} className={`test-chip ${String(form.follow_up_days) === String(d) ? 'on' : ''}`} onClick={() => setF('follow_up_days', d)}>
            {d === '' ? 'None' : `${d} days`}
          </button>
        ))}
      </div>
      {form.follow_up_days && (
        <input className="input-sleek" style={{ maxWidth: '100%', textAlign: 'left' }} value={form.follow_up_instructions} onChange={(e) => setF('follow_up_instructions', e.target.value)} placeholder="Follow-up instructions (optional)" />
      )}

      {error && <div className="note note-warn" style={{ marginTop: '12px' }}>{error}</div>}

      <div className="btn-row" style={{ marginTop: '18px' }}>
        <Button onClick={save} disabled={saving} className="btn-sm">{saving ? 'Saving…' : '✓ Complete Consultation'}</Button>
        <Button variant="secondary" onClick={onClose} className="btn-sm">Cancel</Button>
      </div>
    </div>
  );
};

export default ConsultationForm;
