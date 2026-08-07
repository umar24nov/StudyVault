// Structured JSON logger (dependency-free) + per-request correlation ID.
// Every log line is a single JSON object so Render/GCP can parse it.

const crypto = require('crypto');

function log(level, event, fields = {}) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...fields
  });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

function requestId(req, res, next) {
  req.id = req.headers['x-request-id'] || crypto.randomUUID();
  res.setHeader('X-Request-ID', req.id);
  next();
}

module.exports = { log, requestId };
