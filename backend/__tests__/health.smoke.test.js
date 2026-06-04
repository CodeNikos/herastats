const request = require('supertest');

let app;

beforeAll(() => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-jest';
  app = require('../src/app');
});

describe('API smoke', () => {
  test('GET /api/health responde JSON', async () => {
    const res = await request(app).get('/api/health');
    expect([200, 503]).toContain(res.status);
    expect(res.body).toHaveProperty('message');
    expect(res.body).toHaveProperty('database');
  });

  test('ruta inexistente devuelve 404', async () => {
    const res = await request(app).get('/api/no-existe');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
