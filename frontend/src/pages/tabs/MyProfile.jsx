import React, { useState, useEffect } from 'react';
import api from '../../api';
import { Card, Button, LoadingState } from '../../components/UI';

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const GENDERS = ['Male', 'Female', 'Other'];

/** MyProfile — persistent patient profile (identity + medical basics). */
const MyProfile = () => {
  const [p, setP] = useState(null);
  const [form, setForm] = useState({});
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/patients/me');
        if (res.success) { setP(res.data); setForm(res.data); }
      } catch (e) { /* silent */ }
    })();
  }, []);

  if (!p) return <LoadingState label="Loading profile…" />;

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const save = async () => {
    setSaving(true); setMsg('');
    try {
      const res = await api.put('/patients/me', form);
      if (res.success) { setP(res.data); setForm(res.data); setEditing(false); setMsg('Profile saved ✓'); setTimeout(() => setMsg(''), 2500); }
    } catch (e) { setMsg(e.error || 'Could not save'); } finally { setSaving(false); }
  };

  const field = (label, key, type = 'text', options = null) => (
    <div className="input-group">
      <label className="input-label">{label}</label>
      {options ? (
        <select className="input-sleek" value={form[key] || ''} onChange={set(key)} disabled={!editing}>
          <option value="">—</option>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input type={type} className="input-sleek" value={form[key] || ''} onChange={set(key)} disabled={!editing} placeholder={label} />
      )}
    </div>
  );

  return (
    <div className="animate-in">
      <div className="text-center mb-6">
        <h2 className="heading">My Profile</h2>
        <p className="subtitle" style={{ marginBottom: '12px' }}>Patient ID · {p.mrn}</p>
        <span className="mrn-chip">🩸 {p.blood_group || 'Blood group not set'}</span>
      </div>

      <Card>
        <div className="profile-grid" style={{ maxWidth: '340px', margin: '0 auto 20px' }}>
          <div className="profile-cell"><p className="pc-label">Full Name</p><p className="pc-value">{p.full_name}</p></div>
          <div className="profile-cell"><p className="pc-label">Mobile</p><p className="pc-value">{p.phone}</p></div>
          <div className="profile-cell"><p className="pc-label">Date of Birth</p><p className="pc-value">{p.dob || '—'}</p></div>
          <div className="profile-cell"><p className="pc-label">Gender</p><p className="pc-value">{p.gender || '—'}</p></div>
          <div className="profile-cell"><p className="pc-label">Blood Group</p><p className="pc-value">{p.blood_group || '—'}</p></div>
          <div className="profile-cell"><p className="pc-label">Emergency Contact</p><p className="pc-value">{p.emergency_contact || '—'}</p></div>
          <div className="profile-cell profile-full"><p className="pc-label">Address</p><p className="pc-value">{p.address || '—'}</p></div>
          <div className="profile-cell profile-full"><p className="pc-label">Allergies</p><p className="pc-value">{p.allergies || 'None recorded'}</p></div>
          <div className="profile-cell profile-full"><p className="pc-label">Existing Conditions</p><p className="pc-value">{p.chronic_conditions || 'None recorded'}</p></div>
          <div className="profile-cell profile-full"><p className="pc-label">Current Medications</p><p className="pc-value">{p.current_medications || '—'}</p></div>
          <div className="profile-cell profile-full"><p className="pc-label">Past Surgeries</p><p className="pc-value">{p.past_surgeries || '—'}</p></div>
          <div className="profile-cell profile-full"><p className="pc-label">Insurance</p><p className="pc-value">{[p.insurance_provider, p.insurance_number].filter(Boolean).join(' · ') || '—'}</p></div>
        </div>

        {!editing ? (
          <Button onClick={() => setEditing(true)}>Edit Profile</Button>
        ) : (
          <>
            {field('Full Name', 'full_name')}
            {field('Date of Birth', 'dob', 'date')}
            {field('Gender', 'gender', 'text', GENDERS)}
            {field('Blood Group', 'blood_group', 'text', BLOOD_GROUPS)}
            {field('Mobile Number', 'phone', 'tel')}
            {field('Email', 'email', 'email')}
            {field('Emergency Contact', 'emergency_contact')}
            <div className="input-group">
              <label className="input-label">Address</label>
              <textarea className="textarea-sleek" value={form.address || ''} onChange={set('address')} rows={2} />
            </div>
            <div className="input-group">
              <label className="input-label">Allergies</label>
              <input className="input-sleek" value={form.allergies || ''} onChange={set('allergies')} placeholder="e.g. Penicillin, dust" />
            </div>
            <div className="input-group">
              <label className="input-label">Existing Conditions</label>
              <input className="input-sleek" value={form.chronic_conditions || ''} onChange={set('chronic_conditions')} placeholder="e.g. Hypertension" />
            </div>
            <div className="input-group">
              <label className="input-label">Current Medications</label>
              <input className="input-sleek" value={form.current_medications || ''} onChange={set('current_medications')} />
            </div>
            <div className="btn-row" style={{ marginTop: '8px' }}>
              <Button onClick={save} disabled={saving} className="btn-sm">{saving ? 'Saving…' : 'Save Changes'}</Button>
              <Button variant="secondary" onClick={() => { setEditing(false); setForm(p); }} className="btn-sm">Cancel</Button>
            </div>
          </>
        )}
        {msg && <p style={{ fontSize: '11px', fontWeight: 700, color: '#0F766E', marginTop: '14px' }}>{msg}</p>}
      </Card>
    </div>
  );
};

export default MyProfile;
