/**
 * Hooks post-finalización de partido (extraídos de configController).
 */
const Game = require('../../models/Game');

async function finalizeGameScoresAndStandingsHooks(tournamentId, gameId) {
  let psGameUpdResult = null;
  let psGameUpdOk = false;

  try {
    await Game.refreshScoresFromGoalEvents(gameId);
  } catch (eRf) {
    console.warn('[team-standings] refreshScoresFromGoalEvents:', eRf.message);
  }

  try {
    psGameUpdResult = await Game.runPsGameUpd(tournamentId, gameId);
    psGameUpdOk = psGameUpdResult?.ok === true;
    if (psGameUpdResult?.ok && !psGameUpdResult.skipped) {
      console.log('[ps_game_upd] aplicado', {
        tournamentId,
        gameId,
        ga_num: psGameUpdResult.ga_num,
        phase_num: psGameUpdResult.phase_num
      });
    }
  } catch (ePs) {
    console.warn('[ps_game_upd]', ePs.message, { tournamentId, gameId });
  }

  if (!psGameUpdOk) {
    try {
      await Game.propagatePlayoffWlAfterGameFinished(tournamentId, gameId);
    } catch (ePb) {
      console.warn('[playoff-propagate]', ePb.message);
    }
    try {
      const stRes = await Game.applyFinishedGameTeamStandings(gameId, tournamentId);
      if (
        stRes &&
        !stRes.applied &&
        stRes.reason &&
        stRes.reason !== 'already_recorded'
      ) {
        console.warn('[team-standings] no aplicado:', stRes.reason, { gameId, tournamentId });
      }
    } catch (eSt) {
      console.error('[team-standings]', eSt.message);
    }
  }

  return { ps_game_upd_ok: psGameUpdOk, ps_game_upd: psGameUpdResult };
}

module.exports = {
  finalizeGameScoresAndStandingsHooks
};
