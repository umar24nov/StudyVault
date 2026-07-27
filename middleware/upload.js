const multer = require('multer');
const path = require('path');

const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png'];
const MAX_SIZE = 15 * 1024 * 1024; // 15 MB

const upload = multer({
  dest: '/tmp/uploads/',
  limits: { fileSize: MAX_SIZE },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_EXTENSIONS.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, DOC, DOCX, JPG, PNG allowed.'));
    }
  }
});

module.exports = { upload };
