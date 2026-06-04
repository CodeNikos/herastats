/**
 * Resolución de la URL base del API.
 * - En producción: solo REACT_APP_API_URL (o mismo default que local).
 * - En desarrollo: puede forzar perfil con localStorage (selector de entorno).
 *
 * Backend de pruebas (`npm run start:test`, `.env.test` suele usar puerto 5001):
 * arranca este frontend con `npm run start:test` para fijar `REACT_APP_API_URL` a `http://localhost:5001/api`.
 * Si usas sólo `npm start` sin variable ni perfil «test», el default es `localhost:5000`: podrías estar
 * llamando a un proceso viejo sin soporte TIMEOUT en `game_events`.
 */

export const DEV_API_PROFILE_KEY = 'herastats_dev_api_profile';

/** API típico local con BD principal (.env del backend habitual). */
export const DEV_API_PROFILE_LOCAL = 'local';

/** API de pruebas (.env.test, puerto 5001 por defecto). */
export const DEV_API_PROFILE_TEST = 'test';

function normalizeBase(url) {
  if (!url) return url;
  return String(url).replace(/\/+$/, '');
}

export function getDevApiLocalUrl() {
  return normalizeBase(
    process.env.REACT_APP_DEV_API_LOCAL || 'http://localhost:5000/api'
  );
}

export function getDevApiTestUrl() {
  return normalizeBase(
    process.env.REACT_APP_DEV_API_TEST || 'http://localhost:5001/api'
  );
}

export function getDevApiProfile() {
  return localStorage.getItem(DEV_API_PROFILE_KEY);
}

export function setDevApiProfile(profile) {
  if (profile === DEV_API_PROFILE_LOCAL || profile === DEV_API_PROFILE_TEST) {
    localStorage.setItem(DEV_API_PROFILE_KEY, profile);
  } else {
    localStorage.removeItem(DEV_API_PROFILE_KEY);
  }
}

/**
 * URL activa para todas las peticiones axios.
 */
export function resolveApiBaseUrl() {
  const localUrl = getDevApiLocalUrl();
  const testUrl = getDevApiTestUrl();

  if (process.env.NODE_ENV === 'production') {
    const prodUrl = normalizeBase(process.env.REACT_APP_API_URL);
    if (!prodUrl) {
      throw new Error(
        'REACT_APP_API_URL es obligatorio en producción. Configúralo antes de npm run build.'
      );
    }
    return prodUrl;
  }

  const profile = localStorage.getItem(DEV_API_PROFILE_KEY);
  if (profile === DEV_API_PROFILE_TEST) {
    return testUrl;
  }
  if (profile === DEV_API_PROFILE_LOCAL) {
    return localUrl;
  }

  const fromEnv = process.env.REACT_APP_API_URL;
  return normalizeBase(fromEnv) || localUrl;
}
