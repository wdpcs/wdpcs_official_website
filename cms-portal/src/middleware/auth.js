'use strict';

const config = require('../config/env');
const { hashToken, hmacSign, timingSafeMatch } = require('../utils/crypto');

const SESSION_COOKIE_NAME = 'wdpcs_admin_sid';

function parseCookies(req) {
  const raw = req.headers.cookie || '';
  const result = {};
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) {
      try {
        result[k] = decodeURIComponent(v);
      } catch {
        result[k] = v;
      }
    }
  }
  return result;
}

function signCookieValue(rawToken) {
  const sig = hmacSign(rawToken, config.sessionSecret);
  return `${rawToken}.${sig}`;
}

function verifySignedCookieValue(signedVal) {
  if (!signedVal || typeof signedVal !== 'string') return null;
  const dotIdx = signedVal.lastIndexOf('.');
  if (dotIdx <= 0) return null;
  const rawToken = signedVal.slice(0, dotIdx);
  const sig = signedVal.slice(dotIdx + 1);
  const expectedSig = hmacSign(rawToken, config.sessionSecret);
  return timingSafeMatch(sig, expectedSig) ? rawToken : null;
}

function setSessionCookie(res, rawToken) {
  const value = encodeURIComponent(signCookieValue(rawToken));
  const maxAgeSec = Math.floor(config.sessionMaxAgeMs / 1000);
  const attrs = [
    `${SESSION_COOKIE_NAME}=${value}`,
    'Path=/',
    'HttpOnly',
    `SameSite=${config.cookieSameSite}`,
    `Max-Age=${maxAgeSec}`
  ];
  if (config.cookieSecure) attrs.push('Secure');
  res.setHeader('Set-Cookie', attrs.join('; '));
}

function clearSessionCookie(res) {
  const attrs = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    `SameSite=${config.cookieSameSite}`,
    'Max-Age=0'
  ];
  if (config.cookieSecure) attrs.push('Secure');
  res.setHeader('Set-Cookie', attrs.join('; '));
}

function loadUserPermissions(db, roleId) {
  const rows = db.prepare(`
    SELECT p.code
    FROM role_permissions rp
    JOIN permissions p ON p.id = rp.permission_id
    WHERE rp.role_id = ?
  `).all(roleId);
  return new Set(rows.map(r => r.code));
}

function createAuthMiddleware(getDbFn) {
  function requireAuth(req, res, next) {
    const db = getDbFn();
    const cookies = parseCookies(req);
    const rawCookie = cookies[SESSION_COOKIE_NAME];
    const rawToken = verifySignedCookieValue(rawCookie);

    if (!rawToken) {
      return res.status(401).json({ ok: false, error: 'Authentication required.' });
    }

    const tokenHash = hashToken(rawToken);
    const session = db.prepare(`
      SELECT s.*, u.id AS u_id, u.username, u.email, u.full_name, u.is_active, u.mfa_enabled,
             u.last_login_at, r.id AS role_id, r.slug AS role_slug, r.name AS role_name
      FROM sessions s
      JOIN admin_users u ON u.id = s.user_id
      JOIN roles r ON r.id = u.role_id
      WHERE s.token_hash = ?
    `).get(tokenHash);

    if (!session) {
      clearSessionCookie(res);
      return res.status(401).json({ ok: false, error: 'Session invalid or expired.' });
    }

    const nowMs = Date.now();
    const expiresMs = Date.parse(session.expires_at);
    const lastActiveMs = Date.parse(session.last_activity_at);

    if (
      !session.is_active ||
      !Number.isFinite(expiresMs) || expiresMs <= nowMs ||
      !Number.isFinite(lastActiveMs) || (nowMs - lastActiveMs) > config.sessionIdleTimeoutMs
    ) {
      db.prepare(`DELETE FROM sessions WHERE id = ?`).run(session.id);
      clearSessionCookie(res);
      return res.status(401).json({ ok: false, error: 'Session expired due to inactivity or account status.' });
    }

    if (!session.mfa_verified) {
      return res.status(403).json({ ok: false, error: 'Multi-factor authentication verification required.', mfaRequired: true });
    }

    // Touch last_activity_at at most once per 30 seconds to avoid unnecessary write churn
    if (nowMs - lastActiveMs > 30000) {
      db.prepare(`UPDATE sessions SET last_activity_at = ? WHERE id = ?`).run(new Date(nowMs).toISOString(), session.id);
    }

    req.session = session;
    req.csrfToken = session.csrf_token;
    req.user = {
      id: session.u_id,
      username: session.username,
      email: session.email,
      full_name: session.full_name,
      role_id: session.role_id,
      role_slug: session.role_slug,
      role_name: session.role_name,
      mfa_enabled: Boolean(session.mfa_enabled),
      last_login_at: session.last_login_at
    };
    req.permissions = loadUserPermissions(db, session.role_id);
    return next();
  }

  function requirePermission(...codes) {
    return function permissionMiddleware(req, res, next) {
      if (!req.user || !req.permissions) {
        return res.status(401).json({ ok: false, error: 'Authentication required.' });
      }
      if (req.user.role_slug === 'super_admin') return next();
      const allowed = codes.some(c => req.permissions.has(c));
      if (!allowed) {
        return res.status(403).json({
          ok: false,
          error: 'You do not have permission to perform this action.',
          requiredPermissions: codes
        });
      }
      return next();
    };
  }

  return {
    requireAuth,
    requirePermission,
    loadUserPermissions
  };
}

module.exports = {
  SESSION_COOKIE_NAME,
  parseCookies,
  setSessionCookie,
  clearSessionCookie,
  createAuthMiddleware
};

