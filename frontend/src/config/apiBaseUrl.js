/**
 * Resolución de la URL base del API.
 * - En producción: REACT_APP_API_URL es obligatorio.
 * - En desarrollo: REACT_APP_API_URL o http://localhost:5000/api por defecto.
 */

function normalizeBase(url) {
  if (!url) return url;
  return String(url).replace(/\/+$/, '');
}

/**
 * URL activa para todas las peticiones axios.
 */
export function resolveApiBaseUrl() {
  if (process.env.NODE_ENV === 'production') {
    const prodUrl = normalizeBase(process.env.REACT_APP_API_URL);
    if (!prodUrl) {
      throw new Error(
        'REACT_APP_API_URL es obligatorio en producción. Configúralo antes de npm run build.'
      );
    }
    return prodUrl;
  }

  const fromEnv = process.env.REACT_APP_API_URL;
  return normalizeBase(fromEnv) || 'http://localhost:5000/api';
}
