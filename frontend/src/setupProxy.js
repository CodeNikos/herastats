const { createProxyMiddleware } = require('http-proxy-middleware');

/**
 * Backend cuando el navegador usa rutas relativas bajo `/api`.
 * Si `REACT_APP_API_URL` está definida, el proxy usa el mismo host/puerto.
 */
function deriveProxyTarget() {
  const raw = process.env.REACT_APP_API_URL;
  if (raw) {
    try {
      const u = new URL(String(raw).trim());
      return `${u.protocol}//${u.host}`;
    } catch (_) {
      /* usar default */
    }
  }
  return 'http://localhost:5000';
}

/** Solo el API va al backend; evita mandar ahí ficheros HMR (*.hot-update.json). */
module.exports = function setupProxy(app) {
  const target = deriveProxyTarget();
  app.use(
    '/api',
    createProxyMiddleware({
      target,
      changeOrigin: true,
    })
  );
};
