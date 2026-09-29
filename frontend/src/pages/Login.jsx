import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

const Login = () => {
  const [role, setRole] = useState('patient');
  const [mode, setMode] = useState('login'); // login | register
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState(['', '', '', '']);
  const [reg, setReg] = useState({ full_name: '', dob: '', gender: '', blood_group: '', emergency_contact: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { login, register } = useAuth();

  const handlePinChange = (val, idx) => {
    if (!/^\d*$/.test(val)) return;
    const newPin = [...pin];
    newPin[idx] = val.slice(-1);
    setPin(newPin);
    if (val && idx < 3) document.getElementById(`pin-${idx + 1}`).focus();
  };

  const handlePinKeyDown = (e, idx) => {
    if (e.key === 'Backspace' && !pin[idx] && idx > 0) document.getElementById(`pin-${idx - 1}`).focus();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (role === 'patient' && mode === 'register') {
        const res = await register({
          phone: username, password: pin.join(''), ...reg,
        });
        if (!res.success) setError(res.error || 'Registration failed');
        return;
      }
      const res = await login(
        role === 'patient' ? username : username.toLowerCase(),
        role === 'patient' ? pin.join('') : password
      );
      if (!res.success) setError(res.error || 'Login failed');
    } catch (err) { setError(err.error || 'Connection error'); } finally { setSubmitting(false); }
  };

  return (
    <div className="app-card p-8 animate-in">
      <div className="mt-6 mb-10">
        <div className="logo-icon">＋</div>
        <p className="title mt-3">MediQueue</p>
      </div>

      <div className="mb-8">
        <h2 className="heading">{role === 'patient' && mode === 'register' ? 'Register' : 'Welcome'}</h2>
        <p className="subtitle">{role === 'patient' && mode === 'register' ? 'Create your patient record' : 'Role-based Access Control'}</p>
      </div>

      <div className="pill-toggle mb-8">
        {['patient', 'doctor', 'admin'].map(id => (
          <button key={id} onClick={() => { setRole(id); setMode('login'); }} className={role === id ? 'active' : ''}>
            {id}
          </button>
        ))}
      </div>

      {error && <div className="text-red-500 text-center mb-6 text-[10px] uppercase font-bold tracking-widest leading-loose">{error}</div>}

      <form onSubmit={handleSubmit} className="mt-4">
        {role === 'patient' && (
          <div className="mb-6">
            <div className="pill-toggle" style={{ maxWidth: '240px' }}>
              {[['login', 'Sign In'], ['register', 'New Patient']].map(([id, label]) => (
                <button key={id} type="button" onClick={() => setMode(id)} className={mode === id ? 'active' : ''} style={{ fontSize: '8px' }}>{label}</button>
              ))}
            </div>
          </div>
        )}

        <div className="mb-8">
          <label className="input-label">{role === 'patient' ? 'Mobile Number' : 'Username'}</label>
          <input
            type={role === 'patient' ? 'tel' : 'text'}
            value={username} onChange={(e) => setUsername(e.target.value)}
            placeholder={role === 'patient' ? '98765 43210' : 'Your username'}
            className="input-sleek"
          />
        </div>

        <div className="mb-8">
          <label className="input-label">{role === 'patient' ? 'Secure 4-Digit Pin' : 'Account Password'}</label>
          {role === 'patient' ? (
            <div className="pin-container">
              {pin.map((p, i) => (
                <input key={i} id={`pin-${i}`} type="password" maxLength={1} value={p}
                  onChange={(e) => handlePinChange(e.target.value, i)}
                  onKeyDown={(e) => handlePinKeyDown(e, i)}
                  className="pin-box"
                />
              ))}
            </div>
          ) : (
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="input-sleek" />
          )}
        </div>

        {role === 'patient' && mode === 'register' && (
          <>
            <div className="mb-8">
              <label className="input-label">Full Name</label>
              <input type="text" value={reg.full_name} onChange={(e) => setReg({ ...reg, full_name: e.target.value })} placeholder="Your full name" className="input-sleek" />
            </div>
            <div className="mb-8">
              <label className="input-label">Date of Birth (optional)</label>
              <input type="date" value={reg.dob} onChange={(e) => setReg({ ...reg, dob: e.target.value })} className="input-sleek" />
            </div>
            <div className="mb-8">
              <label className="input-label">Gender (optional)</label>
              <select value={reg.gender} onChange={(e) => setReg({ ...reg, gender: e.target.value })} className="input-sleek">
                <option value="">—</option>
                <option>Male</option><option>Female</option><option>Other</option>
              </select>
            </div>
            <div className="mb-8">
              <label className="input-label">Blood Group (optional)</label>
              <select value={reg.blood_group} onChange={(e) => setReg({ ...reg, blood_group: e.target.value })} className="input-sleek">
                <option value="">—</option>
                {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(b => <option key={b}>{b}</option>)}
              </select>
            </div>
          </>
        )}

        <div className="mt-10">
          <button type="submit" disabled={submitting} className="btn btn-primary h-14">
            {submitting ? 'Please wait…' : role === 'patient' && mode === 'register' ? 'Create My Record →' : 'Sign In Now →'}
          </button>
        </div>
      </form>

      <div className="mt-auto pt-10 text-center">
        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-[0.2em] leading-relaxed">Demo: 9876543214 / 1234</p>
      </div>
    </div>
  );
};

export default Login;
