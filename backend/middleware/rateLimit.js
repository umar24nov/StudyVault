const rateLimit = require('express-rate-limit');

// Exponential backoff lockout store: key -> { count, resetAt }
const backoff = new Map();
const MAX_BACKOFF_STEPS = Math.max(1, parseInt(process.env.RATE_LIMIT_BACKOFF_STEPS, 10) || 8);

// Periodic sweep of expired lockout entries
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of backoff) {
    if (entry.resetAt <= now) backoff.delete(key);
  }
}, 10 * 60 * 1000).unref();

function fromEnv(name, fallback) {
  const parsed = parseInt(process.env[name], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// Per-account when authenticated, per-IP otherwise
function limiterKey(req) {
  return (req.user && req.user.uid) ? `user:${req.user.uid}` : `ip:${req.ip}`;
}

function createLimiter({ max, windowMs, message }) {
  const limiter = rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: limiterKey,
    handler: (req, res) => {
      const key = limiterKey(req);
      const prev = backoff.get(key);
      const count = Math.min((prev ? prev.count : 0) + 1, MAX_BACKOFF_STEPS);
      const factor = Math.pow(2, count - 1);
      const resetAt = Date.now() + windowMs * factor;
      backoff.set(key, { count, resetAt });
      res.set('Retry-After', String(Math.ceil((resetAt - Date.now()) / 1000)));
      return res.status(429).json({ error: message });
    }
  });

  return function rateLimitWithBackoff(req, res, next) {
    const entry = backoff.get(limiterKey(req));
    if (entry && entry.resetAt > Date.now()) {
      res.set('Retry-After', String(Math.ceil((entry.resetAt - Date.now()) / 1000)));
      return res.status(429).json({ error: message });
    }
    if (entry) backoff.delete(limiterKey(req));
    return limiter(req, res, next);
  };
}

// General API rate limit (default: 100 per 15 minutes per key)
const apiLimiter = createLimiter({
  max: fromEnv('RATE_LIMIT_API_MAX', 100),
  windowMs: fromEnv('RATE_LIMIT_API_WINDOW_MIN', 15) * 60 * 1000,
  message: 'Too many requests. Please try again in 15 minutes.'
});

// Strict limit for uploads (default: 10 per hour per key)
const uploadLimiter = createLimiter({
  max: fromEnv('RATE_LIMIT_UPLOAD_MAX', 10),
  windowMs: fromEnv('RATE_LIMIT_UPLOAD_WINDOW_MIN', 60) * 60 * 1000,
  message: 'Upload limit reached. You can upload up to 10 files per hour.'
});

// Review/feedback/write limit (default: 5 per hour per key)
const writeLimiter = createLimiter({
  max: fromEnv('RATE_LIMIT_WRITE_MAX', 5),
  windowMs: fromEnv('RATE_LIMIT_WRITE_WINDOW_MIN', 60) * 60 * 1000,
  message: 'Rate limit reached. Please wait before posting again.'
});

// Download tracking limit (default: 60 per 15 min per key)
const downloadLimiter = createLimiter({
  max: fromEnv('RATE_LIMIT_DOWNLOAD_MAX', 60),
  windowMs: fromEnv('RATE_LIMIT_DOWNLOAD_WINDOW_MIN', 15) * 60 * 1000,
  message: 'Too many requests.'
});

// Auth/token endpoints (default: 10 per 15 min per key)
const authLimiter = createLimiter({
  max: fromEnv('RATE_LIMIT_AUTH_MAX', 10),
  windowMs: fromEnv('RATE_LIMIT_AUTH_WINDOW_MIN', 15) * 60 * 1000,
  message: 'Too many authentication attempts. Please try again later.'
});

module.exports = { apiLimiter, uploadLimiter, writeLimiter, downloadLimiter, authLimiter };
