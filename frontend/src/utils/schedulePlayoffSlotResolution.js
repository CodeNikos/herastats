/**
 * Resuelve nombre/imagen para filas tipo calendario/anotación cuando el playoff
 * indica plaza por grupos (`1A`) o resultado de otro partido (`W12`,`L7`),
 * usando la misma semántica que `PlacementsBracket.js`.
 */

import {
  buildGroupStandingsRows,
  normalizeDivisionName,
  normalizeGroupName,
  isFinishedGameEstado,
  parseGoalsCell
} from './groupStandings';
import {
  resolveParticipantTeamDisplay,
  teamNameLooksGenericPlaceholder
} from './teamDisplayResolution';

const TEAM_FALLBACK_IMAGE = '/Hera_logo.png';

const toPositiveTeamId = (value) => {
  const n = value != null && value !== '' ? Number(value) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Prioriza FK del partido (`local`/`visitor`); si no hay, usa el id resuelto por slots playoff (grupo / W·L jugado). */
export function rosterTeamIdForNavigation(fkTeamId, enrichedDisplay) {
  const fk = toPositiveTeamId(fkTeamId);
  if (fk != null) return fk;
  return toPositiveTeamId(enrichedDisplay?.rosterTeamId);
}

const toNumberSafe = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const readStat = (team, keys) => {
  for (const key of keys) {
    if (team?.[key] !== undefined && team?.[key] !== null && team?.[key] !== '') {
      return toNumberSafe(team[key]);
    }
  }
  return 0;
};

export const readDivision = (team) => {
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

const groupSlotLetterToken = (team) => {
  const display = normalizeGroupName(String(team.group || team.grupo || '').trim());
  if (!display) return '';
  const stripped = display.replace(/^grupo\s+/i, '').trim().toUpperCase();
  if (/^([A-Z])$/.test(stripped)) return stripped;
  const parts = stripped.split(/\s+/).filter(Boolean);
  const last = parts[parts.length - 1];
  if (/^([A-Z])$/.test(last)) return last;
  if (/^([A-Z])\d*$/.test(stripped)) return stripped[0];
  return stripped;
};

const teamMatchesGroupSlotToken = (team, tokenUpper) => {
  if (!tokenUpper) return false;
  const letterTok = groupSlotLetterToken(team);
  if (/^[A-Z]$/.test(tokenUpper)) return letterTok === tokenUpper;
  const displayUpper = normalizeGroupName(String(team.group || team.grupo || '').trim()).toUpperCase();
  const stripped = displayUpper.replace(/^GRUPO\s+/, '').trim();
  return letterTok === tokenUpper || stripped === tokenUpper;
};

export function parseStatsSlotDescriptor(raw) {
  const s = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
  if (!s) return null;

  let m = s.match(/^(\d{1,2})([A-Z0-9]+)$/);
  if (m) return { type: 'groupRank', rank: Number(m[1]), groupToken: m[2] };
  m = s.match(/^([A-Z0-9]+)(\d{1,2})$/);
  if (m) return { type: 'groupRank', rank: Number(m[2]), groupToken: m[1] };
  m = s.match(/^([A-Z0-9]+)-(\d{1,2})$/);
  if (m) return { type: 'groupRank', rank: Number(m[2]), groupToken: m[1] };
  return null;
}

export function parseBracketAdvanceSlotDescriptor(raw) {
  const s = String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!s) return null;
  const m = s.match(/^([WL])(\d+)$/);
  if (!m) return null;
  const gameNum = Number(m[2]);
  if (!Number.isInteger(gameNum) || gameNum <= 0) return null;
  return { outcome: m[1] === 'L' ? 'loser' : 'winner', gameNum };
}

/**
 * Igual orden que estadísticas grupos (`buildGroupStandingsRows`).
 */
export function resolveGroupStandingsCandidate(slotTrim, teams, division, normalizedGames = [], options = {}) {
  const parsed = parseStatsSlotDescriptor(slotTrim);
  if (!parsed || !Array.isArray(teams)) return null;
  const token = String(parsed.groupToken || '').toUpperCase();

  const pool = [];
  for (const raw of teams) {
    if (!divisionMatchesSelection(raw, division)) continue;
    if (!teamMatchesGroupSlotToken(raw, token)) continue;

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

  const rows = buildGroupStandingsRows(pool, Array.isArray(normalizedGames) ? normalizedGames : [], division || '');
  const idx = parsed.rank - 1;
  if (idx < 0 || idx >= rows.length) return null;
  const row = rows[idx];
  return {
    teamId: Number(row.id),
    name: row.name || 'Equipo',
    image: row.url_imagen ? String(row.url_imagen).trim() : TEAM_FALLBACK_IMAGE
  };
}

function findGameByBracketNumber(normGames, gameNum) {
  for (const g of normGames || []) {
    const n = g.game_num != null ? Number(g.game_num) : NaN;
    if (Number.isFinite(n) && n === gameNum) return g;
  }
  return null;
}

function bracketAdvanceWinnerLoserTeamIds(source) {
  if (!source || !isFinishedGameEstado(source.estado)) return null;
  const ls = parseGoalsCell(source.local_score);
  const vs = parseGoalsCell(source.visitor_score);
  if (!Number.isFinite(ls) || !Number.isFinite(vs) || ls === vs) return null;
  const localId = source.local != null ? Number(source.local) : NaN;
  const visitorId = source.visitor != null ? Number(source.visitor) : NaN;
  if (!Number.isFinite(localId) || !Number.isFinite(visitorId)) return null;

  const winId = ls > vs ? localId : visitorId;
  const loseId = ls > vs ? visitorId : localId;
  return { winId, loseId };
}

function resolveBracketAdvanceFromSlot(slotTrim, normalizedGamesWithNum, teamLookup, divisionPref) {
  const d = parseBracketAdvanceSlotDescriptor(slotTrim);
  if (!d || !normalizedGamesWithNum?.length) return null;

  const candidates = normalizedGamesWithNum.filter(
    (row) =>
      Number.isFinite(Number(row.game_num)) &&
      Number(row.game_num) === d.gameNum &&
      normalizeDivisionName(String(row.division ?? '').trim() || '') ===
        normalizeDivisionName(String(divisionPref ?? '').trim() || '')
  );
  /** Si no coincide división exacta (datos incompletos), usar primer partido con ese número. */
  const source =
    candidates.length > 0
      ? candidates[0]
      : findGameByBracketNumber(normalizedGamesWithNum, d.gameNum);
  if (!source) return { mode: 'label', tag: `${d.outcome === 'loser' ? 'L' : 'W'}${d.gameNum}` };

  const ids = bracketAdvanceWinnerLoserTeamIds(source);
  if (!ids)
    return { mode: 'label', tag: `${d.outcome === 'loser' ? 'L' : 'W'}${d.gameNum}` };

  const tid = d.outcome === 'loser' ? ids.loseId : ids.winId;
  const roster = teamLookup?.get?.(tid);
  const nm = roster?.name && String(roster.name).trim() !== '' ? String(roster.name).trim() : null;
  return {
    mode: 'team',
    tag: `${d.outcome === 'loser' ? 'L' : 'W'}${d.gameNum}`,
    name: nm,
    image: roster?.image || TEAM_FALLBACK_IMAGE,
    teamId: tid
  };
}

function wantsStatsSlotFallback(basePreview, statsSlotRaw, fkTeamId) {
  const slot = statsSlotRaw != null ? String(statsSlotRaw).trim() : '';
  if (!slot) return false;
  if (teamNameLooksGenericPlaceholder(basePreview?.name || '')) return true;
  /** Sin equipo fijo en `game.local` / `visitor`: el LEFT JOIN no puede devolver nombre. */
  const fk = fkTeamId != null && fkTeamId !== '' ? Number(fkTeamId) : NaN;
  return !Number.isFinite(fk) || fk <= 0;
}

/**
 * Une JOIN + roster + `stats_slot_local` / `stats_slot_visitor` playoff.
 *
 * @param {{
 *   teamId: number|null,
 *   joinName?: string|null,
 *   joinImage?: string|null,
 *   statsSlotRaw?: string|null,
 *   teamLookup: Map<number, { name: string, image: string }>,
 *   teamsRows: object[],
 *   division: string,
 *   tournamentGamesNormalized: Array<{
 *     game_id: number,
 *     game_num: number|null,
 *     division: string,
 *     local: number|null,
 *     visitor: number|null,
 *     local_score: *,
 *     visitor_score: *,
 *     estado?: *
 *   }>
 * }} opts
 * @param {typeof import('./teamDisplayResolution').resolveParticipantTeamDisplay} [resolveBase]
 */
export function enrichScheduleParticipantFromSlots(opts, resolveBase = resolveParticipantTeamDisplay) {
  const {
    teamId,
    joinName,
    joinImage,
    statsSlotRaw,
    teamLookup,
    teamsRows,
    division,
    tournamentGamesNormalized,
    cardStatsByTeamId
  } = opts;

  const base = resolveBase(teamId, joinName, joinImage, teamLookup);
  const slot = statsSlotRaw != null ? String(statsSlotRaw).trim() : '';
  const fromFk = toPositiveTeamId(teamId);

  if (!wantsStatsSlotFallback(base, statsSlotRaw, teamId) || !slot) {
    return { ...base, rosterTeamId: fromFk };
  }

  const divLab = normalizeDivisionName(String(division || '').trim() || '');

  const groupCandidate = resolveGroupStandingsCandidate(
    slot,
    teamsRows || [],
    divLab,
    tournamentGamesNormalized,
    { cardStatsByTeamId }
  );
  if (groupCandidate?.name?.trim()) {
    const rid = toPositiveTeamId(groupCandidate.teamId);
    return {
      name: groupCandidate.name.trim(),
      image: groupCandidate.image || base.image,
      rosterTeamId: rid != null ? rid : fromFk
    };
  }

  const adv = resolveBracketAdvanceFromSlot(slot, tournamentGamesNormalized, teamLookup, divLab);
  if (adv?.mode === 'team') {
    const ridBracket = toPositiveTeamId(adv.teamId);
    const nm = adv.name && String(adv.name).trim() !== '' ? String(adv.name).trim() : '';
    if (nm) {
      return { name: nm, image: adv.image || base.image, rosterTeamId: ridBracket ?? fromFk };
    }
    if (adv.tag) return { name: adv.tag, image: base.image, rosterTeamId: ridBracket ?? fromFk };
  }
  if (adv?.mode === 'label' && adv.tag) return { name: adv.tag, image: base.image, rosterTeamId: fromFk };

  const parsedGroup = parseStatsSlotDescriptor(slot);
  if (
    parsedGroup &&
    (teamNameLooksGenericPlaceholder(base.name) || base.name === 'A definir')
  ) {
    const shortLabel = `${parsedGroup.rank}${parsedGroup.groupToken}`;
    return { name: shortLabel, image: base.image, rosterTeamId: fromFk };
  }

  return { ...base, rosterTeamId: fromFk };
}

const normalizeGroupLabel = (groupName) => {
  const value = String(groupName || '').trim();
  return value.replace(/^grupo\s+/i, '').trim() || value;
};

/**
 * Resuelve slot de grupo (1A, 2B, 3E) al formato de equipo usado en PlacementsBracket.
 */
export function resolveStatsSlotToTeam(descriptor, teams, selectedDivision, allGames = [], options = {}) {
  const candidate = resolveGroupStandingsCandidate(
    descriptor,
    teams,
    selectedDivision,
    allGames,
    options
  );
  if (!candidate) return null;
  const parsed = parseStatsSlotDescriptor(descriptor);
  const gName = String(
    teams.find((t) => String(t.team_id ?? t.id) === String(candidate.teamId))?.group ||
      teams.find((t) => String(t.team_id ?? t.id) === String(candidate.teamId))?.grupo ||
      ''
  ).trim();
  return {
    id: String(candidate.teamId),
    name: candidate.name || 'Equipo',
    seed: parsed?.type === 'groupRank' ? `${normalizeGroupLabel(gName)}-${parsed.rank}` : '',
    flag: candidate.image || TEAM_FALLBACK_IMAGE
  };
}
