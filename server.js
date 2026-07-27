require('dotenv').config();
const express = require('express');
const cors = require('cors');

// ── Validate environment variables FIRST ────────────────
const { validateEnv } = require('./config/env');
const env = validateEnv();

// ── Initialize services ────────────────────────────────
const { initFirebase } = require('./config/firebase');
const { initCloudinary } = require('./config/cloudinary');
const db = initFirebase(env);
const cloudinary = initCloudinary(env);

// ── Initialize Express ─────────────────────────────────
const app = express();

// ── Security middleware ────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '1mb' }));  // Limit JSON body size
app.use(express.static('public'));

// ── Rate limiting ──────────────────────────────────────
const { apiLimiter } = require('./middleware/rateLimit');
app.use('/api', apiLimiter);

// ── Input sanitization ─────────────────────────────────
const { sanitizeBody } = require('./middleware/sanitize');
app.use(sanitizeBody);

// ── Routes ─────────────────────────────────────────────
const paperRoutes    = require('./routes/papers');
const reviewRoutes   = require('./routes/reviews');
const feedbackRoutes = require('./routes/feedback');
const bookmarkRoutes = require('./routes/bookmarks');
const userRoutes     = require('./routes/users');

app.use('/api/papers',    paperRoutes(db, cloudinary));
app.use('/api/reviews',   reviewRoutes(db));
app.use('/api/feedback',  feedbackRoutes(db));
app.use('/api/bookmarks', bookmarkRoutes(db));
app.use('/api/users',     userRoutes(db));

// Backward-compatible endpoints (old URL structure)
app.get('/api/papers-list', (req, res) => res.redirect(301, '/api/papers'));

// ── Health check ───────────────────────────────────────
app.get('/api/health', async (req, res) => {
  try {
    await db.collection('papers').limit(1).get();
    res.json({ status: 'ok', firebase: 'connected', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: 'error', firebase: 'disconnected', error: err.message });
  }
});

app.get('/', (req, res) => res.json({ status: 'StudyVault API is running!' }));

// ── Global error handler (must be last) ────────────────
const { errorHandler } = require('./middleware/errorHandler');
app.use(errorHandler);

// ── Graceful shutdown ──────────────────────────────────
function shutdown(signal) {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

// ── Start server ───────────────────────────────────────
const PORT = env.PORT;
app.listen(PORT, () => {
  console.log(`✅ StudyVault API running on port ${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
});
