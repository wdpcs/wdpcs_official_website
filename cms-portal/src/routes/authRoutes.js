'use strict';

const express = require('express');
const config = require('../config/env');
const {
  hashPassword,
  verifyPassword,
  generateSecureToken,
  hashToken,
  generateTotpSecret,
  verifyTotpCode,
  buildTotpUri
} = require('../utils/crypto');
const { sanitizePlainText } = require('../utils/sanitize');
const { recordAudit, getClientIp } = require('../utils/audit');
const {
  SESSION_COOKIE_NAME,
  parseCookies,
  setSessionCookie,
  clearSessionCookie
} = require('../middleware/auth');
const { hmacSign, timingSafeMatch } = require('../utils/crypto');
const { createRateLimiter } = require('../middleware/rateLimit');

function verifySignedToken(cookies, secret) {
  const signedVal = cookies[SESSION_COOKIE_NAME];
  if (!signedVal || typeof signedVal !== 'string') return null;
  const dotIdx = signedVal.lastIndexOf('.');
  if (dotIdx <= 0) return null;
  const rawToken = signedVal.slice(0, dotIdx);
  const sig = signedVal.slice(dotIdx + 1);
  return timingSafeMatch(sig, hmacSign(rawToken, secret)) ? rawToken : null;
}

function createAuthRouter({ getDb, requireAuth, verifyCsrf, loadUserPermissions }) {
  const router = express.Router();

  const loginLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 30,
    keyPrefix: 'login',
    message: 'Too many authentication attempts from this IP. Please wait before trying again.'
  });

  const resetLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 15,
    keyPrefix: 'pwd-reset',
    message: 'Too many password reset requests. Please try again later.'
  });

  router.post('/login', loginLimiter, (req, res) => {
    const db = getDb();
    const identifier = sanitizePlainText(req.body && req.body.identifier, 120);
    const password = typeof (req.body && req.body.password) === 'string' ? req.body.password : '';
    const ip = getClientIp(req);
    const ua = sanitizePlainText(req.headers['user-agent'] || '', 255);

    if (!identifier || !password) {
      return res.status(400).json({ ok: false, error: 'Username/Email and Password are required.' });
    }

    const user = db.prepare(`
      SELECT u.*, r.slug AS role_slug, r.name AS role_name
      FROM admin_users u
      JOIN roles r ON r.id = u.role_id
      WHERE u.username = ? OR u.email = ?
      LIMIT 1
    `).get(identifier, identifier);

    if (!user) {
      recordAudit(db, { req, action: 'LOGIN_FAILED', module: 'Auth', targetLabel: identifier, newValue: 'Unknown account' });
      return res.status(401).json({ ok: false, error: 'Invalid credentials.' });
    }

    if (!user.is_active) {
      recordAudit(db, { req, user, action: 'LOGIN_BLOCKED', module: 'Auth', targetId: user.id, targetLabel: user.username, newValue: 'Account deactivated' });
      return res.status(403).json({ ok: false, error: 'This administrator account is currently deactivated. Contact Super Administrator.' });
    }

    if (user.locked_until && Date.parse(user.locked_until) > Date.now()) {
      const waitMin = Math.ceil((Date.parse(user.locked_until) - Date.now()) / 60000);
      recordAudit(db, { req, user, action: 'LOGIN_LOCKED', module: 'Auth', targetId: user.id, targetLabel: user.username });
      return res.status(423).json({
        ok: false,
        error: `Account temporarily locked due to multiple failed attempts. Try again in ${waitMin} minute(s).`
      });
    }

    if (!verifyPassword(password, user.password_hash)) {
      const nextAttempts = (user.failed_attempts || 0) + 1;
      const shouldLock = nextAttempts >= config.loginMaxAttempts;
      const lockedUntil = shouldLock ? new Date(Date.now() + config.loginLockoutMs).toISOString() : null;
      db.prepare(`UPDATE admin_users SET failed_attempts = ?, locked_until = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(nextAttempts, lockedUntil, user.id);

      recordAudit(db, {
        req, user,
        action: shouldLock ? 'ACCOUNT_LOCKED' : 'LOGIN_FAILED',
        module: 'Auth',
        targetId: user.id,
        targetLabel: user.username,
        newValue: { attempts: nextAttempts, lockedUntil }
      });

      return res.status(shouldLock ? 423 : 401).json({
        ok: false,
        error: shouldLock
          ? 'Maximum failed login attempts reached. Account temporarily locked for security.'
          : 'Invalid credentials.'
      });
    }

    // Credentials valid: reset lockout counters & issue session
    db.prepare(`UPDATE admin_users SET failed_attempts = 0, locked_until = NULL, updated_at = datetime('now') WHERE id = ?`).run(user.id);

    const rawToken = generateSecureToken(32);
    const csrfToken = generateSecureToken(24);
    const expiresAt = new Date(Date.now() + config.sessionMaxAgeMs).toISOString();
    const mfaVerified = user.mfa_enabled ? 0 : 1;

    db.prepare(`
      INSERT INTO sessions (token_hash, csrf_token, user_id, mfa_verified, ip_address, user_agent, expires_at, last_activity_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(hashToken(rawToken), csrfToken, user.id, mfaVerified, ip, ua, expiresAt, new Date().toISOString());

    setSessionCookie(res, rawToken);

    if (user.mfa_enabled) {
      recordAudit(db, { req, user, action: 'LOGIN_MFA_CHALLENGE', module: 'Auth', targetId: user.id, targetLabel: user.username });
      return res.json({
        ok: true,
        mfaRequired: true,
        csrfToken,
        message: 'Enter the 6-digit verification code from your authenticator app.'
      });
    }

    db.prepare(`UPDATE admin_users SET last_login_at = datetime('now'), last_login_ip = ? WHERE id = ?`).run(ip, user.id);
    recordAudit(db, { req, user, action: 'LOGIN_SUCCESS', module: 'Auth', targetId: user.id, targetLabel: user.username });

    const permissions = Array.from(loadUserPermissions(db, user.role_id));
    return res.json({
      ok: true,
      mfaRequired: false,
      csrfToken,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        full_name: user.full_name,
        role_slug: user.role_slug,
        role_name: user.role_name,
        mfa_enabled: Boolean(user.mfa_enabled),
        last_login_at: user.last_login_at
      },
      permissions
    });
  });

  router.post('/mfa-verify', loginLimiter, (req, res) => {
    const db = getDb();
    const cookies = parseCookies(req);
    const rawToken = verifySignedToken(cookies, config.sessionSecret);
    if (!rawToken) {
      return res.status(401).json({ ok: false, error: 'No pending login session found.' });
    }
    const session = db.prepare(`
      SELECT s.*, u.id AS u_id, u.username, u.email, u.full_name, u.mfa_secret, u.mfa_enabled, u.is_active,
             r.id AS role_id, r.slug AS role_slug, r.name AS role_name
      FROM sessions s
      JOIN admin_users u ON u.id = s.user_id
      JOIN roles r ON r.id = u.role_id
      WHERE s.token_hash = ?
    `).get(hashToken(rawToken));

    if (!session || !session.is_active || Date.parse(session.expires_at) <= Date.now()) {
      return res.status(401).json({ ok: false, error: 'Session expired. Please sign in again.' });
    }

    const code = sanitizePlainText(req.body && req.body.code, 16);
    if (!verifyTotpCode(session.mfa_secret, code)) {
      recordAudit(db, { req, user: { id: session.u_id, username: session.username, role_name: session.role_name }, action: 'MFA_FAILED', module: 'Auth', targetId: session.u_id });
      return res.status(401).json({ ok: false, error: 'Invalid 6-digit MFA verification code.' });
    }

    const ip = getClientIp(req);
    db.prepare(`UPDATE sessions SET mfa_verified = 1, last_activity_at = ? WHERE id = ?`).run(new Date().toISOString(), session.id);
    db.prepare(`UPDATE admin_users SET last_login_at = datetime('now'), last_login_ip = ? WHERE id = ?`).run(ip, session.u_id);

    const userObj = {
      id: session.u_id,
      username: session.username,
      email: session.email,
      full_name: session.full_name,
      role_slug: session.role_slug,
      role_name: session.role_name,
      mfa_enabled: true
    };
    recordAudit(db, { req, user: userObj, action: 'LOGIN_SUCCESS_MFA', module: 'Auth', targetId: session.u_id, targetLabel: session.username });

    return res.json({
      ok: true,
      csrfToken: session.csrf_token,
      user: userObj,
      permissions: Array.from(loadUserPermissions(db, session.role_id))
    });
  });

  router.post('/logout', (req, res) => {
    const db = getDb();
    const cookies = parseCookies(req);
    const rawToken = verifySignedToken(cookies, config.sessionSecret);
    if (rawToken) {
      const session = db.prepare(`
        SELECT s.id, u.id AS uid, u.username, r.name AS role_name
        FROM sessions s JOIN admin_users u ON u.id = s.user_id JOIN roles r ON r.id = u.role_id
        WHERE s.token_hash = ?
      `).get(hashToken(rawToken));
      if (session) {
        db.prepare(`DELETE FROM sessions WHERE id = ?`).run(session.id);
        recordAudit(db, { req, user: { id: session.uid, username: session.username, role_name: session.role_name }, action: 'LOGOUT', module: 'Auth', targetId: session.uid, targetLabel: session.username });
      }
    }
    clearSessionCookie(res);
    return res.json({ ok: true });
  });

  router.get('/me', requireAuth, (req, res) => {
    return res.json({
      ok: true,
      user: req.user,
      permissions: Array.from(req.permissions),
      csrfToken: req.csrfToken,
      idleTimeoutMs: config.sessionIdleTimeoutMs
    });
  });

  router.post('/change-password', requireAuth, verifyCsrf, (req, res) => {
    const db = getDb();
    const currentPassword = typeof (req.body && req.body.currentPassword) === 'string' ? req.body.currentPassword : '';
    const newPassword = typeof (req.body && req.body.newPassword) === 'string' ? req.body.newPassword : '';
    if (newPassword.length < 8) {
      return res.status(400).json({ ok: false, error: 'New password must be at least 8 characters long.' });
    }
    const row = db.prepare(`SELECT password_hash FROM admin_users WHERE id = ?`).get(req.user.id);
    if (!row || !verifyPassword(currentPassword, row.password_hash)) {
      return res.status(400).json({ ok: false, error: 'Current password is incorrect.' });
    }
    db.prepare(`UPDATE admin_users SET password_hash = ?, password_changed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`)
      .run(hashPassword(newPassword), req.user.id);
    recordAudit(db, { req, user: req.user, action: 'PASSWORD_CHANGED', module: 'Auth', targetId: req.user.id, targetLabel: req.user.username });
    return res.json({ ok: true, message: 'Password updated successfully.' });
  });

  router.post('/mfa/setup', requireAuth, verifyCsrf, (req, res) => {
    const db = getDb();
    const secret = generateTotpSecret();
    db.prepare(`UPDATE admin_users SET mfa_secret = ?, updated_at = datetime('now') WHERE id = ?`).run(secret, req.user.id);
    const otpauthUri = buildTotpUri({ secret, accountName: req.user.email || req.user.username });
    recordAudit(db, { req, user: req.user, action: 'MFA_SETUP_INITIATED', module: 'Auth', targetId: req.user.id, targetLabel: req.user.username });
    return res.json({ ok: true, secret, otpauthUri });
  });

  router.post('/mfa/enable', requireAuth, verifyCsrf, (req, res) => {
    const db = getDb();
    const code = sanitizePlainText(req.body && req.body.code, 16);
    const row = db.prepare(`SELECT mfa_secret FROM admin_users WHERE id = ?`).get(req.user.id);
    if (!row || !row.mfa_secret) {
      return res.status(400).json({ ok: false, error: 'Generate an MFA secret first.' });
    }
    if (!verifyTotpCode(row.mfa_secret, code)) {
      return res.status(400).json({ ok: false, error: 'Invalid 6-digit verification code. Confirm your authenticator app time is synced.' });
    }
    db.prepare(`UPDATE admin_users SET mfa_enabled = 1, updated_at = datetime('now') WHERE id = ?`).run(req.user.id);
    recordAudit(db, { req, user: req.user, action: 'MFA_ENABLED', module: 'Auth', targetId: req.user.id, targetLabel: req.user.username });
    return res.json({ ok: true, mfa_enabled: true });
  });

  router.post('/mfa/disable', requireAuth, verifyCsrf, (req, res) => {
    const db = getDb();
    const password = typeof (req.body && req.body.password) === 'string' ? req.body.password : '';
    const row = db.prepare(`SELECT password_hash FROM admin_users WHERE id = ?`).get(req.user.id);
    if (!row || !verifyPassword(password, row.password_hash)) {
      return res.status(400).json({ ok: false, error: 'Valid account password is required to disable MFA.' });
    }
    db.prepare(`UPDATE admin_users SET mfa_enabled = 0, mfa_secret = NULL, updated_at = datetime('now') WHERE id = ?`).run(req.user.id);
    recordAudit(db, { req, user: req.user, action: 'MFA_DISABLED', module: 'Auth', targetId: req.user.id, targetLabel: req.user.username });
    return res.json({ ok: true, mfa_enabled: false });
  });

  router.post('/forgot-password', resetLimiter, (req, res) => {
    const db = getDb();
    const identifier = sanitizePlainText(req.body && req.body.identifier, 120);
    if (!identifier) {
      return res.status(400).json({ ok: false, error: 'Enter your registered username or email address.' });
    }
    const user = db.prepare(`SELECT id, username, email, is_active FROM admin_users WHERE username = ? OR email = ? LIMIT 1`).get(identifier, identifier);
    let devPreviewToken = null;

    if (user && user.is_active) {
      const rawResetToken = generateSecureToken(24);
      const expiresAt = new Date(Date.now() + config.passwordResetExpiryMs).toISOString();
      db.prepare(`
        INSERT INTO password_resets (user_id, token_hash, expires_at, requested_ip)
        VALUES (?, ?, ?, ?)
      `).run(user.id, hashToken(rawResetToken), expiresAt, getClientIp(req));
      recordAudit(db, { req, user, action: 'PASSWORD_RESET_REQUESTED', module: 'Auth', targetId: user.id, targetLabel: user.username });
      if (config.allowDevResetPreview) {
        devPreviewToken = rawResetToken;
      }
      console.info(`[CMS RESET] Password reset requested for ${user.username} (${user.email}). Token expires at ${expiresAt}.`);
    }

    return res.json({
      ok: true,
      message: 'If the account is active and registered, a password reset link/token has been issued cleanly.',
      ...(devPreviewToken ? { devResetToken: devPreviewToken } : {})
    });
  });

  router.post('/reset-password', resetLimiter, (req, res) => {
    const db = getDb();
    const token = sanitizePlainText(req.body && req.body.token, 128);
    const newPassword = typeof (req.body && req.body.newPassword) === 'string' ? req.body.newPassword : '';
    if (!token || newPassword.length < 8) {
      return res.status(400).json({ ok: false, error: 'Valid reset token and a new password (min 8 chars) are required.' });
    }

    const row = db.prepare(`
      SELECT pr.*, u.username, u.role_id
      FROM password_resets pr
      JOIN admin_users u ON u.id = pr.user_id
      WHERE pr.token_hash = ? AND pr.used_at IS NULL
    `).get(hashToken(token));

    if (!row || Date.parse(row.expires_at) <= Date.now()) {
      return res.status(400).json({ ok: false, error: 'Password reset token is invalid or has expired.' });
    }

    db.prepare(`UPDATE admin_users SET password_hash = ?, failed_attempts = 0, locked_until = NULL, password_changed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`)
      .run(hashPassword(newPassword), row.user_id);
    db.prepare(`UPDATE password_resets SET used_at = datetime('now') WHERE id = ?`).run(row.id);
    db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(row.user_id);

    recordAudit(db, { req, user: { id: row.user_id, username: row.username, role_name: 'account-recovery' }, action: 'PASSWORD_RESET_COMPLETED', module: 'Auth', targetId: row.user_id, targetLabel: row.username });
    return res.json({ ok: true, message: 'Password reset successfully. Please sign in with your new password.' });
  });

  return router;
}

module.exports = { createAuthRouter };

