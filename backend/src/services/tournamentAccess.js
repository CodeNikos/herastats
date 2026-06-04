const TournamentConfig = require('../models/TournamentConfig');
const { hasGlobalTournamentAccess } = require('../utils/userRoles');

/**
 * Dueño del torneo (created_by) o rol con acceso global (admin/superuser).
 */
async function assertTournamentEditAccess(req, tournamentId) {
  const userEmail = req.user?.email;
  const userRole = req.user?.role;
  if (!userEmail) {
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
  const isOwner =
    String(tournament.created_by || '').toLowerCase() === String(userEmail).toLowerCase();
  if (!isOwner && !hasGlobalTournamentAccess(userRole)) {
    return {
      ok: false,
      status: 403,
      message: 'No autorizado para este torneo'
    };
  }
  return { ok: true, tournament };
}

module.exports = {
  assertTournamentEditAccess
};
