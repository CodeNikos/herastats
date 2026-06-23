/**
 * Mejores terceros entre grupos (reglas tipo Copa del Mundo).
 * Criterios de desempate, en orden estricto:
 * 1. Puntos en fase de grupos (3-1-0)
 * 2. Diferencia de goles
 * 3. Goles a favor
 * 4. Fair play (menos tarjetas amarillas/rojas = puntuación más alta)
 */

import { buildGroupStandingsRows, normalizeGroupName } from './groupStandings';

/** Letras de grupo estándar (12 grupos, p. ej. Copa del Mundo). */
export const WORLD_CUP_GROUP_LETTERS = Object.freeze([
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
  'I',
  'J',
  'K',
  'L'
]);

/** Combinaciones oficiales: slot → grupos cuyos 3.º se comparan entre sí. */
export const BEST_THIRD_PLACE_COMBINATIONS = Object.freeze([
  { slot: '3ABCDF', groups: ['A', 'B', 'C', 'D', 'F'] },
  { slot: '3CDFGH', groups: ['C', 'D', 'F', 'G', 'H'] },
  { slot: '3CEFHI', groups: ['C', 'E', 'F', 'H', 'I'] },
  { slot: '3EHIJK', groups: ['E', 'H', 'I', 'J', 'K'] },
  { slot: '3BEFIJ', groups: ['B', 'E', 'F', 'I', 'J'] },
  { slot: '3AEHIJ', groups: ['A', 'E', 'H', 'I', 'J'] },
  { slot: '3EFGIJ', groups: ['E', 'F', 'G', 'I', 'J'] },
  { slot: '3DEIJL', groups: ['D', 'E', 'I', 'J', 'L'] }
]);

const groupSlotLetterToken = (team) => {
  const display = normalizeGroupName(String(team?.group || team?.grupo || '').trim());
  if (!display) return '';
  const stripped = display.replace(/^grupo\s+/i, '').trim().toUpperCase();
  if (/^([A-Z])$/.test(stripped)) return stripped;
  const parts = stripped.split(/\s+/).filter(Boolean);
  const last = parts[parts.length - 1];
  if (/^([A-Z])$/.test(last)) return last;
  if (/^([A-Z])\d*$/.test(stripped)) return stripped[0];
  return stripped;
};

export const teamMatchesGroupLetter = (team, letterUpper) => {
  if (!letterUpper) return false;
  const letterTok = groupSlotLetterToken(team);
  return letterTok === String(letterUpper).toUpperCase();
};

const readStat = (team, keys) => {
  for (const key of keys) {
    if (team?.[key] !== undefined && team?.[key] !== null && team?.[key] !== '') {
      const n = Number(team[key]);
      return Number.isFinite(n) ? n : 0;
    }
  }
  return 0;
};

const readDivision = (team) => {
  const divisionValue = String(
    team?.division || team?.categoria || team?.category || team?.division_name || ''
  ).trim();
  return divisionValue || 'Sin division';
};

const divisionMatchesSelection = (team, selectedDivisionRaw) => {
  if (selectedDivisionRaw == null || String(selectedDivisionRaw).trim() === '') return true;
  const a = readDivision(team).trim().toLowerCase();
  const b = String(selectedDivisionRaw).trim().toLowerCase();
  return a === b;
};

/**
 * Puntuación fair play (mayor = mejor). Penalización simplificada FIFA:
 * -1 por amarilla, -3 adicionales por roja directa (≈ -4 por roja total en eventos).
 */
export function computeFairPlayScore(yellowCards, redCards) {
  const yc = Number(yellowCards) || 0;
  const rc = Number(redCards) || 0;
  return -(yc + rc * 3);
}

/**
 * @param {object} row fila de buildGroupStandingsRows
 * @param {{ yellowcards?: number, redcards?: number }} [cards]
 */
export function footballMetricsFromStandingsRow(row, cards = {}) {
  const pg = Number(row.pg) || 0;
  const wins = Number(row.wins) || 0;
  const losses = Number(row.losses) || 0;
  const draws = Math.max(0, pg - wins - losses);
  const points = wins * 3 + draws;
  const gd = Number(row.gd) || 0;
  const gf = Number(row.gf) || 0;
  const yellowcards = Number(cards.yellowcards ?? cards.yc) || 0;
  const redcards = Number(cards.redcards ?? cards.rc) || 0;

  return {
    points,
    gd,
    gf,
    draws,
    pg,
    wins,
    losses,
    yellowcards,
    redcards,
    fairPlayScore: computeFairPlayScore(yellowcards, redcards)
  };
}

/**
 * Compara dos candidatos a mejor tercero (retorno negativo si `a` va antes que `b`).
 * @param {{ metrics: ReturnType<typeof footballMetricsFromStandingsRow>, name?: string }} a
 * @param {{ metrics: ReturnType<typeof footballMetricsFromStandingsRow>, name?: string }} b
 */
export function compareBestThirdCandidates(a, b) {
  const ma = a.metrics;
  const mb = b.metrics;

  if (mb.points !== ma.points) return mb.points - ma.points;
  if (mb.gd !== ma.gd) return mb.gd - ma.gd;
  if (mb.gf !== ma.gf) return mb.gf - ma.gf;
  if (mb.fairPlayScore !== ma.fairPlayScore) return mb.fairPlayScore - ma.fairPlayScore;

  const rankA = Number(a.fifaRanking ?? ma.fifaRanking);
  const rankB = Number(b.fifaRanking ?? mb.fifaRanking);
  if (Number.isFinite(rankA) && Number.isFinite(rankB) && rankA !== rankB) {
    return rankA - rankB;
  }

  return String(a.name || '').localeCompare(String(b.name || ''), 'es');
}

/**
 * @param {string} raw ej. `3ABCDF`
 * @returns {{ type: 'bestThird', slot: string, groups: string[] } | null}
 */
export function parseBestThirdSlotDescriptor(raw) {
  const s = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
  if (!s) return null;

  const m = s.match(/^3([A-Z]{2,})$/);
  if (!m) return null;

  const groups = m[1].split('');
  if (groups.length < 2) return null;

  return { type: 'bestThird', slot: s, groups };
}

/**
 * Agrega tarjetas por equipo desde filas de stats/player-events.
 * @param {Array<{ team_id?: number, id?: number, yellowcards?: number, redcards?: number }>} playerRows
 * @returns {Map<number, { yellowcards: number, redcards: number }>}
 */
export function aggregateTeamCardStatsFromPlayerRows(playerRows) {
  /** @type {Map<number, { yellowcards: number, redcards: number }>} */
  const map = new Map();

  for (const row of playerRows || []) {
    const tid = Number(row.team_id ?? row.teamId ?? row.id);
    if (!Number.isFinite(tid) || tid <= 0) continue;

    const prev = map.get(tid) || { yellowcards: 0, redcards: 0 };
    prev.yellowcards += Number(row.yellowcards) || 0;
    prev.redcards += Number(row.redcards) || 0;
    map.set(tid, prev);
  }

  return map;
}

function rosterTeamForGroup(teams, groupLetter, division) {
  const pool = [];
  for (const raw of teams || []) {
    if (!divisionMatchesSelection(raw, division)) continue;
    if (!teamMatchesGroupLetter(raw, groupLetter)) continue;

    const idStr = String(raw.team_id ?? raw.id ?? '').trim();
    const idNum = Number(idStr);
    if (!idStr || !Number.isFinite(idNum)) continue;

    pool.push({
      id: idStr,
      name: raw.name || 'Equipo',
      division: readDivision(raw),
      group: normalizeGroupName(String(raw.group || raw.grupo || '').trim()),
      games:
        Number(raw.games) ||
        readStat(raw, ['games_played', 'played_games', 'played', 'pg', 'pj', 'games']),
      wins: Number(raw.wins) || readStat(raw, ['wins', 'won', 'victories', 'victorias', 'w']),
      losses: Number(raw.losses) || readStat(raw, ['losses', 'lost', 'derrotas', 'l']),
      url_imagen: raw.url_imagen
    });
  }
  return pool;
}

/**
 * Tercero clasificado de un grupo (posición 3 en la tabla).
 */
export function getThirdPlaceTeamFromGroup(groupLetter, teams, games, division, cardStatsByTeamId = null) {
  const pool = rosterTeamForGroup(teams, groupLetter, division);
  if (pool.length === 0) return null;

  const rows = buildGroupStandingsRows(pool, Array.isArray(games) ? games : [], division || '');
  const third = rows[2];
  if (!third) return null;

  const teamId = Number(third.id);
  const cards =
    cardStatsByTeamId instanceof Map
      ? cardStatsByTeamId.get(teamId) || {}
      : cardStatsByTeamId?.[teamId] || {};

  return {
    teamId,
    name: third.name || 'Equipo',
    image: third.url_imagen ? String(third.url_imagen).trim() : '',
    groupLetter: String(groupLetter).toUpperCase(),
    standingsRow: third,
    metrics: footballMetricsFromStandingsRow(third, cards)
  };
}

/**
 * Mejor tercero entre los grupos indicados (p. ej. ['A','B','C','D','F']).
 */
export function pickBestThirdAmongGroups(groups, teams, games, division, cardStatsByTeamId = null) {
  const letters = (groups || []).map((g) => String(g).trim().toUpperCase()).filter(Boolean);
  if (letters.length === 0) return null;

  const candidates = [];
  for (const letter of letters) {
    const third = getThirdPlaceTeamFromGroup(letter, teams, games, division, cardStatsByTeamId);
    if (third) candidates.push(third);
  }

  if (candidates.length === 0) return null;

  const sorted = [...candidates].sort(compareBestThirdCandidates);
  return sorted[0];
}

/**
 * Resuelve slot tipo `3ABCDF` al equipo ganador del pool.
 */
export function resolveBestThirdPlaceSlot(slotRaw, teams, games, division, cardStatsByTeamId = null) {
  const parsed = parseBestThirdSlotDescriptor(slotRaw);
  if (!parsed) return null;

  const winner = pickBestThirdAmongGroups(parsed.groups, teams, games, division, cardStatsByTeamId);
  if (!winner) return null;

  return {
    slot: parsed.slot,
    groups: parsed.groups,
    teamId: winner.teamId,
    name: winner.name,
    image: winner.image,
    groupLetter: winner.groupLetter,
    metrics: winner.metrics
  };
}

/**
 * Letras de grupo presentes en la división (orden alfabético).
 * Si no hay datos, devuelve las 12 letras estándar A–L.
 */
export function discoverGroupLetters(teams, division) {
  const letters = new Set();
  for (const team of teams || []) {
    if (!divisionMatchesSelection(team, division)) continue;
    const letter = groupSlotLetterToken(team);
    if (/^[A-Z]$/.test(letter)) letters.add(letter);
  }

  if (letters.size === 0) return [...WORLD_CUP_GROUP_LETTERS];

  return [...letters].sort((a, b) => a.localeCompare(b, 'en'));
}

/**
 * Terceros clasificados de cada grupo (uno por letra).
 */
export function collectAllThirdPlaceTeams(
  teams,
  games,
  division,
  cardStatsByTeamId = null,
  groupLetters = null
) {
  const letters = groupLetters?.length ? groupLetters : discoverGroupLetters(teams, division);
  const thirds = [];

  for (const letter of letters) {
    const third = getThirdPlaceTeamFromGroup(letter, teams, games, division, cardStatsByTeamId);
    if (third) thirds.push(third);
  }

  return thirds;
}

/**
 * Ordena globalmente los terceros (mejor primero) y asigna `globalRank`.
 */
export function rankThirdPlaceTeamsGlobally(thirdPlaceTeams) {
  const sorted = [...(thirdPlaceTeams || [])].sort(compareBestThirdCandidates);
  return sorted.map((team, index) => ({
    ...team,
    globalRank: index + 1
  }));
}

/**
 * Los 8 mejores terceros entre todos los grupos (p. ej. 12 candidatos → top 8).
 */
export function pickTopEightThirdPlaceTeams(
  teams,
  games,
  division,
  cardStatsByTeamId = null,
  groupLetters = null
) {
  const ranked = rankThirdPlaceTeamsGlobally(
    collectAllThirdPlaceTeams(teams, games, division, cardStatsByTeamId, groupLetters)
  );
  return ranked.slice(0, 8);
}

/**
 * Clave de combinación para los 8 clasificados: `3` + letras de grupo ordenadas.
 * Ej.: ['F','A','C','B'] → `3ABCF…`
 */
export function buildBestThirdCombinationKey(groupLetters) {
  const letters = (groupLetters || [])
    .map((g) => String(g).trim().toUpperCase())
    .filter((g) => /^[A-Z]$/.test(g));
  if (letters.length === 0) return '';
  return `3${[...new Set(letters)].sort((a, b) => a.localeCompare(b, 'en')).join('')}`;
}

/**
 * Calcula los 8 mejores terceros (una entrada por combinación oficial).
 */
export function computeAllBestThirdPlaceResults(teams, games, division, cardStatsByTeamId = null) {
  return BEST_THIRD_PLACE_COMBINATIONS.map(({ slot, groups }) => {
    const winner = pickBestThirdAmongGroups(groups, teams, games, division, cardStatsByTeamId);
    return {
      slot,
      groups,
      team: winner
        ? {
            teamId: winner.teamId,
            name: winner.name,
            image: winner.image,
            groupLetter: winner.groupLetter,
            metrics: winner.metrics
          }
        : null
    };
  });
}

/**
 * Panel completo: ranking global de terceros, top 8 y slots FIFA oficiales.
 */
export function computeBestThirdPlaceDashboard(teams, games, division, cardStatsByTeamId = null) {
  const groupLetters = discoverGroupLetters(teams, division);
  const allThirdsRanked = rankThirdPlaceTeamsGlobally(
    collectAllThirdPlaceTeams(teams, games, division, cardStatsByTeamId, groupLetters)
  );
  const qualifiedEight = allThirdsRanked.slice(0, 8);
  const qualifiedGroupLetters = new Set(qualifiedEight.map((t) => t.groupLetter));
  const allThirdsWithFlag = allThirdsRanked.map((team) => ({
    ...team,
    qualified: qualifiedGroupLetters.has(team.groupLetter)
  }));

  return {
    groupLetters,
    allThirds: allThirdsWithFlag,
    qualifiedEight,
    combinationKey: buildBestThirdCombinationKey(qualifiedEight.map((t) => t.groupLetter)),
    slotResults: computeAllBestThirdPlaceResults(teams, games, division, cardStatsByTeamId)
  };
}
