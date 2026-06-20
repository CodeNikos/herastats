/**
 * URL pública del sitio para canonical, OG y sitemap en frontend.
 */
export function getSiteUrl() {
  const fromEnv = process.env.REACT_APP_SITE_URL;
  if (fromEnv && !String(fromEnv).includes('REACT_APP_')) {
    return String(fromEnv).replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/+$/, '');
  }
  return '';
}

export function buildCanonicalPath(pathname, search = '') {
  const base = getSiteUrl();
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const query = search ? (search.startsWith('?') ? search : `?${search}`) : '';
  return `${base}${path}${query}`;
}

export const DEFAULT_OG_IMAGE = '/Hera_logo.png';

export const DEFAULT_SITE_TITLE = 'Herastats';
export const DEFAULT_SITE_DESCRIPTION =
  'Estadísticas, calendarios, brackets y resultados en vivo para torneos de ultimate frisbee y fútbol.';
