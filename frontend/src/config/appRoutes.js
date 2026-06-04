/**
 * Prefijo `/test` en la URL del navegador solo en desarrollo con perfil API "test".
 * React Router usa basename `/test`; las rutas internas siguen siendo `/home`, `/login`, etc.
 */

import {
  DEV_API_PROFILE_LOCAL,
  DEV_API_PROFILE_TEST,
  getDevApiProfile,
} from './apiBaseUrl';

export const TEST_ROUTE_PREFIX = '/test';

/** Desarrollo + perfil forzado a API de pruebas (localStorage). */
export function isTestAppEnvironment() {
  return (
    process.env.NODE_ENV === 'development' &&
    getDevApiProfile() === DEV_API_PROFILE_TEST
  );
}

export function getRouterBasename() {
  return isTestAppEnvironment() ? TEST_ROUTE_PREFIX : '';
}

/**
 * Quita `/test` del pathname del navegador (no el de React Router ya normalizado).
 * `/test` → `/`, `/test/home` → `/home`; si no lleva prefijo, devuelve pathname tal cual.
 */
export function stripTestPrefix(pathname) {
  if (pathname === '/test') return '/';
  if (pathname.startsWith('/test/')) return pathname.slice(TEST_ROUTE_PREFIX.length);
  return pathname;
}

/**
 * Ruta absoluta en la barra de direcciones (con prefijo `/test` si aplica).
 * Idempotente: `appPath('/test/home')` en modo test sigue siendo `/test/home`.
 */
export function appPath(relPath) {
  const normalized = relPath.startsWith('/') ? relPath : `/${relPath}`;
  const stripped = stripTestPrefix(normalized);
  const suffix = stripped === '/' ? '/' : stripped;

  if (!isTestAppEnvironment()) {
    return suffix === '/' ? '/' : suffix;
  }

  if (suffix === '/') {
    return TEST_ROUTE_PREFIX;
  }
  return `${TEST_ROUTE_PREFIX}${suffix}`;
}

/**
 * Como `appPath` pero preserva query y fragmento en strings tipo `/stats?tournamentId=1`.
 */
export function appHref(pathWithQueryHash) {
  const s = pathWithQueryHash.startsWith('/')
    ? pathWithQueryHash
    : `/${pathWithQueryHash}`;
  const q = s.search(/[?#]/);
  if (q === -1) return appPath(s);
  const pathOnly = s.slice(0, q);
  const rest = s.slice(q);
  return appPath(pathOnly) + rest;
}

/**
 * Ensayar pathname + query + hash que correspondería al nuevo perfil (tras setDevApiProfile).
 */
export function rewriteBrowserPathForProfile(profile) {
  const { pathname, search, hash } = window.location;

  if (
    process.env.NODE_ENV !== 'production' &&
    profile === DEV_API_PROFILE_TEST
  ) {
    if (
      pathname === TEST_ROUTE_PREFIX ||
      pathname.startsWith(`${TEST_ROUTE_PREFIX}/`)
    ) {
      return `${pathname}${search}${hash}`;
    }
    const tail = pathname === '/' ? '/home' : pathname;
    return `${TEST_ROUTE_PREFIX}${tail}${search}${hash}`;
  }

  if (
    process.env.NODE_ENV !== 'production' &&
    profile === DEV_API_PROFILE_LOCAL
  ) {
    let p = pathname;
    if (p === TEST_ROUTE_PREFIX) p = '/home';
    else if (p.startsWith(`${TEST_ROUTE_PREFIX}/`)) {
      p = pathname.slice(TEST_ROUTE_PREFIX.length);
    }
    return `${p}${search}${hash}`;
  }

  return `${pathname}${search}${hash}`;
}

/**
 * Dev: si perfil URL y pathname del navegador no coinciden, redirige (replace).
 * Llamar una vez antes de montar Router. Devuelve true si se lanzó navegación.
 */
export function performDevBrowserPathSync() {
  if (typeof window === 'undefined' || process.env.NODE_ENV === 'production') {
    return false;
  }

  const { pathname, search, hash } = window.location;
  const wantsTest = isTestAppEnvironment();
  const underTest =
    pathname === TEST_ROUTE_PREFIX || pathname.startsWith(`${TEST_ROUTE_PREFIX}/`);

  if (wantsTest && !underTest) {
    const tail = pathname === '/' ? '/home' : pathname;
    window.location.replace(`${TEST_ROUTE_PREFIX}${tail}${search}${hash}`);
    return true;
  }

  if (!wantsTest && underTest) {
    const dest = pathname === TEST_ROUTE_PREFIX ? '/home' : pathname.slice(TEST_ROUTE_PREFIX.length);
    window.location.replace(`${dest}${search}${hash}`);
    return true;
  }

  return false;
}
