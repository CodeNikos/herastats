const { getMinPasswordLength, validatePassword } = require('./passwordPolicy');

describe('passwordPolicy', () => {
  const prevEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = prevEnv;
    delete process.env.MIN_PASSWORD_LENGTH;
  });

  test('producción exige al menos 10 caracteres por defecto', () => {
    process.env.NODE_ENV = 'production';
    expect(getMinPasswordLength()).toBe(10);
    expect(validatePassword('short').ok).toBe(false);
    expect(validatePassword('longenough1').ok).toBe(true);
  });

  test('desarrollo exige al menos 8 por defecto', () => {
    process.env.NODE_ENV = 'development';
    expect(getMinPasswordLength()).toBe(8);
    expect(validatePassword('1234567').ok).toBe(false);
    expect(validatePassword('12345678').ok).toBe(true);
  });
});
