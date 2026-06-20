/**

 * Hooks post-finalización de partido (extraídos de configController).

 */

const Game = require('../../models/Game');

const { isFinishedGameEstado } = require('../../utils/gameEstado');



/**

 * Propaga estadísticas de equipos, grupos y cruces cuando un partido finalizado cambia de marcador

 * o se actualiza desde la API / eventos.

 */

async function propagateFinishedGameStats(tournamentId, gameId, gameBefore, gameAfter) {

  if (!gameAfter || !isFinishedGameEstado(gameAfter.estado)) return;



  const oldL = Game.parseScoreIntForPlayoffWl(gameBefore?.local_score);

  const oldV = Game.parseScoreIntForPlayoffWl(gameBefore?.visitor_score);

  const newL = Game.parseScoreIntForPlayoffWl(gameAfter?.local_score);

  const newV = Game.parseScoreIntForPlayoffWl(gameAfter?.visitor_score);

  const oldLocal = Number.isFinite(oldL) ? oldL : 0;

  const oldVisitor = Number.isFinite(oldV) ? oldV : 0;

  const newLocal = Number.isFinite(newL) ? newL : 0;

  const newVisitor = Number.isFinite(newV) ? newV : 0;

  const scoresChanged = oldLocal !== newLocal || oldVisitor !== newVisitor;



  try {

    const stRes = await Game.applyFinishedGameTeamStandings(gameId, tournamentId);

    if (stRes?.applied) {

      gameAfter = (await Game.findById(gameId)) || gameAfter;

    }

  } catch (eSt) {

    console.warn('[game-stats] applyFinishedGameTeamStandings:', eSt.message);

  }



  if (scoresChanged) {

    try {

      await Game.reviseTeamStandingsAfterScoreChange(

        gameId,

        tournamentId,

        oldLocal,

        oldVisitor,

        newLocal,

        newVisitor

      );

    } catch (eRev) {

      console.warn('[game-stats] reviseTeamStandings:', eRev.message);

    }

  }



  try {

    await Game.runPsGameUpd(tournamentId, gameId, { force: scoresChanged });

  } catch (ePs) {

    console.warn('[game-stats] runPsGameUpd:', ePs.message);

  }



  try {

    await Game.propagatePlayoffWlAfterGameFinished(tournamentId, gameId);

  } catch (ePb) {

    console.warn('[game-stats] propagatePlayoff:', ePb.message);

  }

}



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

  finalizeGameScoresAndStandingsHooks,

  propagateFinishedGameStats

};


