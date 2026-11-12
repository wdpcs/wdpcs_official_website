'use strict';

const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const config = require('./config/env');
const { createDatabase, getDb } = require('./db/database');
const { seedBaseData } = require('./db/initialSeed');
const { createAuthMiddleware } = require('./middleware/auth');
const { verifyCsrf } = require('./middleware/csrf');
const { createRateLimiter } = require('./middleware/rateLimit');
const { createAuthRouter } = require('./routes/authRoutes');
const { createAdminCoreRouter } = require('./routes/adminCoreRoutes');
const { createContentRouter } = require('./routes/contentRoutes');
const { createFinancialRouter } = require('./routes/financialRoutes');
const { createMediaRouter } = require('./routes/mediaRoutes');
const { createPublicRouter } = require('./routes/publicRoutes');

function createCmsApp(options = {}) {
  const customDb = options.db || null;
  const dbProvider = () => customDb || getDb();

  if (options.initDb) {
    seedBaseData(dbProvider(), {
      createSuperAdmin: Boolean(options.adminPassword),
      adminPassword: options.adminPassword || ''
    });
  } else {
    // Ensure base tables, roles, and seed records exist cleanly if starting fresh DB
    seedBaseData(dbProvider(), { createSuperAdmin: false });
  }

  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) {
    app.set('trust proxy', config.trustProxy);
  }

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: false, limit: '2mb' }));

  // Baseline security headers for independent Admin Portal
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    if (!req.path.startsWith('/api/public') && !req.path.startsWith('/cms-uploads')) {
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    }
    next();
  });

  // Strict CORS only for public read-only endpoints & uploaded public media
  const allowedOrigins = new Set(options.publicSiteOrigins || config.publicSiteOrigins);
  function applyPublicCors(req, res, next) {
    const origin = req.headers.origin;
    if (origin && (allowedOrigins.has(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    return next();
  }

  const uploadRoot = options.uploadDir || config.uploadDir;
  if (options.uploadDir) {
    config.uploadDir = options.uploadDir;
  }
  if (options.backupDir) {
    config.backupDir = options.backupDir;
  }

  // Serve uploaded gallery WebP images, audio narrations, and PDF forms securely
  app.use('/cms-uploads', applyPublicCors, express.static(uploadRoot, {
    dotfiles: 'deny',
    index: false,
    maxAge: '1h',
    setHeaders: (res, filePath) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      if (filePath.endsWith('.pdf')) {
        res.setHeader('Content-Disposition', 'inline');
      }
    }
  }));

  // Public Read-Only API
  const publicLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 120, keyPrefix: 'public' });
  app.use('/api/public', applyPublicCors, publicLimiter, createPublicRouter({ getDb: dbProvider }));

  // Admin Auth & Middleware
  const { requireAuth, requirePermission, loadUserPermissions } = createAuthMiddleware(dbProvider);
  const adminLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 180, keyPrefix: 'admin-api' });

  app.use('/api/admin/auth', createAuthRouter({
    getDb: dbProvider,
    requireAuth,
    verifyCsrf,
    loadUserPermissions
  }));

  app.use('/api/admin', adminLimiter, requireAuth, verifyCsrf);
  app.use('/api/admin', createAdminCoreRouter({ getDb: dbProvider, requireAuth, requirePermission, verifyCsrf }));
  app.use('/api/admin', createContentRouter({ getDb: dbProvider, requireAuth, requirePermission, verifyCsrf }));
  app.use('/api/admin/financial', createFinancialRouter({ getDb: dbProvider, requireAuth, requirePermission, verifyCsrf }));
  app.use('/api/admin', createMediaRouter({ getDb: dbProvider, requireAuth, requirePermission, verifyCsrf }));

  // Serve Admin Portal UI (completely separate from public website)
  const portalPublicDir = path.resolve(__dirname, '..', 'public');
  app.use(express.static(portalPublicDir, { dotfiles: 'deny', index: ['login.html'] }));

  // Read-only fallback so seeded public director/gallery images preview cleanly in Admin Portal
  const publicAssetsDir = path.join(config.publicSiteRoot, 'assets');
  if (fs.existsSync(publicAssetsDir)) {
    app.use('/assets', express.static(publicAssetsDir, { dotfiles: 'deny', index: false }));
  }

  app.get('/health', (req, res) => {
    res.json({ ok: true, service: 'wdpcs-cms-portal', env: config.nodeEnv });
  });

  app.get('/', (req, res) => {
    res.sendFile(path.join(portalPublicDir, 'login.html'));
  });

  app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(portalPublicDir, 'dashboard.html'));
  });

  // Error handler returning clean JSON for API routes
  app.use((err, req, res, next) => {
    console.error('[CMS_ERROR]', err);
    if (req.path.startsWith('/api/')) {
      return res.status(err.status || 500).json({ ok: false, error: err.message || 'Internal server error' });
    }
    return res.status(500).send('Internal server error');
  });

  return app;
}

module.exports = {
  createCmsApp,
  createDatabase
};
