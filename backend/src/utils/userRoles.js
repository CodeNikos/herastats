/**
 * Roles que reciben el listado completo de torneos (GET /config/tournament con sesión).
 */
const TOURNAMENT_LIST_ALL_ROLES = new Set(['admin', 'superuser', 'anotador']);

/**
 * Pueden actuar como dueños en cualquier torneo (ver/editar funciones restringidas por created_by).
 */
const TOURNAMENT_GLOBAL_ACCESS_ROLES = new Set(['admin', 'superuser']);

/**
 * Tras quitar espacios, guiones y guiones bajos debe coincidir con una clave canónica
 * (p. ej. "super user", "super-user", "SUPER_USER" → superuser).
 */
const ROLE_CONDENSED_TO_CANONICAL = {
  admin: 'admin',
  superuser: 'superuser',
  anotador: 'anotador'
};

function normalizeRole(role) {
  const trimmed = String(role ?? '').trim().toLowerCase();
  if (!trimmed) return '';
  const condensed = trimmed.replace(/[\s_-]+/g, '');
  return ROLE_CONDENSED_TO_CANONICAL[condensed] ?? trimmed;
}

function canListAllTournaments(role) {
  return TOURNAMENT_LIST_ALL_ROLES.has(normalizeRole(role));
}

function hasGlobalTournamentAccess(role) {
  return TOURNAMENT_GLOBAL_ACCESS_ROLES.has(normalizeRole(role));
}

module.exports = {
  TOURNAMENT_LIST_ALL_ROLES,
  TOURNAMENT_GLOBAL_ACCESS_ROLES,
  normalizeRole,
  canListAllTournaments,
  hasGlobalTournamentAccess
};
