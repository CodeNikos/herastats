describe('dbConfig', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  test('usa DATABASE_URL cuando está definida', () => {
    process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/herastats';
    process.env.NODE_ENV = 'development';
    delete process.env.DB_HOST;

    const { getPoolConfig } = require('./dbConfig');
    const cfg = getPoolConfig();

    expect(cfg.connectionString).toBe(process.env.DATABASE_URL);
    expect(cfg.ssl).toBeUndefined();
  });

  test('activa SSL para host remoto sin sslmode en la URL', () => {
    process.env.DATABASE_URL = 'postgres://user:pass@db.seenode.com:5432/herastats';
    process.env.NODE_ENV = 'development';
    delete process.env.DB_SSL;

    const { getPoolConfig } = require('./dbConfig');
    const cfg = getPoolConfig();

    expect(cfg.ssl).toEqual({ rejectUnauthorized: false });
  });

  test('activa SSL con sslmode=require en DATABASE_URL aunque no sea producción', () => {
    process.env.DATABASE_URL =
      'postgres://user:pass@host.seenode.com:5432/herastats?sslmode=require';
    process.env.NODE_ENV = 'development';

    const { getPoolConfig } = require('./dbConfig');
    const cfg = getPoolConfig();

    expect(cfg.ssl).toEqual({ rejectUnauthorized: false });
  });

  test('activa SSL en producción con DATABASE_URL', () => {
    process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/herastats';
    process.env.NODE_ENV = 'production';

    const { getPoolConfig } = require('./dbConfig');
    const cfg = getPoolConfig();

    expect(cfg.ssl).toEqual({ rejectUnauthorized: false });
  });

  test('DB_SSL=false desactiva SSL aunque sea producción', () => {
    process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/herastats';
    process.env.NODE_ENV = 'production';
    process.env.DB_SSL = 'false';

    const { getPoolConfig } = require('./dbConfig');
    const cfg = getPoolConfig();

    expect(cfg.ssl).toBe(false);
  });

  test('usa variables DB_* cuando no hay DATABASE_URL', () => {
    delete process.env.DATABASE_URL;
    process.env.DB_HOST = 'localhost';
    process.env.DB_PORT = '5432';
    process.env.DB_NAME = 'herastats';
    process.env.DB_USER = 'herastats_user';
    process.env.DB_PASSWORD = 'secret';
    process.env.NODE_ENV = 'development';

    const { getPoolConfig } = require('./dbConfig');
    const cfg = getPoolConfig();

    expect(cfg).toMatchObject({
      host: 'localhost',
      port: 5432,
      database: 'herastats',
      user: 'herastats_user',
      password: 'secret'
    });
    expect(cfg.ssl).toBeUndefined();
  });
});
