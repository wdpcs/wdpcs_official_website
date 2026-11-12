'use strict';

const express = require('express');
const fs = require('node:fs');
const {
  sanitizePlainText,
  sanitizeRichHtml,
  containsSanthwanamSubruleViolation
} = require('../utils/sanitize');
const { recordAudit } = require('../utils/audit');
const {
  uploadMemory,
  saveOptimizedGalleryImage,
  savePdfFile,
  saveAudioFile,
  resolveUploadDiskPath
} = require('../utils/upload');
const config = require('../config/env');

function runMulter(mw) {
  return (req, res, next) => {
    mw(req, res, err => {
      if (err) {
        return res.status(400).json({ ok: false, error: err.message || 'File upload failed.' });
      }
      return next();
    });
  };
}

function createMediaRouter({ getDb, requirePermission }) {
  const router = express.Router();

  // =========================================================================
  // NOTICES & CIRCULARS
  // =========================================================================
  router.get('/notices', requirePermission('content:view', 'notices:manage'), (req, res) => {
    const db = getDb();
    const notices = db.prepare(`SELECT * FROM notices ORDER BY publish_date DESC, id DESC`).all();
    return res.json({ ok: true, notices });
  });

  router.post('/notices', requirePermission('notices:manage', 'content:edit'), runMulter(uploadMemory.single('attachment')), (req, res) => {
    const db = getDb();
    const title = sanitizePlainText(req.body && req.body.title, 300);
    const category = sanitizePlainText((req.body && req.body.category) || 'general', 40);
    const refNo = sanitizePlainText(req.body && req.body.referenceNumber, 80);
    const summary = sanitizePlainText(req.body && req.body.summary, 1500);
    const bodyHtml = sanitizeRichHtml((req.body && req.body.bodyHtml) || `<p>${summary}</p>`, 15000);
    const publishDate = sanitizePlainText((req.body && req.body.publishDate) || new Date().toISOString().slice(0, 10), 32);
    const expiryDate = req.body && req.body.expiryDate ? sanitizePlainText(req.body.expiryDate, 32) : null;
    const isFeatured = req.body && (req.body.isFeatured === true || req.body.isFeatured === 'true' || req.body.isFeatured === '1') ? 1 : 0;
    const requestedStatus = sanitizePlainText((req.body && req.body.workflowStatus) || 'Draft', 32);

    if (!title) return res.status(400).json({ ok: false, error: 'Notice title is required.' });
    if (containsSanthwanamSubruleViolation(title + ' ' + summary + ' ' + bodyHtml)) {
      return res.status(400).json({ ok: false, error: 'Santhwanam sub-rules cannot be published.' });
    }

    let attachmentPath = null;
    let attachmentName = null;
    let attachmentSize = null;
    if (req.file) {
      try {
        const saved = savePdfFile(req.file, 'notices', config.uploadDir);
        attachmentPath = saved.filePath;
        attachmentName = saved.originalFilename;
        attachmentSize = saved.fileSize;
      } catch (err) {
        return res.status(400).json({ ok: false, error: err.message });
      }
    }

    const canPublish = req.permissions.has('notices:publish') || req.permissions.has('content:publish') || req.user.role_slug === 'super_admin';
    const workflowStatus = requestedStatus === 'Published' && canPublish
      ? 'Published'
      : (requestedStatus === 'Pending Approval' ? 'Pending Approval' : 'Draft');

    const info = db.prepare(`
      INSERT INTO notices
        (title, category, reference_number, summary, body_html, publish_date, expiry_date, attachment_path, attachment_name, attachment_size, is_featured, workflow_status, created_by, updated_by, approved_by, published_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      title, category, refNo, summary, bodyHtml, publishDate, expiryDate,
      attachmentPath, attachmentName, attachmentSize, isFeatured, workflowStatus,
      req.user.id, req.user.id,
      workflowStatus === 'Published' ? req.user.id : null,
      workflowStatus === 'Published' ? new Date().toISOString() : null
    );

    recordAudit(db, { req, user: req.user, action: 'NOTICE_CREATED', module: 'Notices & Circulars', targetId: info.lastInsertRowid, targetLabel: title, newValue: { category, workflowStatus } });
    return res.status(201).json({ ok: true, id: Number(info.lastInsertRowid), workflowStatus });
  });

  router.put('/notices/:id', requirePermission('notices:manage', 'content:edit'), runMulter(uploadMemory.single('attachment')), (req, res) => {
    const db = getDb();
    const id = Number(req.params.id);
    const existing = db.prepare(`SELECT * FROM notices WHERE id = ?`).get(id);
    if (!existing) return res.status(404).json({ ok: false, error: 'Notice not found.' });

    const title = sanitizePlainText(req.body && req.body.title, 300) || existing.title;
    const category = sanitizePlainText(req.body && req.body.category, 40) || existing.category;
    const refNo = req.body && req.body.referenceNumber !== undefined ? sanitizePlainText(req.body.referenceNumber, 80) : existing.reference_number;
    const summary = req.body && req.body.summary !== undefined ? sanitizePlainText(req.body.summary, 1500) : existing.summary;
    const bodyHtml = req.body && req.body.bodyHtml !== undefined ? sanitizeRichHtml(req.body.bodyHtml, 15000) : existing.body_html;
    const publishDate = sanitizePlainText(req.body && req.body.publishDate, 32) || existing.publish_date;
    const expiryDate = req.body && req.body.expiryDate !== undefined ? (sanitizePlainText(req.body.expiryDate, 32) || null) : existing.expiry_date;
    const isFeatured = req.body && req.body.isFeatured !== undefined
      ? ((req.body.isFeatured === true || req.body.isFeatured === 'true' || req.body.isFeatured === '1') ? 1 : 0)
      : existing.is_featured;
    const requestedStatus = sanitizePlainText((req.body && req.body.workflowStatus) || existing.workflow_status, 32);

    if (containsSanthwanamSubruleViolation(title + ' ' + summary + ' ' + bodyHtml)) {
      return res.status(400).json({ ok: false, error: 'Santhwanam sub-rules cannot be published.' });
    }

    let attachmentPath = existing.attachment_path;
    let attachmentName = existing.attachment_name;
    let attachmentSize = existing.attachment_size;
    if (req.file) {
      try {
        const saved = savePdfFile(req.file, 'notices', config.uploadDir);
        attachmentPath = saved.filePath;
        attachmentName = saved.originalFilename;
        attachmentSize = saved.fileSize;
      } catch (err) {
        return res.status(400).json({ ok: false, error: err.message });
      }
    }

    const canPublish = req.permissions.has('notices:publish') || req.permissions.has('content:publish') || req.user.role_slug === 'super_admin';
    let workflowStatus = existing.workflow_status;
    if (['Draft', 'Pending Approval', 'Archived'].includes(requestedStatus)) {
      workflowStatus = requestedStatus;
    } else if (requestedStatus === 'Published') {
      if (!canPublish) return res.status(403).json({ ok: false, error: 'Notice publishing permission required.' });
      workflowStatus = 'Published';
    }

    db.prepare(`
      UPDATE notices
      SET title = ?, category = ?, reference_number = ?, summary = ?, body_html = ?, publish_date = ?, expiry_date = ?,
          attachment_path = ?, attachment_name = ?, attachment_size = ?, is_featured = ?, workflow_status = ?,
          updated_by = ?, approved_by = ?, published_at = CASE WHEN ? = 'Published' AND published_at IS NULL THEN datetime('now') ELSE published_at END,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(
      title, category, refNo, summary, bodyHtml, publishDate, expiryDate,
      attachmentPath, attachmentName, attachmentSize, isFeatured, workflowStatus,
      req.user.id, workflowStatus === 'Published' ? req.user.id : existing.approved_by,
      workflowStatus, id
    );

    recordAudit(db, { req, user: req.user, action: 'NOTICE_UPDATED', module: 'Notices & Circulars', targetId: id, targetLabel: title, oldValue: { status: existing.workflow_status }, newValue: { status: workflowStatus } });
    return res.json({ ok: true, workflowStatus });
  });

  router.delete('/notices/:id', requirePermission('notices:manage', 'content:edit'), (req, res) => {
    const db = getDb();
    const id = Number(req.params.id);
    const existing = db.prepare(`SELECT * FROM notices WHERE id = ?`).get(id);
    if (!existing) return res.status(404).json({ ok: false, error: 'Notice not found.' });
    db.prepare(`DELETE FROM notices WHERE id = ?`).run(id);
    if (existing.attachment_path) {
      const p = resolveUploadDiskPath(existing.attachment_path, config.uploadDir);
      if (p && fs.existsSync(p)) fs.unlinkSync(p);
    }
    recordAudit(db, { req, user: req.user, action: 'NOTICE_DELETED', module: 'Notices & Circulars', targetId: id, targetLabel: existing.title });
    return res.json({ ok: true });
  });

  // =========================================================================
  // GALLERY MANAGEMENT (Multi-upload, WebP + Thumbs, Narration + Audio)
  // =========================================================================
  router.get('/gallery', requirePermission('content:view', 'gallery:manage'), (req, res) => {
    const db = getDb();
    const items = db.prepare(`SELECT * FROM gallery_images ORDER BY display_order ASC, id DESC`).all();
    return res.json({ ok: true, items });
  });

  router.post(
    '/gallery/upload',
    requirePermission('gallery:manage', 'content:edit'),
    runMulter(uploadMemory.fields([{ name: 'images', maxCount: 20 }, { name: 'audio', maxCount: 1 }])),
    async (req, res) => {
      const db = getDb();
      const imageFiles = (req.files && req.files.images) || [];
      if (imageFiles.length === 0) {
        return res.status(400).json({ ok: false, error: 'Please select at least one JPG, PNG, or WebP image to upload.' });
      }

      const category = sanitizePlainText((req.body && req.body.category) || 'events', 40);
      const albumName = sanitizePlainText((req.body && req.body.albumName) || 'Society Photo Archive', 160);
      const eventDate = sanitizePlainText((req.body && req.body.eventDate) || new Date().toISOString().slice(0, 10), 32);
      const baseTitle = sanitizePlainText(req.body && req.body.title, 250);
      const captionSummary = sanitizePlainText(req.body && req.body.captionSummary, 1000);
      const narrationHtml = sanitizeRichHtml((req.body && req.body.narrationHtml) || (captionSummary ? `<p>${captionSummary}</p>` : ''), 15000);
      const isFeatured = req.body && (req.body.isFeatured === true || req.body.isFeatured === 'true' || req.body.isFeatured === '1') ? 1 : 0;
      const requestedStatus = sanitizePlainText((req.body && req.body.workflowStatus) || 'Draft', 32);
      const canPublish = req.permissions.has('gallery:publish') || req.permissions.has('content:publish') || req.user.role_slug === 'super_admin';
      const workflowStatus = requestedStatus === 'Published' && canPublish
        ? 'Published'
        : (requestedStatus === 'Pending Approval' ? 'Pending Approval' : 'Draft');

      let savedAudio = null;
      const audioFiles = (req.files && req.files.audio) || [];
      if (audioFiles[0]) {
        try {
          savedAudio = saveAudioFile(audioFiles[0], config.uploadDir);
        } catch (err) {
          return res.status(400).json({ ok: false, error: err.message });
        }
      }

      let maxOrder = (db.prepare(`SELECT MAX(display_order) AS m FROM gallery_images`).get().m) || 0;
      const createdIds = [];
      const createdItems = [];

      try {
        for (let i = 0; i < imageFiles.length; i++) {
          const img = imageFiles[i];
          const processed = await saveOptimizedGalleryImage(img, 10 * 1024 * 1024, config.uploadDir);
          const itemTitle = baseTitle
            ? (imageFiles.length > 1 ? `${baseTitle} (${i + 1})` : baseTitle)
            : sanitizePlainText(processed.originalFilename.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '), 200);
          maxOrder += 1;

          const info = db.prepare(`
            INSERT INTO gallery_images
              (title, category, album_name, event_date, caption_summary, narration_html, image_path, thumbnail_path, original_filename, width, height, file_size, audio_path, audio_filename, is_featured, display_order, workflow_status, created_by, updated_by, approved_by, published_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            itemTitle, category, albumName, eventDate, captionSummary, narrationHtml,
            processed.imagePath, processed.thumbnailPath, processed.originalFilename,
            processed.width, processed.height, processed.fileSize,
            savedAudio ? savedAudio.audioPath : null,
            savedAudio ? savedAudio.originalFilename : null,
            isFeatured, maxOrder, workflowStatus,
            req.user.id, req.user.id,
            workflowStatus === 'Published' ? req.user.id : null,
            workflowStatus === 'Published' ? new Date().toISOString() : null
          );
          const id = Number(info.lastInsertRowid);
          createdIds.push(id);
          createdItems.push({ id, title: itemTitle, imagePath: processed.imagePath, thumbnailPath: processed.thumbnailPath });
        }
      } catch (err) {
        return res.status(400).json({ ok: false, error: err.message });
      }

      recordAudit(db, {
        req, user: req.user, action: 'GALLERY_IMAGES_UPLOADED', module: 'Gallery Management',
        targetId: createdIds.join(','), targetLabel: `${createdIds.length} image(s) in ${category}`,
        newValue: { count: createdIds.length, workflowStatus, hasAudio: Boolean(savedAudio) }
      });

      return res.status(201).json({ ok: true, count: createdIds.length, items: createdItems, workflowStatus });
    }
  );

  router.put(
    '/gallery/:id',
    requirePermission('gallery:manage', 'content:edit'),
    runMulter(uploadMemory.fields([{ name: 'image', maxCount: 1 }, { name: 'audio', maxCount: 1 }])),
    async (req, res) => {
      const db = getDb();
      const id = Number(req.params.id);
      const existing = db.prepare(`SELECT * FROM gallery_images WHERE id = ?`).get(id);
      if (!existing) return res.status(404).json({ ok: false, error: 'Gallery item not found.' });

      const title = sanitizePlainText(req.body && req.body.title, 250) || existing.title;
      const category = sanitizePlainText(req.body && req.body.category, 40) || existing.category;
      const albumName = req.body && req.body.albumName !== undefined ? sanitizePlainText(req.body.albumName, 160) : existing.album_name;
      const eventDate = req.body && req.body.eventDate !== undefined ? sanitizePlainText(req.body.eventDate, 32) : existing.event_date;
      const captionSummary = req.body && req.body.captionSummary !== undefined ? sanitizePlainText(req.body.captionSummary, 1000) : existing.caption_summary;
      const narrationHtml = req.body && req.body.narrationHtml !== undefined ? sanitizeRichHtml(req.body.narrationHtml, 15000) : existing.narration_html;
      const displayOrder = req.body && req.body.displayOrder !== undefined ? Number(req.body.displayOrder) : existing.display_order;
      const isFeatured = req.body && req.body.isFeatured !== undefined
        ? ((req.body.isFeatured === true || req.body.isFeatured === 'true' || req.body.isFeatured === '1') ? 1 : 0)
        : existing.is_featured;
      const requestedStatus = sanitizePlainText((req.body && req.body.workflowStatus) || existing.workflow_status, 32);

      let imagePath = existing.image_path;
      let thumbnailPath = existing.thumbnail_path;
      let width = existing.width;
      let height = existing.height;
      let fileSize = existing.file_size;
      let originalFilename = existing.original_filename;

      const newImg = req.files && req.files.image && req.files.image[0];
      if (newImg) {
        try {
          const processed = await saveOptimizedGalleryImage(newImg, 10 * 1024 * 1024, config.uploadDir);
          imagePath = processed.imagePath;
          thumbnailPath = processed.thumbnailPath;
          width = processed.width;
          height = processed.height;
          fileSize = processed.fileSize;
          originalFilename = processed.originalFilename;
        } catch (err) {
          return res.status(400).json({ ok: false, error: err.message });
        }
      }

      let audioPath = existing.audio_path;
      let audioFilename = existing.audio_filename;
      if (req.body && (req.body.removeAudio === 'true' || req.body.removeAudio === true)) {
        audioPath = null;
        audioFilename = null;
      }
      const newAudio = req.files && req.files.audio && req.files.audio[0];
      if (newAudio) {
        try {
          const savedA = saveAudioFile(newAudio, config.uploadDir);
          audioPath = savedA.audioPath;
          audioFilename = savedA.originalFilename;
        } catch (err) {
          return res.status(400).json({ ok: false, error: err.message });
        }
      }

      const canPublish = req.permissions.has('gallery:publish') || req.permissions.has('content:publish') || req.user.role_slug === 'super_admin';
      let workflowStatus = existing.workflow_status;
      if (['Draft', 'Pending Approval', 'Archived'].includes(requestedStatus)) {
        workflowStatus = requestedStatus;
      } else if (requestedStatus === 'Published') {
        if (!canPublish) return res.status(403).json({ ok: false, error: 'Gallery publishing permission required.' });
        workflowStatus = 'Published';
      }

      db.prepare(`
        UPDATE gallery_images
        SET title = ?, category = ?, album_name = ?, event_date = ?, caption_summary = ?, narration_html = ?,
            image_path = ?, thumbnail_path = ?, original_filename = ?, width = ?, height = ?, file_size = ?,
            audio_path = ?, audio_filename = ?, is_featured = ?, display_order = ?, workflow_status = ?,
            updated_by = ?, approved_by = ?, published_at = CASE WHEN ? = 'Published' AND published_at IS NULL THEN datetime('now') ELSE published_at END,
            updated_at = datetime('now')
        WHERE id = ?
      `).run(
        title, category, albumName, eventDate, captionSummary, narrationHtml,
        imagePath, thumbnailPath, originalFilename, width, height, fileSize,
        audioPath, audioFilename, isFeatured, displayOrder, workflowStatus,
        req.user.id, workflowStatus === 'Published' ? req.user.id : existing.approved_by, workflowStatus, id
      );

      recordAudit(db, { req, user: req.user, action: 'GALLERY_ITEM_UPDATED', module: 'Gallery Management', targetId: id, targetLabel: title, oldValue: { status: existing.workflow_status }, newValue: { status: workflowStatus } });
      return res.json({ ok: true, workflowStatus });
    }
  );

  router.post('/gallery/reorder', requirePermission('gallery:manage', 'content:edit'), (req, res) => {
    const db = getDb();
    const orderList = Array.isArray(req.body && req.body.order) ? req.body.order : [];
    const stmt = db.prepare(`UPDATE gallery_images SET display_order = ?, updated_by = ? WHERE id = ?`);
    for (const entry of orderList) {
      if (entry && Number.isInteger(Number(entry.id))) {
        stmt.run(Number(entry.displayOrder) || 0, req.user.id, Number(entry.id));
      }
    }
    recordAudit(db, { req, user: req.user, action: 'GALLERY_REORDERED', module: 'Gallery Management', targetLabel: `${orderList.length} items` });
    return res.json({ ok: true });
  });

  router.delete('/gallery/:id', requirePermission('gallery:manage', 'content:edit'), (req, res) => {
    const db = getDb();
    const id = Number(req.params.id);
    const existing = db.prepare(`SELECT * FROM gallery_images WHERE id = ?`).get(id);
    if (!existing) return res.status(404).json({ ok: false, error: 'Gallery item not found.' });
    db.prepare(`DELETE FROM gallery_images WHERE id = ?`).run(id);
    for (const relUrl of [existing.image_path, existing.thumbnail_path, existing.audio_path]) {
      if (relUrl) {
        const diskPath = resolveUploadDiskPath(relUrl, config.uploadDir);
        if (diskPath && fs.existsSync(diskPath)) fs.unlinkSync(diskPath);
      }
    }
    recordAudit(db, { req, user: req.user, action: 'GALLERY_ITEM_DELETED', module: 'Gallery Management', targetId: id, targetLabel: existing.title });
    return res.json({ ok: true });
  });

  // =========================================================================
  // DOWNLOADS & APPLICATION FORMS (Versioned PDFs + Santhwanam Guardrail)
  // =========================================================================
  router.get('/downloads', requirePermission('content:view', 'downloads:manage'), (req, res) => {
    const db = getDb();
    const documents = db.prepare(`SELECT * FROM documents ORDER BY display_order ASC, id ASC`).all();
    const versions = db.prepare(`SELECT dv.*, u.full_name AS uploaded_by_name FROM document_versions dv LEFT JOIN admin_users u ON u.id = dv.uploaded_by ORDER BY dv.id DESC`).all();
    const versionsByDoc = new Map();
    for (const v of versions) {
      if (!versionsByDoc.has(v.document_id)) versionsByDoc.set(v.document_id, []);
      versionsByDoc.get(v.document_id).push(v);
    }
    return res.json({
      ok: true,
      documents: documents.map(d => ({ ...d, versions: versionsByDoc.get(d.id) || [] }))
    });
  });

  router.post('/downloads', requirePermission('downloads:manage', 'content:edit'), runMulter(uploadMemory.single('file')), (req, res) => {
    const db = getDb();
    const title = sanitizePlainText(req.body && req.body.title, 250);
    const category = sanitizePlainText((req.body && req.body.category) || 'other', 40);
    const categoryTag = sanitizePlainText((req.body && req.body.categoryTag) || 'Official Form', 100);
    const formCode = sanitizePlainText(req.body && req.body.formCode, 64);
    const versionNumber = sanitizePlainText((req.body && req.body.versionNumber) || '1.0', 24);
    const description = sanitizePlainText(req.body && req.body.description, 1000);
    const tags = sanitizePlainText(req.body && req.body.tags, 400);
    const pageInfo = sanitizePlainText((req.body && req.body.pageInfo) || 'PDF', 80);
    const effectiveDate = sanitizePlainText((req.body && req.body.effectiveDate) || new Date().toISOString().slice(0, 10), 32);
    const requestedStatus = sanitizePlainText((req.body && req.body.workflowStatus) || 'Draft', 32);

    if (!title || !req.file) {
      return res.status(400).json({ ok: false, error: 'Document title and a valid PDF file are required.' });
    }
    if (category === 'santhwanam') {
      return res.status(400).json({
        ok: false,
        error: 'POLICY RESTRICTION: Welfare Scheme – Santhwanam permits only the two approved forms. You can update/replace those existing entries directly.'
      });
    }
    if (containsSanthwanamSubruleViolation(title + ' ' + description + ' ' + req.file.originalname + ' ' + tags)) {
      return res.status(400).json({ ok: false, error: 'POLICY RESTRICTION: Santhwanam sub-rule documents cannot be uploaded or published.' });
    }

    let savedPdf;
    try {
      savedPdf = savePdfFile(req.file, 'documents', config.uploadDir);
    } catch (err) {
      return res.status(400).json({ ok: false, error: err.message });
    }

    const baseSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'form';
    const slug = `${baseSlug}-${Date.now().toString(36)}`;
    const maxOrder = (db.prepare(`SELECT MAX(display_order) AS m FROM documents`).get().m) || 0;
    const canPublish = req.permissions.has('downloads:publish') || req.permissions.has('content:publish') || req.user.role_slug === 'super_admin';
    const workflowStatus = requestedStatus === 'Published' && canPublish ? 'Published' : (requestedStatus === 'Pending Approval' ? 'Pending Approval' : 'Draft');

    const info = db.prepare(`
      INSERT INTO documents
        (slug, title, category, category_tag, form_code, version_number, description, tags, file_path, original_filename, file_size, page_info, effective_date, is_santhwanam_locked, display_order, workflow_status, updated_by, approved_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
    `).run(
      slug, title, category, categoryTag, formCode, versionNumber, description, tags,
      savedPdf.filePath, savedPdf.originalFilename, savedPdf.fileSize, pageInfo, effectiveDate,
      maxOrder + 1, workflowStatus, req.user.id, workflowStatus === 'Published' ? req.user.id : null
    );

    recordAudit(db, { req, user: req.user, action: 'DOCUMENT_CREATED', module: 'Downloads & Forms', targetId: info.lastInsertRowid, targetLabel: title, newValue: { category, versionNumber, workflowStatus } });
    return res.status(201).json({ ok: true, id: Number(info.lastInsertRowid), slug, workflowStatus });
  });

  router.put('/downloads/:id', requirePermission('downloads:manage', 'content:edit'), runMulter(uploadMemory.single('file')), (req, res) => {
    const db = getDb();
    const id = Number(req.params.id);
    const existing = db.prepare(`SELECT * FROM documents WHERE id = ?`).get(id);
    if (!existing) return res.status(404).json({ ok: false, error: 'Document not found.' });

    const title = sanitizePlainText(req.body && req.body.title, 250) || existing.title;
    const category = existing.is_santhwanam_locked ? existing.category : (sanitizePlainText(req.body && req.body.category, 40) || existing.category);
    const categoryTag = sanitizePlainText(req.body && req.body.categoryTag, 100) || existing.category_tag;
    const formCode = req.body && req.body.formCode !== undefined ? sanitizePlainText(req.body.formCode, 64) : existing.form_code;
    const description = req.body && req.body.description !== undefined ? sanitizePlainText(req.body.description, 1000) : existing.description;
    const tags = req.body && req.body.tags !== undefined ? sanitizePlainText(req.body.tags, 400) : existing.tags;
    const pageInfo = sanitizePlainText(req.body && req.body.pageInfo, 80) || existing.page_info;
    const effectiveDate = sanitizePlainText(req.body && req.body.effectiveDate, 32) || existing.effective_date;
    const changeNote = sanitizePlainText(req.body && req.body.changeNote, 300);
    const requestedStatus = sanitizePlainText((req.body && req.body.workflowStatus) || existing.workflow_status, 32);

    if (containsSanthwanamSubruleViolation(title + ' ' + description + ' ' + tags + ' ' + (req.file ? req.file.originalname : ''))) {
      return res.status(400).json({ ok: false, error: 'POLICY RESTRICTION: Santhwanam sub-rules are strictly forbidden.' });
    }

    let filePath = existing.file_path;
    let originalFilename = existing.original_filename;
    let fileSize = existing.file_size;
    let versionNumber = sanitizePlainText(req.body && req.body.versionNumber, 24) || existing.version_number;

    if (req.file) {
      let savedPdf;
      try {
        savedPdf = savePdfFile(req.file, 'documents', config.uploadDir);
      } catch (err) {
        return res.status(400).json({ ok: false, error: err.message });
      }
      // Archive previous file version cleanly in document_versions
      db.prepare(`
        INSERT INTO document_versions (document_id, version_number, file_path, original_filename, file_size, change_note, uploaded_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, existing.version_number, existing.file_path, existing.original_filename, existing.file_size, changeNote || 'Replaced by newer PDF upload', req.user.id);

      filePath = savedPdf.filePath;
      originalFilename = savedPdf.originalFilename;
      fileSize = savedPdf.fileSize;
      if (versionNumber === existing.version_number) {
        const numeric = Number.parseFloat(existing.version_number);
        versionNumber = Number.isFinite(numeric) ? (numeric + 0.1).toFixed(1) : `${existing.version_number}.1`;
      }
    }

    const canPublish = req.permissions.has('downloads:publish') || req.permissions.has('content:publish') || req.user.role_slug === 'super_admin';
    let workflowStatus = existing.workflow_status;
    if (['Draft', 'Pending Approval', 'Archived'].includes(requestedStatus)) {
      if (existing.is_santhwanam_locked && requestedStatus === 'Archived') {
        return res.status(400).json({ ok: false, error: 'Approved Santhwanam forms cannot be archived away; replace the PDF instead.' });
      }
      workflowStatus = requestedStatus;
    } else if (requestedStatus === 'Published') {
      if (!canPublish) return res.status(403).json({ ok: false, error: 'Downloads publishing permission required.' });
      workflowStatus = 'Published';
    }

    db.prepare(`
      UPDATE documents
      SET title = ?, category = ?, category_tag = ?, form_code = ?, version_number = ?, description = ?, tags = ?,
          file_path = ?, original_filename = ?, file_size = ?, page_info = ?, effective_date = ?, workflow_status = ?,
          updated_by = ?, approved_by = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      title, category, categoryTag, formCode, versionNumber, description, tags,
      filePath, originalFilename, fileSize, pageInfo, effectiveDate, workflowStatus,
      req.user.id, workflowStatus === 'Published' ? req.user.id : existing.approved_by, id
    );

    recordAudit(db, {
      req, user: req.user, action: req.file ? 'DOCUMENT_VERSION_REPLACED' : 'DOCUMENT_UPDATED',
      module: 'Downloads & Forms', targetId: id, targetLabel: title,
      oldValue: { version: existing.version_number, file: existing.file_path },
      newValue: { version: versionNumber, file: filePath, workflowStatus }
    });
    return res.json({ ok: true, versionNumber, workflowStatus, filePath });
  });

  router.delete('/downloads/:id', requirePermission('downloads:manage', 'content:edit'), (req, res) => {
    const db = getDb();
    const id = Number(req.params.id);
    const existing = db.prepare(`SELECT * FROM documents WHERE id = ?`).get(id);
    if (!existing) return res.status(404).json({ ok: false, error: 'Document not found.' });
    if (existing.is_santhwanam_locked) {
      return res.status(400).json({ ok: false, error: 'POLICY RESTRICTION: Core Santhwanam forms cannot be deleted; replace the PDF instead.' });
    }
    db.prepare(`DELETE FROM documents WHERE id = ?`).run(id);
    recordAudit(db, { req, user: req.user, action: 'DOCUMENT_DELETED', module: 'Downloads & Forms', targetId: id, targetLabel: existing.title });
    return res.json({ ok: true });
  });

  return router;
}

module.exports = { createMediaRouter };
