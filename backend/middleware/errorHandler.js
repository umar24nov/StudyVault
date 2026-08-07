// Global error handler — catches all unhandled errors.
// Without this, an unhandled error crashes the server silently.
// Logs structured JSON; never leaks internal details to clients in production.

const { log } = require('./logger');

function errorHandler(err, req, res, _next) {
  const isProd = process.env.NODE_ENV === 'production';
  const ctx = { reqId: req.id, method: req.method, path: req.originalUrl || req.path };

  // Multer file size error
  if (err.code === 'LIMIT_FILE_SIZE') {
    log('warn', 'upload_size_exceeded', ctx);
    return res.status(400).json({ error: 'File too large. Maximum size is 15 MB.' });
  }

  // Multer file type error
  if (err.message && err.message.includes('Invalid file type')) {
    log('warn', 'upload_type_rejected', { ...ctx, message: err.message });
    return res.status(400).json({ error: err.message });
  }

  // Explicit 4xx errors carry a statusCode on the error object
  if (err.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
    log('warn', 'request_error', { ...ctx, statusCode: err.statusCode, message: err.message });
    return res.status(err.statusCode).json({ error: err.message });
  }

  // Default 500
  log('error', 'unhandled_error', { ...ctx, message: err.message, stack: err.stack });
  res.status(500).json({
    error: isProd
      ? 'Internal server error'
      : err.message
  });
}

module.exports = { errorHandler };
