'use strict';

const { getClientIp } = require('../utils/audit');

function createRateLimiter({ windowMs = 15 * 60 * 1000, max = 100, keyPrefix = 'api', message = 'Too many requests. Please wait and try again.' }) {
  const hits = new Map();

  // Periodic cleanup to keep memory bounded
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [k, entry] of hits.entries()) {
      if (entry.resetAt <= now) hits.delete(k);
    }
  }, Math.min(windowMs, 60000));
  if (typeof cleanupTimer.unref === 'function') cleanupTimer.unref();

  return function rateLimitMiddleware(req, res, next) {
    const ip = getClientIp(req);
    const key = `${keyPrefix}:${ip}`;
    const now = Date.now();
    let entry = hits.get(key);

    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }

    entry.count += 1;
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - entry.count)));

    if (entry.count > max) {
      const retryAfterSec = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        ok: false,
        error: message,
        retryAfterSeconds: retryAfterSec
      });
    }
    return next();
  };
}

module.exports = {
  createRateLimiter
};

