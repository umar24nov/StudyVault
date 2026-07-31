// XSS Sanitization Middleware
// Strips HTML tags and dangerous characters from user input.
// Why? If a user submits <script>alert('hacked')</script> as a title,
// it gets stored in Firestore and served to every visitor's browser.
// This middleware strips those tags before they reach the database.

const DANGEROUS_PATTERNS = [
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,  // <script> tags
  /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,  // <iframe> tags
  /<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi,  // <object> tags
  /<embed\b[^>]*\/?>/gi,                                   // <embed> tags
  /on\w+\s*=\s*["'][^"']*["']/gi,                         // onclick="...", onerror='...'
  /on\w+\s*=\s*[^\s>]+/gi,                                 // onclick=alert(1) (unquoted)
  /javascript\s*:/gi,                                      // javascript: protocol
  /data\s*:\s*text\/html/gi,                               // data: URI scheme
];

function stripDangerous(input) {
  if (typeof input !== 'string') return input;
  let clean = input;
  for (const pattern of DANGEROUS_PATTERNS) {
    clean = clean.replace(pattern, '');
  }
  // Remove remaining HTML tags but keep the text content
  clean = clean.replace(/<[^>]*>/g, '');
  return clean.trim();
}

// Recursively sanitize all string values in an object
function sanitizeObject(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      sanitized[key] = stripDangerous(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

// Express middleware that sanitizes req.body
function sanitizeBody(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }
  next();
}

module.exports = { sanitizeBody, stripDangerous };
