/**
 * Utilidades de rutas para enlaces que no pasan por React Router.
 */

export function appPath(relPath) {
  const normalized = relPath.startsWith('/') ? relPath : `/${relPath}`;
  return normalized === '/' ? '/' : normalized;
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
