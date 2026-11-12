'use strict';

const express = require('express');
const {
  sanitizePlainText,
  sanitizeRichHtml,
  containsSanthwanamSubruleViolation
} = require('../utils/sanitize');
const { recordAudit, recordRevision, getBoolSetting } = require('../utils/audit');
const { uploadMemory, saveDirectorPhoto } = require('../utils/upload');
const config = require('../config/env');

function sanitizeStructuredPayload(obj) {
  if (typeof obj === 'string') return sanitizePlainText(obj, 5000);
  if (Array.isArray(obj)) return obj.map(item => sanitizeStructuredPayload(item));
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k.toLowerCase().endsWith('html')) {
        out[k] = sanitizeRichHtml(v, 25000);
      } else {
        out[k] = sanitizeStructuredPayload(v);
      }
    }
    return out;
  }
  return obj;
}

function createContentRouter({ getDb, requirePermission }) {
  const router = express.Router();

  // =========================================================================
  // GENERAL WEBSITE CONTENT & HOMEPAGE MANAGEMENT
  // =========================================================================
  router.get('/content', requirePermission('content:view', 'content:edit'), (req, res) => {
    const db = getDb();
    const rows = db.prepare(`
      SELECT wc.*, u.full_name AS updated_by_name, a.full_name AS approved_by_name
      FROM website_content wc
      LEFT JOIN admin_users u ON u.id = wc.updated_by
      LEFT JOIN admin_users a ON a.id = wc.approved_by
      ORDER BY wc.id ASC
    `).all();
    return res.json({
      ok: true,
      sections: rows.map(r => ({
        ...r,
        published_payload: JSON.parse(r.published_payload || '{}'),
        draft_payload: JSON.parse(r.draft_payload || '{}')
      }))
    });
  });

  router.put('/content/:sectionKey', requirePermission('content:edit'), (req, res) => {
    const db = getDb();
    const key = sanitizePlainText(req.params.sectionKey, 64);
    const existing = db.prepare(`SELECT * FROM website_content WHERE section_key = ?`).get(key);
    if (!existing) return res.status(404).json({ ok: false, error: 'Website section not found.' });

    const action = sanitizePlainText((req.body && req.body.action) || 'save_draft', 32);
    const changeNote = sanitizePlainText(req.body && req.body.changeNote, 300);
    const cleanPayload = sanitizeStructuredPayload((req.body && req.body.payload) || {});
    const payloadJson = JSON.stringify(cleanPayload);

    const requireApproval = getBoolSetting(db, 'require_approval_content', false);
    const canPublishDirectly = req.permissions.has('content:publish') || req.user.role_slug === 'super_admin';

    let nextStatus = 'Draft';
    let nextPublished = existing.published_payload;
    let nextApprovedBy = existing.approved_by;
    let nextPublishedAt = existing.published_at;
    let nextVersion = existing.version_number + 1;

    if (action === 'submit_approval' || (action === 'publish' && requireApproval && !canPublishDirectly)) {
      nextStatus = 'Pending Approval';
    } else if (action === 'publish') {
      if (!canPublishDirectly) {
        return res.status(403).json({ ok: false, error: 'Publishing permission required. Submit for approval instead.' });
      }
      nextStatus = 'Published';
      nextPublished = payloadJson;
      nextApprovedBy = req.user.id;
      nextPublishedAt = new Date().toISOString();
    }

    recordRevision(db, {
      entityType: 'website_content',
      entityId: key,
      versionLabel: `v${existing.version_number}`,
      snapshot: JSON.parse(existing.draft_payload || '{}'),
      changeNote: changeNote || `Snapshot before update (${nextStatus})`,
      user: req.user
    });

    db.prepare(`
      UPDATE website_content
      SET draft_payload = ?, published_payload = ?, workflow_status = ?, version_number = ?,
          updated_by = ?, approved_by = ?, published_at = ?, updated_at = datetime('now')
      WHERE section_key = ?
    `).run(payloadJson, nextPublished, nextStatus, nextVersion, req.user.id, nextApprovedBy, nextPublishedAt, key);

    recordAudit(db, {
      req, user: req.user,
      action: nextStatus === 'Published' ? 'CONTENT_PUBLISHED' : (nextStatus === 'Pending Approval' ? 'CONTENT_SUBMITTED' : 'CONTENT_DRAFT_SAVED'),
      module: existing.module_group === 'homepage' ? 'Homepage Management' : 'General Content',
      targetId: key, targetLabel: existing.title,
      oldValue: JSON.parse(existing.draft_payload || '{}'),
      newValue: cleanPayload
    });

    return res.json({ ok: true, workflowStatus: nextStatus, versionNumber: nextVersion });
  });

  router.post('/content/:sectionKey/publish', requirePermission('content:publish'), (req, res) => {
    const db = getDb();
    const key = sanitizePlainText(req.params.sectionKey, 64);
    const existing = db.prepare(`SELECT * FROM website_content WHERE section_key = ?`).get(key);
    if (!existing) return res.status(404).json({ ok: false, error: 'Website section not found.' });

    db.prepare(`
      UPDATE website_content
      SET published_payload = draft_payload, workflow_status = 'Published',
          approved_by = ?, published_at = datetime('now'), updated_at = datetime('now')
      WHERE section_key = ?
    `).run(req.user.id, key);

    recordAudit(db, {
      req, user: req.user, action: 'CONTENT_APPROVED_PUBLISHED',
      module: 'General Content', targetId: key, targetLabel: existing.title
    });
    return res.json({ ok: true });
  });

  router.post('/content/:sectionKey/restore', requirePermission('content:edit'), (req, res) => {
    const db = getDb();
    const key = sanitizePlainText(req.params.sectionKey, 64);
    const revisionId = Number(req.body && req.body.revisionId);
    const rev = db.prepare(`SELECT * FROM content_revisions WHERE id = ? AND entity_type = 'website_content' AND entity_id = ?`).get(revisionId, key);
    if (!rev) return res.status(404).json({ ok: false, error: 'Revision not found.' });

    db.prepare(`
      UPDATE website_content
      SET draft_payload = ?, workflow_status = 'Draft', updated_by = ?, updated_at = datetime('now')
      WHERE section_key = ?
    `).run(rev.snapshot_json, req.user.id, key);

    recordAudit(db, {
      req, user: req.user, action: 'CONTENT_REVISION_RESTORED',
      module: 'General Content', targetId: key, targetLabel: `Restored ${rev.version_label}`
    });
    return res.json({ ok: true, payload: JSON.parse(rev.snapshot_json) });
  });

  // Upload Director / Secretary portrait photo (WebP-optimized & aspect-preserving)
  router.post(
    '/content/governance/photo',
    requirePermission('content:edit'),
    (req, res, next) => {
      uploadMemory.single('photo')(req, res, err => {
        if (err) return res.status(400).json({ ok: false, error: err.message || 'Photo upload failed.' });
        return next();
      });
    },
    async (req, res) => {
      const db = getDb();
      if (!req.file) {
        return res.status(400).json({ ok: false, error: 'Please select a JPG, PNG, or WebP portrait image.' });
      }
      try {
        const saved = await saveDirectorPhoto(req.file, 5 * 1024 * 1024, config.uploadDir);
        recordAudit(db, {
          req, user: req.user, action: 'DIRECTOR_PHOTO_UPLOADED',
          module: 'General Content', targetLabel: saved.originalFilename,
          newValue: { photoPath: saved.photoPath }
        });
        return res.status(201).json({ ok: true, photoUrl: saved.photoPath, width: saved.width, height: saved.height });
      } catch (err) {
        return res.status(400).json({ ok: false, error: err.message });
      }
    }
  );

  // =========================================================================
  // SANTHWANAM WELFARE SCHEME MANAGEMENT (Strict Sub-Rule Exclusion)
  // =========================================================================
  router.get('/santhwanam', requirePermission('content:view', 'santhwanam:manage'), (req, res) => {
    const db = getDb();
    const rows = db.prepare(`SELECT * FROM santhwanam_content ORDER BY id ASC`).all();
    return res.json({
      ok: true,
      sections: rows.map(r => ({
        ...r,
        published_payload: JSON.parse(r.published_payload || '{}'),
        draft_payload: JSON.parse(r.draft_payload || '{}')
      }))
    });
  });

  router.put('/santhwanam/:sectionKey', requirePermission('santhwanam:manage', 'content:edit'), (req, res) => {
    const db = getDb();
    const key = sanitizePlainText(req.params.sectionKey, 64);
    const existing = db.prepare(`SELECT * FROM santhwanam_content WHERE section_key = ?`).get(key);
    if (!existing) return res.status(404).json({ ok: false, error: 'Santhwanam section not found.' });

    const cleanPayload = sanitizeStructuredPayload((req.body && req.body.payload) || {});
    if (containsSanthwanamSubruleViolation(cleanPayload)) {
      return res.status(400).json({
        ok: false,
        error: 'POLICY RESTRICTION: Publishing or reproducing Santhwanam sub-rules is strictly prohibited by society policy.'
      });
    }

    const action = sanitizePlainText((req.body && req.body.action) || 'save_draft', 32);
    const canPublish = req.permissions.has('santhwanam:publish') || req.permissions.has('content:publish') || req.user.role_slug === 'super_admin';
    const payloadJson = JSON.stringify(cleanPayload);

    let nextStatus = 'Draft';
    let nextPublished = existing.published_payload;
    let nextApprovedBy = existing.approved_by;
    if (action === 'submit_approval') {
      nextStatus = 'Pending Approval';
    } else if (action === 'publish') {
      if (!canPublish) return res.status(403).json({ ok: false, error: 'Santhwanam publishing permission required.' });
      nextStatus = 'Published';
      nextPublished = payloadJson;
      nextApprovedBy = req.user.id;
    }

    recordRevision(db, {
      entityType: 'santhwanam_content',
      entityId: key,
      versionLabel: `v${existing.version_number}`,
      snapshot: JSON.parse(existing.draft_payload || '{}'),
      changeNote: `Updated (${nextStatus})`,
      user: req.user
    });

    db.prepare(`
      UPDATE santhwanam_content
      SET draft_payload = ?, published_payload = ?, workflow_status = ?, version_number = version_number + 1,
          updated_by = ?, approved_by = ?, updated_at = datetime('now')
      WHERE section_key = ?
    `).run(payloadJson, nextPublished, nextStatus, req.user.id, nextApprovedBy, key);

    recordAudit(db, {
      req, user: req.user,
      action: nextStatus === 'Published' ? 'SANTHWANAM_PUBLISHED' : 'SANTHWANAM_UPDATED',
      module: 'Santhwanam Management', targetId: key, targetLabel: existing.section_title,
      oldValue: JSON.parse(existing.draft_payload || '{}'),
      newValue: cleanPayload
    });

    return res.json({ ok: true, workflowStatus: nextStatus });
  });

  // =========================================================================
  // FAQ MANAGEMENT
  // =========================================================================
  router.get('/faqs', requirePermission('content:view', 'faqs:manage'), (req, res) => {
    const db = getDb();
    const faqs = db.prepare(`SELECT * FROM faqs ORDER BY category ASC, display_order ASC, id ASC`).all();
    return res.json({ ok: true, faqs });
  });

  router.post('/faqs', requirePermission('faqs:manage', 'content:edit'), (req, res) => {
    const db = getDb();
    const category = sanitizePlainText(req.body && req.body.category, 32) || 'general';
    const question = sanitizePlainText(req.body && req.body.question, 500);
    const answerHtml = sanitizeRichHtml(req.body && req.body.answerHtml, 10000);
    const displayOrder = Number(req.body && req.body.displayOrder) || 0;
    const requestedStatus = sanitizePlainText((req.body && req.body.workflowStatus) || 'Draft', 32);

    if (!question || !answerHtml) {
      return res.status(400).json({ ok: false, error: 'FAQ question and answer are required.' });
    }
    if (category === 'santhwanam' && (containsSanthwanamSubruleViolation(question) || containsSanthwanamSubruleViolation(answerHtml))) {
      return res.status(400).json({ ok: false, error: 'Santhwanam FAQs cannot reproduce sub-rules text.' });
    }

    const canPublish = req.permissions.has('faqs:publish') || req.permissions.has('content:publish') || req.user.role_slug === 'super_admin';
    const workflowStatus = requestedStatus === 'Published' && canPublish ? 'Published' : (requestedStatus === 'Pending Approval' ? 'Pending Approval' : 'Draft');

    const info = db.prepare(`
      INSERT INTO faqs (category, question, answer_html, display_order, workflow_status, created_by, updated_by, approved_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(category, question, answerHtml, displayOrder, workflowStatus, req.user.id, req.user.id, workflowStatus === 'Published' ? req.user.id : null);

    recordAudit(db, { req, user: req.user, action: 'FAQ_CREATED', module: 'FAQ Management', targetId: info.lastInsertRowid, targetLabel: question });
    return res.status(201).json({ ok: true, id: Number(info.lastInsertRowid), workflowStatus });
  });

  router.put('/faqs/:id', requirePermission('faqs:manage', 'content:edit'), (req, res) => {
    const db = getDb();
    const id = Number(req.params.id);
    const existing = db.prepare(`SELECT * FROM faqs WHERE id = ?`).get(id);
    if (!existing) return res.status(404).json({ ok: false, error: 'FAQ not found.' });

    const category = sanitizePlainText(req.body && req.body.category, 32) || existing.category;
    const question = sanitizePlainText(req.body && req.body.question, 500) || existing.question;
    const answerHtml = req.body && req.body.answerHtml !== undefined ? sanitizeRichHtml(req.body.answerHtml, 10000) : existing.answer_html;
    const displayOrder = req.body && req.body.displayOrder !== undefined ? Number(req.body.displayOrder) : existing.display_order;
    const requestedStatus = sanitizePlainText((req.body && req.body.workflowStatus) || existing.workflow_status, 32);

    if (category === 'santhwanam' && (containsSanthwanamSubruleViolation(question) || containsSanthwanamSubruleViolation(answerHtml))) {
      return res.status(400).json({ ok: false, error: 'Santhwanam FAQs cannot reproduce sub-rules text.' });
    }

    const canPublish = req.permissions.has('faqs:publish') || req.permissions.has('content:publish') || req.user.role_slug === 'super_admin';
    let workflowStatus = existing.workflow_status;
    if (['Draft', 'Pending Approval', 'Archived'].includes(requestedStatus)) {
      workflowStatus = requestedStatus;
    } else if (requestedStatus === 'Published') {
      if (!canPublish) return res.status(403).json({ ok: false, error: 'Publishing permission required for FAQs.' });
      workflowStatus = 'Published';
    }

    db.prepare(`
      UPDATE faqs
      SET category = ?, question = ?, answer_html = ?, display_order = ?, workflow_status = ?,
          updated_by = ?, approved_by = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(category, question, answerHtml, displayOrder, workflowStatus, req.user.id, workflowStatus === 'Published' ? req.user.id : existing.approved_by, id);

    recordAudit(db, { req, user: req.user, action: 'FAQ_UPDATED', module: 'FAQ Management', targetId: id, targetLabel: question, oldValue: { question: existing.question, status: existing.workflow_status }, newValue: { question, status: workflowStatus } });
    return res.json({ ok: true, workflowStatus });
  });

  router.delete('/faqs/:id', requirePermission('faqs:manage', 'content:edit'), (req, res) => {
    const db = getDb();
    const id = Number(req.params.id);
    const existing = db.prepare(`SELECT * FROM faqs WHERE id = ?`).get(id);
    if (!existing) return res.status(404).json({ ok: false, error: 'FAQ not found.' });
    db.prepare(`DELETE FROM faqs WHERE id = ?`).run(id);
    recordAudit(db, { req, user: req.user, action: 'FAQ_DELETED', module: 'FAQ Management', targetId: id, targetLabel: existing.question });
    return res.json({ ok: true });
  });

  return router;
}

module.exports = { createContentRouter };
