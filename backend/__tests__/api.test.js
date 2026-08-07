const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

// ── Stub helper ───────────────────────────────────────
function stub() {
  const s = function (...args) {
    s.calls.push(args);
    if (s._impl) return s._impl(...args);
    return s._ret !== undefined ? s._ret : s;
  };
  s.calls = [];
  s._ret = s;
  s.mockReturnValue = (v) => { s._ret = v; return s; };
  s.mockResolvedValue = (v) => { s._ret = Promise.resolve(v); return s; };
  s.mockImplementation = (fn) => { s._impl = fn; return s; };
  s.mockClear = () => { s.calls.length = 0; };
  return s;
}

// ── Chainable Firestore collection mock ───────────────
let docOverride = null; // optional { exists, data } override for doc()
let colDocs = [];       // seed docs returned by collection.get()

function makeMockCollection() {
  const col = {
    doc: stub().mockImplementation((id) => {
      const d = docOverride ? { ...docOverride } : { id: id || 'mock-id', title: 'Test', course: 'eng', status: 'approved', downloads: 0, tags: [] };
      return {
        exists: docOverride ? docOverride.exists : true,
        id: id || 'mock-id',
        data: () => d,
        get: stub().mockResolvedValue({
          exists: docOverride ? docOverride.exists : true,
          data: () => d
        }),
        update: stub().mockResolvedValue(undefined),
        delete: stub().mockResolvedValue(undefined),
        set: stub().mockResolvedValue(undefined),
      };
    }),
    add: stub().mockResolvedValue({ id: 'new-id' }),
    get: stub().mockImplementation(async () => ({
      docs: colDocs.map(d => ({
        id: d.id,
        data: () => d.data,
        ref: { delete: stub().mockResolvedValue(undefined) }
      })),
      size: colDocs.length,
      empty: colDocs.length === 0
    })),
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
  const db = {
    collection: stub().mockImplementation(() => makeMockCollection()),
    FieldValue,
    runTransaction: stub().mockImplementation(async (fn) => {
      const tx = {
        get: (ref) => (ref && ref.get ? ref.get() : Promise.resolve({ exists: false, data: () => ({}) })),
        update: (ref, data) => { if (ref && ref.update) ref.update(data); },
        set: (ref, data, opts) => { if (ref && ref.set) ref.set(data, opts); },
        delete: (ref) => { if (ref && ref.delete) ref.delete(); },
      };
      return fn(tx);
    })
  };

  const adminMock = {
    apps: [],
    initializeApp: stub(),
    firestore: Object.assign(stub().mockReturnValue(db), { FieldValue }),
    auth: () => ({ verifyIdToken: stub().mockResolvedValue({ uid: 'u1', email: 't@t.com', name: 'T' }) }),
    credential: { cert: stub() },
  };

  const cloudMock = {
    v2: { config: stub(), uploader: { upload: stub().mockResolvedValue({ secure_url: 'https://cld.test/f.pdf', public_id: 'studyvault/f' }), destroy: stub().mockResolvedValue({ result: 'ok' }) } }
  };

  const uploadMock = {
    upload: { single: () => (req, res, next) => {
      if (req.headers['x-test-upload'] === 'true')
        req.file = { path: '/tmp/t.pdf', originalname: 't.pdf', size: 1024 };
      next();
    } },
    verifyMagicBytes: pass
  };

  const rateMock = { apiLimiter: pass, uploadLimiter: pass, writeLimiter: pass, downloadLimiter: pass, authLimiter: pass };

  const authMiddleware = (req, res, next) => { req.user = { uid: 'u1', email: 't@t.com', name: 'T' }; next(); };
  const authMock = { verifyToken: authMiddleware, optionalAuth: authMiddleware, requireAdminAuth: authMiddleware, requireAdmin: authMiddleware };

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
  app.use('/api/admin', require(path.join(ROOT, 'routes', 'admin'))(db, cloudinary));
  app.use('/api/notifications', require(path.join(ROOT, 'routes', 'notifications'))(db));

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

  it('accepts year and university filters', async () => {
    const res = await request(app, 'GET', '/api/papers?year=2023&university=Anna');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data));
  });

  it('filters by course and type', async () => {
    colDocs = [
      { id: 'p1', data: { id: 'p1', title: 'DBMS PYQ', course: 'engineering', type: 'pyq', status: 'approved', downloads: 2, year: '2023', tags: [] } },
      { id: 'p2', data: { id: 'p2', title: 'Notes', course: 'management', type: 'notes', status: 'approved', downloads: 1, year: '2022', tags: [] } },
    ];

    const res = await request(app, 'GET', '/api/papers?course=engineering&type=pyq');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.map(p => p.id), ['p1']);
    assert.equal(res.body.pagination.total, 1);
  });

  it('filters by search term across title', async () => {
    colDocs = [
      { id: 'p1', data: { id: 'p1', title: 'Algorithms Final', course: 'cs', type: 'pyq', status: 'approved', downloads: 0, year: '2023', tags: ['algorithms'] } },
      { id: 'p2', data: { id: 'p2', title: 'Economics Notes', course: 'commerce', type: 'notes', status: 'approved', downloads: 0, year: '2022', tags: [] } },
    ];

    const res = await request(app, 'GET', '/api/papers?search=algorithms');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.map(p => p.id), ['p1']);
    assert.equal(res.body.pagination.total, 1);
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

describe('GET /api/papers/:id', () => {
  it('returns approved paper', async () => {
    const res = await request(app, 'GET', '/api/papers/mock-id');
    assert.equal(res.status, 200);
    assert.equal(res.body.id, 'mock-id');
  });

  it('returns 404 for non-approved paper', async () => {
    docOverride = { exists: true, id: 'pending-id', title: 'Test', course: 'eng', status: 'pending', downloads: 0, tags: [] };
    try {
      const res = await request(app, 'GET', '/api/papers/pending-id');
      assert.equal(res.status, 404);
    } finally {
      docOverride = null;
    }
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

describe('GET /api/reviews', () => {
  it('supports sort=recent and sort=top', async () => {
    const recent = await request(app, 'GET', '/api/reviews?sort=recent');
    assert.equal(recent.status, 200);
    assert.ok(Array.isArray(recent.body));

    const top = await request(app, 'GET', '/api/reviews?sort=top');
    assert.equal(top.status, 200);
    assert.ok(Array.isArray(top.body));
  });
});

describe('GET /api/notifications', () => {
  it('returns unread count and data array', async () => {
    const res = await request(app, 'GET', '/api/notifications');
    assert.equal(res.status, 200);
    assert.equal(typeof res.body.unread, 'number');
    assert.ok(Array.isArray(res.body.data));
  });
});

describe('GET /api/admin', () => {
  it('check returns isAdmin', async () => {
    const res = await request(app, 'GET', '/api/admin/check');
    assert.equal(res.status, 200);
    assert.equal(res.body.isAdmin, true);
  });

  it('papers returns pagination shape', async () => {
    const res = await request(app, 'GET', '/api/admin/papers?page=1&limit=25');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data));
    assert.ok(res.body.pagination);
    assert.equal(res.body.pagination.page, 1);
    assert.equal(res.body.pagination.limit, 25);
  });
});

// ── New endpoint coverage (ratings, reports, profile, admin) ──

describe('POST /api/papers/:id/report', () => {
  it('rejects an empty reason', async () => {
    docOverride = { exists: true, title: 'X', status: 'approved' };
    try {
      const res = await request(app, 'POST', '/api/papers/p1/report', { reason: '' });
      assert.equal(res.status, 400);
    } finally {
      docOverride = null;
    }
  });

  it('returns 404 for a missing paper', async () => {
    docOverride = { exists: false, title: 'X' };
    try {
      const res = await request(app, 'POST', '/api/papers/nope/report', { reason: 'Wrong file' });
      assert.equal(res.status, 404);
    } finally {
      docOverride = null;
    }
  });

  it('creates a report', async () => {
    docOverride = { exists: true, title: 'DBMS Notes', status: 'approved' };
    try {
      const res = await request(app, 'POST', '/api/papers/p1/report', { reason: 'Duplicate content' });
      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
    } finally {
      docOverride = null;
    }
  });
});

describe('POST /api/papers/:id/rating', () => {
  it('rejects stars out of range', async () => {
    docOverride = { exists: true, title: 'X', status: 'approved' };
    try {
      const res = await request(app, 'POST', '/api/papers/p1/rating', { stars: 7 });
      assert.equal(res.status, 400);
    } finally {
      docOverride = null;
    }
  });

  it('returns 404 for a missing paper', async () => {
    colDocs = [];
    docOverride = { exists: false, title: 'X' };
    try {
      const res = await request(app, 'POST', '/api/papers/nope/rating', { stars: 3 });
      assert.equal(res.status, 404);
    } finally {
      docOverride = null;
    }
  });

  it('records a new rating and updates aggregates', async () => {
    colDocs = [];
    docOverride = { exists: true, title: 'X', status: 'approved' };
    try {
      const res = await request(app, 'POST', '/api/papers/p1/rating', { stars: 5 });
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
    } finally {
      docOverride = null;
    }
  });
});

describe('GET /api/reviews/stats', () => {
  it('returns aggregate totals and average', async () => {
    colDocs = [
      { id: 'r1', data: { status: 'approved', stars: 5 } },
      { id: 'r2', data: { status: 'approved', stars: 3 } },
    ];
    const res = await request(app, 'GET', '/api/reviews/stats');
    assert.equal(res.status, 200);
    assert.equal(res.body.total, 2);
    assert.equal(res.body.average, 4);
    assert.equal(res.body.counts[5], 1);
    assert.equal(res.body.counts[3], 1);
  });
});

describe('GET /api/users/me', () => {
  it('returns profile with stats and badge', async () => {
    colDocs = [
      { id: 'p1', data: { id: 'p1', uploadedBy: 'u1', status: 'approved', downloads: 10 } },
      { id: 'p2', data: { id: 'p2', uploadedBy: 'u1', status: 'approved', downloads: 5 } },
    ];
    const res = await request(app, 'GET', '/api/users/me');
    assert.equal(res.status, 200);
    assert.equal(res.body.uid, 'u1');
    assert.equal(res.body.stats.uploads, 2);
    assert.equal(res.body.stats.approvedUploads, 2);
    assert.equal(res.body.stats.totalDownloads, 15);
    assert.equal(res.body.badge, '');
  });

  it('awards Active Contributor badge at 100 downloads', async () => {
    colDocs = [
      { id: 'p1', data: { id: 'p1', uploadedBy: 'u1', status: 'approved', downloads: 100 } },
    ];
    const res = await request(app, 'GET', '/api/users/me');
    assert.equal(res.status, 200);
    assert.equal(res.body.badge, 'Active Contributor');
  });
});

describe('GET /api/users/me/downloads', () => {
  it('returns history sorted newest-first without userId', async () => {
    colDocs = [
      { id: 'd1', data: { userId: 'u1', paperId: 'p1', title: 'Old', course: 'eng', createdAt: { _seconds: 100 } } },
      { id: 'd2', data: { userId: 'u1', paperId: 'p2', title: 'New', course: 'cs', createdAt: { _seconds: 200 } } },
    ];
    const res = await request(app, 'GET', '/api/users/me/downloads');
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 2);
    assert.equal(res.body[0].id, 'd2');
    assert.equal('userId' in res.body[0], false);
  });
});

describe('GET /api/users/me/recommendations', () => {
  it('returns an array of recommended papers', async () => {
    colDocs = [
      { id: 'p1', data: { id: 'p1', title: 'DBMS PYQ', course: 'engineering', type: 'pyq', status: 'approved', downloads: 3 } },
    ];
    const res = await request(app, 'GET', '/api/users/me/recommendations');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
    assert.ok(res.body.length >= 1);
  });
});

describe('PUT /api/users/me/uploads/:id', () => {
  it('updates own upload metadata', async () => {
    docOverride = { exists: true, title: 'Old', uploadedBy: 'u1', course: 'eng' };
    try {
      const res = await request(app, 'PUT', '/api/users/me/uploads/p1', { title: 'New', course: 'cs' });
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
    } finally {
      docOverride = null;
    }
  });

  it('forbids editing someone else upload', async () => {
    docOverride = { exists: true, title: 'Old', uploadedBy: 'other', course: 'eng' };
    try {
      const res = await request(app, 'PUT', '/api/users/me/uploads/p1', { title: 'New' });
      assert.equal(res.status, 403);
    } finally {
      docOverride = null;
    }
  });
});

describe('DELETE /api/users/me/uploads/:id', () => {
  it('deletes own upload', async () => {
    colDocs = [];
    docOverride = { exists: true, title: 'Old', uploadedBy: 'u1', course: 'eng' };
    try {
      const res = await request(app, 'DELETE', '/api/users/me/uploads/p1');
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
    } finally {
      docOverride = null;
    }
  });

  it('forbids deleting someone else upload', async () => {
    colDocs = [];
    docOverride = { exists: true, title: 'Old', uploadedBy: 'other', course: 'eng' };
    try {
      const res = await request(app, 'DELETE', '/api/users/me/uploads/p1');
      assert.equal(res.status, 403);
    } finally {
      docOverride = null;
    }
  });
});

describe('GET /api/admin/reports', () => {
  it('lists reports newest-first', async () => {
    colDocs = [
      { id: 'rep1', data: { paperTitle: 'X', reason: 'bad', status: 'open', createdAt: { _seconds: 100 } } },
      { id: 'rep2', data: { paperTitle: 'Y', reason: 'dup', status: 'open', createdAt: { _seconds: 200 } } },
    ];
    const res = await request(app, 'GET', '/api/admin/reports?status=all');
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 2);
    assert.equal(res.body[0].id, 'rep2');
  });
});

describe('PATCH /api/admin/reports/:id/resolve', () => {
  it('resolves a report', async () => {
    const res = await request(app, 'PATCH', '/api/admin/reports/rep1/resolve');
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
  });
});

describe('DELETE /api/admin/reports/:id', () => {
  it('deletes a report', async () => {
    const res = await request(app, 'DELETE', '/api/admin/reports/rep1');
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
  });
});

describe('DELETE /api/admin/downloads', () => {
  it('clears download history and reports count', async () => {
    colDocs = [
      { id: 'd1', data: { userId: 'u1', paperId: 'p1' } },
    ];
    const res = await request(app, 'DELETE', '/api/admin/downloads');
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.deleted, 1);
  });
});

describe('PATCH /api/admin/papers/:id/reject', () => {
  it('rejects a paper with a reason', async () => {
    docOverride = { exists: true, title: 'X', uploadedBy: 'u1', status: 'pending' };
    try {
      const res = await request(app, 'PATCH', '/api/admin/papers/p1/reject', { reason: 'Duplicate' });
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
    } finally {
      docOverride = null;
    }
  });

  it('returns 404 for a missing paper', async () => {
    docOverride = { exists: false, title: 'X' };
    try {
      const res = await request(app, 'PATCH', '/api/admin/papers/nope/reject', { reason: 'bad' });
      assert.equal(res.status, 404);
    } finally {
      docOverride = null;
    }
  });
});
