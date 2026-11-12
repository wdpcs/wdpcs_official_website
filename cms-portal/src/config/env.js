'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const CMS_ROOT = path.resolve(__dirname, '..', '..');
const PUBLIC_SITE_ROOT = path.resolve(CMS_ROOT, '..');

function loadDotEnv(envPath) {
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = val;
    }
  }
}

loadDotEnv(path.join(CMS_ROOT, '.env'));

function resolveStoragePath(rawPath, fallbackRel) {
  const target = rawPath && rawPath.trim() ? rawPath.trim() : fallbackRel;
  return path.isAbsolute(target) ? target : path.resolve(CMS_ROOT, target);
}

function parseBool(val, fallback) {
  if (val === undefined || val === null || val === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(val).trim().toLowerCase());
}

function parseIntSafe(val, fallback) {
  const n = Number.parseInt(val, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// Generate an ephemeral local fallback secret only in non-production if .env wasn't created yet
const isProd = process.env.NODE_ENV === 'production';
const fallbackSessionSecret = isProd
  ? ''
  : crypto.createHash('sha256').update(`wdpcs-local-session-${CMS_ROOT}`).digest('hex');
const fallbackCsrfSecret = isProd
  ? ''
  : crypto.createHash('sha256').update(`wdpcs-local-csrf-${CMS_ROOT}`).digest('hex');

const config = {
  cmsRoot: CMS_ROOT,
  publicSiteRoot: PUBLIC_SITE_ROOT,
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd,
  host: process.env.CMS_HOST || '127.0.0.1',
  port: parseIntSafe(process.env.CMS_PORT, 4000),
  trustProxy: parseIntSafe(process.env.TRUST_PROXY, 0),
  adminBaseUrl: (process.env.ADMIN_BASE_URL || 'http://localhost:4000').replace(/\/+$/, ''),
  publicSiteOrigins: (process.env.PUBLIC_SITE_ORIGINS || 'http://localhost:8080,http://127.0.0.1:8080,https://www.wdpcs.in,https://wdpcs.github.io')
    .split(',')
    .map(s => s.trim().replace(/\/+$/, ''))
    .filter(Boolean),
  sessionSecret: process.env.SESSION_SECRET || fallbackSessionSecret,
  csrfSecret: process.env.CSRF_SECRET || fallbackCsrfSecret,
  sessionMaxAgeMs: parseIntSafe(process.env.SESSION_MAX_AGE_MINUTES, 480) * 60 * 1000,
  sessionIdleTimeoutMs: parseIntSafe(process.env.SESSION_IDLE_TIMEOUT_MINUTES, 60) * 60 * 1000,
  loginMaxAttempts: parseIntSafe(process.env.LOGIN_MAX_ATTEMPTS, 5),
  loginLockoutMs: parseIntSafe(process.env.LOGIN_LOCKOUT_MINUTES, 15) * 60 * 1000,
  passwordResetExpiryMs: parseIntSafe(process.env.PASSWORD_RESET_EXPIRY_MINUTES, 30) * 60 * 1000,
  allowDevResetPreview: parseBool(process.env.ALLOW_DEV_RESET_PREVIEW, !isProd),
  dbPath: resolveStoragePath(process.env.DB_PATH, './storage/database/wdpcs_cms.sqlite'),
  uploadDir: resolveStoragePath(process.env.UPLOAD_DIR, './storage/uploads'),
  backupDir: resolveStoragePath(process.env.BACKUP_DIR, './backups'),
  cookieSecure: parseBool(process.env.COOKIE_SECURE, isProd),
  cookieSameSite: process.env.COOKIE_SAME_SITE || 'Lax',
  defaultRequireApprovalFinancial: parseBool(process.env.DEFAULT_REQUIRE_APPROVAL_FINANCIAL, true),
  defaultRequireApprovalContent: parseBool(process.env.DEFAULT_REQUIRE_APPROVAL_CONTENT, false),
  initAdmin: {
    username: process.env.ADMIN_INIT_USERNAME || 'superadmin',
    email: process.env.ADMIN_INIT_EMAIL || 'admin@wdpcs.in',
    fullName: process.env.ADMIN_INIT_NAME || 'Society System Administrator',
    password: process.env.ADMIN_INIT_PASSWORD || ''
  }
};

if (isProd && (!config.sessionSecret || config.sessionSecret.length < 32 || !config.csrfSecret || config.csrfSecret.length < 32)) {
  throw new Error('Production startup aborted: SESSION_SECRET and CSRF_SECRET (>= 32 chars) must be set in environment.');
}

// Ensure required isolated storage directories exist
for (const dir of [
  path.dirname(config.dbPath),
  config.uploadDir,
  path.join(config.uploadDir, 'gallery'),
  path.join(config.uploadDir, 'gallery-thumbs'),
  path.join(config.uploadDir, 'directors'),
  path.join(config.uploadDir, 'audio'),
  path.join(config.uploadDir, 'notices'),
  path.join(config.uploadDir, 'documents'),
  path.join(config.uploadDir, 'media'),
  config.backupDir
]) {
  fs.mkdirSync(dir, { recursive: true });
}

module.exports = config;

