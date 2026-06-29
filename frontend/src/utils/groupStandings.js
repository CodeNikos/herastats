import { isFinishedGameEstado as isFinishedEstado } from './gameEstado';

export { isFinishedGameEstado } from './gameEstado';

/**
 * Clasificación por grupos alineada con la vista Estadísticas → Grupos.
 * Equivalente SQL (pgAdmin): backend/sql/group_standings_ranking.sql
 * Calcula orden por partidos terminados en fase de grupos dentro del grupo;
 * si no, usa campos persistidos del equipo (misma semántica que stats.js).
 *
 * Orden principal: puntos (3 victoria, 1 empate, 0 derrota).
 * Desempate a igual puntos: enfrentamiento directo en fase de grupos (solo partidos entre
 * empatados) → puntos H2H, diferencia de goles H2H, goles a favor H2H;
 * si no hubo esos partidos, diferencia de goles global del grupo.
 */

export function normalizeGroupName(groupValue) {
  const value = (groupValue || '').trim();
  if (!value) return '';
  if (value.toLowerCase().startsWith('grupo')) return value;
  return `Grupo ${value.toUpperCase()}`;
}

export function normalizeDivisionName(divisionValue) {
  const value = (divisionValue || '').trim();
  return value || 'Sin division';
}

/** Comparación de división sin distinguir mayúsculas (game.division vs selector en stats). */
export function divisionMatchesLabel(gameDivision, selectedDivision) {
  const a = normalizeDivisionName(gameDivision).toLowerCase();
  const b = normalizeDivisionName(selectedDivision).toLowerCase();
  return a === b;
}

/** Partido de fase de grupos: phas_num / phase_num = 1 o nombre tipo Groups/Grupo. */
export function isGroupPhaseGame(game) {
  const phasNum = Number(game?.phas_num ?? game?.phase_num ?? game?.phase_num_from_phase);
  if (phasNum === 1) return true;
  const text = String(game?.phase_name ?? game?.stage ?? game?.phase ?? '').toLowerCase().trim();
  return text.includes('grupo') || text.includes('group') || text === 'groups';
}

export function parseGoalsCell(value) {
  if (value == null || value === '') return 0;
  const n = parseInt(String(value).trim(), 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Puntos 3-1-0 a partir de PG, W y L. */
export function standingsPointsFromRecord(pg, wins, losses) {
  const w = Number(wins) || 0;
  const played = Number(pg) || 0;
  const l = Number(losses) || 0;
  const draws = Math.max(0, played - w - l);
  return w * 3 + draws;
}

/**
 * @param {Set<number>} teamIdsSet
 * @param {Array<object>} allGames
 * @param {string} divisionLabel
 */
function collectGroupPhaseHeadToHeadGames(teamIdsSet, allGames, divisionLabel) {
  const out = [];
  for (const g of allGames || []) {
    if (!isFinishedEstado(g.estado)) continue;
    if (!isGroupPhaseGame(g)) continue;
    if (!divisionMatchesLabel(g.division, divisionLabel)) continue;

    const localId = g.local != null ? Number(g.local) : NaN;
    const visitorId = g.visitor != null ? Number(g.visitor) : NaN;
    if (!Number.isFinite(localId) || !Number.isFinite(visitorId)) continue;
    if (!teamIdsSet.has(localId) || !teamIdsSet.has(visitorId)) continue;

    out.push(g);
  }
  return out;
}

/**
 * Estadísticas mini-liga solo con partidos entre equipos del conjunto `teamIds`.
 * @param {number[]} teamIds
 * @param {Array<object>} games
 * @returns {Map<number, { pts: number, gf: number, ga: number }>}
 */
function computeMiniLeagueStats(teamIds, games) {
  const idSet = new Set(teamIds.map((id) => Number(id)).filter((id) => Number.isFinite(id)));
  /** @type {Map<number, { pts: number, gf: number, ga: number }>} */
  const mini = new Map();
  idSet.forEach((id) => mini.set(id, { pts: 0, gf: 0, ga: 0 }));

  for (const g of games || []) {
    const localId = Number(g.local);
    const visitorId = Number(g.visitor);
    if (!idSet.has(localId) || !idSet.has(visitorId)) continue;

    const ls = parseGoalsCell(g.local_score);
    const vs = parseGoalsCell(g.visitor_score);
    const aLoc = mini.get(localId);
    const aVis = mini.get(visitorId);
    if (!aLoc || !aVis) continue;

    aLoc.gf += ls;
    aLoc.ga += vs;
    aVis.gf += vs;
    aVis.ga += ls;

    if (ls > vs) {
      aLoc.pts += 3;
    } else if (vs > ls) {
      aVis.pts += 3;
    } else {
      aLoc.pts += 1;
      aVis.pts += 1;
    }
  }

  return mini;
}

function miniGd(mini, teamId) {
  const s = mini.get(Number(teamId));
  if (!s) return 0;
  return s.gf - s.ga;
}

/**
 * Compara dos filas empatadas en puntos.
 * @param {{ id: string | number; name?: string; gd?: number; gf?: number }} a
 * @param {{ id: string | number; name?: string; gd?: number; gf?: number }} b
 * @param {Array<object>} h2hGames partidos de grupos entre equipos del bloque empatado
 * @param {number[]} tiedTeamIds todos los IDs del bloque empatado (mini-liga común)
 */
function compareTiedStandingsRows(a, b, h2hGames, tiedTeamIds) {
  if (!h2hGames.length) {
    if (b.gd !== a.gd) return b.gd - a.gd;
    if (b.gf !== a.gf) return b.gf - a.gf;
    return String(a.name || '').localeCompare(String(b.name || ''), 'es');
  }

  const mini = computeMiniLeagueStats(tiedTeamIds, h2hGames);
  const aId = Number(a.id);
  const bId = Number(b.id);
  const aMini = mini.get(aId) || { pts: 0, gf: 0, ga: 0 };
  const bMini = mini.get(bId) || { pts: 0, gf: 0, ga: 0 };

  if (bMini.pts !== aMini.pts) return bMini.pts - aMini.pts;

  const aMiniGd = miniGd(mini, aId);
  const bMiniGd = miniGd(mini, bId);
  if (bMiniGd !== aMiniGd) return bMiniGd - aMiniGd;

  if (bMini.gf !== aMini.gf) return bMini.gf - aMini.gf;

  if (b.gd !== a.gd) return b.gd - a.gd;
  if (b.gf !== a.gf) return b.gf - a.gf;
  return String(a.name || '').localeCompare(String(b.name || ''), 'es');
}

/**
 * Ordena filas con los mismos puntos aplicando desempate H2H o GD global.
 */
function sortStandingsCluster(cluster, allGames, divisionLabel) {
  if (cluster.length <= 1) return cluster;

  const tiedIds = new Set(cluster.map((t) => Number(t.id)).filter((id) => Number.isFinite(id)));
  const tiedTeamIds = [...tiedIds];
  const h2hGames = collectGroupPhaseHeadToHeadGames(tiedIds, allGames, divisionLabel);

  return [...cluster].sort((a, b) => compareTiedStandingsRows(a, b, h2hGames, tiedTeamIds));
}

function sortStandingsRows(rows, allGames, divisionLabel) {
  const byPoints = new Map();
  for (const row of rows) {
    const pts = Number(row.points) || 0;
    if (!byPoints.has(pts)) byPoints.set(pts, []);
    byPoints.get(pts).push(row);
  }

  const pointLevels = [...byPoints.keys()].sort((a, b) => b - a);
  const result = [];
  for (const pts of pointLevels) {
    const cluster = byPoints.get(pts) || [];
    result.push(...sortStandingsCluster(cluster, allGames, divisionLabel));
  }
  return result;
}

/**
 * @param {Array<{ id: string | number; name?: string; games?: number; wins?: number; losses?: number; group?: string; division?: string }>} groupTeams equipos ya filtrados a un mismo grupo
 * @param {Array<object>} allGames listado GET games del torneo
 * @param {string} divisionLabel división activa en la tabla
 */
export function buildGroupStandingsRows(groupTeams, allGames, divisionLabel) {
  const teamIdsInGroup = new Set(groupTeams.map((t) => Number(t.id)));

  /** @type {Map<number, { pg: number, w: number, l: number, gf: number, ga: number }>} */
  const agg = new Map();
  groupTeams.forEach((t) => {
    const tid = Number(t.id);
    if (Number.isFinite(tid)) {
      agg.set(tid, { pg: 0, w: 0, l: 0, gf: 0, ga: 0 });
    }
  });

  let innerGroupGames = 0;
  for (const g of allGames || []) {
    if (!isFinishedEstado(g.estado)) continue;
    if (!isGroupPhaseGame(g)) continue;
    if (!divisionMatchesLabel(g.division, divisionLabel)) continue;

    const localId = g.local != null ? Number(g.local) : NaN;
    const visitorId = g.visitor != null ? Number(g.visitor) : NaN;
    if (!Number.isFinite(localId) || !Number.isFinite(visitorId)) continue;
    if (!teamIdsInGroup.has(localId) || !teamIdsInGroup.has(visitorId)) continue;

    innerGroupGames++;
    const ls = parseGoalsCell(g.local_score);
    const vs = parseGoalsCell(g.visitor_score);

    const aLoc = agg.get(localId);
    const aVis = agg.get(visitorId);
    if (!aLoc || !aVis) continue;

    aLoc.pg++;
    aVis.pg++;
    aLoc.gf += ls;
    aLoc.ga += vs;
    aVis.gf += vs;
    aVis.ga += ls;

    if (ls > vs) {
      aLoc.w++;
      aVis.l++;
    } else if (vs > ls) {
      aVis.w++;
      aLoc.l++;
    }
  }

  const rows = groupTeams.map((t) => {
    const tid = Number(t.id);
    const fromAgg = agg.get(tid);

    let pg = fromAgg?.pg ?? 0;
    let wins = fromAgg?.w ?? 0;
    let losses = fromAgg?.l ?? 0;
    let gf = fromAgg?.gf ?? 0;
    let ga = fromAgg?.ga ?? 0;

    if (innerGroupGames === 0) {
      pg = Number(t.games) || 0;
      wins = Number(t.wins) || 0;
      losses = Number(t.losses) || 0;
      gf = 0;
      ga = 0;
    }

    const gd = gf - ga;
    const draws = Math.max(0, pg - wins - losses);
    const points = standingsPointsFromRecord(pg, wins, losses);
    return {
      ...t,
      pg,
      wins,
      losses,
      draws,
      points,
      gf,
      ga,
      gd
    };
  });

  const sorted = sortStandingsRows(rows, allGames, divisionLabel);

  return sorted.map((r, idx) => ({ ...r, rank: idx + 1 }));
}
