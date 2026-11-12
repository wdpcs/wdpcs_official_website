'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const config = require('../config/env');

let dbInstance = null;

function createDatabase(dbFilePath = config.dbPath) {
  fs.mkdirSync(path.dirname(dbFilePath), { recursive: true });
  const db = new DatabaseSync(dbFilePath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');
  initSchema(db);
  return db;
}

function getDb() {
  if (!dbInstance) {
    dbInstance = createDatabase(config.dbPath);
  }
  return dbInstance;
}

function closeDb() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

function initSchema(db) {
  db.exec(`
    -- 1. Roles & Permissions
    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      is_system INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      module TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS role_permissions (
      role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
      PRIMARY KEY (role_id, permission_id)
    );

    -- 2. Admin Users, Sessions & Password Resets
    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      full_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role_id INTEGER NOT NULL REFERENCES roles(id),
      is_active INTEGER NOT NULL DEFAULT 1,
      mfa_enabled INTEGER NOT NULL DEFAULT 0,
      mfa_secret TEXT DEFAULT NULL,
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT DEFAULT NULL,
      last_login_at TEXT DEFAULT NULL,
      last_login_ip TEXT DEFAULT NULL,
      password_changed_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_hash TEXT NOT NULL UNIQUE,
      csrf_token TEXT NOT NULL,
      user_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
      mfa_verified INTEGER NOT NULL DEFAULT 1,
      ip_address TEXT NOT NULL DEFAULT '',
      user_agent TEXT NOT NULL DEFAULT '',
      expires_at TEXT NOT NULL,
      last_activity_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

    CREATE TABLE IF NOT EXISTS password_resets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used_at TEXT DEFAULT NULL,
      requested_ip TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 3. Website Content (General Content & Homepage Blocks)
    CREATE TABLE IF NOT EXISTS website_content (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      section_key TEXT NOT NULL UNIQUE,
      module_group TEXT NOT NULL, -- 'general' | 'homepage' | 'contact' | 'governance'
      title TEXT NOT NULL,
      published_payload TEXT NOT NULL DEFAULT '{}',
      draft_payload TEXT NOT NULL DEFAULT '{}',
      workflow_status TEXT NOT NULL DEFAULT 'Published' CHECK (workflow_status IN ('Draft', 'Pending Approval', 'Published', 'Archived')),
      version_number INTEGER NOT NULL DEFAULT 1,
      updated_by INTEGER REFERENCES admin_users(id),
      approved_by INTEGER REFERENCES admin_users(id),
      published_at TEXT DEFAULT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 4. Deposit Products
    CREATE TABLE IF NOT EXISTS deposit_products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      product_name TEXT NOT NULL,
      category_label TEXT NOT NULL DEFAULT 'Deposit Account',
      interest_rate TEXT NOT NULL,
      rate_type TEXT NOT NULL DEFAULT 'Annual (p.a.)',
      effective_from TEXT NOT NULL,
      effective_until TEXT DEFAULT NULL,
      min_amount TEXT NOT NULL DEFAULT '',
      tenure TEXT NOT NULL DEFAULT '',
      eligibility TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      specs_json TEXT NOT NULL DEFAULT '[]',
      form_slug TEXT DEFAULT NULL,
      status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
      is_published INTEGER NOT NULL DEFAULT 1,
      workflow_status TEXT NOT NULL DEFAULT 'Published' CHECK (workflow_status IN ('Draft', 'Pending Approval', 'Published', 'Archived')),
      draft_payload TEXT DEFAULT NULL,
      display_order INTEGER NOT NULL DEFAULT 0,
      last_updated TEXT NOT NULL DEFAULT (datetime('now')),
      updated_by INTEGER REFERENCES admin_users(id),
      approved_by INTEGER REFERENCES admin_users(id)
    );

    -- 5. Loan Products
    CREATE TABLE IF NOT EXISTS loan_products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      product_name TEXT NOT NULL,
      category_label TEXT NOT NULL DEFAULT 'Loan Product',
      interest_rate TEXT NOT NULL,
      rate_type TEXT NOT NULL DEFAULT 'Annual (p.a.)',
      effective_from TEXT NOT NULL,
      effective_until TEXT DEFAULT NULL,
      max_amount TEXT NOT NULL DEFAULT '',
      tenure TEXT NOT NULL DEFAULT '',
      repayment_mode TEXT NOT NULL DEFAULT 'Non-EMI',
      eligibility TEXT NOT NULL DEFAULT '',
      required_documents TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      form_slug TEXT DEFAULT NULL,
      status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
      is_published INTEGER NOT NULL DEFAULT 1,
      workflow_status TEXT NOT NULL DEFAULT 'Published' CHECK (workflow_status IN ('Draft', 'Pending Approval', 'Published', 'Archived')),
      draft_payload TEXT DEFAULT NULL,
      display_order INTEGER NOT NULL DEFAULT 0,
      last_updated TEXT NOT NULL DEFAULT (datetime('now')),
      updated_by INTEGER REFERENCES admin_users(id),
      approved_by INTEGER REFERENCES admin_users(id)
    );

    -- 6. Interest Rate History (historical rows never overwritten)
    CREATE TABLE IF NOT EXISTS interest_rate_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_type TEXT NOT NULL CHECK (product_type IN ('deposit', 'loan')),
      product_id INTEGER NOT NULL,
      product_name TEXT NOT NULL,
      previous_rate TEXT NOT NULL,
      new_rate TEXT NOT NULL,
      rate_type TEXT NOT NULL DEFAULT 'Annual (p.a.)',
      effective_from TEXT NOT NULL,
      effective_until TEXT DEFAULT NULL,
      change_reason TEXT NOT NULL DEFAULT '',
      approval_status TEXT NOT NULL DEFAULT 'Approved' CHECK (approval_status IN ('Pending', 'Approved', 'Rejected')),
      changed_by INTEGER REFERENCES admin_users(id),
      changed_by_name TEXT NOT NULL DEFAULT '',
      approved_by INTEGER REFERENCES admin_users(id),
      approved_by_name TEXT DEFAULT NULL,
      changed_at TEXT NOT NULL DEFAULT (datetime('now')),
      approved_at TEXT DEFAULT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_rate_hist_product ON interest_rate_history(product_type, product_id);

    -- Prevent overwriting historical Approved interest rate records
    CREATE TRIGGER IF NOT EXISTS prevent_approved_rate_history_update
    BEFORE UPDATE ON interest_rate_history
    WHEN OLD.approval_status = 'Approved'
    BEGIN
      SELECT RAISE(ABORT, 'Approved interest rate history records cannot be overwritten');
    END;

    CREATE TRIGGER IF NOT EXISTS prevent_rate_history_delete
    BEFORE DELETE ON interest_rate_history
    BEGIN
      SELECT RAISE(ABORT, 'Interest rate history records cannot be deleted');
    END;

    -- 7. Notices & Circulars
    CREATE TABLE IF NOT EXISTS notices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      reference_number TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT '',
      body_html TEXT NOT NULL DEFAULT '',
      publish_date TEXT NOT NULL,
      expiry_date TEXT DEFAULT NULL,
      attachment_path TEXT DEFAULT NULL,
      attachment_name TEXT DEFAULT NULL,
      attachment_size INTEGER DEFAULT NULL,
      is_featured INTEGER NOT NULL DEFAULT 0,
      workflow_status TEXT NOT NULL DEFAULT 'Draft' CHECK (workflow_status IN ('Draft', 'Pending Approval', 'Published', 'Archived')),
      draft_payload TEXT DEFAULT NULL,
      created_by INTEGER REFERENCES admin_users(id),
      updated_by INTEGER REFERENCES admin_users(id),
      approved_by INTEGER REFERENCES admin_users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      published_at TEXT DEFAULT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_notices_status_date ON notices(workflow_status, publish_date DESC);

    -- 8. Gallery Images (with rich narration + optional audio narration)
    CREATE TABLE IF NOT EXISTS gallery_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      album_name TEXT NOT NULL DEFAULT 'Institutional Archives',
      event_date TEXT NOT NULL DEFAULT '',
      caption_summary TEXT NOT NULL DEFAULT '',
      narration_html TEXT NOT NULL DEFAULT '',
      image_path TEXT NOT NULL,
      thumbnail_path TEXT NOT NULL,
      original_filename TEXT NOT NULL DEFAULT '',
      width INTEGER DEFAULT NULL,
      height INTEGER DEFAULT NULL,
      file_size INTEGER DEFAULT NULL,
      audio_path TEXT DEFAULT NULL,
      audio_filename TEXT DEFAULT NULL,
      is_featured INTEGER NOT NULL DEFAULT 0,
      display_order INTEGER NOT NULL DEFAULT 0,
      workflow_status TEXT NOT NULL DEFAULT 'Draft' CHECK (workflow_status IN ('Draft', 'Pending Approval', 'Published', 'Archived')),
      draft_payload TEXT DEFAULT NULL,
      created_by INTEGER REFERENCES admin_users(id),
      updated_by INTEGER REFERENCES admin_users(id),
      approved_by INTEGER REFERENCES admin_users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      published_at TEXT DEFAULT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_gallery_status_order ON gallery_images(workflow_status, display_order ASC, id DESC);

    -- 9. Downloadable Documents & Version History
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      category_tag TEXT NOT NULL DEFAULT '',
      form_code TEXT NOT NULL DEFAULT '',
      version_number TEXT NOT NULL DEFAULT '1.0',
      description TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '',
      file_path TEXT NOT NULL,
      original_filename TEXT NOT NULL DEFAULT '',
      file_size INTEGER NOT NULL DEFAULT 0,
      page_info TEXT NOT NULL DEFAULT 'PDF',
      effective_date TEXT NOT NULL DEFAULT (date('now')),
      is_santhwanam_locked INTEGER NOT NULL DEFAULT 0,
      display_order INTEGER NOT NULL DEFAULT 0,
      workflow_status TEXT NOT NULL DEFAULT 'Published' CHECK (workflow_status IN ('Draft', 'Pending Approval', 'Published', 'Archived')),
      draft_payload TEXT DEFAULT NULL,
      updated_by INTEGER REFERENCES admin_users(id),
      approved_by INTEGER REFERENCES admin_users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS document_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      version_number TEXT NOT NULL,
      file_path TEXT NOT NULL,
      original_filename TEXT NOT NULL,
      file_size INTEGER NOT NULL DEFAULT 0,
      change_note TEXT NOT NULL DEFAULT '',
      uploaded_by INTEGER REFERENCES admin_users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 10. FAQs
    CREATE TABLE IF NOT EXISTS faqs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      question TEXT NOT NULL,
      answer_html TEXT NOT NULL,
      display_order INTEGER NOT NULL DEFAULT 0,
      workflow_status TEXT NOT NULL DEFAULT 'Published' CHECK (workflow_status IN ('Draft', 'Pending Approval', 'Published', 'Archived')),
      draft_payload TEXT DEFAULT NULL,
      created_by INTEGER REFERENCES admin_users(id),
      updated_by INTEGER REFERENCES admin_users(id),
      approved_by INTEGER REFERENCES admin_users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 11. Santhwanam Welfare Scheme Content (strictly excludes sub-rules)
    CREATE TABLE IF NOT EXISTS santhwanam_content (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      section_key TEXT NOT NULL UNIQUE,
      section_title TEXT NOT NULL,
      published_payload TEXT NOT NULL DEFAULT '{}',
      draft_payload TEXT NOT NULL DEFAULT '{}',
      workflow_status TEXT NOT NULL DEFAULT 'Published' CHECK (workflow_status IN ('Draft', 'Pending Approval', 'Published', 'Archived')),
      version_number INTEGER NOT NULL DEFAULT 1,
      updated_by INTEGER REFERENCES admin_users(id),
      approved_by INTEGER REFERENCES admin_users(id),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 12. Revision History across entities
    CREATE TABLE IF NOT EXISTS content_revisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      version_label TEXT NOT NULL,
      snapshot_json TEXT NOT NULL,
      change_note TEXT NOT NULL DEFAULT '',
      created_by INTEGER REFERENCES admin_users(id),
      created_by_name TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_revisions_entity ON content_revisions(entity_type, entity_id, id DESC);

    -- 13. Immutable Audit Logs
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
      username TEXT NOT NULL DEFAULT 'system',
      role_name TEXT NOT NULL DEFAULT 'system',
      action TEXT NOT NULL,
      module TEXT NOT NULL,
      target_id TEXT NOT NULL DEFAULT '',
      target_label TEXT NOT NULL DEFAULT '',
      old_value TEXT DEFAULT NULL,
      new_value TEXT DEFAULT NULL,
      ip_address TEXT NOT NULL DEFAULT '',
      user_agent TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_module ON audit_logs(module);
    CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);

    CREATE TRIGGER IF NOT EXISTS prevent_audit_update
    BEFORE UPDATE ON audit_logs
    BEGIN
      SELECT RAISE(ABORT, 'Audit logs are immutable and cannot be modified');
    END;

    CREATE TRIGGER IF NOT EXISTS prevent_audit_delete
    BEFORE DELETE ON audit_logs
    BEGIN
      SELECT RAISE(ABORT, 'Audit logs are immutable and cannot be deleted');
    END;

    -- 14. System Settings
    CREATE TABLE IF NOT EXISTS system_settings (
      setting_key TEXT PRIMARY KEY,
      setting_value TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      updated_by INTEGER REFERENCES admin_users(id),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

module.exports = {
  createDatabase,
  getDb,
  closeDb,
  initSchema
};
