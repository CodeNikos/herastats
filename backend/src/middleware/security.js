const rateLimit = require('express-rate-limit');

const isProd = process.env.NODE_ENV === 'production';

/** Límite estricto en login y set-password (fuerza bruta). */
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 20 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.'
  },
  skip: () => process.env.NODE_ENV === 'test'
});

/** Límite general por IP en el API. */
const apiRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: isProd ? 300 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Demasiadas peticiones. Inténtalo más tarde.'
  },
  skip: () => process.env.NODE_ENV === 'test'
});

/** Límite en recolección de analytics (beacon público). */
const analyticsCollectRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: isProd ? 60 : 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Demasiadas peticiones de analytics.'
  },
  skip: () => process.env.NODE_ENV === 'test'
});

module.exports = {
  authRateLimiter,
  apiRateLimiter,
  analyticsCollectRateLimiter
};
