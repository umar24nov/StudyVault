const request = require('supertest');
const { createApp } = require('./helpers');

const app = createApp();

describe('GET /api/papers', () => {
  it('should return papers array', async () => {
    const res = await request(app).get('/api/papers');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('pagination');
  });

  it('should support pagination params', async () => {
    const res = await request(app).get('/api/papers?page=1&limit=10');
    expect(res.status).toBe(200);
    expect(res.body.pagination.page).toBe(1);
    expect(res.body.pagination.limit).toBe(10);
  });

  it('should support course filter', async () => {
    const res = await request(app).get('/api/papers?course=engineering');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('should support type filter', async () => {
    const res = await request(app).get('/api/papers?type=pyq');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

describe('GET /api/papers/trending', () => {
  it('should return trending papers', async () => {
    const res = await request(app).get('/api/papers/trending');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('GET /api/papers/universities', () => {
  it('should return universities list', async () => {
    const res = await request(app).get('/api/papers/universities');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('GET /api/papers/:id', () => {
  it('should return 404 for non-existent paper', async () => {
    const res = await request(app).get('/api/papers/nonexistent');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/papers/:id/download', () => {
  it('should increment download count', async () => {
    const res = await request(app).post('/api/papers/test-id/download');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('POST /api/reviews', () => {
  it('should reject empty review', async () => {
    const res = await request(app)
      .post('/api/reviews')
      .send({ name: '', message: '', stars: 0 });
    expect(res.status).toBe(400);
  });

  it('should accept valid review', async () => {
    const res = await request(app)
      .post('/api/reviews')
      .send({ name: 'Test', message: 'Great!', stars: 5 });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });
});

describe('POST /api/feedback', () => {
  it('should reject empty feedback', async () => {
    const res = await request(app)
      .post('/api/feedback')
      .send({ message: '' });
    expect(res.status).toBe(400);
  });

  it('should accept valid feedback', async () => {
    const res = await request(app)
      .post('/api/feedback')
      .send({ type: 'suggestion', message: 'Add dark mode' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('POST /api/feedback/contact', () => {
  it('should reject incomplete contact form', async () => {
    const res = await request(app)
      .post('/api/feedback/contact')
      .send({ name: 'Test', email: '', message: '' });
    expect(res.status).toBe(400);
  });

  it('should reject invalid email', async () => {
    const res = await request(app)
      .post('/api/feedback/contact')
      .send({ name: 'Test', email: 'notanemail', message: 'Hello' });
    expect(res.status).toBe(400);
  });

  it('should accept valid contact form', async () => {
    const res = await request(app)
      .post('/api/feedback/contact')
      .send({ name: 'Test', email: 'test@test.com', message: 'Hello' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
