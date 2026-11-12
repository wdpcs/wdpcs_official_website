'use strict';

const { timingSafeMatch } = require('../utils/crypto');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function verifyCsrf(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  const headerToken = req.headers['x-csrf-token'];
  if (!req.csrfToken || !headerToken || !timingSafeMatch(headerToken, req.csrfToken)) {
    return res.status(403).json({
      ok: false,
      error: 'Invalid or missing CSRF security token. Please refresh the admin portal.'
    });
  }
  return next();
}

module.exports = {
  verifyCsrf
};

