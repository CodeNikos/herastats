const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');

const backendRoot = path.join(__dirname, '..');
const envFile = process.env.ENV_FILE || '.env';
const envPath = path.isAbsolute(envFile) ? envFile : path.join(backendRoot, envFile);
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
  if (envFile !== '.env') {
    console.warn(`ENV_FILE=${envFile} no encontrado en ${envPath}, usando dotenv por defecto`);
  }
}

const pool = require('./config/database');
const authRoutes = require('./routes/auth');
const configRoutes = require('./routes/config');
const spiritSurveyRoutes = require('./routes/spiritSurvey');
const userRoutes = require('./routes/users');
const sportsRoutes = require('./routes/sports');
const analyticsRoutes = require('./routes/analytics');
const { getSitemap } = require('./controllers/sitemapController');
const { apiRateLimiter } = require('./middleware/security');

const app = express();
const isProd = process.env.NODE_ENV === 'production';

if (isProd) {
  app.set('trust proxy', 1);
}

const parseCorsOrigins = () => {
  const raw = process.env.CORS_ORIGIN || 'http://localhost:3000';
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
};

const corsAllowed = parseCorsOrigins();

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  })
);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        if (isProd) {
          return callback(null, false);
        }
        return callback(null, true);
      }
      if (corsAllowed.includes(origin)) {
        return callback(null, true);
      }
      if (!isProd) {
        console.warn('CORS bloqueado para origen:', origin);
      }
      return callback(null, false);
    },
    credentials: true
  })
);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use('/api', apiRateLimiter);

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({
      message: 'Servidor funcionando correctamente',
      database: 'ok'
    });
  } catch (err) {
    res.status(503).json({
      message: 'Servidor activo pero base de datos no disponible',
      database: 'error',
      ...(isProd ? {} : { error: err.message })
    });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/config', configRoutes);
app.use('/api/spirit-survey', spiritSurveyRoutes);
app.use('/api/users', userRoutes);
app.use('/api/sports', sportsRoutes);
app.use('/api/analytics', analyticsRoutes);

app.get('/sitemap.xml', getSitemap);

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Ruta no encontrada' });
});

app.use((err, req, res, next) => {
  console.error('Error no manejado:', err);
  const msg =
    err.message && /Solo se permiten/i.test(err.message)
      ? err.message
      : 'Error interno del servidor';
  const status = /Solo se permiten/i.test(err.message || '') ? 400 : 500;
  res.status(status).json({ success: false, message: msg });
});

module.exports = app;
