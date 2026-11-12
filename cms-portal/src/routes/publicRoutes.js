'use strict';

const express = require('express');
const { containsSanthwanamSubruleViolation } = require('../utils/sanitize');

function createPublicRouter({ getDb }) {
  const router = express.Router();

  // Read-only aggregated snapshot for progressive hydration of public site pages
  // Strictly returns ONLY Published & non-expired content — zero drafts, zero secrets.
  router.get('/site-data', (req, res) => {
    const db = getDb();
    const today = new Date().toISOString().slice(0, 10);

    const contentRows = db.prepare(`SELECT section_key, module_group, title, published_payload, published_at, updated_at FROM website_content`).all();
    const content = {};
    for (const r of contentRows) {
      content[r.section_key] = {
        title: r.title,
        updatedAt: r.published_at || r.updated_at,
        data: JSON.parse(r.published_payload || '{}')
      };
    }

    const deposits = db.prepare(`
      SELECT id, slug, product_name, category_label, interest_rate, rate_type, effective_from, effective_until,
             min_amount, tenure, eligibility, description, specs_json, form_slug, status, last_updated
      FROM deposit_products
      WHERE is_published = 1 AND status = 'Active' AND workflow_status != 'Archived'
      ORDER BY display_order ASC, id ASC
    `).all().map(d => ({ ...d, specs: JSON.parse(d.specs_json || '[]') }));

    const loans = db.prepare(`
      SELECT id, slug, product_name, category_label, interest_rate, rate_type, effective_from, effective_until,
             max_amount, tenure, repayment_mode, eligibility, required_documents, description, form_slug, status, last_updated
      FROM loan_products
      WHERE is_published = 1 AND status = 'Active' AND workflow_status != 'Archived'
      ORDER BY display_order ASC, id ASC
    `).all();

    const notices = db.prepare(`
      SELECT id, title, category, reference_number, summary, body_html, publish_date, expiry_date,
             attachment_path, attachment_name, attachment_size, is_featured, published_at
      FROM notices
      WHERE workflow_status = 'Published'
        AND publish_date <= ?
        AND (expiry_date IS NULL OR expiry_date = '' OR expiry_date >= ?)
      ORDER BY publish_date DESC, id DESC
    `).all(today, today);

    const gallery = db.prepare(`
      SELECT id, title, category, album_name, event_date, caption_summary, narration_html,
             image_path, thumbnail_path, width, height, audio_path, is_featured, display_order
      FROM gallery_images
      WHERE workflow_status = 'Published'
      ORDER BY display_order ASC, id DESC
    `).all();

    const documents = db.prepare(`
      SELECT id, slug, title, category, category_tag, form_code, version_number, description, tags,
             file_path, file_size, page_info, effective_date, is_santhwanam_locked, updated_at
      FROM documents
      WHERE workflow_status = 'Published'
      ORDER BY display_order ASC, id ASC
    `).all().filter(d => !containsSanthwanamSubruleViolation(d.title + ' ' + d.description));

    const faqs = db.prepare(`
      SELECT id, category, question, answer_html, display_order
      FROM faqs
      WHERE workflow_status = 'Published'
      ORDER BY category ASC, display_order ASC, id ASC
    `).all();

    const santhRows = db.prepare(`SELECT section_key, section_title, published_payload, updated_at FROM santhwanam_content`).all();
    const santhwanam = {};
    for (const s of santhRows) {
      const parsed = JSON.parse(s.published_payload || '{}');
      if (!containsSanthwanamSubruleViolation(parsed)) {
        santhwanam[s.section_key] = { title: s.section_title, updatedAt: s.updated_at, data: parsed };
      }
    }

    res.setHeader('Cache-Control', 'public, max-age=30');
    return res.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      content,
      deposits,
      loans,
      notices,
      gallery,
      documents,
      faqs,
      santhwanam
    });
  });

  router.get('/rates', (req, res) => {
    const db = getDb();
    const deposits = db.prepare(`
      SELECT slug, product_name, interest_rate, rate_type, effective_from, effective_until, last_updated
      FROM deposit_products WHERE is_published = 1 AND status = 'Active' AND workflow_status != 'Archived'
      ORDER BY display_order ASC
    `).all();
    const loans = db.prepare(`
      SELECT slug, product_name, interest_rate, rate_type, effective_from, effective_until, max_amount, tenure, repayment_mode, last_updated
      FROM loan_products WHERE is_published = 1 AND status = 'Active' AND workflow_status != 'Archived'
      ORDER BY display_order ASC
    `).all();
    return res.json({ ok: true, deposits, loans });
  });

  router.get('/notices', (req, res) => {
    const db = getDb();
    const today = new Date().toISOString().slice(0, 10);
    const notices = db.prepare(`
      SELECT id, title, category, reference_number, summary, body_html, publish_date, expiry_date, attachment_path, attachment_name, is_featured
      FROM notices
      WHERE workflow_status = 'Published' AND publish_date <= ? AND (expiry_date IS NULL OR expiry_date = '' OR expiry_date >= ?)
      ORDER BY publish_date DESC, id DESC
    `).all(today, today);
    return res.json({ ok: true, notices });
  });

  return router;
}

module.exports = { createPublicRouter };
