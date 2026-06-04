const { requireRole } = require('./auth');

/** Crear/editar estructura del torneo (equipos, fases, bracket, jugadores, partidos CRUD). */
const requireTournamentAdmin = requireRole('admin', 'superuser');

/** Anotación en vivo: eventos, reloj, estado, forfeit. */
const requireScorer = requireRole('admin', 'superuser', 'anotador');

module.exports = {
  requireTournamentAdmin,
  requireScorer
};
