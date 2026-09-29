/**
 * auth.js — Authentication routes + session middleware
 * POST /api/auth/login   → {username, password, role} → {token, user}
 * POST /api/auth/logout  → invalidate session
 * GET  /api/auth/me      → return current user from session
 */

const express = require('express');
const bcrypt  = require('bcryptjs');
const crypto  = require('crypto');
const { Q, dbRun, nextMrn } = require('./db');

const router = express.Router();

// ── Helpers ──────────────────────────────────────────────────────────────────

function randomToken() {
  return crypto.randomBytes(32).toString('hex');
}

function sessionExpiry() {
  // 12 hours from now as ISO string
  const d = new Date(Date.now() + 12 * 60 * 60 * 1000);
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

// ── Middleware ────────────────────────────────────────────────────────────────

/**
 * requireAuth — attaches req.session if valid token present, else 401
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ success: false, error: 'Not authenticated' });

  const session = Q.getSession(token);
  if (!session) return res.status(401).json({ success: false, error: 'Session expired or invalid' });

  req.session = session;
  next();
}

/**
 * requireRole — factory that wraps requireAuth + role check
 * Usage:  router.post('/foo', requireRole('admin'), handler)
 *         router.post('/foo', requireRole(['admin','doctor']), handler)
 */
function requireRole(roles) {
  const allowed = Array.isArray(roles) ? roles : [roles];
  return [
    requireAuth,
    (req, res, next) => {
      if (!allowed.includes(req.session.role)) {
        return res.status(403).json({ success: false, error: 'Forbidden' });
      }
      next();
    },
  ];
}

// ── Routes ────────────────────────────────────────────────────────────────────

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ success: false, error: 'Username and password required' });

  const user = Q.getUserByUsername(username.trim().toLowerCase());
  if (!user)
    return res.status(401).json({ success: false, error: 'Invalid username or password' });

  const ok = await bcrypt.compare(String(password), user.password_hash);
  if (!ok)
    return res.status(401).json({ success: false, error: 'Invalid username or password' });

  const token     = randomToken();
  const expiresAt = sessionExpiry();
  Q.createSession(token, user.id, expiresAt);

  return res.json({
    success: true,
    data: {
      token,
      role:        user.role,
      username:    user.username,
      displayName: user.display_name,
      linkedId:    user.linked_id,
    },
  });
});

// POST /api/auth/register — patient self-registration
// Body: { phone, password, full_name, dob?, gender?, email?, address?, emergency_contact?, blood_group? }
router.post('/register', async (req, res) => {
  const { phone, password, full_name, dob, gender, email, address, emergency_contact, blood_group } = req.body;
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 10)
    return res.status(400).json({ success: false, error: 'A valid 10-digit mobile number is required' });
  if (!password || String(password).length < 4)
    return res.status(400).json({ success: false, error: 'Password must be at least 4 characters' });
  if (!full_name || !full_name.trim())
    return res.status(400).json({ success: false, error: 'Full name is required' });

  const username = digits;
  if (Q.getUserByUsername(username))
    return res.status(409).json({ success: false, error: 'An account with this mobile number already exists' });
  if (Q.getPatientByPhone(digits))
    return res.status(409).json({ success: false, error: 'A patient record with this mobile number already exists' });

  const hash = await bcrypt.hash(String(password), 10);
  const userResult = Q.createUser('patient', username, hash, null, full_name.trim());
  const userId = userResult.lastInsertRowid;

  const patientResult = Q.createPatient({
    $mrn: nextMrn(),
    $user_id: userId,
    $full_name: full_name.trim(),
    $dob: dob || null,
    $gender: gender || null,
    $phone: digits,
    $email: email || null,
    $address: address || null,
    $emergency_contact: emergency_contact || null,
    $blood_group: blood_group || null,
    $allergies: null,
    $chronic_conditions: null,
    $past_surgeries: null,
    $current_medications: null,
    $insurance_provider: null,
    $insurance_number: null,
  });
  dbRun(`UPDATE users SET linked_id = ? WHERE id = ?`, [patientResult.lastInsertRowid, userId]);

  const token = randomToken();
  const expiresAt = sessionExpiry();
  Q.createSession(token, userId, expiresAt);

  const patient = Q.getPatientById(patientResult.lastInsertRowid);
  Q.createNotification(userId, 'Welcome to MediQueue',
    `Your patient record ${patient.mrn} has been created.`, 'success');

  return res.status(201).json({
    success: true,
    data: {
      token,
      role: 'patient',
      username,
      displayName: patient.full_name,
      linkedId: patient.id,
      patient: { mrn: patient.mrn, id: patient.id },
    },
  });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (token) Q.deleteSession(token);
  res.json({ success: true });
});

// ── Notifications ────────────────────────────────────────────────────────────

// GET /api/auth/notifications — current user's notifications
router.get('/notifications', requireAuth, (req, res) => {
  res.json({
    success: true,
    data: Q.getNotifications(req.session.user_id),
    unread: Q.countUnreadNotifications(req.session.user_id),
  });
});

// POST /api/auth/notifications/read — mark all as read
router.post('/notifications/read', requireAuth, (req, res) => {
  Q.markNotificationsRead(req.session.user_id);
  res.json({ success: true });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  const data = {
    role:        req.session.role,
    username:    req.session.username,
    displayName: req.session.display_name,
    linkedId:    req.session.linked_id,
  };
  if (req.session.role === 'patient') {
    let patient = (req.session.linked_id && Q.getPatientById(req.session.linked_id)) || null;
    if (!patient) patient = Q.getPatientByUserId(req.session.user_id) || null;
    if (patient) {
      data.linkedId = patient.id;
      data.patient = patient;
    }
  }
  if (req.session.role === 'doctor' && req.session.linked_id) {
    data.doctor = Q.getDoctorById(req.session.linked_id) || null;
  }
  res.json({ success: true, data });
});

module.exports = { router, requireAuth, requireRole };
