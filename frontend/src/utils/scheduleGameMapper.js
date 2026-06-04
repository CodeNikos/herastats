import { normalizeDivisionName } from './groupStandings';
import { pickEstadoFromGame } from './gameEstado';
import { enrichScheduleParticipantFromSlots, rosterTeamIdForNavigation } from './schedulePlayoffSlotResolution';
import { buildTorneoTeamLookup, resolveParticipantTeamDisplay } from './teamDisplayResolution';

const isRankedCanvasBracketValue = (value) =>
  String(value ?? '').trim().toLowerCase() === 'ranked';

const divisionLabelIsMixto = (divisionBase) =>
  String(divisionBase ?? '').trim().toLowerCase().includes('mixto');

function normalizeTournamentGamesForSlots(tournamentGames) {
  return tournamentGames.map((g) => {
    const gn = g.game_num != null && g.game_num !== '' ? Number(g.game_num) : NaN;
    return {
      game_id: Number(g.game_id),
      game_num: Number.isFinite(gn) ? gn : null,
      division: normalizeDivisionName(String(g.division || '').trim()),
      local: g.local != null ? Number(g.local) : null,
      visitor: g.visitor != null ? Number(g.visitor) : null,
      local_score: g.local_score,
      visitor_score: g.visitor_score,
      estado: pickEstadoFromGame(g)
    };
  });
}

function mapSingleGameToScheduleRow(game, tournament, teamRows, teamLookup, tournamentGamesNormalized, options = {}) {
  const { variant = 'calendar' } = options;
  const localId = game.local != null ? Number(game.local) : null;
  const visitorId = game.visitor != null ? Number(game.visitor) : null;
  const divisionNorm = normalizeDivisionName(
    String(game.division || game.category || game.categoria || '').trim()
  );
  const rawSlotL = game.stats_slot_local ?? game.statsSlotLocal;
  const statsSlotLocal =
    rawSlotL != null && String(rawSlotL).trim() !== '' ? String(rawSlotL).trim() : '';
  const rawSlotV = game.stats_slot_visitor ?? game.statsSlotVisitor;
  const statsSlotVisitor =
    rawSlotV != null && String(rawSlotV).trim() !== '' ? String(rawSlotV).trim() : '';

  const localDisplay = enrichScheduleParticipantFromSlots(
    {
      teamId: localId,
      joinName: game.local_name,
      joinImage: game.local_image,
      statsSlotRaw: statsSlotLocal,
      teamLookup,
      teamsRows: teamRows,
      division: divisionNorm,
      tournamentGamesNormalized
    },
    resolveParticipantTeamDisplay
  );
  const visitorDisplay = enrichScheduleParticipantFromSlots(
    {
      teamId: visitorId,
      joinName: game.visitor_name,
      joinImage: game.visitor_image,
      statsSlotRaw: statsSlotVisitor,
      teamLookup,
      teamsRows: teamRows,
      division: divisionNorm,
      tournamentGamesNormalized
    },
    resolveParticipantTeamDisplay
  );

  const divisionBase =
    String(game.division || game.category || game.categoria || '').trim() || 'Sin categoria';
  const canvasBracket = game.canvas_bracket ?? game.canvasBracket;
  const appendRankeoCategorySuffix =
    variant === 'calendar' && isRankedCanvasBracketValue(canvasBracket) && !divisionLabelIsMixto(divisionBase);
  const categoryLabel = appendRankeoCategorySuffix ? `${divisionBase} · Rankeo` : divisionBase;

  const gameNumParsed =
    game.game_num != null && String(game.game_num).trim() !== '' ? Number(game.game_num) : NaN;

  const row = {
    id: Number(game.game_id),
    gameNum: Number.isFinite(gameNumParsed) && gameNumParsed > 0 ? gameNumParsed : null,
    tournamentId: Number(tournament.torneo_id),
    tournamentName: tournament.name || 'Torneo',
    date: String(game.game_date).split('T')[0],
    time: String(game.game_time || '').slice(0, 5),
    place: game.game_location || '',
    phaseName: game.phase_name || '',
    category: categoryLabel,
    homeTeamName: localDisplay.name,
    homeTeamImage: localDisplay.image,
    awayTeamName: visitorDisplay.name,
    awayTeamImage: visitorDisplay.image,
    homeTeamId: rosterTeamIdForNavigation(localId, localDisplay),
    awayTeamId: rosterTeamIdForNavigation(visitorId, visitorDisplay),
    homeScore: game.local_score,
    awayScore: game.visitor_score,
    estado: pickEstadoFromGame(game)
  };

  if (variant === 'anotacion') {
    row.canvasBracket = game.canvas_bracket != null ? String(game.canvas_bracket).trim() : '';
    row.placement =
      game.placement != null && String(game.placement).trim() !== '' ? String(game.placement).trim() : '';
  }

  return row;
}

/**
 * Mapea respuestas de torneos/equipos/partidos a filas de calendario o anotación.
 *
 * @param {{
 *   tournamentsData: object[],
 *   teamsResponses: PromiseSettledResult[],
 *   gameResponses: PromiseSettledResult[],
 *   variant?: 'calendar' | 'anotacion'
 * }} params
 */
export function mapTournamentGamesToScheduleRows({
  tournamentsData,
  teamsResponses,
  gameResponses,
  variant = 'calendar'
}) {
  const mergedGames = [];

  gameResponses.forEach((result, index) => {
    if (result.status !== 'fulfilled') return;
    const tournament = tournamentsData[index];
    const teamsResult = teamsResponses[index];
    const teamRows =
      teamsResult?.status === 'fulfilled' && teamsResult?.value?.success
        ? teamsResult.value?.data?.teams || []
        : [];
    const teamLookup = buildTorneoTeamLookup(teamRows);
    const tournamentGames = result.value?.data?.games || [];
    const tournamentGamesNormalized = normalizeTournamentGamesForSlots(tournamentGames);

    tournamentGames.forEach((game) => {
      mergedGames.push(
        mapSingleGameToScheduleRow(game, tournament, teamRows, teamLookup, tournamentGamesNormalized, {
          variant
        })
      );
    });
  });

  return mergedGames;
}
