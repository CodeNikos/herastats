const TournamentConfig = require('../models/TournamentConfig');
const TournamentMember = require('../models/TournamentMember');
const { hasGlobalTournamentAccess, normalizeRole } = require('../utils/userRoles');

/**
 * Dueño (created_by), miembro asignado o superuser global.
 */
async function assertTournamentEditAccess(req, tournamentId) {
  const userEmail = req.user?.email;
  const userId = req.user?.id;
  const userRole = req.user?.role;
  if (!userEmail || !userId) {
    return { ok: false, status: 401, message: 'Usuario no autenticado' };
  }
  const tid = parseInt(tournamentId, 10);
  if (!Number.isFinite(tid) || tid <= 0) {
    return { ok: false, status: 400, message: 'ID de torneo inválido' };
  }
  const tournament = await TournamentConfig.findById(tid);
  if (!tournament) {
    return { ok: false, status: 404, message: 'Torneo no encontrado' };
  }

  if (hasGlobalTournamentAccess(userRole)) {
    return { ok: true, tournament };
  }

  const isOwner =
    String(tournament.created_by || '').toLowerCase() === String(userEmail).toLowerCase();
  if (isOwner) {
    return { ok: true, tournament };
  }

  const isMember = await TournamentMember.hasAccess(userId, tid);
  if (!isMember) {
    return {
      ok: false,
      status: 403,
      message: 'No autorizado para este torneo'
    };
  }

  return { ok: true, tournament };
}

/**
 * Comprueba si el usuario puede invitar o gestionar miembros en un torneo.
 */
async function assertTournamentInviteAccess(req, tournamentId) {
  const base = await assertTournamentEditAccess(req, tournamentId);
  if (!base.ok) return base;

  const role = normalizeRole(req.user?.role);
  if (role === 'superuser' || role === 'admin') {
    return base;
  }

  return {
    ok: false,
    status: 403,
    message: 'Solo superuser o admin pueden invitar usuarios al torneo'
  };
}

module.exports = {
  assertTournamentEditAccess,
  assertTournamentInviteAccess
};
