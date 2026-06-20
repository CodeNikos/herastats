/**
 * Misma regla que en backend (`utils/userRoles.js`): variantes "super user", etc. → canonical.
 */

const ROLE_CONDENSED_TO_CANONICAL = {
  admin: 'admin',
  superuser: 'superuser',
  anotador: 'anotador'
};

/** @param {unknown} role */
export function normalizeRole(role) {
  const trimmed = String(role ?? '').trim().toLowerCase();
  if (!trimmed) return '';
  const condensed = trimmed.replace(/[\s_-]+/g, '');
  return ROLE_CONDENSED_TO_CANONICAL[condensed] ?? trimmed;
}

/** @param {unknown} user */
/** @returns {boolean} */
export function isSuperuser(user) {
  return normalizeRole(user?.role) === 'superuser';
}

/** @param {unknown} user */
/** @returns {boolean} */
export function isAdmin(user) {
  return normalizeRole(user?.role) === 'admin';
}

/** @param {unknown} user */
/** @returns {boolean} */
export function isAnotador(user) {
  return normalizeRole(user?.role) === 'anotador';
}

/** @param {unknown} user */
/** @returns {boolean} */
export function isAdminOrSuperuser(user) {
  const r = normalizeRole(user?.role);
  return r === 'admin' || r === 'superuser';
}

/**
 * @param {unknown} user
 * @param {string[]} allowedRoles
 * @returns {boolean}
 */
export function userHasAnyRole(user, allowedRoles) {
  const r = normalizeRole(user?.role);
  if (!r || !Array.isArray(allowedRoles) || allowedRoles.length === 0) return false;
  return allowedRoles.some((allowed) => normalizeRole(allowed) === r);
}
