require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

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
app.set('trust proxy', 1);  // Trust first proxy (needed for Render)

// ── Security middleware ────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: ['https://studyvaultapp.vercel.app', 'http://localhost:3000', 'http://localhost:5173'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..', 'frontend')));

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
const adminRoutes    = require('./routes/admin');

app.use('/api/papers',    paperRoutes(db, cloudinary));
app.use('/api/reviews',   reviewRoutes(db));
app.use('/api/feedback',  feedbackRoutes(db));
app.use('/api/bookmarks', bookmarkRoutes(db));
app.use('/api/users',     userRoutes(db));
app.use('/api/admin',     adminRoutes(db));

// Backward-compatible endpoints (old URL structure)
app.get('/api/papers-list', (req, res) => res.redirect(301, '/api/papers'));

// ── Health check ───────────────────────────────────────
app.get('/api/health', async (req, res) => {
  try {
    await db.collection('papers').limit(1).get();
    res.json({ status: 'ok', firebase: 'connected', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({
      status: 'error',
      firebase: 'disconnected',
      error: process.env.NODE_ENV === 'production' ? 'Service unavailable' : err.message
    });
  }
});

app.get('/favicon.ico', (req, res) => {
  res.type('image/svg+xml');
  res.send('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">📚</text></svg>');
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
