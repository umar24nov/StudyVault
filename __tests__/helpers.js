// Test helper — mocks Firebase and Cloudinary so tests don't need real credentials.

// Mock Firestore
const mockDocs = [];
const mockFirestore = {
  collection: jest.fn((name) => ({
    doc: jest.fn((id) => ({
      get: jest.fn(() => Promise.resolve({ exists: false, id, data: () => ({}) })),
      set: jest.fn(() => Promise.resolve()),
      update: jest.fn(() => Promise.resolve()),
      delete: jest.fn(() => Promise.resolve()),
    })),
    add: jest.fn((data) => Promise.resolve({ id: 'mock-id-' + Date.now() })),
    get: jest.fn(() => Promise.resolve({ docs: mockDocs, size: mockDocs.length })),
    where: jest.fn(function() { return this; }),
    orderBy: jest.fn(function() { return this; }),
    limit: jest.fn(function() { return this; }),
    offset: jest.fn(function() { return this; }),
  })),
};

// Mock firebase-admin
jest.mock('firebase-admin', () => {
  const firestore = {
    FieldValue: {
      serverTimestamp: jest.fn(() => 'mock-timestamp'),
      increment: jest.fn((n) => n),
    }
  };
  return {
    apps: [],
    initializeApp: jest.fn(),
    firestore: () => mockFirestore,
    auth: () => ({
      verifyIdToken: jest.fn(() => Promise.resolve({ uid: 'test-uid', email: 'test@test.com', name: 'Test User' })),
    }),
    credential: {
      cert: jest.fn(() => 'mock-credential'),
    },
  };
});

// Mock cloudinary
jest.mock('cloudinary', () => ({
  v2: {
    config: jest.fn(),
    uploader: {
      upload: jest.fn(() => Promise.resolve({
        secure_url: 'https://res.cloudinary.com/test/file.pdf'
      })),
    },
  },
}));

// Mock multer — just pass file through
jest.mock('../middleware/upload', () => ({
  upload: {
    single: jest.fn(() => (req, res, next) => {
      if (req.headers['x-test-upload'] === 'true') {
        req.file = { path: '/tmp/test.pdf', originalname: 'test.pdf', size: 1024 };
      }
      next();
    }),
  },
}));

// Mock rate limiter — pass through in tests
jest.mock('../middleware/rateLimit', () => ({
  apiLimiter: (req, res, next) => next(),
  uploadLimiter: (req, res, next) => next(),
  writeLimiter: (req, res, next) => next(),
}));

// Mock auth middleware
jest.mock('../middleware/auth', () => ({
  verifyToken: (req, res, next) => {
    req.user = { uid: 'test-uid', email: 'test@test.com', name: 'Test User' };
    next();
  },
  optionalAuth: (req, res, next) => {
    req.user = { uid: 'test-uid', email: 'test@test.com', name: 'Test User' };
    next();
  },
  requireAdminAuth: (req, res, next) => next(),
  requireAdmin: (req, res, next) => next(),
}));

// Mock sanitize middleware
jest.mock('../middleware/sanitize', () => ({
  sanitizeBody: (req, res, next) => next(),
  stripDangerous: (s) => s,
}));

const express = require('express');

function createApp() {
  const app = express();
  app.use(express.json());

  const paperRoutes = require('../routes/papers');
  const reviewRoutes = require('../routes/reviews');
  const feedbackRoutes = require('../routes/feedback');
  const bookmarkRoutes = require('../routes/bookmarks');
  const userRoutes = require('../routes/users');

  // Mock cloudinary instance
  const mockCloudinary = {
    uploader: {
      upload: jest.fn(() => Promise.resolve({ secure_url: 'https://res.cloudinary.com/test/file.pdf' })),
    },
  };

  app.use('/api/papers', paperRoutes(mockFirestore, mockCloudinary));
  app.use('/api/reviews', reviewRoutes(mockFirestore));
  app.use('/api/feedback', feedbackRoutes(mockFirestore));
  app.use('/api/bookmarks', bookmarkRoutes(mockFirestore));
  app.use('/api/users', userRoutes(mockFirestore));

  return app;
}

module.exports = { createApp, mockFirestore };
