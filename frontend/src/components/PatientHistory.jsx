import React from 'react';
import { Badge, fmtDate, fmtMoney, Row } from './UI';

/**
 * PatientHistory — renders a list of consultations with vitals, prescriptions,
 * tests and follow-ups. Shared between the doctor console and patient records.
 */
const PatientHistory = ({ consultations, compact = false }) => {
  if (!consultations || consultations.length === 0) {
    return <p className="empty-hint" style={{ padding: '16px 0' }}>No past consultations on record.</p>;
  }

  return (
    <div className="flex-col gap-4" style={{ alignItems: 'stretch' }}>
      {consultations.map((c) => (
        <div key={c.id} className="consult-card">
          <div className="flex items-center justify-between" style={{ marginBottom: '10px' }}>
            <div style={{ textAlign: 'left' }}>
              <p className="consult-date">{fmtDate(c.visit_date)}</p>
              <p className="consult-doctor">Dr. {c.doctor_name || ''} • {c.department || ''}</p>
            </div>
            {c.follow_up_date && !compact && (
              <Badge variant="RECOMMENDED">Follow-up {fmtDate(c.follow_up_date)}</Badge>
            )}
          </div>

          <Row label="Symptoms" value={c.symptoms} />
          <Row label="Diagnosis" value={c.diagnosis} />
          {!compact && <Row label="Notes" value={c.clinical_notes} />}

          {c.vitals && (c.vitals.blood_pressure || c.vitals.temperature_c || c.vitals.heart_rate) && (
            <div className="vitals-strip">
              {c.vitals.temperature_c && <span className="vital-chip">Temp {c.vitals.temperature_c}°C</span>}
              {c.vitals.blood_pressure && <span className="vital-chip">BP {c.vitals.blood_pressure}</span>}
              {c.vitals.heart_rate && <span className="vital-chip">HR {c.vitals.heart_rate}</span>}
              {c.vitals.spo2 && <span className="vital-chip">SpO₂ {c.vitals.spo2}%</span>}
              {c.vitals.weight_kg && <span className="vital-chip">Wt {c.vitals.weight_kg}kg</span>}
              {c.vitals.height_cm && <span className="vital-chip">Ht {c.vitals.height_cm}cm</span>}
            </div>
          )}

          {c.prescriptions && c.prescriptions.length > 0 && (
            <div className="consult-section" style={{ textAlign: 'left' }}>
              <p className="consult-sec-title">Prescription</p>
              {c.prescriptions.map((rx) => (
                <div key={rx.id} className="rx-line">
                  <span className="rx-name">💊 {rx.medicine_name}</span>
                  <span className="rx-detail">
                    {[rx.dosage, rx.frequency, rx.duration_days && `${rx.duration_days} days`].filter(Boolean).join(' • ')}
                  </span>
                  {rx.instructions && <span className="rx-detail italic">{rx.instructions}</span>}
                </div>
              ))}
            </div>
          )}

          {c.tests && c.tests.length > 0 && (
            <div className="consult-section" style={{ textAlign: 'left' }}>
              <p className="consult-sec-title">Tests</p>
              {c.tests.map((t) => (
                <div key={t.id} className="rx-line">
                  <span className="rx-name">🔬 {t.test_name}</span>
                  <span className="rx-detail">
                    {t.price ? fmtMoney(t.price) + ' • ' : ''}<Badge variant={t.status}>{t.status}</Badge>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default PatientHistory;
