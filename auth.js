/**
 * auth.js — Authentication routes + session middleware
 * POST /api/auth/login   → {username, password, role} → {token, user}
 * POST /api/auth/logout  → invalidate session
 * GET  /api/auth/me      → return current user from session
 */

const express = require('express');
const bcrypt  = require('bcryptjs');
const crypto  = require('crypto');
const { Q }   = require('./db');

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

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (token) Q.deleteSession(token);
  res.json({ success: true });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  res.json({
    success: true,
    data: {
      role:        req.session.role,
      username:    req.session.username,
      displayName: req.session.display_name,
      linkedId:    req.session.linked_id,
    },
  });
});

module.exports = { router, requireAuth, requireRole };
