import { configService } from '../services/configService';

/**
 * Carga inventario de equipos y partidos para standings/slots en bracket.
 * @param {number|string} tournamentId
 * @returns {Promise<{ teams: object[], games: object[], gamesOk: boolean }>}
 */
export async function fetchTournamentStandingsInventory(tournamentId) {
  const [teamsResponse, gamesResponse] = await Promise.all([
    configService.getTeams(tournamentId),
    configService.getGames(tournamentId)
  ]);
  const teams = teamsResponse?.success ? teamsResponse?.data?.teams || [] : [];
  const gamesRaw = Array.isArray(gamesResponse?.data?.games) ? gamesResponse.data.games : [];
  return {
    teams,
    games: gamesRaw,
    gamesOk: Boolean(gamesResponse?.success)
  };
}
