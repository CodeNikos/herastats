/**
 * Configuración centralizada de JWT. Todos los sign/verify deben usar este módulo.
 */
const DEV_FALLBACK_SECRET = 'dev-only-insecure-jwt-secret-change-me';

function resolveJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (secret && String(secret).trim().length >= 16) {
    return String(secret).trim();
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'JWT_SECRET es obligatorio en producción (mínimo 16 caracteres). ' +
        'Genera uno con: openssl rand -base64 48'
    );
  }
  if (secret && String(secret).trim().length > 0) {
    console.warn('[jwt] JWT_SECRET corto; usa al menos 16 caracteres incluso en desarrollo.');
    return String(secret).trim();
  }
  if (process.env.NODE_ENV === 'test') {
    return process.env.JWT_SECRET_TEST || 'test-secret-for-jest-only';
  }
  console.warn('[jwt] JWT_SECRET no definido; usando valor solo para desarrollo local.');
  return DEV_FALLBACK_SECRET;
}

const JWT_SECRET = resolveJwtSecret();

function getJwtExpiresIn() {
  return process.env.JWT_EXPIRES_IN || '24h';
}

module.exports = {
  JWT_SECRET,
  getJwtExpiresIn,
  DEV_FALLBACK_SECRET
};
