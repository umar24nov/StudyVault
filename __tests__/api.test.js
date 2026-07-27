const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

// ── Stub helper ───────────────────────────────────────
function stub() {
  const s = function (...args) { s.calls.push(args); return s._ret !== undefined ? s._ret : s; };
  s.calls = [];
  s._ret = s;
  s.mockReturnValue = (v) => { s._ret = v; return s; };
  s.mockResolvedValue = (v) => { s._ret = Promise.resolve(v); return s; };
  s.mockImplementation = (fn) => { s._impl = fn; return s; };
  s.mockClear = () => { s.calls.length = 0; };
  return s;
}

// ── Chainable Firestore collection mock ───────────────
function makeMockCollection() {
  const col = {
    doc: stub().mockImplementation((id) => ({
      exists: true, id: id || 'mock-id',
      data: () => ({ id: id || 'mock-id', title: 'Test', course: 'eng', status: 'approved', downloads: 0, tags: [] }),
      update: stub().mockResolvedValue(undefined),
      delete: stub().mockResolvedValue(undefined),
      set: stub().mockResolvedValue(undefined),
    })),
    add: stub().mockResolvedValue({ id: 'new-id' }),
    get: stub().mockResolvedValue({ docs: [], size: 0, empty: true }),
    where: stub().mockImplementation(() => col),
    orderBy: stub().mockImplementation(() => col),
    limit: stub().mockImplementation(() => col),
    offset: stub().mockImplementation(() => col),
  };
  return col;
}

// ── Mock modules ──────────────────────────────────────
function setupMocks() {
  const pass = (req, res, next) => next();

  const FieldValue = { serverTimestamp: stub().mockReturnValue('ts'), increment: stub().mockImplementation(n => n) };
  const db = { collection: stub().mockImplementation(() => makeMockCollection()), FieldValue };

  const adminMock = {
    apps: [],
    initializeApp: stub(),
    firestore: Object.assign(stub().mockReturnValue(db), { FieldValue }),
    auth: () => ({ verifyIdToken: stub().mockResolvedValue({ uid: 'u1', email: 't@t.com', name: 'T' }) }),
    credential: { cert: stub() },
  };

  const cloudMock = {
    v2: { config: stub(), uploader: { upload: stub().mockResolvedValue({ secure_url: 'https://cld.test/f.pdf' }) } }
  };

  const uploadMock = {
    upload: { single: () => (req, res, next) => {
      if (req.headers['x-test-upload'] === 'true')
        req.file = { path: '/tmp/t.pdf', originalname: 't.pdf', size: 1024 };
      next();
    } }
  };

  const rateMock = { apiLimiter: pass, uploadLimiter: pass, writeLimiter: pass };

  const authMiddleware = (req, res, next) => { req.user = { uid: 'u1', email: 't@t.com', name: 'T' }; next(); };
  const authMock = { verifyToken: authMiddleware, optionalAuth: authMiddleware, requireAdminAuth: pass, requireAdmin: pass };

  const sanitizeMock = { sanitizeBody: pass, stripDangerous: (s) => s };

  // Inject into require.cache — keys must be fully resolved paths
  const cache = require.cache;
  cache[require.resolve('firebase-admin')] = { id: require.resolve('firebase-admin'), filename: require.resolve('firebase-admin'), loaded: true, exports: adminMock };
  cache[require.resolve('cloudinary')] = { id: require.resolve('cloudinary'), filename: require.resolve('cloudinary'), loaded: true, exports: cloudMock };

  const uploadPath = path.join(ROOT, 'middleware', 'upload.js');
  const ratePath = path.join(ROOT, 'middleware', 'rateLimit.js');
  const authPath = path.join(ROOT, 'middleware', 'auth.js');
  const sanitizePath = path.join(ROOT, 'middleware', 'sanitize.js');

  cache[uploadPath] = { id: uploadPath, filename: uploadPath, loaded: true, exports: uploadMock };
  cache[ratePath] = { id: ratePath, filename: ratePath, loaded: true, exports: rateMock };
  cache[authPath] = { id: authPath, filename: authPath, loaded: true, exports: authMock };
  cache[sanitizePath] = { id: sanitizePath, filename: sanitizePath, loaded: true, exports: sanitizeMock };
}

// ── Build the Express app ─────────────────────────────
function createApp() {
  setupMocks();
  const express = require('express');
  const app = express();
  app.use(express.json());

  const db = require('firebase-admin').firestore();
  const cloudinary = require('cloudinary').v2;

  app.use('/api/papers', require(path.join(ROOT, 'routes', 'papers'))(db, cloudinary));
  app.use('/api/reviews', require(path.join(ROOT, 'routes', 'reviews'))(db));
  app.use('/api/feedback', require(path.join(ROOT, 'routes', 'feedback'))(db));
  app.use('/api/bookmarks', require(path.join(ROOT, 'routes', 'bookmarks'))(db));
  app.use('/api/users', require(path.join(ROOT, 'routes', 'users'))(db));

  app.use((err, req, res, _next) => res.status(500).json({ error: err.message }));
  return app;
}

// ── HTTP helper ───────────────────────────────────────
function request(app, method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const port = server.address().port;
      const opts = { hostname: '127.0.0.1', port, path: urlPath, method, headers: { 'Content-Type': 'application/json' } };
      const req = http.request(opts, (res) => {
        let data = '';
        res.on('data', (c) => data += c);
        res.on('end', () => {
          server.close();
          let json;
          try { json = JSON.parse(data); } catch { json = data; }
          resolve({ status: res.statusCode, body: json, headers: res.headers });
        });
      });
      req.on('error', (e) => { server.close(); reject(e); });
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  });
}

// ── Tests ─────────────────────────────────────────────
let app;

before(() => { app = createApp(); });

describe('GET /api/papers', () => {
  it('returns data and pagination', async () => {
    const res = await request(app, 'GET', '/api/papers');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data));
    assert.ok(res.body.pagination);
  });

  it('supports page/limit params', async () => {
    const res = await request(app, 'GET', '/api/papers?page=1&limit=10');
    assert.equal(res.status, 200);
    assert.equal(res.body.pagination.page, 1);
    assert.equal(res.body.pagination.limit, 10);
  });
});

describe('GET /api/papers/trending', () => {
  it('returns array', async () => {
    const res = await request(app, 'GET', '/api/papers/trending');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
  });
});

describe('GET /api/papers/universities', () => {
  it('returns array', async () => {
    const res = await request(app, 'GET', '/api/papers/universities');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
  });
});

describe('POST /api/papers/:id/download', () => {
  it('increments download count', async () => {
    const res = await request(app, 'POST', '/api/papers/test-id/download');
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
  });
});

describe('POST /api/reviews', () => {
  it('rejects empty review', async () => {
    const res = await request(app, 'POST', '/api/reviews', { name: '', message: '', stars: 0 });
    assert.equal(res.status, 400);
  });

  it('accepts valid review', async () => {
    const res = await request(app, 'POST', '/api/reviews', { name: 'Test', message: 'Great!', stars: 5 });
    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
  });
});

describe('POST /api/feedback', () => {
  it('rejects empty feedback', async () => {
    const res = await request(app, 'POST', '/api/feedback', { message: '' });
    assert.equal(res.status, 400);
  });

  it('accepts valid feedback', async () => {
    const res = await request(app, 'POST', '/api/feedback', { type: 'suggestion', message: 'Add dark mode' });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
  });
});

describe('POST /api/feedback/contact', () => {
  it('rejects incomplete form', async () => {
    const res = await request(app, 'POST', '/api/feedback/contact', { name: 'T', email: '', message: '' });
    assert.equal(res.status, 400);
  });

  it('rejects invalid email', async () => {
    const res = await request(app, 'POST', '/api/feedback/contact', { name: 'T', email: 'bad', message: 'Hi' });
    assert.equal(res.status, 400);
  });

  it('accepts valid contact', async () => {
    const res = await request(app, 'POST', '/api/feedback/contact', { name: 'T', email: 't@t.com', message: 'Hi' });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
  });
});
