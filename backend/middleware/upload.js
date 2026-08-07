const multer = require('multer');
const fs = require('fs');
const path = require('path');

const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png'];
const ALLOWED_MIMES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png'
];
const MAX_SIZE = 15 * 1024 * 1024; // 15 MB

const upload = multer({
  dest: '/tmp/uploads/',
  limits: { fileSize: MAX_SIZE },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_EXTENSIONS.includes(ext) && ALLOWED_MIMES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, DOC, DOCX, JPG, PNG allowed.'));
    }
  }
});

// Magic-byte signatures for allowed types (extension => expected content)
const MAGIC_BY_EXTENSION = {
  '.pdf':  'pdf',
  '.jpg':  'jpg',
  '.jpeg': 'jpg',
  '.png':  'png',
  '.doc':  'doc',
  '.docx': 'docx'
};

const SIGNATURES = {
  pdf:  [[0x25, 0x50, 0x44, 0x46, 0x2d]],                                          // %PDF-
  jpg:  [[0xff, 0xd8, 0xff]],                                                        // JPEG SOI
  png:  [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],                         // PNG signature
  doc:  [[0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]],                         // OLE2 compound document
  docx: [[0x50, 0x4b, 0x03, 0x04], [0x50, 0x4b, 0x05, 0x06], [0x50, 0x4b, 0x07, 0x08]] // ZIP-based Office
};

function readHead(filePath, size = 1024) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(size);
    const n = fs.readSync(fd, buf, 0, size, 0);
    return buf.subarray(0, n);
  } finally {
    fs.closeSync(fd);
  }
}

function matchesAny(head, signatures) {
  return signatures.some(sig => {
    if (sig.length > head.length) return false;
    for (let i = 0; i < sig.length; i++) if (head[i] !== sig[i]) return false;
    return true;
  });
}

// Verifies the uploaded file's actual content (magic bytes) matches its extension,
// so a renamed executable/HTML cannot be stored as a "PDF".
function verifyMagicBytes(req, res, next) {
  if (!req.file) return next();

  const ext = path.extname(req.file.originalname).toLowerCase();
  const kind = MAGIC_BY_EXTENSION[ext];
  if (!kind) return next();

  let head;
  try {
    head = readHead(req.file.path);
  } catch (err) {
    try { fs.unlinkSync(req.file.path); } catch (_e) {}
    return res.status(400).json({ error: 'Could not read the uploaded file.' });
  }

  let valid;
  if (kind === 'pdf') {
    valid = head.includes(Buffer.from('%PDF-', 'ascii'));
  } else {
    valid = head.length > 0 && matchesAny(head, SIGNATURES[kind]);
  }

  if (!valid) {
    try { fs.unlinkSync(req.file.path); } catch (_e) {}
    return res.status(400).json({ error: 'File content does not match its extension. Please upload a genuine PDF, DOC, DOCX, JPG, or PNG file.' });
  }

  next();
}

module.exports = { upload, verifyMagicBytes };
