const { assertTournamentEditAccess } = require('../services/tournamentAccess');

/**
 * Exige acceso al torneo en req.params.id (dueño o admin/superuser global).
 * Debe ir después de authenticate y requireTournamentAdmin/requireScorer.
 */
const requireTournamentEditAccess = async (req, res, next) => {
  try {
    const tournamentId = req.params.id ?? req.params.tournamentId;
    const result = await assertTournamentEditAccess(req, tournamentId);
    if (!result.ok) {
      return res.status(result.status).json({
        success: false,
        message: result.message
      });
    }
    req.tournament = result.tournament;
    return next();
  } catch (err) {
    console.error('[requireTournamentEditAccess]', err);
    return res.status(500).json({
      success: false,
      message: 'Error al comprobar acceso al torneo'
    });
  }
};

module.exports = {
  requireTournamentEditAccess
};
