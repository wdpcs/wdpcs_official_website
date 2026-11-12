'use strict';

const { sanitizePlainText } = require('./sanitize');

function getClientIp(req) {
  const fwd = req && req.headers && req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) {
    return fwd.split(',')[0].trim().slice(0, 64);
  }
  return ((req && (req.ip || (req.socket && req.socket.remoteAddress))) || '127.0.0.1').slice(0, 64);
}

function recordAudit(db, { req, user, action, module, targetId = '', targetLabel = '', oldValue = null, newValue = null }) {
  try {
    const stmt = db.prepare(`
      INSERT INTO audit_logs
        (user_id, username, role_name, action, module, target_id, target_label, old_value, new_value, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const serialize = val => {
      if (val === undefined || val === null) return null;
      const str = typeof val === 'string' ? val : JSON.stringify(val);
      return str.slice(0, 10000);
    };

    const ua = req && req.headers && req.headers['user-agent'] ? sanitizePlainText(req.headers['user-agent'], 256) : '';
    stmt.run(
      user ? user.id : null,
      user ? user.username : 'system',
      user ? (user.role_name || user.role_slug || 'admin') : 'system',
      sanitizePlainText(action, 64),
      sanitizePlainText(module, 64),
      sanitizePlainText(String(targetId || ''), 64),
      sanitizePlainText(targetLabel, 255),
      serialize(oldValue),
      serialize(newValue),
      getClientIp(req),
      ua
    );
  } catch (err) {
    // Non-fatal fallback log to stderr if disk issue occurs during non-critical audit write
    console.error('[AUDIT_LOG_ERROR]', err.message);
  }
}

function recordRevision(db, { entityType, entityId, versionLabel, snapshot, changeNote = '', user = null }) {
  db.prepare(`
    INSERT INTO content_revisions
      (entity_type, entity_id, version_label, snapshot_json, change_note, created_by, created_by_name)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    sanitizePlainText(entityType, 64),
    sanitizePlainText(String(entityId), 64),
    sanitizePlainText(String(versionLabel), 64),
    typeof snapshot === 'string' ? snapshot : JSON.stringify(snapshot),
    sanitizePlainText(changeNote, 500),
    user ? user.id : null,
    user ? (user.full_name || user.username) : 'System'
  );
}

function getSetting(db, key, fallback = '') {
  const row = db.prepare(`SELECT setting_value FROM system_settings WHERE setting_key = ?`).get(key);
  return row ? row.setting_value : fallback;
}

function getBoolSetting(db, key, fallback = false) {
  const raw = getSetting(db, key, '');
  if (!raw) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
}

function setSetting(db, key, value, userId = null, description = null) {
  const existing = db.prepare(`SELECT description FROM system_settings WHERE setting_key = ?`).get(key);
  const desc = description !== null ? description : (existing ? existing.description : '');
  db.prepare(`
    INSERT INTO system_settings (setting_key, setting_value, description, updated_by, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(setting_key) DO UPDATE SET
      setting_value = excluded.setting_value,
      description = excluded.description,
      updated_by = excluded.updated_by,
      updated_at = datetime('now')
  `).run(key, String(value), desc, userId);
}

module.exports = {
  getClientIp,
  recordAudit,
  recordRevision,
  getSetting,
  getBoolSetting,
  setSetting
};

