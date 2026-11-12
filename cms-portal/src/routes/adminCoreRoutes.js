'use strict';

const express = require('express');
const { hashPassword } = require('../utils/crypto');
const { sanitizePlainText, sanitizeSafeCsvCell } = require('../utils/sanitize');
const { recordAudit, getSetting, setSetting } = require('../utils/audit');
const { createSystemBackup, listBackups, resolveBackupFile } = require('../utils/backupService');
const config = require('../config/env');

function createAdminCoreRouter({ getDb, requirePermission }) {
  const router = express.Router();

  // 1. Dashboard Summary Metrics & Recent Activity
  router.get('/dashboard', requirePermission('dashboard:view'), (req, res) => {
    const db = getDb();

    const publishedNotices = db.prepare(`SELECT COUNT(*) AS cnt FROM notices WHERE workflow_status = 'Published'`).get().cnt;
    const galleryImages = db.prepare(`SELECT COUNT(*) AS cnt FROM gallery_images WHERE workflow_status != 'Archived'`).get().cnt;
    const totalDownloads = db.prepare(`SELECT COUNT(*) AS cnt FROM documents WHERE workflow_status = 'Published'`).get().cnt;
    const publishedServices =
      db.prepare(`SELECT COUNT(*) AS cnt FROM deposit_products WHERE workflow_status = 'Published' AND status = 'Active'`).get().cnt +
      db.prepare(`SELECT COUNT(*) AS cnt FROM loan_products WHERE workflow_status = 'Published' AND status = 'Active'`).get().cnt;

    const draftContent =
      db.prepare(`SELECT COUNT(*) AS cnt FROM website_content WHERE workflow_status = 'Draft'`).get().cnt +
      db.prepare(`SELECT COUNT(*) AS cnt FROM deposit_products WHERE workflow_status = 'Draft'`).get().cnt +
      db.prepare(`SELECT COUNT(*) AS cnt FROM loan_products WHERE workflow_status = 'Draft'`).get().cnt +
      db.prepare(`SELECT COUNT(*) AS cnt FROM notices WHERE workflow_status = 'Draft'`).get().cnt +
      db.prepare(`SELECT COUNT(*) AS cnt FROM gallery_images WHERE workflow_status = 'Draft'`).get().cnt +
      db.prepare(`SELECT COUNT(*) AS cnt FROM documents WHERE workflow_status = 'Draft'`).get().cnt +
      db.prepare(`SELECT COUNT(*) AS cnt FROM faqs WHERE workflow_status = 'Draft'`).get().cnt +
      db.prepare(`SELECT COUNT(*) AS cnt FROM santhwanam_content WHERE workflow_status = 'Draft'`).get().cnt;

    const pendingApproval =
      db.prepare(`SELECT COUNT(*) AS cnt FROM website_content WHERE workflow_status = 'Pending Approval'`).get().cnt +
      db.prepare(`SELECT COUNT(*) AS cnt FROM deposit_products WHERE workflow_status = 'Pending Approval'`).get().cnt +
      db.prepare(`SELECT COUNT(*) AS cnt FROM loan_products WHERE workflow_status = 'Pending Approval'`).get().cnt +
      db.prepare(`SELECT COUNT(*) AS cnt FROM interest_rate_history WHERE approval_status = 'Pending'`).get().cnt +
      db.prepare(`SELECT COUNT(*) AS cnt FROM notices WHERE workflow_status = 'Pending Approval'`).get().cnt +
      db.prepare(`SELECT COUNT(*) AS cnt FROM gallery_images WHERE workflow_status = 'Pending Approval'`).get().cnt +
      db.prepare(`SELECT COUNT(*) AS cnt FROM documents WHERE workflow_status = 'Pending Approval'`).get().cnt +
      db.prepare(`SELECT COUNT(*) AS cnt FROM faqs WHERE workflow_status = 'Pending Approval'`).get().cnt +
      db.prepare(`SELECT COUNT(*) AS cnt FROM santhwanam_content WHERE workflow_status = 'Pending Approval'`).get().cnt;

    const recentImages = db.prepare(`SELECT id, title, category, thumbnail_path, workflow_status, created_at FROM gallery_images ORDER BY id DESC LIMIT 5`).all();
    const recentNotices = db.prepare(`SELECT id, title, category, publish_date, workflow_status FROM notices ORDER BY publish_date DESC, id DESC LIMIT 5`).all();
    const recentRates = db.prepare(`SELECT id, product_type, product_name, previous_rate, new_rate, effective_from, approval_status, changed_by_name, changed_at FROM interest_rate_history ORDER BY id DESC LIMIT 5`).all();
    const recentActivities = db.prepare(`SELECT id, username, role_name, action, module, target_label, created_at FROM audit_logs ORDER BY id DESC LIMIT 10`).all();

    return res.json({
      ok: true,
      summary: {
        publishedNotices,
        galleryImages,
        totalDownloads,
        publishedServices,
        draftContent,
        pendingApproval
      },
      recentImages,
      recentNotices,
      recentRates,
      recentActivities,
      settings: {
        requireApprovalFinancial: getSetting(db, 'require_approval_financial', 'true') === 'true',
        requireApprovalContent: getSetting(db, 'require_approval_content', 'false') === 'true'
      }
    });
  });

  // 2. Users Management
  router.get('/users', requirePermission('users:view', 'users:manage'), (req, res) => {
    const db = getDb();
    const users = db.prepare(`
      SELECT u.id, u.username, u.email, u.full_name, u.is_active, u.mfa_enabled,
             u.failed_attempts, u.locked_until, u.last_login_at, u.last_login_ip, u.created_at,
             r.id AS role_id, r.slug AS role_slug, r.name AS role_name
      FROM admin_users u
      JOIN roles r ON r.id = u.role_id
      ORDER BY u.id ASC
    `).all();
    return res.json({ ok: true, users });
  });

  router.post('/users', requirePermission('users:manage'), (req, res) => {
    const db = getDb();
    const username = sanitizePlainText(req.body && req.body.username, 60);
    const email = sanitizePlainText(req.body && req.body.email, 120);
    const fullName = sanitizePlainText(req.body && req.body.fullName, 120);
    const password = typeof (req.body && req.body.password) === 'string' ? req.body.password : '';
    const roleId = Number(req.body && req.body.roleId);

    if (!username || !email || !fullName || password.length < 8 || !Number.isInteger(roleId)) {
      return res.status(400).json({ ok: false, error: 'Username, email, full name, valid role, and password (min 8 chars) are required.' });
    }
    const role = db.prepare(`SELECT id, name FROM roles WHERE id = ?`).get(roleId);
    if (!role) return res.status(400).json({ ok: false, error: 'Selected role does not exist.' });

    const existing = db.prepare(`SELECT id FROM admin_users WHERE username = ? OR email = ?`).get(username, email);
    if (existing) return res.status(409).json({ ok: false, error: 'Username or email is already registered.' });

    const info = db.prepare(`
      INSERT INTO admin_users (username, email, full_name, password_hash, role_id, is_active)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(username, email, fullName, hashPassword(password), roleId);

    recordAudit(db, {
      req, user: req.user, action: 'USER_CREATED', module: 'User Management',
      targetId: info.lastInsertRowid, targetLabel: username,
      newValue: { username, email, fullName, role: role.name }
    });
    return res.status(201).json({ ok: true, id: Number(info.lastInsertRowid) });
  });

  router.put('/users/:id', requirePermission('users:manage'), (req, res) => {
    const db = getDb();
    const userId = Number(req.params.id);
    const target = db.prepare(`
      SELECT u.*, r.slug AS role_slug, r.name AS role_name
      FROM admin_users u JOIN roles r ON r.id = u.role_id
      WHERE u.id = ?
    `).get(userId);
    if (!target) return res.status(404).json({ ok: false, error: 'User not found.' });

    const fullName = sanitizePlainText(req.body && req.body.fullName, 120) || target.full_name;
    const email = sanitizePlainText(req.body && req.body.email, 120) || target.email;
    const roleId = req.body && req.body.roleId ? Number(req.body.roleId) : target.role_id;
    const isActive = req.body && typeof req.body.isActive === 'boolean' ? (req.body.isActive ? 1 : 0) : target.is_active;

    const newRole = db.prepare(`SELECT id, slug, name FROM roles WHERE id = ?`).get(roleId);
    if (!newRole) return res.status(400).json({ ok: false, error: 'Invalid role selected.' });

    // Prevent locking out the last active Super Admin
    if (target.role_slug === 'super_admin' && (newRole.slug !== 'super_admin' || !isActive)) {
      const otherActiveSupers = db.prepare(`
        SELECT COUNT(*) AS cnt FROM admin_users u JOIN roles r ON r.id = u.role_id
        WHERE r.slug = 'super_admin' AND u.is_active = 1 AND u.id != ?
      `).get(userId).cnt;
      if (otherActiveSupers === 0) {
        return res.status(400).json({ ok: false, error: 'Cannot deactivate or demote the last active Super Administrator.' });
      }
    }

    db.prepare(`
      UPDATE admin_users
      SET full_name = ?, email = ?, role_id = ?, is_active = ?,
          failed_attempts = CASE WHEN ? = 1 THEN 0 ELSE failed_attempts END,
          locked_until = CASE WHEN ? = 1 THEN NULL ELSE locked_until END,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(fullName, email, roleId, isActive, isActive, isActive, userId);

    if (!isActive) {
      db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(userId);
    }

    recordAudit(db, {
      req, user: req.user, action: 'USER_UPDATED', module: 'User Management',
      targetId: userId, targetLabel: target.username,
      oldValue: { fullName: target.full_name, email: target.email, role: target.role_name, isActive: Boolean(target.is_active) },
      newValue: { fullName, email, role: newRole.name, isActive: Boolean(isActive) }
    });
    return res.json({ ok: true });
  });

  router.post('/users/:id/reset-password', requirePermission('users:manage'), (req, res) => {
    const db = getDb();
    const userId = Number(req.params.id);
    const newPassword = typeof (req.body && req.body.newPassword) === 'string' ? req.body.newPassword : '';
    if (newPassword.length < 8) {
      return res.status(400).json({ ok: false, error: 'New password must be at least 8 characters long.' });
    }
    const target = db.prepare(`SELECT id, username FROM admin_users WHERE id = ?`).get(userId);
    if (!target) return res.status(404).json({ ok: false, error: 'User not found.' });

    db.prepare(`UPDATE admin_users SET password_hash = ?, failed_attempts = 0, locked_until = NULL, password_changed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`)
      .run(hashPassword(newPassword), userId);
    db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(userId);

    recordAudit(db, { req, user: req.user, action: 'USER_PASSWORD_RESET', module: 'User Management', targetId: userId, targetLabel: target.username });
    return res.json({ ok: true, message: 'Password reset and existing sessions invalidated.' });
  });

  // 3. Roles & Permissions
  router.get('/roles', requirePermission('users:view', 'roles:manage', 'users:manage'), (req, res) => {
    const db = getDb();
    const roles = db.prepare(`SELECT * FROM roles ORDER BY id ASC`).all();
    const allPerms = db.prepare(`SELECT * FROM permissions ORDER BY module ASC, code ASC`).all();
    const mappings = db.prepare(`SELECT role_id, permission_id FROM role_permissions`).all();

    const permMap = new Map();
    for (const m of mappings) {
      if (!permMap.has(m.role_id)) permMap.set(m.role_id, []);
      permMap.get(m.role_id).push(m.permission_id);
    }

    const enriched = roles.map(r => {
      const assignedIds = new Set(permMap.get(r.id) || []);
      return {
        ...r,
        permissionCodes: allPerms.filter(p => assignedIds.has(p.id)).map(p => p.code)
      };
    });
    return res.json({ ok: true, roles: enriched, permissions: allPerms });
  });

  router.put('/roles/:id/permissions', requirePermission('roles:manage'), (req, res) => {
    const db = getDb();
    const roleId = Number(req.params.id);
    const role = db.prepare(`SELECT * FROM roles WHERE id = ?`).get(roleId);
    if (!role) return res.status(404).json({ ok: false, error: 'Role not found.' });
    if (role.slug === 'super_admin') {
      return res.status(400).json({ ok: false, error: 'Super Administrator always retains full permissions.' });
    }
    const codes = Array.isArray(req.body && req.body.permissionCodes) ? req.body.permissionCodes : [];
    const oldCodes = db.prepare(`
      SELECT p.code FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id WHERE rp.role_id = ?
    `).all(roleId).map(r => r.code);

    db.prepare(`DELETE FROM role_permissions WHERE role_id = ?`).run(roleId);
    const insertRp = db.prepare(`INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)`);
    for (const code of codes) {
      const p = db.prepare(`SELECT id FROM permissions WHERE code = ?`).get(String(code));
      if (p) insertRp.run(roleId, p.id);
    }

    recordAudit(db, {
      req, user: req.user, action: 'ROLE_PERMISSIONS_UPDATED', module: 'Roles & Permissions',
      targetId: roleId, targetLabel: role.name, oldValue: oldCodes, newValue: codes
    });
    return res.json({ ok: true });
  });

  // 4. Activity Logs (Immutable Audit Trail)
  router.get('/audit-logs', requirePermission('audit:view'), (req, res) => {
    const db = getDb();
    const moduleFilter = sanitizePlainText(req.query.module, 64);
    const actionFilter = sanitizePlainText(req.query.action, 64);
    const userFilter = sanitizePlainText(req.query.username, 64);
    const limit = Math.min(250, Math.max(10, Number(req.query.limit) || 100));

    const where = [];
    const params = [];
    if (moduleFilter) { where.push('module = ?'); params.push(moduleFilter); }
    if (actionFilter) { where.push('action = ?'); params.push(actionFilter); }
    if (userFilter) { where.push('username LIKE ?'); params.push(`%${userFilter}%`); }

    const sql = `SELECT * FROM audit_logs ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT ?`;
    params.push(limit);
    const logs = db.prepare(sql).all(...params);
    return res.json({ ok: true, logs });
  });

  router.get('/audit-logs/export', requirePermission('audit:view'), (req, res) => {
    const db = getDb();
    const logs = db.prepare(`SELECT * FROM audit_logs ORDER BY id DESC LIMIT 1000`).all();
    const header = ['ID', 'Timestamp', 'Username', 'Role', 'Action', 'Module', 'Target ID', 'Target Label', 'IP Address', 'Old Value', 'New Value']
      .map(sanitizeSafeCsvCell).join(',');
    const lines = logs.map(l => [
      l.id, l.created_at, l.username, l.role_name, l.action, l.module,
      l.target_id, l.target_label, l.ip_address, l.old_value || '', l.new_value || ''
    ].map(sanitizeSafeCsvCell).join(','));

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="wdpcs-cms-audit-logs.csv"');
    return res.send([header, ...lines].join('\r\n'));
  });

  // 5. Revisions Viewer & Restore
  router.get('/revisions/:entityType/:entityId', requirePermission('content:view', 'financial:view'), (req, res) => {
    const db = getDb();
    const entityType = sanitizePlainText(req.params.entityType, 64);
    const entityId = sanitizePlainText(req.params.entityId, 64);
    const revisions = db.prepare(`
      SELECT id, entity_type, entity_id, version_label, snapshot_json, change_note, created_by_name, created_at
      FROM content_revisions WHERE entity_type = ? AND entity_id = ? ORDER BY id DESC LIMIT 30
    `).all(entityType, entityId);
    return res.json({ ok: true, revisions });
  });

  // 6. Settings & Backups
  router.get('/settings', requirePermission('dashboard:view'), (req, res) => {
    const db = getDb();
    const rows = db.prepare(`SELECT setting_key, setting_value, description, updated_at FROM system_settings ORDER BY setting_key ASC`).all();
    return res.json({ ok: true, settings: rows });
  });

  router.put('/settings', requirePermission('settings:manage'), (req, res) => {
    const db = getDb();
    const updates = req.body && req.body.settings;
    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ ok: false, error: 'Settings payload is required.' });
    }
    const allowedKeys = new Set([
      'require_approval_financial',
      'require_approval_content',
      'admin_portal_url',
      'public_site_url',
      'backup_retention_count'
    ]);
    const oldState = {};
    const newState = {};
    for (const [k, v] of Object.entries(updates)) {
      if (!allowedKeys.has(k)) continue;
      oldState[k] = getSetting(db, k, '');
      const cleanVal = sanitizePlainText(v, 255);
      setSetting(db, k, cleanVal, req.user.id);
      newState[k] = cleanVal;
    }
    recordAudit(db, { req, user: req.user, action: 'SETTINGS_UPDATED', module: 'Settings', targetLabel: 'System Settings', oldValue: oldState, newValue: newState });
    return res.json({ ok: true });
  });

  router.get('/backups', requirePermission('settings:manage'), (req, res) => {
    return res.json({ ok: true, backups: listBackups(config.backupDir) });
  });

  router.post('/backups', requirePermission('settings:manage'), (req, res) => {
    const db = getDb();
    const note = sanitizePlainText(req.body && req.body.note, 200) || 'Admin Portal manual snapshot';
    const manifest = createSystemBackup(db, {
      backupDir: config.backupDir,
      uploadDir: config.uploadDir,
      createdBy: req.user.username,
      note
    });
    recordAudit(db, { req, user: req.user, action: 'BACKUP_CREATED', module: 'Backups', targetId: manifest.backupId, targetLabel: manifest.backupId, newValue: manifest.rowCounts });
    return res.status(201).json({ ok: true, backup: manifest });
  });

  router.get('/backups/:backupId/:file', requirePermission('settings:manage'), (req, res) => {
    const filePath = resolveBackupFile(req.params.backupId, req.params.file, config.backupDir);
    if (!filePath) return res.status(404).json({ ok: false, error: 'Backup file not found.' });
    return res.download(filePath);
  });

  return router;
}

module.exports = { createAdminCoreRouter };
