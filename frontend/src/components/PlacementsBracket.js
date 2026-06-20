import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useGameMatchScore } from '../hooks/useGameMatchScore';
import { configService } from '../services/configService';
import {
  broadcastTournamentCoherenceChanged,
  HERASTATS_GAMES_CHANGED_STORAGE,
  HERASTATS_TOURNAMENT_COHERENCE,
  normalizeTournamentIdForCoherence
} from '../utils/tournamentSync'; 
import {
  buildGroupStandingsRows,
  isFinishedGameEstado,
  normalizeDivisionName,
  normalizeGroupName
} from '../utils/groupStandings';
import {
  parseStatsSlotDescriptor,
  resolveStatsSlotToTeam
} from '../utils/schedulePlayoffSlotResolution';
import { aggregateTeamCardStatsFromPlayerRows } from '../utils/bestThirdPlace';
import { fetchTournamentStandingsInventory } from '../utils/tournamentStandingsRefresh';
import {
  BRACKET_PLACEMENT_OPTIONS,
  displayPlacementLabel,
  parsePlacementSelectChange,
  placementNumberFromLabel,
  placementLabelFromNumber,
  resolvePlacementSelectValue
} from '../utils/bracketPlacementOptions';
import './placementsBracket.css';

const TEAM_FALLBACK_IMAGE = '/Hera_logo.png';
/** Columnas de referencia del grid: evita que los cards crezcan cuando hay menos fases. */
const BRACKET_REFERENCE_PHASE_COUNT = 3;

/**
 * Regla base homogénea para layout de fútbol (torneo_id / sport_id = 2).
 */
const FOOTBALL_FIXED_LAYOUT_BLANK = Object.freeze({
  gap: '12px',
  offset: '0px',
  alignTopOffset: '0px',
  marginTop: '0px'
});

/**
 * `fixedLayouts` para el resto de deportes (lógica histórica del bracket).
 */
function buildDefaultFixedLayouts({ c, layoutUsesRankedRules, prevPhaseMatches }) {
  return {
    0: undefined,
    1:
      !layoutUsesRankedRules && prevPhaseMatches === 2
        ? c.secondPhaseTwoGames
        : layoutUsesRankedRules && prevPhaseMatches === 0
          ? c.laterPhaseFewGames
          : !layoutUsesRankedRules && prevPhaseMatches === 0
            ? c.twoPhasesmany
            : c.phase1,
    2:
      !layoutUsesRankedRules && prevPhaseMatches <= 2
        ? c.laterPhaseFewGames
        : layoutUsesRankedRules && prevPhaseMatches === 0
          ? c.laterPhaseFewGames
          : c.phase2Many
  };
}

/** Plantilla de reglas por patrón de conectores dentro de una fase. */
const footballConnectorRules = (overrides = {}) => {
  const { default: sharedRule, ...rest } = overrides;
  const fallback = () => {
    if (sharedRule == null) return { ...FOOTBALL_FIXED_LAYOUT_BLANK };
    if (typeof sharedRule === 'object') return { ...sharedRule };
    return sharedRule;
  };

  return {
    /** Salida a siguiente fase, sin entrada desde la anterior */
    toNextOnly: rest.toNextOnly ?? fallback(),
    /** Sin conectores */
    isolated: rest.isolated ?? fallback(),
    /** Entrada y salida (típico penúltima columna) */
    both: rest.both ?? fallback(),
    /** Solo entrada desde fase anterior */
    fromPrevOnly: rest.fromPrevOnly ?? fallback()
  };
};

/**
 * Paso vertical de referencia para offsets incrementales por partido en la misma fase.
 */
const FOOTBALL_LAYOUT_ROW_STEP_PX = 52;

/**
 * Reglas de layout por fase — lienzo de CONFIGURACIÓN (/brackets, edición).
 * Edita solo esta función para el bracket de configuración.
 *
 * @param {number} matchesBeforeForThisMatch — índice del partido en la columna (0 = primero, 1 = segundo, …).
 */
function FOOTBALL_CONNECTOR_LAYOUT_BY_PHASE_CONFIG(matchesBeforeForThisMatch) {
  const n = Math.max(0, Number(matchesBeforeForThisMatch) || 0);
  const step = FOOTBALL_LAYOUT_ROW_STEP_PX;

  return {
    0: footballConnectorRules({
      default: { gap: '12px', offset: '12px', alignTopOffset: '0px' }
    }),
    1: footballConnectorRules({
      default: { gap: '113.706px', offset: '52px', alignTopOffset: '0px' },
      fromPrevOnly: { gap: '113.706px', offset: '52px', alignTopOffset: '0px' },
      toNextOnly: { gap: '113.706px', offset: '52px', alignTopOffset: '0px' },
      both: { gap: '113.706px', offset: '103.706px', alignTopOffset: '0px' }
    }),
    2: footballConnectorRules({
      default: { gap: '12px', offset: '152.556px', alignTopOffset: '0px' },
      fromPrevOnly: { gap: '305.112px', offset: '0px', alignTopOffset: '12px' },
      toNextOnly: { gap: '305.112px', offset: '0px', alignTopOffset: '12px' },
      both: { gap: '305.112px', offset: '0px', alignTopOffset: '12px' }
    }),
    penultimate: footballConnectorRules({
      default: { gap: '12px', offset: '357.112px', alignTopOffset: '0px' },
      fromPrevOnly: { gap: '649.074px', offset: '357.112px', alignTopOffset: '12px' },
      toNextOnly: { gap: '710.78px', offset: '357.112px', alignTopOffset: '12px' },
      both: { gap: '710.78px', offset: '357.112px', alignTopOffset: '12px' }
    }),
    last: footballConnectorRules({
      default: { gap: '12px', offset: '751.706px', alignTopOffset: '150px' },
      fromPrevOnly: { gap: '150px', offset: '751.706px', alignTopOffset: '0px' },
      isolated: { gap: '450px', offset: '751.706px', alignTopOffset: '0px' }
    }),
    default: footballConnectorRules()
  };
}

/**
 * Reglas de layout por fase — lienzo POOL & BRACKETS (/poolbrackets, solo lectura).
 * Edita solo esta función para la vista pública; no afecta configuración.
 *
 * @param {number} matchesBeforeForThisMatch — índice del partido en la columna (0 = primero, 1 = segundo, …).
 */
function FOOTBALL_CONNECTOR_LAYOUT_BY_PHASE_POOL(matchesBeforeForThisMatch) {
  const n = Math.max(0, Number(matchesBeforeForThisMatch) || 0);
  const step = FOOTBALL_LAYOUT_ROW_STEP_PX;

  return {
    0: footballConnectorRules({
      default: { gap: '12px', offset: '12px', alignTopOffset: '0px' }
    }),
    1: footballConnectorRules({
      default: { gap: '96px', offset: '52px', alignTopOffset: '0px' },
      fromPrevOnly: { gap: '96px', offset: '52px', alignTopOffset: '0px' },
      toNextOnly: { gap: '96px', offset: '52px', alignTopOffset: '0px' },
      both: { gap: '96px', offset: '52px', alignTopOffset: '0px' }
    }),
    2: footballConnectorRules({
      default: { gap: '12px', offset: '132px', alignTopOffset: '0px' },
      fromPrevOnly: { gap: '252px', offset: '0px', alignTopOffset: '12px' },
      toNextOnly: { gap: '252px', offset: '0px', alignTopOffset: '12px' },
      both: { gap: '252px', offset: '0px', alignTopOffset: '12px' }
    }),
    penultimate: footballConnectorRules({
      default: { gap: '12px', offset: '300px', alignTopOffset: '0px' },
      fromPrevOnly: { gap: '649.074px', offset: '300px', alignTopOffset: '0px' },
      toNextOnly: { gap: '710.78px', offset: '300px', alignTopOffset: '0px' },
      both: { gap: '600px', offset: '300px', alignTopOffset: '0px' }
    }),
    last: footballConnectorRules({
      default: { gap: '12px', offset: '636px', alignTopOffset: '0px' },
      fromPrevOnly: { gap: '150px', offset: '636px', alignTopOffset: '0px' },
      isolated: { gap: '450px', offset: '636px', alignTopOffset: '0px' }
    }),
    default: footballConnectorRules()
  };
}

/** Elige la tabla de reglas según la página que renderiza el lienzo. */
function resolveFootballConnectorLayoutByPhase(isPoolBracketsPage) {
  return isPoolBracketsPage
    ? FOOTBALL_CONNECTOR_LAYOUT_BY_PHASE_POOL
    : FOOTBALL_CONNECTOR_LAYOUT_BY_PHASE_CONFIG;
}

/** Índice semántico de fase para la tabla anterior. */
function resolveFootballPhaseKey(roundIndex, totalPhases) {
  if (roundIndex <= 0) return 'first';
  if (totalPhases > 0 && roundIndex === totalPhases - 1) return 'last';
  if (totalPhases > 1 && roundIndex === totalPhases - 2) return 'penultimate';
  return roundIndex;
}

function getFootballPhaseConnectorRules(
  roundIndex,
  totalPhases,
  matchesBeforeForThisMatch,
  isPoolBracketsPage = false
) {
  const layoutByPhase = resolveFootballConnectorLayoutByPhase(isPoolBracketsPage);
  const table = layoutByPhase(matchesBeforeForThisMatch);
  if (Object.prototype.hasOwnProperty.call(table, roundIndex)) {
    return table[roundIndex];
  }
  const phaseKey = resolveFootballPhaseKey(roundIndex, totalPhases);
  return table[phaseKey] ?? table.default;
}

function resolveFootballLayoutRule(rule, layoutCtx) {
  if (rule == null) return null;
  if (typeof rule === 'function') return rule(layoutCtx);
  return { ...rule };
}

function getFootballRoundFallbackLayout(
  roundIndex,
  totalPhases,
  matchesBeforeForThisMatch = 0,
  isPoolBracketsPage = false
) {
  const layoutCtx = {
    matchesBeforeForThisMatch,
    roundIndex,
    totalPhases
  };
  const phaseRules = getFootballPhaseConnectorRules(
    roundIndex,
    totalPhases,
    matchesBeforeForThisMatch,
    isPoolBracketsPage
  );
  return resolveFootballLayoutRule(phaseRules.isolated, layoutCtx) ?? { ...FOOTBALL_FIXED_LAYOUT_BLANK };
}

/**
 * Layout según conectores del partido — exclusivo fútbol (torneo_id / sport_id = 2).
 * Usa `FOOTBALL_CONNECTOR_LAYOUT_BY_PHASE_CONFIG` o `_POOL` según la página.
 */
function footballLayoutFromPhaseEvaluation(
  e,
  { roundIndex, totalPhases, matchesBeforeForThisMatch = 0, isPoolBracketsPage = false }
) {
  const blank = { ...FOOTBALL_FIXED_LAYOUT_BLANK };
  const layoutCtx = {
    matchesBeforeForThisMatch,
    roundIndex,
    totalPhases
  };
  const phaseRules = getFootballPhaseConnectorRules(
    roundIndex,
    totalPhases,
    matchesBeforeForThisMatch,
    isPoolBracketsPage
  );
  const pick = (connectorKey) => resolveFootballLayoutRule(phaseRules[connectorKey], layoutCtx) ?? blank;

  if (e.hasConnectorsToNext && !e.hasConnectorsFromPrev) return pick('toNextOnly');
  if (!e.hasConnectorsFromPrev && !e.hasConnectorsToNext) return pick('isolated');
  if (e.hasConnectorsFromPrev && e.hasConnectorsToNext) return pick('both');
  if (e.hasConnectorsFromPrev && !e.hasConnectorsToNext) return pick('fromPrevOnly');

  return getFootballRoundFallbackLayout(
    roundIndex,
    totalPhases,
    matchesBeforeForThisMatch,
    isPoolBracketsPage
  );
}

/**
 * Layout según conectores — resto de deportes (lógica histórica).
 */
function defaultLayoutFromPhaseEvaluation(e, { layoutUsesRankedRules, c, roundIndex, fixedLayouts }) {
  if (layoutUsesRankedRules && e.hasConnectorsToNext && !e.hasConnectorsFromPrev) return c.penPhase;
  if (layoutUsesRankedRules && !e.hasConnectorsFromPrev && !e.hasConnectorsToNext) return c.finalPhase;
  if (layoutUsesRankedRules && e.hasConnectorsFromPrev && e.hasConnectorsToNext) return c.penPhaseTwoGames;
  return fixedLayouts[roundIndex];
}

/** Vacío en UI → valor por compatibilidad con crear/actualizar juego en BD. */
const normGameLocationPersist = (v) => {
  const t = v != null ? String(v).trim() : '';
  return t !== '' ? t.slice(0, 255) : 'Por definir';
};

const sanitizeGameLocationForUi = (raw) => {
  const s = raw != null ? String(raw).trim() : '';
  if (s === '' || s.toLowerCase() === 'por definir') return '';
  return s.slice(0, 255);
};

const formatFootballCardDate = (rawDate) => {
  const value = String(rawDate || '').trim();
  if (!value) return 'Fecha por definir';
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long' }).format(parsed);
};

function getFootballPrimaryLabel({ displayName, slotTrim, isPoolBracketsPage }) {
  const normalizedName = String(displayName || '').trim();
  const isPlaceholder = !normalizedName || /^por definir/i.test(normalizedName);
  if (!isPlaceholder) return normalizedName;
  if (slotTrim) {
    if (isPoolBracketsPage) return formatGroupPoolSeedLabel(slotTrim) || slotTrim;
    return slotTrim;
  }
  return '—';
}

function FootballCardMeta({ gameDate, gameLocation }) {
  const location = sanitizeGameLocationForUi(gameLocation);
  return (
    <div className="placements-football-card-meta">
      <span className="placements-football-card-date">{formatFootballCardDate(gameDate)}</span>
      {location ? (
        <>
          <span className="placements-football-card-sep"> – </span>
          <span className="placements-football-card-city">{location}</span>
        </>
      ) : null}
    </div>
  );
}

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const readStat = (team, keys) => {
  for (const key of keys) {
    if (team?.[key] !== undefined && team?.[key] !== null && team?.[key] !== '') {
      return toNumber(team[key]);
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

/** Etiqueta canónica de puesto en grupo para Pool & Brackets: 1A, 2B, 3C o mejor tercero 3ABCDF. */
const formatGroupPoolSeedLabel = (raw) => {
  const parsed = parseStatsSlotDescriptor(raw);
  if (!parsed) return null;
  if (parsed.type === 'bestThird') return parsed.slot;
  const rank = Number(parsed.rank);
  const groupToken = String(parsed.groupToken || '')
    .trim()
    .toUpperCase();
  if (!Number.isFinite(rank) || rank < 1 || !groupToken) return null;
  return `${rank}${groupToken}`;
};

/** Origen desde partidos del bracket: W12 = ganador del juego 12, L73 = perdedor del juego 73 (# = número visible en la tarjeta). */
const parseBracketAdvanceSlotDescriptor = (raw) => {
  const s = String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!s) return null;
  const m = s.match(/^([WL])(\d+)$/);
  if (!m) return null;
  const gameNum = Number(m[2]);
  if (!Number.isInteger(gameNum) || gameNum <= 0) return null;
  return { outcome: m[1] === 'L' ? 'loser' : 'winner', gameNum };
};

const parseBracketScoresNumericPair = (score) => {
  const hs = String(getScoreField(score, 'home') ?? '').trim();
  const vs = String(getScoreField(score, 'away') ?? '').trim();
  if (hs === '' || vs === '') return null;
  const h = Number(hs);
  const v = Number(vs);
  if (!Number.isFinite(h) || !Number.isFinite(v)) return null;
  return { home: h, away: v };
};

const resolveTeamFromBracketAdvanceInMatch = (descriptor, sourceMatch) => {
  if (!descriptor || !sourceMatch) return null;
  const nums = parseBracketScoresNumericPair(sourceMatch.score);
  if (!nums || nums.home === nums.away) return null;

  const winnerSlot = nums.home > nums.away ? 0 : 1;
  const loserSlot = nums.home > nums.away ? 1 : 0;
  const slotIdx = descriptor.outcome === 'loser' ? loserSlot : winnerSlot;
  const team = sourceMatch.teams?.[slotIdx];

  const tid = team?.teamId != null ? String(team.teamId).trim() : '';
  if (!tid) return null;

  const tag = `${descriptor.outcome === 'loser' ? 'L' : 'W'}${descriptor.gameNum}`;
  return {
    id: tid,
    name: team?.name || 'Equipo',
    seed: `${tag}`,
    flag: team?.flag || TEAM_FALLBACK_IMAGE
  };
};

const normalizeGroupLabel = (groupName) => {
  const value = String(groupName || '').trim();
  return value.replace(/^grupo\s+/i, '').trim() || value;
};

const isGroupPhase = (phase) => {
  const text = String(phase?.stage || phase?.name || phase?.phase || '').toLowerCase().trim();
  return text.includes('grupo') || text.includes('group');
};

const isSemifinalTitle = (title) => {
  const text = String(title || '').toLowerCase();
  return text.includes('semifinal') || text.includes('semi final') || text.includes('semi-final');
};

/** Cuartos de final — no confundir con tercer puesto ni con el substring "cuarto" en "Cuartos". */
const isQuarterFinalTitle = (title) => {
  const text = String(title || '').toLowerCase().trim();
  return /\bcuartos?\b/.test(text) || text.includes('quarter');
};

const isThirdPlaceTitle = (title) => {
  if (isQuarterFinalTitle(title)) return false;
  const text = String(title || '').toLowerCase().trim();
  return (
    text.includes('3ro') ||
    text.includes('3er') ||
    text.includes('tercer') ||
    text.includes('tercero') ||
    text.includes('third')
  );
};

const createEmptyTeam = () => ({
  teamId: '',
  name: 'Por Definir',
  seed: '-',
  flag: TEAM_FALLBACK_IMAGE
});

const createMatchId = (roundId) => `${roundId}-match-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

const createEmptyScore = () => ({ home: '', away: '' });

const getScoreField = (score, field) => {
  if (!score) return '';
  if (typeof score === 'object') return score[field] ?? '';
  const [home = '', away = ''] = String(score).split('-').map((value) => value.trim());
  return field === 'home' ? home : away;
};

/** Entero útil para destacar ganador en tarjeta a partir del texto mostrado (goal-totals o BD fusionada). */
const parseGoalsIntFromDisplayString = (raw) => {
  if (raw == null || raw === '') return NaN;
  const n = parseInt(String(raw).trim(), 10);
  return Number.isFinite(n) ? n : NaN;
};

const toNodeKey = (matchId, slotIndex) => `${matchId}-${slotIndex}`;

const parseNodeKey = (nodeKey) => {
  const value = String(nodeKey || '');
  const splitAt = value.lastIndexOf('-');
  if (splitAt <= 0) return { matchId: value, slotIndex: 0 };
  return {
    matchId: value.slice(0, splitAt),
    slotIndex: Number(value.slice(splitAt + 1)) || 0
  };
};

const findMatchByIdInRounds = (rounds, matchId) => {
  const mid = String(matchId || '');
  for (const round of rounds || []) {
    const found = (round.matches || []).find((m) => String(m.id) === mid);
    if (found) return found;
  }
  return null;
};

/** Origen del slot: ganador/perdedor del juego N → forma corta W43 / L44 (title con texto completo). */
const getIncomingAdvanceDisplay = (links, rounds, destMatchId, destSlotIndex) => {
  if (!Array.isArray(links) || links.length === 0) return null;
  const targetKey = toNodeKey(destMatchId, destSlotIndex);
  const link = links.find((l) => String(l.to) === targetKey);
  if (!link) return null;
  const fromParsed = parseNodeKey(link.from);
  const fromMatch = findMatchByIdInRounds(rounds, fromParsed.matchId);
  const num = Number(fromMatch?.gameNum);
  const isLoser = String(link.rule || 'winner').toLowerCase() === 'loser';
  if (Number.isInteger(num) && num > 0) {
    const prefix = isLoser ? 'L' : 'W';
    return {
      text: `${prefix}${num}`,
      title: isLoser
        ? `Perdedor del juego ${num} · avanza a este lugar`
        : `Ganador del juego ${num} · avanza a este lugar`
    };
  }
  return {
    text: isLoser ? 'L?' : 'W?',
    title: isLoser
      ? 'Perdedor del partido enlazado · avanza aquí'
      : 'Ganador del partido enlazado · avanza aquí'
  };
};

const getMatchCrossoverPairLabel = (links, rounds, matchId) => {
  const a = getIncomingAdvanceDisplay(links, rounds, matchId, 0);
  const b = getIncomingAdvanceDisplay(links, rounds, matchId, 1);
  if (a && b) return `${a.text} vs ${b.text}`;
  return null;
};

const notifyBracketDataChanged = (tournamentId) => {
  const tid = String(tournamentId || '');
  if (!tid) return;
  broadcastTournamentCoherenceChanged(tid, { fullBracketReload: true });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('herastats:bracket-updated', { detail: { tournamentId: tid } }));
  }
};

const buildPhaseMatchEvaluationsForRound = (phase, roundIndex, allRounds, manualLinks, isRankedView) => {
  const prevRound = roundIndex >= 1 ? allRounds[roundIndex - 1] : null;
  const prevRoundMatchIds = new Set((prevRound?.matches || []).map((m) => String(m.id)));
  const nextRound = roundIndex < allRounds.length - 1 ? allRounds[roundIndex + 1] : null;
  const nextRoundMatchIds = new Set((nextRound?.matches || []).map((m) => String(m.id)));
  const matchReceivesFromPrevRound = (m) => prevRound && (manualLinks || []).some((link) => {
    const fromParsed = parseNodeKey(link.from);
    const toParsed = parseNodeKey(link.to);
    return (
      prevRoundMatchIds.has(String(fromParsed.matchId)) &&
      String(toParsed.matchId) === String(m.id)
    );
  });
  const matchHasConnectorsToNextRound = (m) => nextRound && (manualLinks || []).some((link) => {
    const fromParsed = parseNodeKey(link.from);
    const toParsed = parseNodeKey(link.to);
    return (
      String(fromParsed.matchId) === String(m.id) &&
      nextRoundMatchIds.has(String(toParsed.matchId))
    );
  });
  return (phase?.matches || []).map((match) => {
    const hasConnectorsFromPrev = matchReceivesFromPrevRound(match);
    const hasConnectorsToNext = matchHasConnectorsToNextRound(match);
    const isRanked = isRankedView;
    const hasConnectorsFromPrevAndToNext = hasConnectorsFromPrev && hasConnectorsToNext;
    return {
      matchId: match.id,
      hasConnectorsFromPrev,
      hasConnectorsToNext,
      isRanked,
      hasConnectorsFromPrevAndToNext,
      isRankedAndHasConnectorsFromPrev: isRanked && hasConnectorsFromPrev,
      isRankedAndHasConnectorsFromPrevAndToNext: isRanked && hasConnectorsFromPrev && hasConnectorsToNext
    };
  });
};

const getGameIdFromMatch = (match, fallbackMatchId = '') => {
  const directGameId = Number(match?.gameId);
  if (Number.isInteger(directGameId) && directGameId > 0) return directGameId;

  const value = String(fallbackMatchId || match?.id || '');
  const parsed = /^g-(\d+)$/.exec(value);
  if (!parsed) return 0;

  const gameId = Number(parsed[1]);
  return Number.isInteger(gameId) && gameId > 0 ? gameId : 0;
};

/** Igual que getGameIdFromMatch pero acepta ids compuestos (p. ej. lienzo::g-12) y game_id (BD). */
const extractGameIdFromMatch = (match) => {
  const direct = Number(match?.gameId);
  if (Number.isInteger(direct) && direct > 0) return direct;
  const snake = Number(match?.game_id);
  if (Number.isInteger(snake) && snake > 0) return snake;
  const fromId = String(match?.id || '');
  const anchored = /^g-(\d+)$/.exec(fromId);
  if (anchored) {
    const n = Number(anchored[1]);
    return Number.isInteger(n) && n > 0 ? n : 0;
  }
  const loose = /g-(\d+)/.exec(fromId);
  if (loose) {
    const n = Number(loose[1]);
    return Number.isInteger(n) && n > 0 ? n : 0;
  }
  return 0;
};

/**
 * Lista de filas de equipo + score; con `useGoalTotalsForScores` y `readOnly` el marcador viene de GET goal-totals,
 * salvo que `match.score` (fusionado con GET /games) difiera: entonces se prioriza la fila oficial del juego.
 * En los lienzos de edición con slots (Principal y Ranked), la columna Loc./Vis. acepta 1A, 3B… o ganador/perdedor de otro partido (W#/L#).
 */
function PlacementsMatchTeamRowsWithScores({
  tournamentId,
  match,
  round,
  roundIndex,
  readOnly,
  useGoalTotalsForScores,
  bracketReloadTick,
  /** Increments on silent standings sync (clasificación/live) sin recargar lienzo; refresca marcadores desde goal-totals. */
  scoresSyncNonce = 0,
  selectedSource,
  handleLinkTargetSelection,
  handleTeamSelection,
  handleScoreChange,
  activeBracketViewProp,
  teamOptions,
  selectedDivision = '',
  standingsTeams = [],
  standingsGames = [],
  slotResolutionOptions = {},
  onStatsSlotFieldChange = null,
  onStatsSlotFieldBlur = null,
  incomingAdvanceDisplays = null,
  /** Map game_num → match con marcador/equipos (Principal + Ranked) para resolver W#/L# en slots */
  bracketSlotMatchByGameNum = null,
  statsSlotPlaceholder = '1A',
  statsSlotFieldTitle = 'Puesto en el grupo (mismo orden que estadísticas). Ej. 1A = 1.º del A',
  /** Pool & Brackets (solo lectura): sin columna Loc./Vis.; nombres y banderas se resuelven igual que en Principal cuando hay slots 1A, W12… */
  isPoolBracketsPage = false,
  useFootballCardStyle = false
}) {
  const gameId = extractGameIdFromMatch(match);
  const { localGoals, visitorGoals, loading, error, refetch } = useGameMatchScore(tournamentId, gameId, {
    enabled: Boolean(useGoalTotalsForScores && readOnly && tournamentId && gameId > 0)
  });

  useEffect(() => {
    if (!useGoalTotalsForScores || !readOnly) return;
    if (bracketReloadTick === 0 && scoresSyncNonce === 0) return;
    refetch();
  }, [bracketReloadTick, scoresSyncNonce, readOnly, refetch, useGoalTotalsForScores]);

  useEffect(() => {
    if (!useGoalTotalsForScores || !readOnly) return;
    if (!isFinishedGameEstado(match.gameEstado)) return;
    if (!gameId) return;
    refetch();
  }, [match.gameEstado, gameId, readOnly, refetch, useGoalTotalsForScores]);

  const fbHome = getScoreField(match.score, 'home');
  const fbAway = getScoreField(match.score, 'away');
  const hasFb = fbHome !== '' || fbAway !== '';

  let displayHome;
  let displayAway;
  if (!useGoalTotalsForScores || !readOnly) {
    displayHome = fbHome;
    displayAway = fbAway;
  } else if (error) {
    displayHome = fbHome;
    displayAway = fbAway;
  } else if (!loading) {
    const parseSide = (v) => {
      if (v == null || v === '') return NaN;
      const n = parseInt(String(v).trim(), 10);
      return Number.isFinite(n) ? n : NaN;
    };
    const fhNum = parseSide(fbHome);
    const faNum = parseSide(fbAway);
    const dbBothNumeric = Number.isFinite(fhNum) && Number.isFinite(faNum);
    const gl = Number(localGoals) || 0;
    const gv = Number(visitorGoals) || 0;
    /** Goal-totals / eventos primero; fila fusionada sólo rescata cuando ambos están en cero pero `game` ya tiene marcador */
    const totalsEmpty = gl === 0 && gv === 0;
    const dbHasScore =
      dbBothNumeric &&
      (fhNum !== 0 || faNum !== 0 || isFinishedGameEstado(match.gameEstado));
    if (totalsEmpty && dbHasScore) {
      displayHome = String(fhNum);
      displayAway = String(faNum);
    } else {
      displayHome = String(gl);
      displayAway = String(gv);
    }
  } else if (hasFb) {
    displayHome = fbHome;
    displayAway = fbAway;
  } else {
    displayHome = '';
    displayAway = '';
  }

  const nh = parseGoalsIntFromDisplayString(displayHome);
  const na = parseGoalsIntFromDisplayString(displayAway);
  const outcomeWinnerIndex =
    Number.isFinite(nh) && Number.isFinite(na) && nh !== na ? (nh > na ? 0 : 1) : null;
  const outcomeLoserIndex = outcomeWinnerIndex != null ? (outcomeWinnerIndex === 0 ? 1 : 0) : null;

  if (useFootballCardStyle) {
    return (
      <div className="placements-football-team-list">
        {(match.teams || []).map((team, index) => {
          const scoreValue =
            useGoalTotalsForScores && readOnly
              ? index === 0
                ? displayHome
                : displayAway
              : getScoreField(match.score, index === 0 ? 'home' : 'away');
          const useBracketSlots = !isPoolBracketsPage;
          const slotSide = index === 0 ? 'local' : 'visitor';
          const slotRaw =
            slotSide === 'local' ? match.statsSlotLocal || '' : match.statsSlotVisitor || '';
          const slotTrim = String(slotRaw).trim();
          const bracketAdvanceDescriptor = slotTrim ? parseBracketAdvanceSlotDescriptor(slotTrim) : null;
          const bracketAdvanceSource =
            bracketAdvanceDescriptor &&
            bracketSlotMatchByGameNum &&
            typeof bracketSlotMatchByGameNum.get === 'function'
              ? bracketSlotMatchByGameNum.get(bracketAdvanceDescriptor.gameNum)
              : null;
          const resolvedFromBracketAdvance = bracketAdvanceDescriptor
            ? resolveTeamFromBracketAdvanceInMatch(bracketAdvanceDescriptor, bracketAdvanceSource)
            : null;
          const resolvedFromStandings =
            slotTrim && !bracketAdvanceDescriptor
              ? resolveStatsSlotToTeam(
                  slotTrim,
                  standingsTeams,
                  selectedDivision,
                  standingsGames,
                  slotResolutionOptions
                )
              : null;
          const hasTeamId = team?.teamId != null && String(team.teamId).trim() !== '';
          const bracketAdvanceHint = bracketAdvanceDescriptor
            ? `${bracketAdvanceDescriptor.outcome === 'loser' ? 'L' : 'W'}${bracketAdvanceDescriptor.gameNum}`
            : null;
          const displayFlag = slotTrim
            ? resolvedFromBracketAdvance?.flag ||
              resolvedFromStandings?.flag ||
              team?.flag ||
              TEAM_FALLBACK_IMAGE
            : team?.flag || TEAM_FALLBACK_IMAGE;
          let displayName;
          if (slotTrim && bracketAdvanceDescriptor) {
            displayName =
              resolvedFromBracketAdvance?.name || `Por definir (${bracketAdvanceHint})`;
          } else if (slotTrim) {
            displayName = resolvedFromStandings?.name || `Por definir (${slotTrim})`;
          } else if (hasTeamId) {
            displayName = team?.name || 'Por Definir';
          } else {
            displayName = team?.name || 'Por Definir';
          }
          const primaryLabel = getFootballPrimaryLabel({
            displayName,
            slotTrim,
            isPoolBracketsPage
          });
          const slotAriaLabel =
            index === 0
              ? 'Origen equipo local en slot (grupo tipo 1A o bracket tipo W12/L73)'
              : 'Origen equipo visitante en slot (grupo tipo 3B o bracket tipo W12/L73)';

          return (
            <div
              key={`${match.id}-${index}-football`}
              className={`placements-football-team-row ${
                outcomeWinnerIndex === index ? 'placements-football-team-row--winner' : ''
              } ${outcomeLoserIndex === index ? 'placements-football-team-row--loser' : ''}`}
              data-node={`${match.id}-${index}`}
            >
              <span className="placements-football-flag-wrap">
                <img
                  src={displayFlag}
                  alt=""
                  onError={(event) => {
                    if (!event.currentTarget.src.includes(TEAM_FALLBACK_IMAGE)) {
                      event.currentTarget.src = TEAM_FALLBACK_IMAGE;
                    }
                  }}
                />
              </span>
              {!readOnly && useBracketSlots ? (
                <input
                  type="text"
                  className="placements-football-slot-input"
                  placeholder={statsSlotPlaceholder}
                  value={slotRaw}
                  title={statsSlotFieldTitle}
                  onChange={(event) =>
                    onStatsSlotFieldChange?.(round.id, match.id, slotSide, event.target.value)
                  }
                  onBlur={(event) => {
                    event.stopPropagation();
                    onStatsSlotFieldBlur?.();
                  }}
                  onClick={(event) => event.stopPropagation()}
                  aria-label={slotAriaLabel}
                />
              ) : (
                <span className="placements-football-team-label" title={displayName}>
                  {primaryLabel}
                </span>
              )}
              <input
                type="text"
                inputMode="numeric"
                className="placements-football-score-box"
                value={scoreValue}
                readOnly={readOnly}
                disabled={readOnly}
                onChange={(event) =>
                  handleScoreChange(round.id, match.id, index === 0 ? 'home' : 'away', event.target.value)
                }
                onClick={(event) => event.stopPropagation()}
                aria-label={index === 0 ? 'Marcador local' : 'Marcador visitante'}
              />
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="placements-team-list">
      {(match.teams || []).map((team, index) => {
        const scoreValue =
          useGoalTotalsForScores && readOnly
            ? index === 0
              ? displayHome
              : displayAway
            : getScoreField(match.score, index === 0 ? 'home' : 'away');

        const useBracketSlots = !isPoolBracketsPage;
        const showSlotColumn = useBracketSlots;
        const slotSide = index === 0 ? 'local' : 'visitor';
        const slotRaw =
          slotSide === 'local' ? match.statsSlotLocal || '' : match.statsSlotVisitor || '';
        const slotTrim = String(slotRaw).trim();
        const bracketAdvanceDescriptor = slotTrim ? parseBracketAdvanceSlotDescriptor(slotTrim) : null;
        const bracketAdvanceSource =
          bracketAdvanceDescriptor &&
          bracketSlotMatchByGameNum &&
          typeof bracketSlotMatchByGameNum.get === 'function'
            ? bracketSlotMatchByGameNum.get(bracketAdvanceDescriptor.gameNum)
            : null;
        const resolvedFromBracketAdvance = bracketAdvanceDescriptor
          ? resolveTeamFromBracketAdvanceInMatch(bracketAdvanceDescriptor, bracketAdvanceSource)
          : null;

        const resolvedFromStandings =
          slotTrim && !bracketAdvanceDescriptor
            ? resolveStatsSlotToTeam(
                slotTrim,
                standingsTeams,
                selectedDivision,
                standingsGames,
                slotResolutionOptions
              )
            : null;

        const adv = incomingAdvanceDisplays?.[index];
        const hasTeamId = team?.teamId != null && String(team.teamId).trim() !== '';

        const bracketAdvanceHint = bracketAdvanceDescriptor
          ? `${bracketAdvanceDescriptor.outcome === 'loser' ? 'L' : 'W'}${bracketAdvanceDescriptor.gameNum}`
          : null;

        const displayFlag = slotTrim
          ? resolvedFromBracketAdvance?.flag ||
            resolvedFromStandings?.flag ||
            team?.flag ||
            TEAM_FALLBACK_IMAGE
          : team?.flag || TEAM_FALLBACK_IMAGE;

        let displayName;
        if (slotTrim && bracketAdvanceDescriptor) {
          displayName =
            resolvedFromBracketAdvance?.name || `Por definir (${bracketAdvanceHint})`;
        } else if (slotTrim) {
          displayName = resolvedFromStandings?.name || `Por definir (${slotTrim})`;
        } else if (hasTeamId) {
          displayName = team?.name || 'Por Definir';
        } else if (adv?.text) {
          displayName = adv.text;
        } else {
          displayName = team?.name || 'Por Definir';
        }

        const showIncomingAdvanceRow = Boolean(
          adv?.text && displayName !== adv.text
        );

        let displaySeed;
        if (isPoolBracketsPage) {
          displaySeed =
            formatGroupPoolSeedLabel(slotTrim) ||
            formatGroupPoolSeedLabel(team?.seed) ||
            null;
        } else if (slotTrim) {
          if (resolvedFromBracketAdvance) {
            displaySeed = `${slotTrim} · ${resolvedFromBracketAdvance.seed}`;
          } else if (resolvedFromStandings) {
            displaySeed = `${slotTrim} · ${resolvedFromStandings.seed}`;
          } else {
            displaySeed = bracketAdvanceHint || slotTrim;
          }
        } else {
          displaySeed = team?.seed ?? '-';
        }

        const showSeed =
          activeBracketViewProp !== 'ranked' &&
          roundIndex === 0 &&
          (!isPoolBracketsPage || Boolean(displaySeed));

        const slotAriaLabel =
          index === 0
            ? 'Origen equipo local en slot (grupo tipo 1A o bracket tipo W12/L73)'
            : 'Origen equipo visitante en slot (grupo tipo 3B o bracket tipo W12/L73)';
        return (
          <div
            key={`${match.id}-${index}`}
            className={`placements-team-row ${showSlotColumn ? 'placements-team-row--bracket-slots' : ''} ${
              selectedSource === `${match.id}-${index}` ? 'is-link-source' : ''
            } ${outcomeWinnerIndex === index ? 'placements-team-row--winner' : ''} ${
              outcomeLoserIndex === index ? 'placements-team-row--loser' : ''
            }`}
            data-node={`${match.id}-${index}`}
            aria-label={
              outcomeWinnerIndex === index
                ? `${displayName}: ganador según marcador`
                : outcomeLoserIndex === index
                  ? `${displayName}: resultado inferior`
                  : undefined
            }
            onClick={(event) => {
              if (readOnly) return;
              event.stopPropagation();
              handleLinkTargetSelection(`${match.id}-${index}`);
            }}
            role={readOnly ? undefined : 'button'}
            tabIndex={readOnly ? -1 : 0}
            onKeyDown={(event) => {
              if (!readOnly && (event.key === 'Enter' || event.key === ' ')) {
                event.preventDefault();
                handleLinkTargetSelection(`${match.id}-${index}`);
              }
            }}
          >
            <img
              src={displayFlag}
              alt={displayName || 'Equipo'}
              onError={(event) => {
                if (!event.currentTarget.src.includes(TEAM_FALLBACK_IMAGE)) {
                  event.currentTarget.src = TEAM_FALLBACK_IMAGE;
                }
              }}
            />
            {showSlotColumn ? (
              <div className="placements-slot-inline-wrap">
                {!readOnly ? (
                  <label className="placements-slot-inline-label">
                    <span className="placements-slot-inline-hint">{index === 0 ? 'Loc.' : 'Vis.'}</span>
                    <input
                      type="text"
                      className="placements-slot-inline-input"
                      placeholder={statsSlotPlaceholder}
                      value={slotRaw}
                      title={statsSlotFieldTitle}
                      onChange={(event) =>
                        onStatsSlotFieldChange?.(round.id, match.id, slotSide, event.target.value)
                      }
                      onBlur={(event) => {
                        event.stopPropagation();
                        onStatsSlotFieldBlur?.();
                      }}
                      onClick={(event) => event.stopPropagation()}
                      aria-label={slotAriaLabel}
                    />
                  </label>
                ) : (
                  <div className="placements-slot-readonly-stack">
                    <span className="placements-slot-inline-hint">{index === 0 ? 'Loc.' : 'Vis.'}</span>
                    <span className="placements-slot-readonly-badge" title={statsSlotFieldTitle}>
                      {slotTrim || '—'}
                    </span>
                  </div>
                )}
              </div>
            ) : null}
            <div className="placements-team-body">
              <span
                className={`placements-incoming-advance ${showIncomingAdvanceRow ? '' : 'placements-incoming-advance--empty'}`}
                title={showIncomingAdvanceRow ? adv.title : undefined}
                aria-hidden={!showIncomingAdvanceRow}
              >
                {showIncomingAdvanceRow ? adv.text : '\u00a0'}
              </span>
              {useBracketSlots && slotTrim ? (
                <div className="placements-team-from-standings">
                  <div className="placements-team-name-line">
                    <span className="placements-team-from-standings-name">{displayName}</span>
                    {showSeed && displaySeed ? (
                      <small className="placements-team-seed">{`(${displaySeed})`}</small>
                    ) : null}
                  </div>
                  {!readOnly && onStatsSlotFieldChange ? (
                    <button
                      type="button"
                      className="placements-slot-pick-team-btn"
                      onClick={(event) => {
                        event.stopPropagation();
                        onStatsSlotFieldChange(round.id, match.id, slotSide, '');
                      }}
                    >
                      Elegir equipo fijo
                    </button>
                  ) : null}
                </div>
              ) : isPoolBracketsPage && readOnly ? (
                <div className="placements-team-from-standings">
                  <div className="placements-team-name-line">
                    <span className="placements-team-from-standings-name">{displayName}</span>
                    {showSeed && displaySeed ? (
                      <small className="placements-team-seed">{`(${displaySeed})`}</small>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="placements-team-name-line placements-team-name-line--select">
                  <select
                    className="placements-team-select"
                    value={team?.teamId || ''}
                    disabled={readOnly}
                    onChange={(event) => handleTeamSelection(round.id, match.id, index, event.target.value)}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <option value="">Por Definir</option>
                    {teamOptions.map((optionTeam) => (
                      <option key={optionTeam.id} value={optionTeam.id}>
                        {optionTeam.name}
                      </option>
                    ))}
                  </select>
                  {showSeed && displaySeed ? (
                    <small className="placements-team-seed">{`(${displaySeed})`}</small>
                  ) : null}
                </div>
              )}
            </div>
            <input
              type="text"
              inputMode="numeric"
              className="placements-team-score-input"
              value={scoreValue}
              readOnly={readOnly}
              disabled={readOnly}
              onChange={(event) =>
                handleScoreChange(round.id, match.id, index === 0 ? 'home' : 'away', event.target.value)
              }
              onClick={(event) => event.stopPropagation()}
              aria-label={
                isPoolBracketsPage
                  ? `Marcador (${index === 0 ? 'primer' : 'segundo'} equipo)`
                  : index === 0
                    ? 'Score equipo local'
                    : 'Score equipo visitante'
              }
              title={useGoalTotalsForScores && readOnly && error ? error : undefined}
            />
          </div>
        );
      })}
    </div>
  );
}

/** Coincide con Ranked sin importar mayúsculas (BD/API pueden variar). */
const isRankedCanvasBracketValue = (value) =>
  String(value ?? '').trim().toLowerCase() === 'ranked';

/**
 * game_id presentes en lienzos de posicionamiento persistidos (para no pintarlos en el lienzo principal
 * si canvas_bracket en BD está mal o es NULL).
 */
const collectGameIdsFromRankedCanvases = (canvases) => {
  const ids = new Set();
  if (!Array.isArray(canvases)) return ids;
  for (const canvas of canvases) {
    for (const round of canvas?.rounds || []) {
      for (const match of round?.matches || []) {
        const gid = extractGameIdFromMatch(match);
        if (gid > 0) ids.add(gid);
      }
    }
  }
  return ids;
};

const filterGamesForMainCanvas = (games, rankedGameIdsFromCanvases) => {
  const rankedIds = rankedGameIdsFromCanvases instanceof Set ? rankedGameIdsFromCanvases : new Set();
  return (Array.isArray(games) ? games : []).filter((game) => {
    if (isRankedCanvasBracketValue(game?.canvas_bracket)) return false;
    const gid = Number(game?.game_id);
    if (Number.isInteger(gid) && gid > 0 && rankedIds.has(gid)) return false;
    return true;
  });
};

const filterManualLinksForExistingMatchIds = (links, rounds) => {
  const matchIds = new Set();
  (rounds || []).forEach((r) => (r.matches || []).forEach((m) => matchIds.add(String(m.id))));
  return (links || []).filter((link) => {
    const fromParsed = parseNodeKey(link.from);
    const toParsed = parseNodeKey(link.to);
    return matchIds.has(String(fromParsed.matchId)) && matchIds.has(String(toParsed.matchId));
  });
};

/**
 * Quita del lienzo ranked referencias a game_id eliminados en BD (p. ej. desde calendario).
 * Los datos del lienzo ranked se persisten en el servidor (ranked-canvases); no en localStorage.
 */
const sanitizeRankedCanvasesAgainstDeletedGames = (canvases, validGameIds) => {
  if (!Array.isArray(canvases) || canvases.length === 0) {
    return { canvases: canvases || [], didChange: false };
  }
  const valid = validGameIds instanceof Set ? validGameIds : new Set();
  let didChange = false;
  const next = canvases.map((canvas) => {
    const rounds = (canvas.rounds || []).map((round) => {
      const roundId = round.id || `round-${round.phaseId ?? 'x'}`;
      const matches = (round.matches || []).map((match) => {
        const gid = extractGameIdFromMatch(match);
        if (gid > 0 && !valid.has(gid)) {
          didChange = true;
          return {
            ...match,
            id: createMatchId(roundId),
            gameId: undefined,
            game_id: undefined,
            gameNum: undefined,
            gameDate: null,
            gameTime: null,
            gameLocation: '',
            teams: [createEmptyTeam(), createEmptyTeam()],
            score: createEmptyScore()
          };
        }
        return match;
      });
      return { ...round, matches };
    });
    const beforeLinks = canvas.manualLinks || [];
    const manualLinks = filterManualLinksForExistingMatchIds(beforeLinks, rounds);
    if (manualLinks.length !== beforeLinks.length) didChange = true;
    return { ...canvas, rounds, manualLinks };
  });
  return { canvases: next, didChange };
};

const getRoundIndexForMatchId = (rounds, matchId) => {
  const value = String(matchId || '');
  for (let roundIndex = 0; roundIndex < rounds.length; roundIndex += 1) {
    const found = (rounds[roundIndex]?.matches || []).some((match) => String(match.id) === value);
    if (found) return roundIndex;
  }
  return -1;
};

const getNextBracketOrder = (round) => {
  const usedOrders = new Set(
    (round?.matches || [])
      .map((match) => Number(match?.bracketOrder))
      .filter((value) => Number.isInteger(value) && value > 0)
  );

  let nextOrder = 1;
  while (usedOrders.has(nextOrder)) {
    nextOrder += 1;
  }
  return nextOrder;
};

const extractManualLinks = (rounds) =>
  rounds.flatMap((round) =>
    round.matches.flatMap((match) =>
      (match.teams || [])
        .map((team, index) => {
          if (team?.nextMatchId && team?.nextSlot !== undefined && team?.nextSlot !== null) {
            return {
              from: `${match.id}-${index}`,
              to: `${team.nextMatchId}-${team.nextSlot}`,
              type: 'match'
            };
          }
          return null;
        })
        .filter(Boolean)
    )
  );

const buildRounds = (phaseList) => {
  if (phaseList.length === 0) return [];

  return phaseList.map((phaseData, index) => ({
    id: `round-${index + 1}`,
    phaseId: phaseData?.id != null ? Number(phaseData.id) : null,
    title: String(phaseData?.title || phaseData || '').trim(),
    matches: []
  }));
};

const cloneRoundsState = (roundsList = []) =>
  roundsList.map((round) => ({
    ...round,
    matches: (round.matches || []).map((match) => ({
      ...match,
      teams: (match.teams || []).map((team) => ({ ...team })),
      score: match?.score && typeof match.score === 'object' ? { ...match.score } : match.score
    }))
  }));

const cloneManualLinksState = (linksList = []) =>
  linksList.map((link) => ({ ...link }));

/** Mapa equipo_id → etiquetas (nombre/seed/logo) desde GET /teams. */
const buildThinTeamLookupForMerge = (teamsRows = []) => {
  const map = {};
  for (const t of teamsRows) {
    const tid = String(t.team_id ?? t.id ?? '').trim();
    if (!tid) continue;
    const gn = normalizeGroupLabel(String(t.group ?? t.grupo ?? '').trim());
    map[tid] = {
      name: t.name || 'Equipo',
      seed: gn || '-',
      flag: t.url_imagen || TEAM_FALLBACK_IMAGE
    };
  }
  return map;
};

/**
 * game_id único por fila (último gana si hubiera repetidos improbables).
 */
const buildInventoryGamesByGameIdMap = (inventoryAll = []) => {
  const m = new Map();
  for (const g of Array.isArray(inventoryAll) ? inventoryAll : []) {
    const id = Number(g?.game_id);
    if (!Number.isInteger(id) || id <= 0) continue;
    m.set(id, g);
  }
  return m;
};

/**
 * Lista GET /games: la API suele usar snake_case; por robustez ante transformaciones intermedias probamos camelCase.
 */
const pickInventoryRowScoreStrings = (gameRow) => {
  const lh = gameRow?.local_score ?? gameRow?.localScore;
  const va = gameRow?.visitor_score ?? gameRow?.visitorScore;
  return {
    home: lh != null && String(lh).trim() !== '' ? String(lh).trim() : '',
    away: va != null && String(va).trim() !== '' ? String(va).trim() : ''
  };
};

/**
 * Alineación de tarjeta con fila BD (GET /games): equipos por ID/slot, texto de marcador en lienzo,
 * fecha/hora/ubicación. Misma geometría que mapRoundsFromPhases en loadBracket.
 */
function hydrateBracketMatchFromInventory(
  match,
  game,
  thinTeamLookup,
  teamsAllRows,
  divisionKey,
  inventoryForSlots,
  slotResolutionOptions = {}
) {
  const localIdStr = game.local != null ? String(game.local).trim() : '';
  const visitorIdStr = game.visitor != null ? String(game.visitor).trim() : '';
  const localSlotRaw = game.stats_slot_local != null ? String(game.stats_slot_local).trim() : '';
  const visitorSlotRaw = game.stats_slot_visitor != null ? String(game.stats_slot_visitor).trim() : '';
  const resolvedLocal =
    !localIdStr && localSlotRaw
      ? resolveStatsSlotToTeam(
          localSlotRaw,
          teamsAllRows,
          divisionKey,
          inventoryForSlots,
          slotResolutionOptions
        )
      : null;
  const resolvedVisitor =
    !visitorIdStr && visitorSlotRaw
      ? resolveStatsSlotToTeam(
          visitorSlotRaw,
          teamsAllRows,
          divisionKey,
          inventoryForSlots,
          slotResolutionOptions
        )
      : null;
  const localTeam = localIdStr ? thinTeamLookup[localIdStr] || {} : {};
  const visitorTeam = visitorIdStr ? thinTeamLookup[visitorIdStr] || {} : {};
  const rawDate = String(game.game_date || '').split('T')[0];
  const rawTime = String(game.game_time || '').trim();
  const gameLocation = sanitizeGameLocationForUi(game.game_location);
  const gameDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : '';
  const gameTime = /^\d{1,2}:\d{2}(?::\d{2})?$/.test(rawTime) ? rawTime.slice(0, 5) : '';
  const gNum = Number(game.game_num);

  const nextTeams = [
    {
      teamId: localIdStr,
      name: localIdStr
        ? game.local_name || localTeam.name || 'Por Definir'
        : resolvedLocal?.name || 'Por Definir',
      seed: localIdStr
        ? localTeam.seed || '-'
        : localSlotRaw
          ? resolvedLocal
            ? `${localSlotRaw} · ${resolvedLocal.seed}`
            : `${localSlotRaw}`
          : '-',
      flag: game.local_image || localTeam.flag || resolvedLocal?.flag || TEAM_FALLBACK_IMAGE
    },
    {
      teamId: visitorIdStr,
      name: visitorIdStr
        ? game.visitor_name || visitorTeam.name || 'Por Definir'
        : resolvedVisitor?.name || 'Por Definir',
      seed: visitorIdStr
        ? visitorTeam.seed || '-'
        : visitorSlotRaw
          ? resolvedVisitor
            ? `${visitorSlotRaw} · ${resolvedVisitor.seed}`
            : `${visitorSlotRaw}`
          : '-',
      flag:
        game.visitor_image || visitorTeam.flag || resolvedVisitor?.flag || TEAM_FALLBACK_IMAGE
    }
  ];

  const invScores = pickInventoryRowScoreStrings(game);
  const nextScore = { home: invScores.home, away: invScores.away };
  const { placement, placementNumber } = parsePlacementFieldsFromGameRow(game);

  return {
    ...match,
    gameNum: Number.isFinite(gNum) && gNum > 0 ? gNum : match.gameNum ?? null,
    gameDate: gameDate || null,
    gameTime: gameTime || null,
    gameLocation,
    teams: nextTeams,
    score: nextScore,
    placement,
    placementNumber,
    statsSlotLocal: localSlotRaw || null,
    statsSlotVisitor: visitorSlotRaw || null,
    /** Campo BD: para badge “Finalizado” y UX en lienzo público */
    gameEstado: game.estado != null && String(game.estado).trim() !== '' ? String(game.estado).trim() : null
  };
}

function mergeRoundsWithLatestInventory(
  roundsArr,
  inventoryByGameId,
  thinTeams,
  teamsAllRows,
  inventoryForSlots,
  divisionKey,
  slotResolutionOptions = {}
) {
  if (!Array.isArray(roundsArr) || roundsArr.length === 0 || !(inventoryByGameId instanceof Map) || inventoryByGameId.size === 0)
    return roundsArr;
  return roundsArr.map((round) => ({
    ...round,
    matches: (round.matches || []).map((match) => {
      const gid = extractGameIdFromMatch(match);
      if (!Number.isInteger(gid) || gid <= 0) return match;
      const dbRow = inventoryByGameId.get(gid);
      if (!dbRow) return match;
      /** No mezclar cruces de otra categoría cuando la BD trae división conocida (comparación insensible a mayúsculas). */
      const rowDiv = normalizeDivisionName(String(dbRow.division ?? '')).toLowerCase();
      const wantDiv = normalizeDivisionName(String(divisionKey ?? '')).toLowerCase();
      if (wantDiv !== 'sin division' && rowDiv !== 'sin division' && rowDiv !== wantDiv) return match;

      return hydrateBracketMatchFromInventory(
        match,
        dbRow,
        thinTeams,
        teamsAllRows,
        divisionKey,
        inventoryForSlots,
        slotResolutionOptions
      );
    })
  }));
}

const buildPhaseTemplate = (roundsList = []) =>
  roundsList.map((round, index) => ({
    id: `round-${index + 1}`,
    phaseId: round?.phaseId != null ? Number(round.phaseId) : null,
    phaseOrder: round?.phaseOrder,
    title: round?.title || `Fase ${index + 1}`
  }));

const normalizeRoundsByTemplate = (roundsList = [], templateRounds = []) => {
  if (!templateRounds.length) return cloneRoundsState(roundsList);

  return templateRounds.map((templateRound, index) => {
    const matchedRound = roundsList.find((round) => (
      round?.phaseId != null && templateRound?.phaseId != null
        ? Number(round.phaseId) === Number(templateRound.phaseId)
        : String(round?.title || '').trim().toLowerCase() === String(templateRound?.title || '').trim().toLowerCase()
    ));

    return {
      id: templateRound.id || `round-${index + 1}`,
      phaseId: templateRound.phaseId,
      phaseOrder: templateRound.phaseOrder,
      title: templateRound.title,
      matches: cloneRoundsState([matchedRound || { matches: [] }])[0]?.matches || []
    };
  });
};

const injectThirdPlaceLoserLinks = (rounds = [], links = []) => {
  if (!Array.isArray(rounds) || rounds.length === 0) return Array.isArray(links) ? links : [];
  const baseLinks = Array.isArray(links) ? links : [];
  const semifinalRound = rounds.find((round) => isSemifinalTitle(round?.title));
  const thirdPlaceRound = rounds.find(
    (round) => isThirdPlaceTitle(round?.title) && !isQuarterFinalTitle(round?.title)
  );
  if (!semifinalRound || !thirdPlaceRound) return baseLinks;

  const semifinalMatches = [...(semifinalRound.matches || [])]
    .sort((a, b) => {
      const aOrder = Number(a?.bracketOrder) || Number.MAX_SAFE_INTEGER;
      const bOrder = Number(b?.bracketOrder) || Number.MAX_SAFE_INTEGER;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return String(a?.id || '').localeCompare(String(b?.id || ''), 'es');
    })
    .slice(0, 2);
  const thirdPlaceMatch = [...(thirdPlaceRound.matches || [])]
    .sort((a, b) => {
      const aOrder = Number(a?.bracketOrder) || Number.MAX_SAFE_INTEGER;
      const bOrder = Number(b?.bracketOrder) || Number.MAX_SAFE_INTEGER;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return String(a?.id || '').localeCompare(String(b?.id || ''), 'es');
    })[0];

  if (semifinalMatches.length < 2 || !thirdPlaceMatch?.id) return baseLinks;

  const autoLinks = semifinalMatches.map((match, index) => ({
    from: toNodeKey(match.id, 0),
    to: toNodeKey(thirdPlaceMatch.id, index),
    type: 'match',
    rule: 'loser'
  }));

  const nextLinks = [...baseLinks];
  autoLinks.forEach((candidate) => {
    const exists = nextLinks.some((link) => link.from === candidate.from && link.to === candidate.to);
    if (!exists) {
      nextLinks.push(candidate);
    }
  });
  return nextLinks;
};

const getHighestGameNumber = (roundsList = []) =>
  roundsList.reduce((maxValue, round) => {
    const roundMax = (round?.matches || []).reduce((innerMax, match) => {
      const gameNum = Number(match?.gameNum);
      return Number.isInteger(gameNum) && gameNum > innerMax ? gameNum : innerMax;
    }, 0);
    return roundMax > maxValue ? roundMax : maxValue;
  }, 0);

/** Respuesta createBracketGame: soporta data anidada o plana. */
const extractGameFromCreateResponse = (createdResponse) => {
  const g = createdResponse?.data?.game ?? createdResponse?.game;
  if (!g) return { gameId: null, gameNum: null };
  const rawId = g.game_id ?? g.gameId;
  const gid = Number(rawId);
  const rawNum = g.game_num ?? g.gameNum;
  const gnum = Number(rawNum);
  return {
    gameId: Number.isInteger(gid) && gid > 0 ? gid : null,
    gameNum: Number.isInteger(gnum) && gnum > 0 ? gnum : null
  };
};

function parsePlacementFieldsFromGameRow(game) {
  const rawNum = game?.placement_number ?? game?.placementNumber;
  const n = Number(rawNum);
  let placementNumber = Number.isInteger(n) && n >= 0 && n <= 15 ? n : null;
  let placement =
    game?.placement != null && String(game.placement).trim() !== '' ? String(game.placement).trim() : null;
  if (placementNumber == null && placement) {
    placementNumber = placementNumberFromLabel(placement);
  }
  if (!placement && placementNumber != null) {
    placement = placementLabelFromNumber(placementNumber);
  }
  return { placement, placementNumber };
}

/** Solo orden visual al arrastrar en vista combinada; no guarda partidos ni lienzos ranked. */
const VISUAL_ORDER_STORAGE_KEY = 'herastats:placement-visual-order';

function PlacementsBracket({
  tournamentId,
  selectedDivision = '',
  activeBracketView: activeBracketViewProp = 'main',
  showToolbar = true,
  /** En ranked: muestra selector de lienzo, nombre y botón Agregar lienzo */
  showRankedCanvasToolbar = true,
  /** En ranked: botón "+ Agregar juego" por fase sticky al hacer scroll */
  stickyRankedPhaseAddButtons = false,
  readOnly = false,
  /** Solo lectura: marcador desde goal-totals (eventos) en lugar del JSON del lienzo. */
  useGoalTotalsForScores = false,
  forcedRankedCanvasId = '',
  forcedRankedCanvasIds = [],
  allowVisualDrag = false,
  isPoolRankedView = false,
  /** Vista pública Pool & Brackets: cards sin etiquetas local/visitante ni columna de puesto */
  isPoolBracketsPage = false,
  /** Pool shell: fuerza nueva lectura GET goal-totals cuando el padre reentra / ranked lista llega */
  poolScoresSyncEpoch = 0,
  /** Solo lectura: al hacer clic en la tarjeta navega a `/game` (p. ej. Pool & Brackets). */
  onGameNavigate,
  isFootballTournament = false
}) {
  const location = useLocation();
  const boardRef = useRef(null);
  /** El primer lienzo correcto ya se pintó: recargas en Pool lectura omiten spinner. */
  const poolBracketHydratedRef = useRef(false);
  const coherenceStandingsTimerRef = useRef(null);
  const roundsRef = useRef([]);
  const manualLinksRef = useRef([]);
  /** Copia de `links` del último GET Main: conserva enlaces hacia ranked al guardar solo el principal. */
  const apiBracketLinksRef = useRef([]);
  const rankedRoundsRef = useRef([]);
  const rankedManualLinksRef = useRef([]);
  const rankedPhaseTemplateRef = useRef([]);
  const deletedGameIdsRef = useRef(new Set());
  const [rounds, setRounds] = useState([]);
  const [rankedRounds, setRankedRounds] = useState([]);
  const [teamOptions, setTeamOptions] = useState([]);
  const [standingsTeamsRaw, setStandingsTeamsRaw] = useState([]);
  /** Partidos del torneo: misma entrada que Stats → Grupos para ordenar slots 1A, 2B… */
  const [standingsGamesRaw, setStandingsGamesRaw] = useState([]);
  const [cardStatsByTeamId, setCardStatsByTeamId] = useState(() => new Map());
  const slotResolutionOptions = useMemo(() => ({ cardStatsByTeamId }), [cardStatsByTeamId]);
  const slotResolutionOptionsRef = useRef(slotResolutionOptions);
  slotResolutionOptionsRef.current = slotResolutionOptions;
  const [loading, setLoading] = useState(true);
  const [svgSize, setSvgSize] = useState({ width: 1, height: 1 });
  const [connectorPaths, setConnectorPaths] = useState([]);
  const [manualLinks, setManualLinks] = useState([]);
  const [rankedManualLinks, setRankedManualLinks] = useState([]);
  const [isLinkMode, setIsLinkMode] = useState(false);
  const [selectedSource, setSelectedSource] = useState('');
  const [saveStatus, setSaveStatus] = useState('idle');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [hasPendingLinkChanges, setHasPendingLinkChanges] = useState(false);
  const [hasUnsavedRankedChanges, setHasUnsavedRankedChanges] = useState(false);
  const [saveErrorMessage, setSaveErrorMessage] = useState('');
  const [rankedCanvases, setRankedCanvases] = useState([]);
  const [activeRankedCanvasId, setActiveRankedCanvasId] = useState('ranked-canvas-1');
  const [rankedCanvasNameDraft, setRankedCanvasNameDraft] = useState('');
  const draggingMatchRef = useRef(null);
  const [dragOverMatchIndex, setDragOverMatchIndex] = useState(null);
  const [visualOrderOverride, setVisualOrderOverride] = useState({});
  const [bracketReloadTick, setBracketReloadTick] = useState(0);
  const [silentStandingsNonce, setSilentStandingsNonce] = useState(0);
  /** Pool & brackets solo lectura: tras hidratar lienzos, fuerza refetch GET goal-totals (silentStandings empieza en 0). */
  const [scoresCanvasHydrateNonce, setScoresCanvasHydrateNonce] = useState(0);
  /** Solo lectura Pool: cada tick de polling refuerza GET goal-totals en las tarjetas. */
  const [poolReadOnlyPollNonce, setPoolReadOnlyPollNonce] = useState(0);

  useEffect(() => {
    setSilentStandingsNonce(0);
  }, [tournamentId]);

  useEffect(() => {
    setScoresCanvasHydrateNonce(0);
  }, [tournamentId, selectedDivision]);

  useEffect(() => {
    setPoolReadOnlyPollNonce(0);
  }, [tournamentId, selectedDivision]);

  useEffect(() => {
    poolBracketHydratedRef.current = false;
  }, [tournamentId, selectedDivision]);

  /** Pool público: sin eventos de coherencia, el inventario y los marcadores pueden quedar stale; mismo patrón que edición pero aquí sí. */
  useEffect(() => {
    if (!readOnly || !isPoolBracketsPage || !tournamentId || String(selectedDivision || '').trim() === '') {
      return undefined;
    }
    let cancelled = false;
    const refreshStandings = async () => {
      try {
        const { teams, games, gamesOk } = await fetchTournamentStandingsInventory(tournamentId);
        if (cancelled) return;
        setStandingsTeamsRaw(teams);
        if (gamesOk) {
          setStandingsGamesRaw(games);
        }
        setPoolReadOnlyPollNonce((n) => n + 1);
      } catch {
        /* ignore */
      }
    };
    const id = window.setInterval(refreshStandings, 42000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [readOnly, isPoolBracketsPage, tournamentId, selectedDivision]);

  /** Coherencia del torneo: recarga ligera del JSON de clasificación para slots tipo 1A (sin reload completo). */
  useEffect(() => {
    if (!tournamentId) return undefined;
    const tid = normalizeTournamentIdForCoherence(tournamentId);

    const bumpStandingsSilent = () => {
      window.clearTimeout(coherenceStandingsTimerRef.current);
      coherenceStandingsTimerRef.current = window.setTimeout(() => {
        coherenceStandingsTimerRef.current = null;
        setSilentStandingsNonce((n) => n + 1);
      }, 380);
    };

    const onCoherence = (event) => {
      if (!event.detail || normalizeTournamentIdForCoherence(event.detail.tournamentId) !== tid) return;
      if (event.detail.fullBracketReload) {
        window.clearTimeout(coherenceStandingsTimerRef.current);
        setBracketReloadTick((tick) => tick + 1);
        return;
      }
      bumpStandingsSilent();
    };

    const onStorage = (event) => {
      if (!event?.newValue || event.key !== HERASTATS_GAMES_CHANGED_STORAGE) return;
      try {
        const payload = JSON.parse(event.newValue);
        if (payload && normalizeTournamentIdForCoherence(payload.tournamentId) === tid) {
          if (payload.fullBracketReload) {
            window.clearTimeout(coherenceStandingsTimerRef.current);
            setBracketReloadTick((tick) => tick + 1);
          } else {
            bumpStandingsSilent();
          }
        }
      } catch (_) {
        /* ignore */
      }
    };

    window.addEventListener(HERASTATS_TOURNAMENT_COHERENCE, onCoherence);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(HERASTATS_TOURNAMENT_COHERENCE, onCoherence);
      window.removeEventListener('storage', onStorage);
      window.clearTimeout(coherenceStandingsTimerRef.current);
      coherenceStandingsTimerRef.current = null;
    };
  }, [tournamentId]);

  useEffect(() => {
    if (!tournamentId || !selectedDivision || String(selectedDivision).trim() === '') return undefined;
    if (!silentStandingsNonce) return undefined;

    let cancelled = false;

    const refreshStandings = async () => {
      try {
        const { teams, games, gamesOk } = await fetchTournamentStandingsInventory(tournamentId);
        if (cancelled) return;
        setStandingsTeamsRaw(teams);
        if (gamesOk) {
          setStandingsGamesRaw(games);
        }
      } catch {
        /* ignore */
      }
    };

    refreshStandings();
    return () => {
      cancelled = true;
    };
  }, [tournamentId, selectedDivision, silentStandingsNonce]);

  useEffect(() => {
    if (!isFootballTournament || !tournamentId) {
      setCardStatsByTeamId(new Map());
      return undefined;
    }

    let cancelled = false;

    const loadCardStats = async () => {
      try {
        const res = await configService.getTournamentPlayerEventStats(tournamentId, {
          scope: 'groups',
          division: selectedDivision || undefined
        });
        if (cancelled) return;
        const rows = res?.success ? res?.data?.playerStats || res?.data?.stats || [] : [];
        setCardStatsByTeamId(aggregateTeamCardStatsFromPlayerRows(rows));
      } catch {
        if (!cancelled) setCardStatsByTeamId(new Map());
      }
    };

    loadCardStats();
    return () => {
      cancelled = true;
    };
  }, [isFootballTournament, tournamentId, selectedDivision, silentStandingsNonce]);

  /**
   * Solo lectura: cuando el inventario BD (`standingsGamesRaw` = GET /games) llega igual o mejor al bracket API,
   * actualiza fecha, equipos, slots y marcador de texto de cada tarjeta sin esperar reload completo.
   */
  useEffect(() => {
    if (!readOnly) return;
    if (!tournamentId || String(selectedDivision ?? '').trim() === '') return;
    if (!Array.isArray(standingsGamesRaw) || standingsGamesRaw.length === 0) return;

    const divKey = String(selectedDivision).trim();
    const byId = buildInventoryGamesByGameIdMap(standingsGamesRaw);
    if (byId.size === 0) return;

    const thinTeams = buildThinTeamLookupForMerge(standingsTeamsRaw);
    const mergeInto = (prev) =>
      mergeRoundsWithLatestInventory(
        prev,
        byId,
        thinTeams,
        standingsTeamsRaw,
        standingsGamesRaw,
        divKey,
        slotResolutionOptionsRef.current
      );

    setRounds((prev) => mergeInto(prev));
    setRankedRounds((prev) => mergeInto(prev));
  }, [
    readOnly,
    tournamentId,
    selectedDivision,
    standingsGamesRaw,
    standingsTeamsRaw,
    bracketReloadTick,
    poolScoresSyncEpoch,
    scoresCanvasHydrateNonce,
    silentStandingsNonce,
    poolReadOnlyPollNonce,
    cardStatsByTeamId
  ]);

  /*
     El mismo navegador no dispara "storage" en la pestaña que escribe; los otros oyentes usan ese canal.
     escuchar también `herastats:bracket-updated` en la misma pestaña provocaba reload en bucle en brackets.js,
     porque hay dos <PlacementsBracket> montados — se perdían nombre del lienzo, slots y texto de posición.

     Coherencia y storage se manejan en el efecto anterior (clasificación ligera vs recarga full).
  */

  /** En edición: respaldo ante ausencia de eventos desde otra pestaña. En Pool público ya hay coherencia + visibilidad. */
  useEffect(() => {
    if (isPoolBracketsPage || !tournamentId || !selectedDivision || String(selectedDivision).trim() === '')
      return undefined;
    let cancelled = false;
    const refreshStandings = async () => {
      try {
        const { teams, games, gamesOk } = await fetchTournamentStandingsInventory(tournamentId);
        if (cancelled) return;
        setStandingsTeamsRaw(teams);
        if (gamesOk) {
          setStandingsGamesRaw(games);
        }
      } catch {
        /* ignore */
      }
    };
    const id = setInterval(refreshStandings, 40000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [isPoolBracketsPage, tournamentId, selectedDivision]);

  useEffect(() => {
    roundsRef.current = rounds;
  }, [rounds]);

  useEffect(() => {
    manualLinksRef.current = manualLinks;
  }, [manualLinks]);

  useEffect(() => {
    rankedRoundsRef.current = rankedRounds;
  }, [rankedRounds]);

  useEffect(() => {
    rankedManualLinksRef.current = rankedManualLinks;
  }, [rankedManualLinks]);

  const activeBracketView = activeBracketViewProp || 'main';
  const isRankedView = activeBracketView === 'ranked';
  const forcedCanvasIdsKey = useMemo(
    () => (Array.isArray(forcedRankedCanvasIds) ? forcedRankedCanvasIds.join('|') : ''),
    [forcedRankedCanvasIds]
  );
  const isMergedRankedView = isRankedView && readOnly && forcedCanvasIdsKey;
  const canVisualDrag = allowVisualDrag && isRankedView;
  useEffect(() => {
    setSelectedSource('');
    setIsLinkMode(false);
  }, [activeBracketView]);

  const activeViewKey = isRankedView ? 'ranked' : 'main';
  const incomingLookupRounds = useMemo(() => {
    if (isRankedView) return [...rounds, ...rankedRounds];
    return rounds;
  }, [isRankedView, rounds, rankedRounds]);

  /** Un solo mapa por # de juego (tarjeta) para resolver slots W#/L# en cualquier lienzo editable. */
  const bracketAdvanceSourceByGameNum = useMemo(() => {
    const map = new Map();
    const ingest = (list) => {
      for (const rnd of list || []) {
        for (const m of rnd.matches || []) {
          const gn = Number(m?.gameNum);
          if (!Number.isInteger(gn) || gn <= 0) continue;
          if (!map.has(gn)) {
            map.set(gn, m);
          }
        }
      }
    };
    ingest(rounds);
    ingest(rankedRounds);
    return map;
  }, [rounds, rankedRounds]);

  const activeRankedCanvas = useMemo(
    () => rankedCanvases.find((canvas) => canvas.id === activeRankedCanvasId) || null,
    [rankedCanvases, activeRankedCanvasId]
  );
  const displayedRounds = isRankedView ? rankedRounds : rounds;
  const displayedManualLinks = isRankedView ? rankedManualLinks : manualLinks;
  const displayedRoundsRef = isRankedView ? rankedRoundsRef : roundsRef;
  const activeRoundsRef = isRankedView ? rankedRoundsRef : roundsRef;
  const activeManualLinksRef = isRankedView ? rankedManualLinksRef : manualLinksRef;

  const getViewState = useCallback((viewKey) => {
    if (viewKey === 'ranked') {
      return {
        roundsRef: rankedRoundsRef,
        manualLinksRef: rankedManualLinksRef,
        setRoundsState: setRankedRounds,
        setManualLinksState: setRankedManualLinks
      };
    }
    return {
      roundsRef,
      manualLinksRef,
      setRoundsState: setRounds,
      setManualLinksState: setManualLinks
    };
  }, []);

  const teamById = useMemo(
    () =>
      teamOptions.reduce((acc, team) => {
        acc[team.id] = team;
        return acc;
      }, {}),
    [teamOptions]
  );

  useEffect(() => {
    let cancelled = false;

    const loadBracketData = async () => {
      if (!tournamentId) {
        setRounds([]);
        setRankedRounds([]);
        setRankedCanvases([]);
        setActiveRankedCanvasId('ranked-canvas-1');
        setTeamOptions([]);
        setStandingsTeamsRaw([]);
        setStandingsGamesRaw([]);
        setManualLinks([]);
        setRankedManualLinks([]);
        apiBracketLinksRef.current = [];
        deletedGameIdsRef.current = new Set();
        setHasUnsavedChanges(false);
        setHasPendingLinkChanges(false);
        setHasUnsavedRankedChanges(false);
        setSaveErrorMessage('');
        setLoading(false);
        return;
      }

      if (!selectedDivision || String(selectedDivision).trim() === '') {
        setRounds([]);
        setRankedRounds([]);
        setRankedCanvases([]);
        setTeamOptions([]);
        setStandingsTeamsRaw([]);
        setStandingsGamesRaw([]);
        setManualLinks([]);
        setRankedManualLinks([]);
        apiBracketLinksRef.current = [];
        setLoading(false);
        return;
      }

      try {
        const splashLoading = !(readOnly && isPoolBracketsPage && poolBracketHydratedRef.current);
        if (splashLoading) setLoading(true);
        setSaveStatus('idle');
        setSaveErrorMessage('');
        const [teamsResponse, phasesResponse, bracketMainResponse, rankedCanvasesResponse, standingsInventory] =
          await Promise.all([
            configService.getTeams(tournamentId),
            configService.getPhases(tournamentId),
            configService.getBracket(tournamentId, selectedDivision || undefined, 'Main'),
            configService.getRankedCanvases(tournamentId, selectedDivision || undefined),
            fetchTournamentStandingsInventory(tournamentId).catch(() => ({
              teams: [],
              games: [],
              gamesOk: false
            }))
          ]);

        if (cancelled) return;

        let allGamesRows = standingsInventory.games || [];
        const gamesInventoryOk = standingsInventory.gamesOk;

        const teams = teamsResponse?.success ? teamsResponse?.data?.teams || [] : [];
        const phases = phasesResponse?.success ? phasesResponse?.data?.phases || [] : [];

        const sortedPhases = [...phases].sort((a, b) => {
          const aOrder = Number(
            a?.phase_order ??
            a?.order_index ??
            a?.order ??
            a?.position ??
            a?.phas_id ??
            0
          );
          const bOrder = Number(
            b?.phase_order ??
            b?.order_index ??
            b?.order ??
            b?.position ??
            b?.phas_id ??
            0
          );
          return aOrder - bOrder;
        });
        const phaseOrderById = sortedPhases.reduce((acc, phase, index) => {
          const phaseId = Number(phase?.phas_id);
          if (Number.isInteger(phaseId) && phaseId > 0) {
            acc[phaseId] = index + 1;
          }
          return acc;
        }, {});

        // La primera fase corresponde a grupos y no debe mostrarse en brackets.
        const knockoutPhases = sortedPhases
          .slice(1)
          .map((phase) => ({
            id: Number(phase.phas_id),
            phaseOrder: phaseOrderById[Number(phase.phas_id)] || 0,
            title: String(phase?.stage || phase?.name || phase?.phase || '').trim()
          }))
          .filter((phase) => phase.title)
          .filter((phase) => !isGroupPhase({ stage: phase.title }));
        const mainKnockoutPhases = knockoutPhases;
        const rankedKnockoutPhases = knockoutPhases;

        const groupedTeams = teams.reduce((acc, team) => {
          if (selectedDivision && readDivision(team) !== selectedDivision) {
            return acc;
          }
          const groupName = String(team.group || team.grupo || '').trim();
          if (!groupName) return acc;
          if (!acc[groupName]) acc[groupName] = [];
          acc[groupName].push(team);
          return acc;
        }, {});

        const qualifiedTeams = Object.entries(groupedTeams)
          .sort((a, b) => a[0].localeCompare(b[0], 'es'))
          .flatMap(([groupName, groupTeams]) => {
            const roster = groupTeams
              .map((t) => {
                const idStr = String(t.team_id ?? t.id ?? '').trim();
                const idNum = Number(idStr);
                return {
                  id: idStr,
                  name: t.name || 'Equipo',
                  division: readDivision(t),
                  group: normalizeGroupName(String(t.group || t.grupo || '').trim()),
                  games:
                    Number(t.games) ||
                    readStat(t, ['games_played', 'played_games', 'played', 'pg', 'pj', 'games']),
                  wins: Number(t.wins) || readStat(t, ['wins', 'won', 'victories', 'victorias', 'w']),
                  losses: Number(t.losses) || readStat(t, ['losses', 'lost', 'derrotas', 'l']),
                  url_imagen: t.url_imagen
                };
              })
              .filter((row) => row.id && Number.isFinite(Number(row.id)));

            const rows = buildGroupStandingsRows(roster, allGamesRows, selectedDivision || '');
            return rows.slice(0, 3).map((row) => ({
              id: String(row.id),
              name: row.name || 'Equipo',
              seed: `${normalizeGroupLabel(groupName)}-${row.rank}`,
              flag: row.url_imagen || TEAM_FALLBACK_IMAGE
            }));
          })
          .filter((team) => team.id);
        const qualifiedTeamById = qualifiedTeams.reduce((acc, team) => {
          acc[team.id] = team;
          return acc;
        }, {});

        const allDivisionTeams = teams
          .filter((team) => !selectedDivision || readDivision(team) === selectedDivision)
          .map((team) => {
            const teamId = String(team.team_id || team.id || '');
            const groupName = String(team.group || team.grupo || '').trim();
            const seed = groupName
              ? `${normalizeGroupLabel(groupName)}`
              : (team.name || 'Equipo');
            return {
              id: teamId,
              name: team.name || 'Equipo',
              seed,
              flag: team.url_imagen || TEAM_FALLBACK_IMAGE
            };
          })
          .filter((team) => team.id)
          .sort((a, b) => String(a.name).localeCompare(String(b.name), 'es'));

        if (knockoutPhases.length === 0) {
          setRounds([]);
          setRankedRounds([]);
          setTeamOptions([]);
          setStandingsTeamsRaw([]);
          setStandingsGamesRaw([]);
          setManualLinks([]);
          setRankedManualLinks([]);
          apiBracketLinksRef.current = [];
          deletedGameIdsRef.current = new Set();
          setHasUnsavedChanges(false);
          setHasPendingLinkChanges(false);
          setHasUnsavedRankedChanges(false);
          setSaveErrorMessage('');
          poolBracketHydratedRef.current = readOnly && isPoolBracketsPage;
          return;
        }

        setTeamOptions(allDivisionTeams.length > 0 ? allDivisionTeams : qualifiedTeams);
        setStandingsTeamsRaw(teams);
        setStandingsGamesRaw(Array.isArray(allGamesRows) ? allGamesRows : []);
        const allTeamById = allDivisionTeams.reduce((acc, team) => {
          acc[team.id] = team;
          return acc;
        }, {});
        const teamByIdForMapping = { ...allTeamById, ...qualifiedTeamById };
        const validGameIdsInDb = new Set(
          allGamesRows
            .map((g) => Number(g.game_id))
            .filter((id) => Number.isInteger(id) && id > 0)
        );

        let persistedCanvases = rankedCanvasesResponse?.success
          ? rankedCanvasesResponse?.data?.canvases || []
          : [];
        const rankedSanitize = gamesInventoryOk
          ? sanitizeRankedCanvasesAgainstDeletedGames(persistedCanvases, validGameIdsInDb)
          : { canvases: persistedCanvases, didChange: false };
        persistedCanvases = rankedSanitize.canvases;
        if (rankedSanitize.didChange && persistedCanvases.length > 0) {
          try {
            await configService.saveRankedCanvases(tournamentId, persistedCanvases, selectedDivision || undefined);
          } catch (persistSanitizeError) {
            console.error('Error al persistir lienzo ranked tras eliminar juegos inexistentes:', persistSanitizeError);
          }
        }

        const rankedGameIdsFromPersistedCanvases = collectGameIdsFromRankedCanvases(persistedCanvases);
        const bracketGamesRaw = bracketMainResponse?.success ? bracketMainResponse?.data?.games || [] : [];
        const bracketGames = filterGamesForMainCanvas(bracketGamesRaw, rankedGameIdsFromPersistedCanvases);
        const bracketLinks = bracketMainResponse?.success ? bracketMainResponse?.data?.links || [] : [];
        apiBracketLinksRef.current = Array.isArray(bracketLinks) ? [...bracketLinks] : [];

        let nextRounds = [];
        let nextLinks = [];
        let nextRankedRounds = [];
        let nextRankedLinks = [];

        if (bracketGames.length > 0) {
          const gamesByPhase = bracketGames.reduce((acc, game) => {
            const key = Number(game.phas_id);
            if (!acc[key]) acc[key] = [];
            acc[key].push(game);
            return acc;
          }, {});
          const gamePhaseById = bracketGames.reduce((acc, game) => {
            const gameId = Number(game?.game_id);
            const phaseId = Number(game?.phas_id);
            if (Number.isInteger(gameId) && gameId > 0) {
              acc[gameId] = phaseId;
            }
            return acc;
          }, {});

          const mapRoundsFromPhases = (phaseList) =>
            phaseList.map((phase, phaseIndex) => {
              const phaseGames = (gamesByPhase[phase.id] || [])
              .sort((a, b) => {
                const aOrder = a.bracket_order ?? Number.MAX_SAFE_INTEGER;
                const bOrder = b.bracket_order ?? Number.MAX_SAFE_INTEGER;
                if (aOrder !== bOrder) return aOrder - bOrder;
                return Number(a.game_id) - Number(b.game_id);
              })
              .map((game, gameIndex) => {
                const localTeam = teamByIdForMapping[String(game.local)] || {};
                const visitorTeam = teamByIdForMapping[String(game.visitor)] || {};
                const localIdStr = game.local != null ? String(game.local).trim() : '';
                const visitorIdStr = game.visitor != null ? String(game.visitor).trim() : '';
                const localSlotRaw =
                  game.stats_slot_local != null ? String(game.stats_slot_local).trim() : '';
                const visitorSlotRaw =
                  game.stats_slot_visitor != null ? String(game.stats_slot_visitor).trim() : '';
                const resolvedLocal =
                  !localIdStr && localSlotRaw
                    ? resolveStatsSlotToTeam(
                        localSlotRaw,
                        teams,
                        selectedDivision,
                        allGamesRows,
                        slotResolutionOptionsRef.current
                      )
                    : null;
                const resolvedVisitor =
                  !visitorIdStr && visitorSlotRaw
                    ? resolveStatsSlotToTeam(
                        visitorSlotRaw,
                        teams,
                        selectedDivision,
                        allGamesRows,
                        slotResolutionOptionsRef.current
                      )
                    : null;
                const rawDate = String(game.game_date || '').split('T')[0];
                const rawTime = String(game.game_time || '').trim();
                const gameLocation = sanitizeGameLocationForUi(game.game_location);
                const gameDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : '';
                const gameTime = /^\d{1,2}:\d{2}(?::\d{2})?$/.test(rawTime) ? rawTime.slice(0, 5) : '';
                const { placement, placementNumber } = parsePlacementFieldsFromGameRow(game);
                return {
                  id: `g-${game.game_id}`,
                  gameId: Number(game.game_id),
                  gameNum: Number(game.game_num) || null,
                  gameDate: gameDate || null,
                  gameTime: gameTime || null,
                  gameLocation,
                  teams: [
                    {
                      teamId: localIdStr,
                      name: localIdStr
                        ? game.local_name || localTeam.name || 'Por Definir'
                        : resolvedLocal?.name || 'Por Definir',
                      seed: localIdStr
                        ? localTeam.seed || '-'
                        : localSlotRaw
                          ? resolvedLocal
                            ? `${localSlotRaw} · ${resolvedLocal.seed}`
                            : `${localSlotRaw}`
                          : '-',
                      flag: game.local_image || localTeam.flag || resolvedLocal?.flag || TEAM_FALLBACK_IMAGE
                    },
                    {
                      teamId: visitorIdStr,
                      name: visitorIdStr
                        ? game.visitor_name || visitorTeam.name || 'Por Definir'
                        : resolvedVisitor?.name || 'Por Definir',
                      seed: visitorIdStr
                        ? visitorTeam.seed || '-'
                        : visitorSlotRaw
                          ? resolvedVisitor
                            ? `${visitorSlotRaw} · ${resolvedVisitor.seed}`
                            : `${visitorSlotRaw}`
                          : '-',
                      flag:
                        game.visitor_image ||
                        visitorTeam.flag ||
                        resolvedVisitor?.flag ||
                        TEAM_FALLBACK_IMAGE
                    }
                  ],
                  score: pickInventoryRowScoreStrings(game),
                  bracketOrder: game.bracket_order ?? gameIndex + 1,
                  placement,
                  placementNumber,
                  statsSlotLocal: localSlotRaw || null,
                  statsSlotVisitor: visitorSlotRaw || null
                };
              });

            return {
              id: `round-${phaseIndex + 1}`,
              phaseId: phase.id,
              phaseOrder: phase.phaseOrder || (phaseIndex + 2),
              title: phase.title,
              matches: phaseGames
            };
          });

          const mapLinksByPhaseSet = (phaseIdSet) => bracketLinks
            .filter((link) => {
              const fromPhase = gamePhaseById[Number(link?.from_game_id)];
              const toPhase = gamePhaseById[Number(link?.to_game_id)];
              return phaseIdSet.has(fromPhase) && phaseIdSet.has(toPhase);
            })
            .map((link) => ({
              from: toNodeKey(`g-${link.from_game_id}`, 0),
              to: toNodeKey(`g-${link.to_game_id}`, String(link.to_slot) === 'visitor' ? 1 : 0),
              type: 'match',
              rule: String(link?.rule || 'winner')
            }))
            .filter((link) => link.from && link.to);

          nextRounds = mapRoundsFromPhases(mainKnockoutPhases);
          nextLinks = mapLinksByPhaseSet(new Set(mainKnockoutPhases.map((phase) => phase.id)));
          nextLinks = injectThirdPlaceLoserLinks(nextRounds, nextLinks);
          nextRankedRounds = buildRounds(rankedKnockoutPhases);
          nextRankedLinks = [];
        } else {
          nextRounds = buildRounds(mainKnockoutPhases);
          nextLinks = injectThirdPlaceLoserLinks(nextRounds, extractManualLinks(nextRounds));
          nextRankedRounds = buildRounds(rankedKnockoutPhases);
          nextRankedLinks = extractManualLinks(nextRankedRounds);
        }

        setRounds(nextRounds);
        setManualLinks(nextLinks);
        rankedPhaseTemplateRef.current = buildPhaseTemplate(nextRankedRounds);
        const normalizedCanvases = (persistedCanvases.length > 0 ? persistedCanvases : [
          {
            id: 'ranked-canvas-1',
            name: 'Posición 1',
            rounds: nextRankedRounds,
            manualLinks: nextRankedLinks
          }
        ]).map((canvas, index) => ({
          id: String(canvas?.id || `ranked-canvas-${index + 1}`),
          name: String(canvas?.name || `Posición ${index + 1}`),
          rounds: normalizeRoundsByTemplate(canvas?.rounds || [], rankedPhaseTemplateRef.current),
          manualLinks: cloneManualLinksState(canvas?.manualLinks || [])
        }));

        const mergeRankedCanvases = (canvasList, templateRounds) => {
          const normalizedTemplate = Array.isArray(templateRounds) ? templateRounds : [];
          const selectedCanvasIds = Array.isArray(forcedRankedCanvasIds) ? forcedRankedCanvasIds : [];
          const sourceCanvases = selectedCanvasIds.length > 0
            ? selectedCanvasIds
              .map((canvasId) => canvasList.find((canvas) => String(canvas.id) === String(canvasId)))
              .filter(Boolean)
            : canvasList;

          const combinedRounds = normalizedTemplate.map((templateRound, roundIndex) => {
            const matches = [];
            sourceCanvases.forEach((canvas) => {
              const normalizedCanvasRounds = normalizeRoundsByTemplate(canvas.rounds || [], normalizedTemplate);
              const round = normalizedCanvasRounds[roundIndex];
              const prefixedMatches = (round?.matches || []).map((match) => ({
                ...match,
                id: `${canvas.id}::${match.id}`,
                sourceCanvasId: canvas.id,
                sourceCanvasName: canvas.name || canvas.id
              }));
              matches.push(...prefixedMatches);
            });
            return {
              ...templateRound,
              matches
            };
          });

          const combinedLinks = sourceCanvases.flatMap((canvas) =>
            (canvas.manualLinks || []).map((link) => {
              const fromParsed = parseNodeKey(link.from);
              const toParsed = parseNodeKey(link.to);
              return {
                ...link,
                from: toNodeKey(`${canvas.id}::${fromParsed.matchId}`, fromParsed.slotIndex),
                to: toNodeKey(`${canvas.id}::${toParsed.matchId}`, toParsed.slotIndex)
              };
            })
          );

          return {
            id: 'ranked-canvas-combined',
            name: 'Posicionamiento combinado',
            rounds: combinedRounds,
            manualLinks: combinedLinks
          };
        };

        const mergedCanvas = isRankedView && readOnly && forcedCanvasIdsKey
          ? mergeRankedCanvases(normalizedCanvases, rankedPhaseTemplateRef.current)
          : null;
        const preferredCanvas = forcedRankedCanvasId
          ? normalizedCanvases.find((canvas) => canvas.id === forcedRankedCanvasId)
          : null;
        const initialCanvas = mergedCanvas || preferredCanvas || normalizedCanvases[0] || {
          id: 'ranked-canvas-1',
          name: 'Posición 1',
          rounds: normalizeRoundsByTemplate(nextRankedRounds, rankedPhaseTemplateRef.current),
          manualLinks: []
        };

        setRankedCanvases(normalizedCanvases);
        setActiveRankedCanvasId(initialCanvas.id);
        setRankedCanvasNameDraft(initialCanvas.name);
        setRankedRounds(cloneRoundsState(initialCanvas.rounds));
        setRankedManualLinks(cloneManualLinksState(initialCanvas.manualLinks));
        rankedRoundsRef.current = cloneRoundsState(initialCanvas.rounds);
        rankedManualLinksRef.current = cloneManualLinksState(initialCanvas.manualLinks);
        setSelectedSource('');
        deletedGameIdsRef.current = new Set();
        setHasUnsavedChanges(false);
        setHasPendingLinkChanges(false);
        setHasUnsavedRankedChanges(false);
        setSaveErrorMessage('');
        poolBracketHydratedRef.current = readOnly && isPoolBracketsPage;
      } finally {
        if (!cancelled) {
          setLoading(false);
          if (readOnly && isPoolBracketsPage && useGoalTotalsForScores && tournamentId) {
            /** Tras aplicar estado de rounds React (timeout 0 a veces adelanta al commit del DOM). */
            window.setTimeout(() => {
              if (!cancelled) setScoresCanvasHydrateNonce((n) => n + 1);
            }, 80);
          }
        }
      }
    };

    loadBracketData();
    return () => {
      cancelled = true;
    };
  }, [
    tournamentId,
    selectedDivision,
    forcedRankedCanvasId,
    forcedCanvasIdsKey,
    isRankedView,
    readOnly,
    location.pathname,
    location.search,
    bracketReloadTick
  ]);

  useEffect(() => {
    if (!allowVisualDrag || !isMergedRankedView || !forcedCanvasIdsKey || !tournamentId) return;
    try {
      const key = `${VISUAL_ORDER_STORAGE_KEY}:${tournamentId}:${selectedDivision || ''}:${forcedCanvasIdsKey}`;
      const stored = localStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === 'object') setVisualOrderOverride(parsed);
      } else {
        setVisualOrderOverride({});
      }
    } catch {
      setVisualOrderOverride({});
    }
  }, [allowVisualDrag, isMergedRankedView, forcedCanvasIdsKey, tournamentId, selectedDivision]);

  const appliedVisualOrderRef = useRef(false);
  useEffect(() => {
    if (!allowVisualDrag || !isMergedRankedView || rankedRounds.length === 0) return;
    if (appliedVisualOrderRef.current) return;
    const hasOrderForRounds = rankedRounds.some((r) => Array.isArray(visualOrderOverride[r.id]) && visualOrderOverride[r.id].length > 0);
    if (!hasOrderForRounds) return;
    appliedVisualOrderRef.current = true;
    setRankedRounds((prev) =>
      prev.map((round) => {
        const order = visualOrderOverride[round.id];
        if (!Array.isArray(order) || order.length === 0) return round;
        const byId = new Map((round.matches || []).map((m) => [m.id, m]));
        const ordered = [];
        const seen = new Set();
        for (const id of order) {
          const m = byId.get(id);
          if (m && !seen.has(id)) {
            ordered.push(m);
            seen.add(id);
          }
        }
        for (const m of round.matches || []) {
          if (!seen.has(m.id)) ordered.push(m);
        }
        return { ...round, matches: ordered };
      })
    );
  }, [allowVisualDrag, isMergedRankedView, rankedRounds.length, visualOrderOverride]);
  useEffect(() => {
    appliedVisualOrderRef.current = false;
  }, [tournamentId, selectedDivision, forcedCanvasIdsKey]);

  useEffect(() => {
    if (!activeRankedCanvasId || rankedCanvases.length === 0) return;
    setRankedCanvases((prevCanvases) => {
      const canvasIndex = prevCanvases.findIndex((canvas) => canvas.id === activeRankedCanvasId);
      if (canvasIndex < 0) return prevCanvases;
      const currentCanvas = prevCanvases[canvasIndex];
      if (currentCanvas.rounds === rankedRounds && currentCanvas.manualLinks === rankedManualLinks) {
        return prevCanvases;
      }
      const nextCanvases = [...prevCanvases];
      nextCanvases[canvasIndex] = {
        ...currentCanvas,
        rounds: rankedRounds,
        manualLinks: rankedManualLinks
      };
      return nextCanvases;
    });
  }, [activeRankedCanvasId, rankedCanvases.length, rankedRounds, rankedManualLinks]);

  useEffect(() => {
    setRankedCanvasNameDraft(activeRankedCanvas?.name || '');
  }, [activeRankedCanvas?.id, activeRankedCanvas?.name]);

  useEffect(() => {
    if (!isRankedView || !forcedRankedCanvasId || rankedCanvases.length === 0) return;
    if (activeRankedCanvasId === forcedRankedCanvasId) return;
    const forcedCanvas = rankedCanvases.find((canvas) => canvas.id === forcedRankedCanvasId);
    if (!forcedCanvas) return;

    const nextRoundsState = normalizeRoundsByTemplate(
      forcedCanvas.rounds,
      rankedPhaseTemplateRef.current
    );
    const nextLinksState = cloneManualLinksState(forcedCanvas.manualLinks);
    setActiveRankedCanvasId(forcedCanvas.id);
    setRankedCanvasNameDraft(forcedCanvas.name || '');
    setRankedRounds(nextRoundsState);
    setRankedManualLinks(nextLinksState);
    rankedRoundsRef.current = nextRoundsState;
    rankedManualLinksRef.current = nextLinksState;
    setSelectedSource('');
    setIsLinkMode(false);
  }, [isRankedView, forcedRankedCanvasId, rankedCanvases, activeRankedCanvasId]);

  const createGameWithFallback = useCallback(async ({
    phaseId,
    bracketOrder,
    localId = null,
    visitorId = null,
    gameDate = null,
    gameTime = null,
    gameLocation = null,
    canvasBracket = 'Main',
    statsSlotLocal = null,
    statsSlotVisitor = null
  }) => {
    const today = new Date().toISOString().slice(0, 10);
    const date = gameDate && /^\d{4}-\d{2}-\d{2}$/.test(String(gameDate)) ? gameDate : today;
    const timeRaw = gameTime ? String(gameTime).trim() : '';
    const time = /^\d{1,2}:\d{2}(?::\d{2})?$/.test(timeRaw)
      ? (timeRaw.length === 5 ? `${timeRaw}:00` : timeRaw)
      : '00:00:00';
    const resolvedCanvas = canvasBracket === 'Ranked' ? 'Ranked' : 'Main';
    const normStats = (v) => {
      if (v == null || String(v).trim() === '') return null;
      return String(v).trim();
    };
    const basePayload = {
      phas_id: Number(phaseId),
      local: localId,
      visitor: visitorId,
      division: selectedDivision || null,
      bracket_order: bracketOrder,
      game_date: date,
      game_time: time,
      game_location: normGameLocationPersist(gameLocation),
      canvas_bracket: resolvedCanvas,
      stats_slot_local: normStats(statsSlotLocal),
      stats_slot_visitor: normStats(statsSlotVisitor)
    };

    try {
      return await configService.createBracketGame(tournamentId, basePayload);
    } catch (firstError) {
      const alreadyHasTeams = localId != null && visitorId != null;
      if (alreadyHasTeams || teamOptions.length < 2) {
        throw firstError;
      }

      const fallbackLocal = Number(teamOptions[0]?.id);
      const fallbackVisitor = Number(teamOptions[1]?.id);
      if (!Number.isInteger(fallbackLocal) || !Number.isInteger(fallbackVisitor) || fallbackLocal === fallbackVisitor) {
        throw firstError;
      }

      // Compatibilidad con backend que aun exige local/visitor NOT NULL.
      return configService.createBracketGame(tournamentId, {
        ...basePayload,
        local: fallbackLocal,
        visitor: fallbackVisitor
      });
    }
  }, [selectedDivision, tournamentId, teamOptions]);

  const refreshBracketGameNumbers = useCallback(async () => {
    if (!tournamentId) return;

    try {
      const [bracketMainResponse, bracketRankedResponse] = await Promise.all([
        configService.getBracket(tournamentId, selectedDivision || undefined, 'Main'),
        configService.getBracket(tournamentId, selectedDivision || undefined, 'Ranked')
      ]);
      const rankedIdsForMain = collectGameIdsFromRankedCanvases(rankedCanvases);
      const gamesMain = filterGamesForMainCanvas(
        bracketMainResponse?.success ? bracketMainResponse?.data?.games || [] : [],
        rankedIdsForMain
      );
      const gamesRanked = bracketRankedResponse?.success ? bracketRankedResponse?.data?.games || [] : [];
      const bracketGames = [...gamesMain, ...gamesRanked];
      const gameNumById = bracketGames.reduce((acc, game) => {
        const gameId = Number(game?.game_id);
        const gameNum = Number(game?.game_num);
        if (Number.isInteger(gameId) && gameId > 0) {
          acc[gameId] = Number.isInteger(gameNum) && gameNum > 0 ? gameNum : null;
        }
        return acc;
      }, {});

      const applyGameNumbers = (prevRounds) =>
        (Array.isArray(prevRounds) ? prevRounds : []).map((round) => ({
          ...round,
          matches: (round.matches || []).map((match) => {
            const matchGameId = getGameIdFromMatch(match, match.id);
            if (!matchGameId) return match;
            return {
              ...match,
              gameNum: gameNumById[matchGameId] ?? match.gameNum ?? null
            };
          })
        }));

      /*
       Tras awaits (persistir / borrar partido), un setState(prev => …) puede ver todavía el estado anterior
       y reaplicar columnas viejas sobre el lienzo. Los refs sí se actualizan síncronos al quitar matches.
       */
      const baseMain = roundsRef.current;
      const baseRanked = rankedRoundsRef.current;
      setRounds(applyGameNumbers(baseMain));
      setRankedRounds(applyGameNumbers(baseRanked));
    } catch (error) {
      console.error('Error sincronizando game_num del bracket:', error);
    }
  }, [tournamentId, selectedDivision, rankedCanvases]);

  /**
   * Resuelve phas_id para una columna del bracket (principal o ranked).
   * En lienzos ranked el JSON persistido a veces llega sin phaseId; se usa la plantilla de fases.
   */
  const resolvePhaseIdForRound = useCallback((round) => {
    if (!round) return null;
    const tryNum = (v) => {
      const n = Number(v);
      return Number.isInteger(n) && n > 0 ? n : null;
    };
    const fromFields = tryNum(round.phaseId) ?? tryNum(round.phas_id);
    if (fromFields) return fromFields;
    const tmpl = rankedPhaseTemplateRef.current || [];
    const byId = tmpl.find((r) => String(r.id) === String(round.id));
    if (byId?.phaseId != null) {
      const n = tryNum(byId.phaseId);
      if (n) return n;
    }
    const rt = String(round.title || '').trim().toLowerCase();
    if (rt) {
      const byTitle = tmpl.find((r) => String(r.title || '').trim().toLowerCase() === rt);
      if (byTitle?.phaseId != null) {
        const n = tryNum(byTitle.phaseId);
        if (n) return n;
      }
    }
    if (tmpl[0]?.phaseId != null) {
      const n = tryNum(tmpl[0].phaseId);
      if (n) return n;
    }
    return null;
  }, []);

  const persistBracket = useCallback(async (roundsArg, manualLinksArg, options = {}) => {
    const { persistLinks = true, viewKey = 'main', suppressNotify = false } = options || {};
    const viewState = getViewState(viewKey);
    const roundsToPersist = Array.isArray(roundsArg) ? roundsArg : viewState.roundsRef.current;
    const manualLinksToPersist = Array.isArray(manualLinksArg) ? manualLinksArg : viewState.manualLinksRef.current;
    const pendingDeletesBeforePersist = [...deletedGameIdsRef.current];
    /** Si sólo hay borrados (p. ej. último match de todas las columnas vacías), igual hay que ejecutar DELETE en BD */
    const hasRoundsStructure = Array.isArray(roundsToPersist) && roundsToPersist.length > 0;
    if (!tournamentId || (!hasRoundsStructure && pendingDeletesBeforePersist.length === 0)) return;

    setSaveStatus('saving');

    try {
      let hadGamePersistError = false;
      const pendingDeletedIds = [...deletedGameIdsRef.current];
      for (const gameId of pendingDeletedIds) {
        try {
          await configService.deleteBracketGame(tournamentId, gameId);
          deletedGameIdsRef.current.delete(gameId);
        } catch (deleteError) {
          hadGamePersistError = true;
          console.error('Error eliminando juego pendiente:', deleteError);
        }
      }

      let workingRounds = (Array.isArray(roundsToPersist) ? roundsToPersist : []).map((round) => ({
        ...round,
        matches: (round.matches || []).map((match) => ({ ...match, teams: [...(match.teams || [])] }))
      }));
      let didCreateGames = false;
      const matchIdAliasMap = {};
      const today = new Date().toISOString().slice(0, 10);
      const normStatsSlotPersist = (v) => {
        if (v == null || String(v).trim() === '') return null;
        return String(v).trim().slice(0, 64);
      };

      for (let roundIndex = 0; roundIndex < workingRounds.length; roundIndex += 1) {
        const round = workingRounds[roundIndex];
        for (let matchIndex = 0; matchIndex < round.matches.length; matchIndex += 1) {
          const match = round.matches[matchIndex];
          const parsedLocalId = Number(match.teams?.[0]?.teamId);
          const parsedVisitorId = Number(match.teams?.[1]?.teamId);
          const localId = Number.isInteger(parsedLocalId) && parsedLocalId > 0 ? parsedLocalId : null;
          const visitorId = Number.isInteger(parsedVisitorId) && parsedVisitorId > 0 ? parsedVisitorId : null;
          const hasCompleteTeams = localId != null && visitorId != null && localId !== visitorId;

          const phaseId = resolvePhaseIdForRound(round);
          if (!phaseId) {
            continue;
          }
          if (Number(round.phaseId) !== phaseId) {
            round.phaseId = phaseId;
          }

          const matchDate = match.gameDate && /^\d{4}-\d{2}-\d{2}$/.test(String(match.gameDate)) ? match.gameDate : today;
          const matchTimeRaw = match.gameTime ? String(match.gameTime).trim() : '';
          const matchTime = /^\d{1,2}:\d{2}(?::\d{2})?$/.test(matchTimeRaw)
            ? (matchTimeRaw.length === 5 ? `${matchTimeRaw}:00` : matchTimeRaw)
            : '00:00:00';
          const homeScore = getScoreField(match.score, 'home');
          const awayScore = getScoreField(match.score, 'away');
          const localScoreStr = String(homeScore).trim();
          const visitorScoreStr = String(awayScore).trim();
          const payload = {
            phas_id: phaseId,
            local: hasCompleteTeams ? localId : null,
            visitor: hasCompleteTeams ? visitorId : null,
            division: selectedDivision || null,
            bracket_order: matchIndex + 1,
            game_date: matchDate,
            game_time: matchTime,
            game_location: normGameLocationPersist(match.gameLocation),
            local_score: localScoreStr === '' ? null : localScoreStr,
            visitor_score: visitorScoreStr === '' ? null : visitorScoreStr,
            stats_slot_local: normStatsSlotPersist(match.statsSlotLocal),
            stats_slot_visitor: normStatsSlotPersist(match.statsSlotVisitor)
          };

          const persistedGameId = extractGameIdFromMatch(match);
          if (Number.isInteger(persistedGameId) && persistedGameId > 0) {
            try {
              const updatePayload = { ...payload };
              await configService.updateBracketGame(tournamentId, persistedGameId, updatePayload);
            } catch (updateError) {
              hadGamePersistError = true;
              console.error('Error actualizando juego de bracket:', updateError);
            }
          } else {
            try {
              const createdResponse = await createGameWithFallback({
                phaseId,
                bracketOrder: matchIndex + 1,
                localId: hasCompleteTeams ? localId : null,
                visitorId: hasCompleteTeams ? visitorId : null,
                gameDate: match.gameDate,
                gameTime: match.gameTime,
                gameLocation: match.gameLocation,
                canvasBracket: viewKey === 'ranked' ? 'Ranked' : 'Main',
                statsSlotLocal: match.statsSlotLocal,
                statsSlotVisitor: match.statsSlotVisitor
              });
              const { gameId: createdGameId, gameNum: createdGameNum } = extractGameFromCreateResponse(createdResponse);
              if (createdGameId) {
                const previousMatchId = String(match.id);
                match.gameId = createdGameId;
                match.game_id = createdGameId;
                match.gameNum = createdGameNum;
                match.id = `g-${createdGameId}`;
                matchIdAliasMap[previousMatchId] = match.id;
                didCreateGames = true;
              }
            } catch (createError) {
              hadGamePersistError = true;
              console.error('Error creando juego de bracket:', createError);
            }
          }
        }
      }

      if (didCreateGames) {
        viewState.roundsRef.current = workingRounds;
        viewState.setRoundsState(workingRounds);
      }

      const matchById = {};
      workingRounds.forEach((round) => {
        round.matches.forEach((match) => {
          matchById[String(match.id)] = match;
        });
      });

      const normalizedManualLinks = manualLinksToPersist.map((link) => {
        const fromParsed = parseNodeKey(link.from);
        const toParsed = parseNodeKey(link.to);
        const resolvedFromMatchId = matchIdAliasMap[fromParsed.matchId] || fromParsed.matchId;
        const resolvedToMatchId = matchIdAliasMap[toParsed.matchId] || toParsed.matchId;
        return {
          ...link,
          from: toNodeKey(resolvedFromMatchId, fromParsed.slotIndex),
          to: toNodeKey(resolvedToMatchId, toParsed.slotIndex)
        };
      });

      if (Object.keys(matchIdAliasMap).length > 0) {
        viewState.manualLinksRef.current = normalizedManualLinks;
        viewState.setManualLinksState(normalizedManualLinks);
      }

      if (!persistLinks) {
        await refreshBracketGameNumbers();
        if (hadGamePersistError) {
          setSaveStatus('error');
          if (viewKey === 'ranked') {
            setHasUnsavedRankedChanges(true);
          } else {
            setHasUnsavedChanges(true);
          }
          setSaveErrorMessage('Hubo errores al persistir algunos juegos.');
        } else {
          setSaveStatus('saved');
          if (viewKey !== 'ranked') {
            setHasUnsavedChanges(false);
          }
          setSaveErrorMessage('');
          if (suppressNotify) {
            broadcastTournamentCoherenceChanged(tournamentId, { fullBracketReload: false });
          } else {
            notifyBracketDataChanged(tournamentId);
          }
        }
        return;
      }

      const matchByIdForLinks = {};
      const ingestMatchesIntoMap = (roundList) => {
        (roundList || []).forEach((round) => {
          (round.matches || []).forEach((m) => {
            matchByIdForLinks[String(m.id)] = m;
          });
        });
      };
      ingestMatchesIntoMap(workingRounds);
      ingestMatchesIntoMap(roundsRef.current);

      const uiLinksToBracketApi = (uiLinks) =>
        (uiLinks || [])
          .map((link) => {
            const fromParsed = parseNodeKey(link.from);
            const toParsed = parseNodeKey(link.to);
            const fromMatch = matchByIdForLinks[String(fromParsed.matchId)];
            const toMatch = matchByIdForLinks[String(toParsed.matchId)];
            const fromGameId = getGameIdFromMatch(fromMatch, fromParsed.matchId);
            const toGameId = getGameIdFromMatch(toMatch, toParsed.matchId);
            if (!fromGameId || !toGameId) return null;
            return {
              from_game_id: fromGameId,
              to_game_id: toGameId,
              to_slot: toParsed.slotIndex === 1 ? 'visitor' : 'local',
              rule: String(link?.rule || 'winner')
            };
          })
          .filter(Boolean);

      const dedupeBracketLinks = (rows) => {
        const map = new Map();
        for (const row of rows) {
          const key = `${row.from_game_id}|${row.to_game_id}|${row.to_slot}|${row.rule || 'winner'}`;
          map.set(key, row);
        }
        return [...map.values()];
      };

      const mainLinkRows = uiLinksToBracketApi(manualLinksRef.current);
      const rankedIdsPreserve = collectGameIdsFromRankedCanvases(rankedCanvases);
      const preservedRows = (apiBracketLinksRef.current || [])
        .map((l) => ({
          from_game_id: Number(l.from_game_id),
          to_game_id: Number(l.to_game_id),
          to_slot: l.to_slot,
          rule: l.rule || 'winner'
        }))
        .filter(
          (l) =>
            Number.isInteger(l.from_game_id) &&
            Number.isInteger(l.to_game_id) &&
            (rankedIdsPreserve.has(l.from_game_id) || rankedIdsPreserve.has(l.to_game_id))
        );

      const linksPayload = dedupeBracketLinks([...mainLinkRows, ...preservedRows]);

      const uiLinkCount = manualLinksRef.current?.length || 0;
      if (uiLinkCount > 0 && linksPayload.length === 0) {
        setSaveStatus('error');
        setHasUnsavedChanges(true);
        setHasPendingLinkChanges(true);
        setSaveErrorMessage('Las conexiones requieren juegos guardados con game_id en origen y destino.');
        return;
      }

      await configService.saveBracketLinks(tournamentId, linksPayload, selectedDivision || undefined);
      apiBracketLinksRef.current = linksPayload.map((row) => ({ ...row }));
      await refreshBracketGameNumbers();
      if (hadGamePersistError) {
        setSaveStatus('error');
        setHasUnsavedChanges(true);
        setHasPendingLinkChanges(false);
        setSaveErrorMessage('Se guardaron conexiones, pero hubo errores al persistir algunos juegos.');
      } else {
        setSaveStatus('saved');
        setHasUnsavedChanges(false);
        setHasPendingLinkChanges(false);
        setSaveErrorMessage('');
        if (suppressNotify) {
          broadcastTournamentCoherenceChanged(tournamentId, { fullBracketReload: false });
        } else {
          notifyBracketDataChanged(tournamentId);
        }
      }
    } catch (error) {
      console.error('Error guardando bracket:', error);
      setSaveStatus('error');
      setSaveErrorMessage(error?.response?.data?.message || 'Error al guardar el bracket.');
    }
  }, [
    tournamentId,
    selectedDivision,
    createGameWithFallback,
    refreshBracketGameNumbers,
    getViewState,
    resolvePhaseIdForRound,
    rankedCanvases
  ]);

  const persistRankedCanvases = useCallback(async (options = {}) => {
    const { suppressNotify = false } = options || {};
    if (!tournamentId) return;

    try {
      setSaveStatus('saving');
      setSaveErrorMessage('');
      const pendingDeletedIds = [...deletedGameIdsRef.current];
      let hadDeleteError = false;
      for (const gameId of pendingDeletedIds) {
        try {
          await configService.deleteBracketGame(tournamentId, gameId);
          deletedGameIdsRef.current.delete(gameId);
        } catch (deleteError) {
          hadDeleteError = true;
          console.error('Error eliminando juego pendiente (ranked):', deleteError);
        }
      }

      const activeCanvasName = String(rankedCanvasNameDraft || '').trim() || 'Posición sin nombre';
      const canvasesToPersist = rankedCanvases.map((canvas) => (
        canvas.id === activeRankedCanvasId
          ? {
            ...canvas,
            name: activeCanvasName,
            rounds: cloneRoundsState(rankedRoundsRef.current),
            manualLinks: cloneManualLinksState(rankedManualLinksRef.current)
          }
          : canvas
      ));

      const payload = canvasesToPersist.map((canvas, index) => ({
        id: String(canvas?.id || `ranked-canvas-${index + 1}`),
        name: String(canvas?.name || `Posición ${index + 1}`),
        rounds: normalizeRoundsByTemplate(canvas?.rounds || [], rankedPhaseTemplateRef.current),
        manualLinks: cloneManualLinksState(canvas?.manualLinks || [])
      }));

      await configService.saveRankedCanvases(tournamentId, payload, selectedDivision || undefined);
      setRankedCanvases(payload);
      setHasUnsavedRankedChanges(false);
      if (hadDeleteError) {
        setSaveStatus('error');
        setSaveErrorMessage('No se pudieron eliminar algunos juegos en el servidor.');
      } else {
        setSaveStatus('saved');
        setSaveErrorMessage('');
        if (!suppressNotify) {
          notifyBracketDataChanged(tournamentId);
        } else {
          broadcastTournamentCoherenceChanged(tournamentId, { fullBracketReload: false });
        }
      }
    } catch (error) {
      console.error('Error guardando lienzos ranked:', error);
      setSaveStatus('error');
      setSaveErrorMessage(error?.response?.data?.message || 'Error al guardar lienzos ranked.');
    }
  }, [tournamentId, rankedCanvases, activeRankedCanvasId, selectedDivision, rankedCanvasNameDraft]);

  /** Mismo flujo que ranked: persistir juegos/enlaces del lienzo principal sin recarga completa. */
  const persistMainCanvas = useCallback(async (roundsArg, manualLinksArg, options = {}) => {
    const { persistLinks = false, suppressNotify = true } = options || {};
    await persistBracket(
      roundsArg ?? roundsRef.current,
      manualLinksArg ?? manualLinksRef.current,
      { persistLinks, viewKey: 'main', suppressNotify }
    );
  }, [persistBracket]);

  const hasPersistedGameId = useCallback((matchId) => {
    const parsedId = String(matchId || '');
    const checkRounds = (roundList) => {
      for (const round of roundList || []) {
        const match = (round.matches || []).find((item) => String(item.id) === parsedId);
        if (match) {
          return getGameIdFromMatch(match, parsedId) > 0;
        }
      }
      return false;
    };
    if (checkRounds(roundsRef.current)) return true;
    if (checkRounds(rankedRoundsRef.current)) return true;
    return getGameIdFromMatch(null, parsedId) > 0;
  }, []);

  const handleTeamSelection = useCallback(async (roundId, matchId, slotIndex, selectedTeamId) => {
    const selectedTeam = teamById[selectedTeamId];
    const picked =
      selectedTeam?.id != null && String(selectedTeam.id).trim() !== '';
    const sourceRoundsRef = isRankedView ? rankedRoundsRef : roundsRef;
    const setTargetRounds = isRankedView ? setRankedRounds : setRounds;
    const nextRounds = sourceRoundsRef.current.map((round) => {
      if (round.id !== roundId) return round;
      return {
        ...round,
        matches: round.matches.map((match) => {
          if (match.id !== matchId) return match;
          return {
            ...match,
            statsSlotLocal: slotIndex === 0 && picked ? null : match.statsSlotLocal,
            statsSlotVisitor: slotIndex === 1 && picked ? null : match.statsSlotVisitor,
            teams: (match.teams || []).map((team, index) => {
              if (index !== slotIndex) return team;
              return {
                ...team,
                teamId: selectedTeam?.id || '',
                name: selectedTeam?.name || 'Por Definir',
                seed: selectedTeam?.seed ?? '-',
                flag: selectedTeam?.flag || TEAM_FALLBACK_IMAGE
              };
            })
          };
        })
      };
    });
    sourceRoundsRef.current = nextRounds;
    setTargetRounds(nextRounds);
    setSaveStatus('idle');
    setSaveErrorMessage('');

    if (isRankedView) {
      setHasUnsavedChanges(false);
      setHasUnsavedRankedChanges(true);
      await persistBracket(nextRounds, rankedManualLinksRef.current, {
        persistLinks: false,
        viewKey: 'ranked',
        suppressNotify: true
      });
      await persistRankedCanvases({ suppressNotify: true });
      return;
    }

    setHasUnsavedChanges(false);
    await persistMainCanvas(nextRounds, activeManualLinksRef.current, { persistLinks: false });
  }, [teamById, persistBracket, persistMainCanvas, persistRankedCanvases, activeManualLinksRef, rankedManualLinksRef, isRankedView]);

  /** Posición de grupo inline (1A, 3B…): el nombre visible se calcula siempre desde la tabla actual. */
  const handleStatsSlotFieldChange = useCallback(
    (roundId, matchId, side, rawValue) => {
      const norm = (v) => {
        if (v == null) return null;
        const s = String(v).trim();
        return s === '' ? null : s.slice(0, 64);
      };
      const value = norm(rawValue);
      const sourceRoundsRef = isRankedView ? rankedRoundsRef : roundsRef;
      const setTargetRounds = isRankedView ? setRankedRounds : setRounds;
      const nextRounds = sourceRoundsRef.current.map((round) => {
        if (round.id !== roundId) return round;
        return {
          ...round,
          matches: round.matches.map((match) => {
            if (match.id !== matchId) return match;
            return {
              ...match,
              statsSlotLocal: side === 'local' ? value : match.statsSlotLocal,
              statsSlotVisitor: side === 'visitor' ? value : match.statsSlotVisitor,
              teams: (match.teams || []).map((team, index) => {
                const isSide = (side === 'local' && index === 0) || (side === 'visitor' && index === 1);
                if (!isSide) return team;
                return createEmptyTeam();
              })
            };
          })
        };
      });
      sourceRoundsRef.current = nextRounds;
      setTargetRounds(nextRounds);
      setSaveStatus('idle');
      setSaveErrorMessage('');
      if (isRankedView) {
        setHasUnsavedChanges(false);
        setHasUnsavedRankedChanges(true);
      } else {
        setHasUnsavedChanges(true);
      }
    },
    [isRankedView]
  );

  const handleStatsSlotFieldBlur = useCallback(async () => {
    const nextRounds = (isRankedView ? rankedRoundsRef : roundsRef).current;
    if (isRankedView) {
      await persistBracket(nextRounds, rankedManualLinksRef.current, {
        persistLinks: false,
        viewKey: 'ranked',
        suppressNotify: true
      });
      await persistRankedCanvases({ suppressNotify: true });
      return;
    }
    await persistMainCanvas(nextRounds, activeManualLinksRef.current, { persistLinks: false });
  }, [
    activeManualLinksRef,
    isRankedView,
    persistBracket,
    persistMainCanvas,
    persistRankedCanvases,
    rankedManualLinksRef
  ]);

  const handleDateTimeChange = useCallback(async (roundId, matchId, field, value) => {
    const sourceRoundsRef = isRankedView ? rankedRoundsRef : roundsRef;
    const setTargetRounds = isRankedView ? setRankedRounds : setRounds;
    const nextRounds = sourceRoundsRef.current.map((round) => {
      if (round.id !== roundId) return round;
      return {
        ...round,
        matches: round.matches.map((match) => {
          if (match.id !== matchId) return match;
          if (field === 'placement') {
            let placement = null;
            let placementNumber = null;
            if (value && typeof value === 'object' && !Array.isArray(value)) {
              placement =
                value.label != null && String(value.label).trim() !== '' ? String(value.label).trim() : null;
              const n = Number(value.number);
              placementNumber = Number.isInteger(n) && n >= 0 && n <= 15 ? n : null;
            } else if (value != null && String(value).trim() !== '') {
              placement = String(value).trim();
              placementNumber = placementNumberFromLabel(placement);
            }
            return { ...match, placement, placementNumber };
          }
          const nextFieldValue =
            field === 'gameLocation'
              ? value == null || value === undefined
                ? ''
                : String(value).slice(0, 255)
              : value || null;
          return {
            ...match,
            [field]: nextFieldValue
          };
        })
      };
    });
    sourceRoundsRef.current = nextRounds;
    setTargetRounds(nextRounds);
    setSaveStatus('idle');
    setHasUnsavedChanges(!isRankedView);
    setHasUnsavedRankedChanges(!!isRankedView);

    const match = nextRounds.flatMap((r) => r.matches).find((m) => m.id === matchId);
    const round = nextRounds.find((r) => r.matches.some((m) => m.id === matchId));

    if (field === 'placement') {
      if (match?.gameId && tournamentId) {
        try {
          setSaveStatus('saving');
          const placementLabel =
            match.placement != null && String(match.placement).trim() !== '' ? String(match.placement).trim() : null;
          const placementNum =
            match.placementNumber != null && Number.isInteger(Number(match.placementNumber))
              ? Number(match.placementNumber)
              : null;
          await configService.updateBracketGame(tournamentId, match.gameId, {
            placement: placementLabel,
            placement_number: placementNum
          });
          setSaveStatus('saved');
          setSaveErrorMessage('');
          if (isRankedView) {
            await persistRankedCanvases({ suppressNotify: true });
          } else {
            await persistMainCanvas(nextRounds, manualLinksRef.current, { persistLinks: false });
          }
        } catch (err) {
          console.error('Error guardando posición:', err);
          setSaveStatus('error');
          setSaveErrorMessage('No se pudo guardar la posición.');
        }
      }
      return;
    }

    if (
      match?.gameId &&
      round?.phaseId &&
      tournamentId &&
      (field === 'gameDate' || field === 'gameTime' || field === 'gameLocation')
    ) {
      const today = new Date().toISOString().slice(0, 10);
      const matchDate = match.gameDate && /^\d{4}-\d{2}-\d{2}$/.test(String(match.gameDate)) ? match.gameDate : today;
      const matchTimeRaw = match.gameTime ? String(match.gameTime).trim() : '';
      const matchTime = /^\d{1,2}:\d{2}(?::\d{2})?$/.test(matchTimeRaw)
        ? (matchTimeRaw.length === 5 ? `${matchTimeRaw}:00` : matchTimeRaw)
        : '00:00:00';
      try {
        setSaveStatus('saving');
        await configService.updateBracketGame(tournamentId, match.gameId, {
          game_date: matchDate,
          game_time: matchTime,
          game_location: normGameLocationPersist(match.gameLocation)
        });
        setSaveStatus('saved');
        if (isRankedView) {
          await persistRankedCanvases({ suppressNotify: true });
        } else {
          await persistMainCanvas(nextRounds, manualLinksRef.current, { persistLinks: false });
        }
      } catch (err) {
        console.error('Error guardando fecha/hora/ubicación:', err);
        setSaveStatus('error');
        setSaveErrorMessage('No se pudo guardar la fecha, la hora o la ubicación.');
      }
    }
  }, [isRankedView, tournamentId, persistRankedCanvases, persistMainCanvas]);

  const handleAddMatch = useCallback(async (roundId) => {
    const sourceRoundsRef = isRankedView ? rankedRoundsRef : roundsRef;
    const setTargetRounds = isRankedView ? setRankedRounds : setRounds;
    const currentRound = sourceRoundsRef.current.find((round) => round.id === roundId);
    const resolvedPhaseId = resolvePhaseIdForRound(currentRound);
    if (tournamentId && !resolvedPhaseId) {
      setSaveStatus('error');
      setSaveErrorMessage(
        'No se pudo determinar la fase (phas_id) de esta columna. Revisa que el torneo tenga fases de eliminatoria configuradas.'
      );
      return;
    }
    const nextBracketOrder = getNextBracketOrder(currentRound);
    const tempMatchId = createMatchId(roundId);
    const nextRankedGameNum = isRankedView
      ? (() => {
        const mainHighestGameNum = getHighestGameNumber(roundsRef.current);
        const rankedHighestGameNum = getHighestGameNumber(
          rankedCanvases.flatMap((canvas) => (
            canvas.id === activeRankedCanvasId
              ? rankedRoundsRef.current
              : (canvas.rounds || [])
          ))
        );
        return Math.max(mainHighestGameNum, rankedHighestGameNum) + 1;
      })()
      : null;

    setTargetRounds((prevRounds) => {
      const nextRounds = prevRounds.map((round) => {
        if (round.id !== roundId) return round;
        return {
          ...round,
          phaseId: round.phaseId ?? resolvedPhaseId,
          matches: [
            ...round.matches,
            {
              id: tempMatchId,
              teams: [createEmptyTeam(), createEmptyTeam()],
              score: createEmptyScore(),
              gameId: null,
              gameNum: isRankedView ? nextRankedGameNum : null,
              gameDate: new Date().toISOString().slice(0, 10),
              gameTime: '00:00',
              gameLocation: '',
              bracketOrder: nextBracketOrder,
              statsSlotLocal: null,
              statsSlotVisitor: null
            }
          ]
        };
      });
      sourceRoundsRef.current = nextRounds;
      return nextRounds;
    });
    setSaveStatus('idle');
    setSaveErrorMessage('');

    if (isRankedView) {
      setHasUnsavedChanges(false);
      setHasUnsavedRankedChanges(true);
    }

    if (!tournamentId || !resolvedPhaseId) return;

    const today = new Date().toISOString().slice(0, 10);
    try {
      const createdResponse = await createGameWithFallback({
        phaseId: resolvedPhaseId,
        bracketOrder: nextBracketOrder,
        localId: null,
        visitorId: null,
        gameDate: today,
        gameTime: '00:00',
        gameLocation: '',
        canvasBracket: isRankedView ? 'Ranked' : 'Main'
      });
      const { gameId: createdGameId, gameNum: createdGameNum } = extractGameFromCreateResponse(createdResponse);
      if (!createdGameId) {
        setSaveStatus('error');
        setSaveErrorMessage('El servidor no devolvió game_id al crear el partido.');
        return;
      }

      setTargetRounds((prevRounds) => {
        const nextRounds = prevRounds.map((round) => {
          if (round.id !== roundId) return round;
          return {
            ...round,
            matches: round.matches.map((match) => (
              match.id === tempMatchId
                ? {
                  ...match,
                  gameId: createdGameId,
                  gameNum: createdGameNum,
                  id: `g-${createdGameId}`
                }
                : match
            ))
          };
        });
        sourceRoundsRef.current = nextRounds;
        return nextRounds;
      });
      await refreshBracketGameNumbers();
      if (isRankedView) {
        setHasUnsavedRankedChanges(true);
      } else {
        setHasUnsavedChanges(false);
      }
      setSaveStatus('saved');
      setSaveErrorMessage('');
    } catch (error) {
      console.error('Error creando juego al agregar match:', error);
      setSaveStatus('error');
      setSaveErrorMessage(error?.response?.data?.message || 'No se pudo crear el juego al agregarlo.');
      if (isRankedView) {
        setHasUnsavedRankedChanges(true);
      } else {
        setHasUnsavedChanges(true);
      }
    }
  }, [
    tournamentId,
    createGameWithFallback,
    isRankedView,
    refreshBracketGameNumbers,
    rankedCanvases,
    activeRankedCanvasId,
    resolvePhaseIdForRound
  ]);

  const handleRemoveMatch = useCallback(async (roundId, matchId) => {
    const sourceRoundsRef = isRankedView ? rankedRoundsRef : roundsRef;
    const sourceManualLinksRef = isRankedView ? rankedManualLinksRef : manualLinksRef;
    const setTargetRounds = isRankedView ? setRankedRounds : setRounds;
    const setTargetManualLinks = isRankedView ? setRankedManualLinks : setManualLinks;
    const existingRound = sourceRoundsRef.current.find((round) => round.id === roundId);
    const existingMatch = existingRound?.matches?.find((match) => match.id === matchId);
    const gidDelete = extractGameIdFromMatch(existingMatch);
    const gameIdToDelete = Number.isInteger(gidDelete) && gidDelete > 0 ? gidDelete : null;
    const nextRounds = sourceRoundsRef.current.map((round) => {
      if (round.id !== roundId) return round;
      const remainingMatches = round.matches.filter((match) => match.id !== matchId);
      return { ...round, matches: remainingMatches };
    });
    const nextLinks = sourceManualLinksRef.current.filter((link) => {
      const fromParsed = parseNodeKey(link.from);
      const toParsed = parseNodeKey(link.to);
      return String(fromParsed.matchId) !== String(matchId) && String(toParsed.matchId) !== String(matchId);
    });
    sourceRoundsRef.current = nextRounds;
    sourceManualLinksRef.current = nextLinks;
    setTargetRounds(nextRounds);
    setTargetManualLinks(nextLinks);

    if (gameIdToDelete) {
      deletedGameIdsRef.current.add(gameIdToDelete);
    }
    if (isRankedView) {
      setHasUnsavedChanges(false);
      setHasUnsavedRankedChanges(true);
      await persistBracket(nextRounds, nextLinks, {
        persistLinks: false,
        viewKey: 'ranked',
        suppressNotify: true
      });
      await persistRankedCanvases({ suppressNotify: true });
      return;
    }

    setHasUnsavedChanges(false);
    await persistMainCanvas(nextRounds, nextLinks, { persistLinks: false });
  }, [isRankedView, persistBracket, persistMainCanvas, persistRankedCanvases]);

  const handleLinkTargetSelection = useCallback((targetId) => {
    if (readOnly) return;
    if (!isLinkMode) return;

    if (!selectedSource) {
      const targetParsed = parseNodeKey(targetId);
      if (!isRankedView && !hasPersistedGameId(targetParsed.matchId)) {
        setSaveStatus('error');
        setSaveErrorMessage('Para conectar, primero guarda los juegos (deben tener game_id).');
        return;
      }
      setSelectedSource(targetId);
      return;
    }

    if (selectedSource === targetId) {
      setSelectedSource('');
      return;
    }

    const sourceParsed = parseNodeKey(selectedSource);
    const targetParsed = parseNodeKey(targetId);
    if (!isRankedView && (!hasPersistedGameId(sourceParsed.matchId) || !hasPersistedGameId(targetParsed.matchId))) {
      setSelectedSource('');
      setSaveStatus('error');
      setSaveErrorMessage('Solo puedes conectar juegos ya guardados con game_id.');
      return;
    }

    const sourceRoundIndex = getRoundIndexForMatchId(displayedRoundsRef.current, sourceParsed.matchId);
    const targetRoundIndex = getRoundIndexForMatchId(displayedRoundsRef.current, targetParsed.matchId);
    if (sourceRoundIndex >= 0 && targetRoundIndex >= 0 && targetRoundIndex <= sourceRoundIndex) {
      setSelectedSource('');
      return;
    }

    const setTargetManualLinks = isRankedView ? setRankedManualLinks : setManualLinks;
    const targetManualLinksRef = isRankedView ? rankedManualLinksRef : manualLinksRef;
    setTargetManualLinks((prev) => {
      const withoutPreviousSource = prev.filter((link) => link.from !== selectedSource);
      const newLink = { from: selectedSource, to: targetId, type: 'match', rule: 'winner' };
      const nextLinks = [...withoutPreviousSource, newLink];
      targetManualLinksRef.current = nextLinks;
      return nextLinks;
    });
    setSelectedSource('');
    setHasUnsavedChanges(!isRankedView);
    setHasPendingLinkChanges(!isRankedView);
    if (isRankedView) {
      setHasUnsavedRankedChanges(true);
    }
    setSaveStatus('idle');
    setSaveErrorMessage('');
  }, [
    isLinkMode,
    selectedSource,
    hasPersistedGameId,
    isRankedView,
    displayedRoundsRef,
    readOnly
  ]);

  const clearAllLinks = useCallback(() => {
    if (isRankedView) {
      setRankedManualLinks(() => {
        rankedManualLinksRef.current = [];
        return [];
      });
    } else {
      setManualLinks(() => {
        manualLinksRef.current = [];
        return [];
      });
    }
    setSelectedSource('');
    setHasUnsavedChanges(!isRankedView);
    setHasPendingLinkChanges(!isRankedView);
    if (isRankedView) {
      setHasUnsavedRankedChanges(true);
    }
    setSaveStatus('idle');
    setSaveErrorMessage('');
  }, [isRankedView]);

  const handleMatchCardSelection = useCallback((match, event) => {
    if (readOnly) {
      if (typeof onGameNavigate === 'function') {
        const interactiveTarget = event?.target?.closest?.('button,select,input,option,a');
        if (interactiveTarget) return;
        const gameId = extractGameIdFromMatch(match);
        if (gameId > 0) {
          onGameNavigate(gameId, match);
        }
      }
      return;
    }
    if (!isLinkMode) return;

    const interactiveTarget = event?.target?.closest?.('button,select,input,option');
    if (interactiveTarget) return;

    const cardRect = event?.currentTarget?.getBoundingClientRect?.();
    const clickY = Number(event?.clientY);
    let slotIndex = 0;

    if (cardRect && Number.isFinite(clickY)) {
      const relativeY = clickY - cardRect.top;
      slotIndex = relativeY >= cardRect.height / 2 ? 1 : 0;
    }

    handleLinkTargetSelection(`${match.id}-${slotIndex}`);
  }, [isLinkMode, handleLinkTargetSelection, onGameNavigate, readOnly]);

  const handleDragStart = useCallback((roundId, matchId, matchIndex) => (event) => {
    if (!canVisualDrag) return;
    const data = { roundId, matchId, matchIndex };
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', JSON.stringify(data));
    event.dataTransfer.setData('application/json', JSON.stringify(data));
    draggingMatchRef.current = data;
    const el = event.currentTarget;
    if (el) el.style.opacity = '0.5';
  }, [canVisualDrag]);

  const handleDragEnd = useCallback((event) => {
    draggingMatchRef.current = null;
    setDragOverMatchIndex(null);
    const el = event.currentTarget;
    if (el) el.style.opacity = '';
  }, []);

  const handleDragEnter = useCallback((roundId, matchIndex) => (event) => {
    if (!canVisualDrag) return;
    const data = draggingMatchRef.current;
    if (!data || data.roundId !== roundId) return;
    event.preventDefault();
    event.stopPropagation();
  }, [canVisualDrag]);

  const handleDragOver = useCallback((roundId, matchIndex) => (event) => {
    if (!canVisualDrag) return;
    const data = draggingMatchRef.current;
    if (!data || data.roundId !== roundId) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    setDragOverMatchIndex({ roundId, matchIndex });
  }, [canVisualDrag]);

  const handleDragLeave = useCallback(() => {
    setDragOverMatchIndex(null);
  }, []);

  const getDropIndexFromContainer = useCallback((containerEl, clientY, matchesCount) => {
    if (!containerEl || matchesCount < 0) return 0;
    const children = Array.from(containerEl.children).filter(
      (el) => !el.classList.contains('placements-drop-overlay')
    );
    if (children.length === 0) return 0;
    for (let i = 0; i < children.length; i++) {
      const rect = children[i].getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      if (clientY < midY) return Math.min(Math.floor(i / 2), matchesCount);
    }
    return matchesCount;
  }, []);

  const handleDrop = useCallback((roundId, dropIndex) => (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!canVisualDrag) return;
    let data = draggingMatchRef.current;
    if (!data) {
      try {
        const raw = event.dataTransfer.getData('text/plain') || event.dataTransfer.getData('application/json');
        if (raw) data = JSON.parse(raw);
      } catch {
        /* ignore */
      }
    }
    if (!data || data.roundId !== roundId) return;
    const sourceIndex = data.matchIndex;
    draggingMatchRef.current = null;
    setDragOverMatchIndex(null);
    if (sourceIndex === dropIndex) return;

    const sourceRounds = rankedRoundsRef.current;
    const roundIndex = sourceRounds.findIndex((r) => r.id === roundId);
    if (roundIndex < 0) return;
    const round = sourceRounds[roundIndex];
    const matches = [...(round.matches || [])];
    const [moved] = matches.splice(sourceIndex, 1);
    matches.splice(dropIndex, 0, moved);
    const nextRounds = sourceRounds.map((r, i) =>
      i === roundIndex ? { ...r, matches } : r
    );

    setRankedRounds(nextRounds);
    rankedRoundsRef.current = nextRounds;
    if (isMergedRankedView && forcedCanvasIdsKey) {
      const nextOrder = {};
      nextRounds.forEach((r) => {
        nextOrder[r.id] = (r.matches || []).map((m) => m.id);
      });
      setVisualOrderOverride(nextOrder);
      try {
        const key = `${VISUAL_ORDER_STORAGE_KEY}:${tournamentId}:${selectedDivision || ''}:${forcedCanvasIdsKey}`;
        localStorage.setItem(key, JSON.stringify(nextOrder));
      } catch {
        /* ignore */
      }
    }
  }, [
    canVisualDrag,
    isMergedRankedView,
    forcedCanvasIdsKey,
    tournamentId,
    selectedDivision
  ]);

  const handleContainerDragOverCapture = useCallback((round) => (event) => {
    if (!canVisualDrag) return;
    const data = draggingMatchRef.current;
    if (!data || data.roundId !== round.id) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, [canVisualDrag]);

  const handleContainerDragOver = useCallback((round) => (event) => {
    if (!canVisualDrag) return;
    if (event.target !== event.currentTarget) return;
    const data = draggingMatchRef.current;
    if (!data || data.roundId !== round.id) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const dropIndex = getDropIndexFromContainer(
      event.currentTarget,
      event.clientY,
      round.matches?.length ?? 0
    );
    setDragOverMatchIndex({ roundId: round.id, matchIndex: dropIndex });
  }, [canVisualDrag, getDropIndexFromContainer]);

  const handleContainerDrop = useCallback((round) => (event) => {
    if (event.target !== event.currentTarget) return;
    const dropIndex = getDropIndexFromContainer(
      event.currentTarget,
      event.clientY,
      round.matches?.length ?? 0
    );
    handleDrop(round.id, dropIndex)(event);
  }, [getDropIndexFromContainer, handleDrop]);

  const handleSaveChanges = useCallback(async () => {
    if (isRankedView) {
      if (!hasUnsavedRankedChanges) return;
      try {
        await persistBracket(activeRoundsRef.current, activeManualLinksRef.current, {
          persistLinks: false,
          viewKey: 'ranked',
          suppressNotify: true
        });
        await persistRankedCanvases({ suppressNotify: true });
      } catch (error) {
        console.error('Error guardando posicionamiento:', error);
      }
      return;
    }
    if (!hasPendingLinkChanges && !hasUnsavedChanges) return;
    try {
      await persistMainCanvas(activeRoundsRef.current, activeManualLinksRef.current, {
        persistLinks: true,
        suppressNotify: true
      });
    } catch (error) {
      console.error('Error guardando bracket principal:', error);
    }
  }, [
    isRankedView,
    hasUnsavedRankedChanges,
    hasUnsavedChanges,
    persistRankedCanvases,
    hasPendingLinkChanges,
    persistBracket,
    persistMainCanvas,
    activeRoundsRef,
    activeManualLinksRef
  ]);

  const handleCreateRankedCanvas = useCallback(() => {
    const nextCanvasIndex = rankedCanvases.length + 1;
    const canvasId = `ranked-canvas-${Date.now()}-${nextCanvasIndex}`;
    const fallbackTemplate = buildPhaseTemplate(
      rankedCanvases[0]?.rounds?.length
        ? rankedCanvases[0].rounds
        : (rankedRounds.length > 0 ? rankedRounds : rounds)
    );
    const phaseTemplate = rankedPhaseTemplateRef.current.length > 0
      ? rankedPhaseTemplateRef.current
      : fallbackTemplate;
    const templateRounds = phaseTemplate.map((roundTemplate, index) => ({
      id: roundTemplate?.id || `round-${index + 1}`,
      phaseId: roundTemplate?.phaseId != null ? Number(roundTemplate.phaseId) : null,
      phaseOrder: roundTemplate?.phaseOrder,
      title: roundTemplate?.title || `Fase ${index + 1}`,
      matches: []
    }));
    const newCanvasName = `Posición ${nextCanvasIndex}`;
    const newCanvas = {
      id: canvasId,
      name: newCanvasName,
      rounds: templateRounds,
      manualLinks: []
    };
    setRankedCanvases((prevCanvases) => [...prevCanvases, newCanvas]);
    setActiveRankedCanvasId(canvasId);
    setRankedCanvasNameDraft(newCanvasName);
    setRankedRounds(templateRounds);
    setRankedManualLinks([]);
    rankedRoundsRef.current = templateRounds;
    rankedManualLinksRef.current = [];
    setSelectedSource('');
    setIsLinkMode(false);
    setHasUnsavedChanges(false);
    setHasUnsavedRankedChanges(true);
    setHasPendingLinkChanges(false);
    setSaveStatus('idle');
    setSaveErrorMessage('');
  }, [rankedCanvases, rankedRounds, rounds]);

  const handleSelectRankedCanvas = useCallback((canvasId) => {
    if (!canvasId || canvasId === activeRankedCanvasId) return;

    const nextCanvases = rankedCanvases.map((canvas) => (
      canvas.id === activeRankedCanvasId
        ? {
          ...canvas,
          rounds: cloneRoundsState(rankedRounds),
          manualLinks: cloneManualLinksState(rankedManualLinks)
        }
        : canvas
    ));
    const selectedCanvas = nextCanvases.find((canvas) => canvas.id === canvasId);
    if (!selectedCanvas) return;

    setRankedCanvases(nextCanvases);
    setActiveRankedCanvasId(canvasId);
    const nextRoundsState = normalizeRoundsByTemplate(
      selectedCanvas.rounds,
      rankedPhaseTemplateRef.current
    );
    const nextLinksState = cloneManualLinksState(selectedCanvas.manualLinks);
    setRankedRounds(nextRoundsState);
    setRankedManualLinks(nextLinksState);
    rankedRoundsRef.current = nextRoundsState;
    rankedManualLinksRef.current = nextLinksState;
    setSelectedSource('');
    setIsLinkMode(false);
    setHasUnsavedChanges(false);
    setHasPendingLinkChanges(false);
    setSaveStatus('idle');
    setSaveErrorMessage('');
  }, [activeRankedCanvasId, rankedCanvases, rankedRounds, rankedManualLinks]);

  const handleScoreChange = useCallback((roundId, matchId, side, value) => {
    if (readOnly) return;
    const sanitizedValue = String(value).replace(/[^\d]/g, '').slice(0, 2);
    const updater = (prevRounds) =>
      prevRounds.map((round) => {
        if (round.id !== roundId) return round;
        return {
          ...round,
          matches: round.matches.map((match) => {
            if (match.id !== matchId) return match;
            const currentHome = getScoreField(match.score, 'home');
            const currentAway = getScoreField(match.score, 'away');
            return {
              ...match,
              score: {
                home: side === 'home' ? sanitizedValue : currentHome,
                away: side === 'away' ? sanitizedValue : currentAway
              }
            };
          })
        };
      });
    if (isRankedView) {
      setRankedRounds(updater);
      setHasUnsavedRankedChanges(true);
    } else {
      setRounds(updater);
      setHasUnsavedChanges(true);
    }
  }, [readOnly, isRankedView]);

  const connectors = useMemo(() => displayedManualLinks, [displayedManualLinks]);

  const cardScale = useMemo(() => 1, []);

  const matchCardHeight = useMemo(
    () => Math.max(112, Math.round(156 * cardScale)),
    [cardScale]
  );

  const bracketGeometry = useMemo(() => {
    const MIN_GAP_PX = 20;
    const MAX_GAP_PX = 140;
    const CANVAS_BREAK_GAP_PX = 130;
    const CARD_HEIGHT = Math.max(96, Math.round((matchCardHeight - 18)));
    const BASE_GAP = Math.max(8, Math.round(14 * cardScale));
    const FOOTBALL_MAIN_BOTTOM_PAD_PX = 20;
    const isFootballMainCanvas = isFootballTournament && !isRankedView && !isMergedRankedView;
    const firstRoundMatches = Math.max(1, displayedRounds[0]?.matches?.length || 1);

    const getCanvasBreakCount = (round) => {
      if (isMergedRankedView) return 0;
      const matches = round?.matches || [];
      if (matches.length <= 1) return 0;
      let breaks = 0;
      for (let index = 1; index < matches.length; index += 1) {
        const prevCanvasId = matches[index - 1]?.sourceCanvasId;
        const nextCanvasId = matches[index]?.sourceCanvasId;
        if (prevCanvasId && nextCanvasId && prevCanvasId !== nextCanvasId) {
          breaks += 1;
        }
      }
      return breaks;
    };
    const firstRoundBreaks = getCanvasBreakCount(displayedRounds[0]);
    const useDynamicGap = isMergedRankedView;

    const baseCapacityHeight = Math.round(620 * cardScale);
    const firstRoundContentMinHeight =
      (firstRoundMatches * CARD_HEIGHT) +
      ((firstRoundMatches - 1) * BASE_GAP) +
      (firstRoundBreaks * CANVAS_BREAK_GAP_PX);
    const roundCapacityHeight = isFootballMainCanvas
      ? (firstRoundMatches * 64) + ((firstRoundMatches - 1) * 12) + FOOTBALL_MAIN_BOTTOM_PAD_PX
      : Math.max(baseCapacityHeight, firstRoundContentMinHeight + 24);

    const firstRoundGap = (useDynamicGap && firstRoundMatches > 1)
      ? Math.max(MIN_GAP_PX, Math.min(MAX_GAP_PX, (roundCapacityHeight - 32 - (firstRoundMatches * CARD_HEIGHT)) / (firstRoundMatches - 1)))
      : BASE_GAP;

    const getCenteredOffset = (matchesCount, gapPx, breaksCount = 0) => {
      const safeMatches = Math.max(1, matchesCount);
      const contentHeight = useDynamicGap
        ? (safeMatches * CARD_HEIGHT) + ((safeMatches - 1) * gapPx)
        : (safeMatches * CARD_HEIGHT) +
          ((safeMatches - 1) * gapPx) +
          (Math.max(0, breaksCount) * CANVAS_BREAK_GAP_PX);
      return Math.max(0, (roundCapacityHeight - contentHeight) / 2);
    };

    const firstRoundOffset = useDynamicGap
      ? getCenteredOffset(firstRoundMatches, firstRoundGap, 0)
      : getCenteredOffset(firstRoundMatches, BASE_GAP, firstRoundBreaks);

    const roundLayouts = [];
    for (let index = 0; index < displayedRounds.length; index += 1) {
      const round = displayedRounds[index];
      const currentMatches = Math.max(1, round.matches.length);
      if (index === 0) {
        roundLayouts.push({
          roundId: round.id,
          gapPx: firstRoundGap,
          offsetPx: firstRoundOffset
        });
        continue;
      }

    const prevLayout = roundLayouts[index - 1];
      const prevMatches = Math.max(1, displayedRounds[index - 1]?.matches?.length || 1);
      const prevStep = CARD_HEIGHT + prevLayout.gapPx;
      const rawSpan = prevMatches / currentMatches;
      const span = Number.isFinite(rawSpan) && rawSpan >= 1 ? rawSpan : 1;
      const minGapForRound = useDynamicGap ? firstRoundGap : BASE_GAP;
      const proportionalGap = Math.max(minGapForRound, Math.round((prevStep * span) - CARD_HEIGHT));
      const bracketAlignedOffset = prevLayout.offsetPx + ((span - 1) * prevStep) / 2;

      roundLayouts.push({
        roundId: round.id,
        gapPx: Math.round(proportionalGap),
        offsetPx: Math.max(0, Math.round(bracketAlignedOffset))
      });
    }
      

    return { roundLayouts, roundCapacityHeight };
  }, [displayedRounds, cardScale, matchCardHeight, isMergedRankedView, isFootballTournament, isRankedView]);
  

  const layoutPhaseColumns = isFootballTournament
    ? displayedRounds.length
    : Math.max(BRACKET_REFERENCE_PHASE_COUNT, displayedRounds.length);
  const phaseWidthReference = isFootballTournament
    ? Math.max(1, displayedRounds.length)
    : displayedRounds.length > BRACKET_REFERENCE_PHASE_COUNT
      ? displayedRounds.length
      : BRACKET_REFERENCE_PHASE_COUNT;

  const recalculateConnectors = useCallback(() => {
    const board = boardRef.current;
    if (!board) return;

    const boardRect = board.getBoundingClientRect();
    const width = Math.max(1, Math.floor(board.scrollWidth));
    const height = Math.max(1, Math.floor(board.scrollHeight));
    setSvgSize({ width, height });

    const toLocalPoint = (rect, side) => ({
      x: (side === 'left' ? rect.left : rect.right) - boardRect.left + board.scrollLeft,
      y: rect.top - boardRect.top + board.scrollTop + rect.height / 2
    });

    const getMatchRectFromNode = (node) => {
      if (!node) return null;
      const matchCard = node.closest('.placements-match-card');
      if (!matchCard) return node.getBoundingClientRect();
      const footballBody = matchCard.querySelector('.placements-football-card-body');
      const target = footballBody || matchCard;
      return target.getBoundingClientRect();
    };

    const nextPaths = connectors
      .map((link, index) => {
      const fromNode = board.querySelector(`[data-node="${link.from}"]`);
      if (!fromNode) return null;
      const fromRect = getMatchRectFromNode(fromNode);
      if (!fromRect) return null;
      const start = toLocalPoint(fromRect, 'right');

      const toNode = board.querySelector(`[data-node="${link.to}"]`);
      if (!toNode) return null;
      const toRect = getMatchRectFromNode(toNode);
      if (!toRect) return null;
      const end = toLocalPoint(toRect, 'left');

      const gapWidth = Math.max(0, end.x - start.x);
      const isFootballBoard = board.classList.contains('placements-bracket-board--football-like');
      const elbowOffset = isFootballBoard
        ? Math.max(20, Math.min(gapWidth * 0.5, gapWidth - 20))
        : Math.max(24, Math.min(52, gapWidth * 0.35));
      const midX = start.x + elbowOffset;
      return {
        id: `${link.type}-${link.from}-${link.to || index}`,
        d: `M ${start.x} ${start.y} L ${midX} ${start.y} L ${midX} ${end.y} L ${end.x} ${end.y}`
      };
    })
      .filter(Boolean);

    setConnectorPaths(nextPaths);
  }, [connectors]);

  useEffect(() => {
    recalculateConnectors();
    const scheduleRecalc = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(recalculateConnectors);
      });
    };
    window.addEventListener('resize', scheduleRecalc);
    boardRef.current?.addEventListener('scroll', recalculateConnectors, { passive: true });

    const observer = new ResizeObserver(scheduleRecalc);
    if (boardRef.current) observer.observe(boardRef.current);

    return () => {
      window.removeEventListener('resize', scheduleRecalc);
      boardRef.current?.removeEventListener('scroll', recalculateConnectors);
      observer.disconnect();
    };
  }, [recalculateConnectors]);

  useEffect(() => {
    const rafId = requestAnimationFrame(() => recalculateConnectors());
    return () => cancelAnimationFrame(rafId);
  }, [recalculateConnectors]);

  if (loading) {
    return <section className="placements-bracket-root">Cargando placements...</section>;
  }

  if (displayedRounds.length === 0) {
    return <section className="placements-bracket-root">No hay fases eliminatorias o clasificados por grupo para mostrar.</section>;
  }

  return (
    <section className="placements-bracket-root">
      {showToolbar ? (
      <div className="placements-editor-toolbar">
        <div className="placements-toolbar-actions">
          <div className="placements-primary-actions">
            <button type="button" onClick={() => setIsLinkMode((prev) => !prev)} className="placements-toolbar-btn">
              {isLinkMode ? 'Salir de conectar' : 'Conectar lineas manualmente'}
            </button>
            <button type="button" onClick={clearAllLinks} className="placements-toolbar-btn placements-toolbar-btn-secondary">
              Limpiar conexiones
            </button>
            <button
              type="button"
              onClick={handleSaveChanges}
              className="placements-toolbar-btn"
              disabled={
                isRankedView
                  ? (!hasUnsavedRankedChanges || saveStatus === 'saving')
                  : (!hasPendingLinkChanges && !hasUnsavedChanges || saveStatus === 'saving')
              }
            >
              Guardar cambios
            </button>
          </div>
          {isRankedView && showRankedCanvasToolbar ? (
            <div className="placements-canvas-toolbox" role="group" aria-label="Herramientas de lienzo">
              <span className="placements-canvas-toolbox-chip">Ranked</span>
              <label htmlFor="placements-ranked-canvas" className="placements-canvas-label">Puesto</label>
              <select
                id="placements-ranked-canvas"
                className="placements-canvas-select"
                value={activeRankedCanvasId}
                onChange={(event) => handleSelectRankedCanvas(event.target.value)}
              >
                {rankedCanvases.map((canvas) => (
                  <option key={canvas.id} value={canvas.id}>
                    {canvas.name}
                  </option>
                ))}
              </select>
              <label htmlFor="placements-canvas-name-input" className="placements-canvas-label">Nombre</label>
              <input
                id="placements-canvas-name-input"
                type="text"
                className="placements-canvas-name-input"
                value={rankedCanvasNameDraft}
                onChange={(event) => {
                  const value = event.target.value;
                  setRankedCanvasNameDraft(value);
                  const saved = String(activeRankedCanvas?.name ?? '').trim();
                  if (String(value).trim() !== saved) {
                    setHasUnsavedRankedChanges(true);
                  }
                }}
                placeholder="Nombre del lienzo"
                aria-label="Nombre del lienzo"
              />
              <button
                type="button"
                onClick={handleCreateRankedCanvas}
                className="placements-toolbar-btn placements-toolbar-btn-small placements-toolbar-btn-strong placements-canvas-add-btn"
                title="Crear nuevo lienzo de posicionamiento"
              >
                Agregar
              </button>
            </div>
          ) : null}
        </div>
        <div className="placements-toolbar-status">
          <p
            className={`placements-toolbar-help ${isLinkMode ? '' : 'placements-toolbar-help--inactive'}`}
            aria-hidden={!isLinkMode}
          >
            {isLinkMode
              ? selectedSource
                ? 'Destino: elige un slot (p. ej. semifinal). El ganador del origen avanza a ese slot. En la tarjeta verás W{n} vs W{m}.'
                : 'Origen: elige un slot del juego fuente; luego el destino (siguiente fase o lienzo Ranked).'
              : ''}
          </p>
          <div className="placements-toolbar-badges">
            {(isRankedView ? hasUnsavedRankedChanges : (hasPendingLinkChanges || hasUnsavedChanges)) &&
            saveStatus !== 'saving' ? (
              <span className="placements-save-state">
                {isRankedView ? 'Lienzos sin guardar' : 'Cambios sin guardar'}
              </span>
            ) : null}
            {saveStatus !== 'idle' ? (
              <span className={`placements-save-state placements-save-state-${saveStatus}`}>
                {saveStatus === 'saving'
                  ? 'Guardando...'
                  : saveStatus === 'saved'
                    ? 'Guardado'
                    : (saveErrorMessage || 'Error al guardar')}
              </span>
            ) : null}
          </div>
        </div>
      </div>
      ) : null}

      <div
        className={`placements-bracket-board placements-bracket-board--${activeBracketViewProp} ${
          isFootballTournament ? 'placements-bracket-board--football-like' : ''
        }`}
        ref={boardRef}
        style={{
          '--phase-columns': layoutPhaseColumns,
          '--phase-width-reference': phaseWidthReference,
          '--active-phase-count': displayedRounds.length,
          '--round-capacity-height': `${bracketGeometry.roundCapacityHeight}px`,
          '--match-card-height': isFootballTournament ? '64px' : `${matchCardHeight}px`,
          '--card-scale': cardScale
        }}
      >
        <div className="placements-bracket-stage">
        <div className="placements-phase-row">
          {displayedRounds.map((round) => (
            <div key={`${round.id}-title`} className={`placements-phase-cell ${isFootballTournament ? 'placements-phase-cell--football-like' : ''}`}>
              {round.title}
            </div>
          ))}
        </div>

        <div className="placements-content-row">
          {displayedRounds.map((round, roundIndex) => (() => {
                      const isLastPhaseRound = roundIndex === displayedRounds.length - 1;
                      const prevRoundForCurrent = roundIndex >= 1 ? displayedRounds[roundIndex - 1] : null;
                      const prevRoundForCurrentMatchIds = new Set(
                        (prevRoundForCurrent?.matches || []).map((m) => String(m.id))
                      );
                      const nextRoundForCurrent = roundIndex < displayedRounds.length - 1 ? displayedRounds[roundIndex + 1] : null;
                      const nextRoundMatchIdsForCurrent = new Set(
                        (nextRoundForCurrent?.matches || []).map((m) => String(m.id))
                      );
                      const isRankedForPhase = activeBracketViewProp === 'ranked';
                      const layoutUsesRankedRules = isRankedForPhase;
                      /** True si existe enlace desde un partido de la ronda anterior hacia el match `m` (por matchId). */
                      const matchReceivesFromPrevRound = (m) =>
                        prevRoundForCurrent &&
                        (displayedManualLinks || []).some((link) => {
                          const fromParsed = parseNodeKey(link.from);
                          const toParsed = parseNodeKey(link.to);
                          return (
                            prevRoundForCurrentMatchIds.has(String(fromParsed.matchId)) &&
                            String(toParsed.matchId) === String(m.id)
                          );
                        });
                      const matchHasConnectorsToNextRound = (m) =>
                        nextRoundForCurrent &&
                        (displayedManualLinks || []).some((link) => {
                          const fromParsed = parseNodeKey(link.from);
                          const toParsed = parseNodeKey(link.to);
                          return (
                            String(fromParsed.matchId) === String(m.id) &&
                            nextRoundMatchIdsForCurrent.has(String(toParsed.matchId))
                          );
                        });
                      const phaseMatchEvaluations = (isFootballTournament || layoutUsesRankedRules)
                        ? buildPhaseMatchEvaluationsForRound(round, roundIndex, displayedRounds, displayedManualLinks, true)
                        : [];
                      const getMatchEvaluation = (matchId) => phaseMatchEvaluations.find((e) => String(e.matchId) === String(matchId));
                      const { roundMatchesStyle, getMatchCardLayout } = (() => {
                      const isLastPhase = roundIndex === displayedRounds.length - 1;
                      const currentPhaseMatches = round.matches?.length ?? 0;
                      const prevPhaseMatches = displayedRounds[roundIndex - 1]?.matches?.length ?? 0;
                      const isRanked = activeBracketViewProp === 'ranked';
                      const totalPhases = displayedRounds.length;
                      const firstPhaseMatches = displayedRounds[0]?.matches?.length ?? 0;
                      const secondPhaseMatches = displayedRounds[1]?.matches?.length ?? 0;
                      /**
                       * Partidos “antes” en la columna actual para presets estáticos (p. ej. ranked.laterPhaseFewGames):
                       * n−1 en esta ronda (cuartos con 4 → 3). No usar solo isLastPhase o aquí casi siempre sería 0.
                       * En getLastPhaseLayoutForMatch el mismo nombre es por partido evaluado (índice en round.matches).
                       */
                      const matchesBeforeForThisMatch = Math.max(0, (currentPhaseMatches ?? 0) - 1);

                      if (isFootballTournament) {
                        const isPenultimatePhase = roundIndex === displayedRounds.length - 2;
                        const getFootballMatchesBefore = (matchId) => {
                          const idx = (round?.matches || []).findIndex(
                            (m) => String(m.id) === String(matchId)
                          );
                          return idx >= 0 ? idx : 0;
                        };
                        const getFootballLayoutForEvaluation = (e, matchesBeforeForThisMatch = 0) =>
                          footballLayoutFromPhaseEvaluation(e, {
                            roundIndex,
                            totalPhases,
                            matchesBeforeForThisMatch,
                            isPoolBracketsPage
                          });
                        const footballRoundLayout = (() => {
                          if (isPenultimatePhase && phaseMatchEvaluations.length > 0) {
                            const evalWithPrevAndNext = phaseMatchEvaluations.find(
                              (ev) => ev.hasConnectorsFromPrev && ev.hasConnectorsToNext
                            );
                            const evalPick = evalWithPrevAndNext ?? phaseMatchEvaluations[0];
                            return getFootballLayoutForEvaluation(
                              evalPick,
                              getFootballMatchesBefore(evalPick.matchId)
                            );
                          }
                          return getFootballRoundFallbackLayout(roundIndex, totalPhases, 0, isPoolBracketsPage);
                        })();
                        const gapPx = bracketGeometry.roundLayouts[roundIndex]?.gapPx ?? 14;
                        const offsetPx = bracketGeometry.roundLayouts[roundIndex]?.offsetPx ?? 0;
                        const useFixed = Boolean(footballRoundLayout);
                        const usePenPhaseTwoGamesAlign = Boolean(
                          footballRoundLayout?.alignTopOffset !== undefined
                        );
                        return {
                          roundMatchesStyle: {
                            '--round-gap': useFixed ? footballRoundLayout.gap : `${gapPx}px`,
                            '--margin-top':
                              footballRoundLayout?.marginTop != null &&
                              String(footballRoundLayout.marginTop).trim() !== ''
                                ? footballRoundLayout.marginTop
                                : '0px',
                            '--round-offset': canVisualDrag
                              ? '0px'
                              : (useFixed ? footballRoundLayout.offset : `${offsetPx}px`),
                            '--round-match-card-top-offset': usePenPhaseTwoGamesAlign
                              ? (footballRoundLayout.alignTopOffset || '0px')
                              : '0px'
                          },
                          getMatchCardLayout: (matchId) => {
                            const matchesBeforeForThisMatch = getFootballMatchesBefore(matchId);
                            const evaluation = getMatchEvaluation(matchId);
                            return evaluation
                              ? getFootballLayoutForEvaluation(evaluation, matchesBeforeForThisMatch)
                              : getFootballRoundFallbackLayout(
                                  roundIndex,
                                  totalPhases,
                                  matchesBeforeForThisMatch,
                                  isPoolBracketsPage
                                );
                          }
                        };
                      }

                      const main = {
                        secondPhaseTwoGames: { gap: '220px', offset: '60px' },
                        laterPhaseFewGames: { gap: '100px', offset: '280px' },
                        laterPhaseFewphases: { gap: '100px', offset: '350px' },
                        penPhase: { gap: '220px', offset: '110px' },
                        penPhaseTwoGames: { gap: '220px', offset: '200px' },
                        finalPhase: { gap: '210px', offset: '710px' },
                        finalPhaseManyGames: { gap: '880px', offset: '710px' },
                        finalPhaseTwoGames: { gap: '210px', offset: '710px' },
                        phase1: { gap: '280px', offset: '140px' },
                        phase2Many: { gap: '620px', offset: '320px' },
                        lastPhaseMany: { gap: '880px', offset: '710px' },
                        twoPhaseslast: { gap: '220px', offset: '250px' },
                        twoPhasesfirstmany: { gap: '12px', offset: '0px',alignTopOffset: '0px' },
                        twoPhasesmany: { gap: '12px', offset: '110px' }
                      };
                      const ranked = {
                        secondPhaseTwoGames: { gap: '220px', offset: '60px' },
                        laterPhaseFewGames: {gap: '12px',offset: `${matchesBeforeForThisMatch * 202.86}px`},
                        laterPhaseFewphases: { gap: '100px', offset: '310px' },
                        penPhase: { gap: '12px', offset: '120px', marginTop: '0px', alignTopOffset: '0px' },
                        penPhaseTwoGames: { gap: '12px', offset: '120px', alignTopOffset: `${188.86}px` },
                        finalPhase: { gap: '12px', offset: '14px', marginTop: '110px' },
                        finalPhaseManyGames: { gap: '12px', offset: '14px' },
                        finalPhaseTwoGames: { gap: '12px', offset: '150px', alignTopOffset: '18px' },
                        phase1: { gap: '20px', offset: '110px',alignTopOffset: '20px' },
                        phase2Many: { gap: '620px', offset: '320px' },
                        lastPhaseMany: { gap: '12px', offset: '14px' },
                        twoPhaseslast: { gap: '220px', offset: '250px' },
                        twoPhasesfirstmany: { gap: '12px', offset: '0px',alignTopOffset: '0px' },
                        twoPhasesmany: { gap: '30px', offset: '50px',alignTopOffset: '30px' }
                      };
                      const poolRanked = {
                        secondPhaseTwoGames: { gap: '220px', offset: '60px' },
                        laterPhaseFewGames: {gap: '12px',offset: `${matchesBeforeForThisMatch * 202.86}px`},
                        laterPhaseFewphases: { gap: '100px', offset: '310px' },
                        penPhase: { gap: '12px', offset: '120px', marginTop: '0px', alignTopOffset: '0px' },
                        penPhaseTwoGames: { gap: '12px', offset: '120px', alignTopOffset: `${188.86}px` },
                        finalPhase: { gap: '12px', offset: '14px', marginTop: '110px' },
                        finalPhaseManyGames: { gap: '12px', offset: '14px' },
                        finalPhaseTwoGames: { gap: '12px', offset: '150px', alignTopOffset: '18px' },
                        phase1: { gap: '20px', offset: '110px',alignTopOffset: '20px' },
                        phase2Many: { gap: '620px', offset: '320px' },
                        lastPhaseMany: { gap: '12px', offset: '14px' },
                        twoPhaseslast: { gap: '220px', offset: '250px' },
                        twoPhasesfirstmany: { gap: '12px', offset: '0px',alignTopOffset: '0px' },
                        twoPhasesmany: { gap: '220px', offset: '250px' }
                      };
                      const c = isPoolRankedView ? poolRanked : (isRanked ? ranked : main);

                      const isPenultimatePhase = roundIndex === displayedRounds.length - 2;

                      const fixedLayouts = buildDefaultFixedLayouts({
                        c,
                        prevPhaseMatches,
                        layoutUsesRankedRules
                      });

                      const layoutFromPhaseEvaluation = (e) =>
                        defaultLayoutFromPhaseEvaluation(e, {
                          layoutUsesRankedRules,
                          c,
                          roundIndex,
                          fixedLayouts
                        });

                      const penultimatePhaseLayout = isPenultimatePhase
                        ? (phaseMatchEvaluations.length === 0
                            ? fixedLayouts[roundIndex]
                            : (() => {
                                const evalWithPrevAndNext = phaseMatchEvaluations.find(
                                  (ev) =>
                                    ev.isRanked && ev.hasConnectorsFromPrev && ev.hasConnectorsToNext
                                );
                                return layoutFromPhaseEvaluation(
                                  evalWithPrevAndNext ?? phaseMatchEvaluations[0]
                                );
                              })())
                        : fixedLayouts[roundIndex];

                      const countIncomingLinksToMatch = (matchId) =>
                        (displayedManualLinks || []).filter((link) => {
                          const toParsed = parseNodeKey(link.to);
                          return String(toParsed.matchId) === String(matchId);
                        }).length;

                      const getLastPhaseLayoutForMatch = (match) => {
                        const lastPhaseMatchIndex = (round?.matches || []).findIndex(
                          (m) => String(m.id) === String(match.id)
                        );
                        const matchesBeforeForThisMatch =
                          lastPhaseMatchIndex >= 0 ? lastPhaseMatchIndex : 0;

                        const hasPrev = matchReceivesFromPrevRound(match);

                        //Ultimo partido de fase validar vecinos verticales sin enlaces desde la fase anterior
                        const matchesInRound = round?.matches || [];
                        const neighborIdx = lastPhaseMatchIndex;
                        const prevNeighborMatch =
                          neighborIdx > 0 ? matchesInRound[neighborIdx - 1] : null;
                        const nextNeighborMatch =
                          neighborIdx >= 0 && neighborIdx < matchesInRound.length - 1
                            ? matchesInRound[neighborIdx + 1]
                            : null;
                        const next2NeighborMatch =
                          neighborIdx >= 0 && neighborIdx < matchesInRound.length - 1
                            ? matchesInRound[neighborIdx + 2]
                            : null;
                        const prevNeighborHasPrev =
                          prevNeighborMatch != null && matchReceivesFromPrevRound(prevNeighborMatch);
                        const nextNeighborHasPrev =
                          nextNeighborMatch != null && matchReceivesFromPrevRound(nextNeighborMatch);
                        const next2NeighborHasPrev =
                          next2NeighborMatch != null && matchReceivesFromPrevRound(next2NeighborMatch);

                        /** Ranked/fútbol: hay partido arriba y abajo en la columna, y ninguno recibe de la fase anterior. */
                        const rankedNeighborsVerticalBothWithoutPrev =
                          layoutUsesRankedRules &&
                          prevNeighborMatch != null &&
                          nextNeighborMatch != null &&
                          !prevNeighborHasPrev &&
                          !nextNeighborHasPrev;

                        const mergeThisMatch = countIncomingLinksToMatch(match.id) >= 2;

                        /*Reglas de layout para el ultimo partido de fase*/

                        if (!layoutUsesRankedRules) {
                          if (currentPhaseMatches === 1 && totalPhases === 3 && firstPhaseMatches === 4) {
                            return c.laterPhaseFewphases;
                          }
                          if (currentPhaseMatches === 1 && totalPhases === 3 && firstPhaseMatches === 0) {
                            return c.penPhaseTwoGames;
                          }
                        
                          if (currentPhaseMatches === 1 && totalPhases === 2) {
                            return c.twoPhaseslast;
                          }
                          if (firstPhaseMatches === 2 && secondPhaseMatches === 2) return c.laterPhaseFewGames;
                          if (currentPhaseMatches === 1) return c.finalPhase;
                          if (prevPhaseMatches <= 2) return c.laterPhaseFewGames;
                          return c.lastPhaseMany;
                        }

                        if(!hasPrev) return c.finalPhaseManyGames;

                          /*Reglas de layout para 2 fases Ranked*/
                        if (totalPhases === 2 && currentPhaseMatches > 1 && hasPrev ) return c.twoPhasesmany;
                        if (totalPhases === 2  && currentPhaseMatches > 1 && !hasPrev ) return c.twoPhasesfirstmany;
                     
                        if (
                          currentPhaseMatches === 1 &&
                          prevPhaseMatches === 2 &&
                          secondPhaseMatches === 0 &&
                          hasPrev
                        ) {
                          return c.finalPhaseTwoGames;
                        }
                        if (currentPhaseMatches === 1 && secondPhaseMatches === 0 && firstPhaseMatches === 0) {
                          return c.finalPhase;
                        }
                        if (matchesBeforeForThisMatch > 2 && hasPrev && next2NeighborHasPrev && rankedNeighborsVerticalBothWithoutPrev) {
                          return c.phase1;
                        }
                        if (matchesBeforeForThisMatch > 2 && hasPrev && !next2NeighborHasPrev) 
                            return c.finalPhaseTwoGames;
                        if (mergeThisMatch) return c.phase2Many;
                        if (isPoolRankedView && currentPhaseMatches > 1) return c.finalPhase;
                        if (hasPrev) return c.finalPhase;
                        return c.finalPhaseManyGames;
                      };

                     const lastPhaseColumnLayout =
                        isLastPhase && (round?.matches?.length ?? 0) > 0
                          ? getLastPhaseLayoutForMatch(round.matches[0])
                          : c.lastPhaseMany;

                      const fixed = isLastPhase
                        ? lastPhaseColumnLayout
                        : isPenultimatePhase
                          ? penultimatePhaseLayout
                          : fixedLayouts[roundIndex];
                      const gapPx = bracketGeometry.roundLayouts[roundIndex]?.gapPx ?? 14;
                      const offsetPx = bracketGeometry.roundLayouts[roundIndex]?.offsetPx ?? 0;
                      const useFixed = roundIndex >= 1 && fixed;
                      const usePenPhaseTwoGamesAlign = Boolean(useFixed && fixed?.alignTopOffset !== undefined);
                      const roundMatchesStyle = {
                        '--round-gap': useFixed ? fixed.gap : `${gapPx}px`,
                        '--margin-top': fixed?.marginTop != null && String(fixed.marginTop).trim() !== '' ? fixed.marginTop : '0px',
                        '--round-offset': canVisualDrag ? '0px' : (useFixed ? fixed.offset : `${offsetPx}px`),
                        '--round-match-card-top-offset': usePenPhaseTwoGamesAlign ? (fixed.alignTopOffset || '0px') : '0px',
                        
                      };
                        const getMatchCardLayout = (matchId) => {
                          if (isLastPhase) {
                            const m = (round?.matches || []).find((x) => String(x.id) === String(matchId));
                            if (m) return getLastPhaseLayoutForMatch(m);
                          }
                          const evaluation = getMatchEvaluation(matchId);
                          return evaluation ? layoutFromPhaseEvaluation(evaluation) : fixed;
                        };
                        return { roundMatchesStyle, getMatchCardLayout };
})();
                      return (
                <div
                  key={round.id}
                  className={`placements-round placements-round-${round.id} ${
                    String(round.title || '').toLowerCase().includes('playoff') ? 'placements-round-playoff' : ''
                  } ${isRankedView && stickyRankedPhaseAddButtons ? 'placements-round--sticky-add' : ''}`}
                >
                  {!readOnly ? (
                    <button type="button" className="placements-add-match-btn" onClick={() => handleAddMatch(round.id)}>
                      + Agregar juego
                    </button>
                  ) : null}
                  <div
                    className={`placements-round-matches placements-round-matches--${activeBracketViewProp} ${activeBracketViewProp === 'ranked' || isFootballTournament ? 'placements-round-matches--ranked-gap-by-match' : ''}`}
                    style={roundMatchesStyle}
                    onDragOverCapture={canVisualDrag ? handleContainerDragOverCapture(round) : undefined}
                    onDragOver={canVisualDrag ? handleContainerDragOver(round) : undefined}
                    onDrop={canVisualDrag ? handleContainerDrop(round) : undefined}
                  >
                    {canVisualDrag ? (
                      <div
                        className="placements-drop-overlay"
                        aria-hidden
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                          const data = draggingMatchRef.current;
                          if (data && data.roundId === round.id) {
                            const dropIndex = getDropIndexFromContainer(
                              e.currentTarget.parentElement,
                              e.clientY,
                              round.matches?.length ?? 0
                            );
                            setDragOverMatchIndex({ roundId: round.id, matchIndex: dropIndex });
                          }
                        }}
                        onDrop={(e) => {
                          const data = draggingMatchRef.current;
                          if (data && data.roundId === round.id) {
                            const dropIndex = getDropIndexFromContainer(
                              e.currentTarget.parentElement,
                              e.clientY,
                              round.matches?.length ?? 0
                            );
                            handleDrop(round.id, dropIndex)(e);
                          }
                        }}
                      />
                    ) : null}
                    {round.matches.map((match, matchIndex) => (
                  (() => {
                    const previousMatch = round.matches[matchIndex - 1];
                    const hasCanvasBreak = !isMergedRankedView && Boolean(
                      match?.sourceCanvasId &&
                      previousMatch?.sourceCanvasId &&
                      match.sourceCanvasId !== previousMatch.sourceCanvasId
                    );
                    const isDragOver = dragOverMatchIndex?.roundId === round.id && dragOverMatchIndex?.matchIndex === matchIndex;
                    const matchEval = getMatchEvaluation(match.id);
                    const gapPxFallback = bracketGeometry.roundLayouts[roundIndex]?.gapPx ?? 14;
                    const matchCardLayout = (activeBracketViewProp === 'ranked' || isFootballTournament)
                      ? getMatchCardLayout(match.id)
                      : null;
                    const hasConnectorsFromPrevForMatch =
                      matchEval?.hasConnectorsFromPrev ?? matchReceivesFromPrevRound(match);
                    const hasConnectorsToNextForMatch =
                      matchEval?.hasConnectorsToNext ?? matchHasConnectorsToNextRound(match);
                    const isRankedAndHasConnectorsFromPrev =
                      isRankedForPhase && hasConnectorsFromPrevForMatch;
                    const isRankedAndHasConnectorsFromPrevAndToNext =
                      isRankedAndHasConnectorsFromPrev && hasConnectorsToNextForMatch;
                    const crossoverPairLabel = getMatchCrossoverPairLabel(
                      displayedManualLinks,
                      incomingLookupRounds,
                      match.id
                    );
                    const poolGameId = readOnly && onGameNavigate ? extractGameIdFromMatch(match) : 0;
                    const isPoolGameNavigable = poolGameId > 0;
                    const useFootballCardStyle = Boolean(isFootballTournament);
                    return (
                  <React.Fragment key={`${round.id}-${match.id}`}>
                    {canVisualDrag ? (
                      <div
                        className={`placements-drop-zone ${isDragOver ? 'placements-drop-zone-active' : ''}`}
                        onDragEnter={handleDragEnter(round.id, matchIndex)}
                        onDragOver={handleDragOver(round.id, matchIndex)}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop(round.id, matchIndex)}
                      />
                    ) : null}
                  <article
                    className={`placements-match-card placements-match-card--${activeBracketViewProp} ${isLinkMode && !readOnly ? 'placements-match-card-link-mode' : ''} ${
                      activeBracketViewProp === 'ranked' || isFootballTournament ? 'placements-match-card-gap-by-match' : (hasCanvasBreak ? 'placements-match-card-canvas-break' : '')
                    } ${canVisualDrag ? 'placements-match-card-draggable' : ''} ${isPoolGameNavigable ? 'placements-match-card--game-link' : ''} ${
                      useFootballCardStyle ? 'placements-match-card--football-like' : ''
                    }`}
                    style={{
                      ...(canVisualDrag && isDragOver ? { outline: '2px dashed #4f67d8', outlineOffset: '2px' } : {}),
                      ...(activeBracketViewProp === 'ranked' || isFootballTournament ? {
                        '--round-gap': matchCardLayout?.gap ?? `${gapPxFallback}px`,
                        '--margin-top':
                          matchCardLayout?.marginTop != null && String(matchCardLayout.marginTop).trim() !== ''
                            ? matchCardLayout.marginTop
                            : '0px',
                        '--match-gap-before': matchIndex === 0 ? '0' : 'var(--round-gap)',
                        '--match-card-top-offset':
                          matchCardLayout?.alignTopOffset != null &&
                          String(matchCardLayout.alignTopOffset).trim() !== ''
                            ? matchCardLayout.alignTopOffset
                            : '0',
                        ...(isRankedAndHasConnectorsFromPrevAndToNext ? { '--match-has-both-connectors': '1' } : {})
                      } : {})
                    }}
                    draggable={canVisualDrag && !isLinkMode}
                    title={
                      isPoolGameNavigable
                        ? 'Ver partido'
                        : canVisualDrag
                          ? 'Arrastrar para reordenar'
                          : undefined
                    }
                    onDragStart={canVisualDrag ? handleDragStart(round.id, match.id, matchIndex) : undefined}
                    onDragEnd={canVisualDrag ? handleDragEnd : undefined}
                    onDragEnter={canVisualDrag ? handleDragEnter(round.id, matchIndex) : undefined}
                    onDragOver={canVisualDrag ? handleDragOver(round.id, matchIndex) : undefined}
                    onDragLeave={canVisualDrag ? handleDragLeave : undefined}
                    onDrop={canVisualDrag ? handleDrop(round.id, matchIndex) : undefined}
                    role={isLinkMode && !readOnly ? 'button' : isPoolGameNavigable ? 'link' : undefined}
                    tabIndex={isLinkMode && !readOnly ? 0 : isPoolGameNavigable ? 0 : -1}
                    onClick={(event) => handleMatchCardSelection(match, event)}
                    onKeyDown={(event) => {
                      if (isPoolGameNavigable && (event.key === 'Enter' || event.key === ' ')) {
                        const target = event.target;
                        const tag = target?.tagName?.toLowerCase();
                        if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
                        if (target?.isContentEditable) return;
                        event.preventDefault();
                        handleMatchCardSelection(match, event);
                        return;
                      }
                      if (readOnly || !isLinkMode) return;
                      const target = event.target;
                      const tag = target?.tagName?.toLowerCase();
                      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
                      if (target?.isContentEditable) return;
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        handleLinkTargetSelection(`${match.id}-0`);
                      }
                    }}
                  >
                    {useFootballCardStyle ? (
                      <>
                        <FootballCardMeta gameDate={match.gameDate} gameLocation={match.gameLocation} />
                        <div className="placements-football-card-body">
                          <PlacementsMatchTeamRowsWithScores
                            tournamentId={tournamentId}
                            match={match}
                            round={round}
                            roundIndex={roundIndex}
                            readOnly={readOnly}
                            useGoalTotalsForScores={useGoalTotalsForScores}
                            bracketReloadTick={bracketReloadTick}
                            scoresSyncNonce={
                              silentStandingsNonce +
                              scoresCanvasHydrateNonce +
                              Number(poolScoresSyncEpoch ?? 0) +
                              poolReadOnlyPollNonce
                            }
                            selectedSource={selectedSource}
                            handleLinkTargetSelection={handleLinkTargetSelection}
                            handleTeamSelection={handleTeamSelection}
                            handleScoreChange={handleScoreChange}
                            activeBracketViewProp={activeBracketViewProp}
                            teamOptions={teamOptions}
                            selectedDivision={selectedDivision}
                            standingsTeams={standingsTeamsRaw}
                            standingsGames={standingsGamesRaw}
                            slotResolutionOptions={slotResolutionOptions}
                            onStatsSlotFieldChange={handleStatsSlotFieldChange}
                            onStatsSlotFieldBlur={handleStatsSlotFieldBlur}
                            isPoolBracketsPage={isPoolBracketsPage}
                            bracketSlotMatchByGameNum={bracketAdvanceSourceByGameNum}
                            statsSlotPlaceholder={
                              activeBracketViewProp === 'ranked' ? '1A ó L73' : '1A, W12…'
                            }
                            statsSlotFieldTitle="Tabla de grupos (ej. 1A) y/o resultado de otro partido del torneo: W + número = ganador del juego con ese número en la tarjeta; L + número = perdedor."
                            incomingAdvanceDisplays={[
                              getIncomingAdvanceDisplay(displayedManualLinks, incomingLookupRounds, match.id, 0),
                              getIncomingAdvanceDisplay(displayedManualLinks, incomingLookupRounds, match.id, 1)
                            ]}
                            useFootballCardStyle
                          />
                        </div>
                        {!readOnly ? (
                          <div className="placements-football-card-edit-bar">
                            <span className="placements-football-card-game-num">
                              {Number.isInteger(Number(match.gameNum)) && Number(match.gameNum) > 0
                                ? `Juego ${Number(match.gameNum)}`
                                : match.gameId
                                  ? `Juego ${match.gameId}`
                                  : 'Juego sin ID'}
                            </span>
                            <button
                              type="button"
                              className="placements-football-remove-btn"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleRemoveMatch(round.id, match.id);
                              }}
                            >
                              Eliminar
                            </button>
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <div className="placements-match-card-actions">
                      {match?.sourceCanvasName && !isPoolRankedView ? (
                        <span className="placements-match-canvas-name">{match.sourceCanvasName}</span>
                      ) : null}
                      {isLastPhaseRound ? (
                        <div className="placements-match-actions-last-phase">
                          <div className="placements-match-actions-last-phase-title">
                            <span className="placements-match-number placements-match-number--last-phase">
                              {Number.isInteger(Number(match.gameNum)) && Number(match.gameNum) > 0
                                ? `Juego ${Number(match.gameNum)}`
                                : (match.gameId ? `Juego ${match.gameId}` : 'Juego sin ID')}
                            </span>
                            <span
                              className={`placements-match-crossover-short ${crossoverPairLabel ? '' : 'placements-match-crossover-short--empty'}`}
                              title={crossoverPairLabel ? 'Orígenes enlazados (Ganador W / Perdedor L)' : undefined}
                              aria-hidden={!crossoverPairLabel}
                            >
                              {crossoverPairLabel || '\u00a0'}
                            </span>
                            {readOnly && isFinishedGameEstado(match.gameEstado) ? (
                              <span className="placements-match-estado-badge">Finalizado</span>
                            ) : null}
                          </div>
                          <div className="placements-match-actions-last-phase-input-row">
                            {readOnly ? (
                              <span className="placements-match-placement-readonly" title="Posición">
                                {displayPlacementLabel(match) || '—'}
                              </span>
                            ) : (
                              <select
                                className="placements-match-placement-select"
                                value={resolvePlacementSelectValue(match)}
                                disabled={readOnly}
                                aria-label="Posición en el torneo"
                                onChange={(event) => {
                                  event.stopPropagation();
                                  const parsed = parsePlacementSelectChange(event.target.value);
                                  handleDateTimeChange(round.id, match.id, 'placement', parsed);
                                }}
                                onClick={(event) => event.stopPropagation()}
                                onBlur={(event) => {
                                  event.stopPropagation();
                                  if (readOnly || !isRankedView) return;
                                  queueMicrotask(() => {
                                    void persistRankedCanvases({ suppressNotify: true });
                                  });
                                }}
                              >
                                <option value="">Posición</option>
                                {BRACKET_PLACEMENT_OPTIONS.map((opt) => (
                                  <option key={opt.number} value={String(opt.number)}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                            )}
                            {!readOnly ? (
                              <button
                                type="button"
                                className="placements-remove-match-btn placements-remove-match-btn--last-phase"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleRemoveMatch(round.id, match.id);
                                }}
                              >
                                Eliminar
                              </button>
                            ) : null}
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="placements-match-title-block">
                            <span className="placements-match-number">
                              {Number.isInteger(Number(match.gameNum)) && Number(match.gameNum) > 0
                                ? `Juego ${Number(match.gameNum)}`
                                : (match.gameId ? `Juego ${match.gameId}` : 'Juego sin ID')}
                            </span>
                            <span
                              className={`placements-match-crossover-short ${crossoverPairLabel ? '' : 'placements-match-crossover-short--empty'}`}
                              title={
                                crossoverPairLabel
                                  ? 'Orígenes enlazados (W = ganador, L = perdedor del juego indicado)'
                                  : undefined
                              }
                              aria-hidden={!crossoverPairLabel}
                            >
                              {crossoverPairLabel || '\u00a0'}
                            </span>
                            {readOnly && isFinishedGameEstado(match.gameEstado) ? (
                              <span className="placements-match-estado-badge">Finalizado</span>
                            ) : null}
                          </div>
                          {!readOnly ? (
                            <button
                              type="button"
                              className="placements-remove-match-btn"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleRemoveMatch(round.id, match.id);
                              }}
                            >
                              Eliminar
                            </button>
                          ) : null}
                        </>
                      )}
                    </div>
                    )}
                    {!useFootballCardStyle ? (
                      <div className="placements-match-datetime">
                      <label className="placements-datetime-label">
                        <span>Fecha</span>
                        <input
                          type="date"
                          className="placements-datetime-input"
                          value={match.gameDate || ''}
                          disabled={readOnly}
                          onChange={(event) => handleDateTimeChange(round.id, match.id, 'gameDate', event.target.value || null)}
                          onClick={(event) => event.stopPropagation()}
                          aria-label="Fecha del juego"
                        />
                      </label>
                      <label className="placements-datetime-label">
                        <span>Hora</span>
                        <input
                          type="time"
                          className="placements-datetime-input"
                          value={match.gameTime || ''}
                          disabled={readOnly}
                          onChange={(event) => handleDateTimeChange(round.id, match.id, 'gameTime', event.target.value || null)}
                          onClick={(event) => event.stopPropagation()}
                          aria-label="Hora del juego"
                        />
                      </label>
                      <label className="placements-datetime-label">
                        <span>Ubicación</span>
                        <input
                          type="text"
                          className="placements-datetime-input"
                          value={match.gameLocation ?? ''}
                          disabled={readOnly}
                          placeholder="Cancha, ciudad…"
                          onChange={(event) =>
                            handleDateTimeChange(round.id, match.id, 'gameLocation', event.target.value)
                          }
                          onClick={(event) => event.stopPropagation()}
                          aria-label="Ubicación del juego"
                        />
                      </label>
                    </div>
                    ) : null}
                    {!useFootballCardStyle ? (
                      <PlacementsMatchTeamRowsWithScores
                        tournamentId={tournamentId}
                        match={match}
                        round={round}
                        roundIndex={roundIndex}
                        readOnly={readOnly}
                        useGoalTotalsForScores={useGoalTotalsForScores}
                        bracketReloadTick={bracketReloadTick}
                        scoresSyncNonce={
                          silentStandingsNonce +
                          scoresCanvasHydrateNonce +
                          Number(poolScoresSyncEpoch ?? 0) +
                          poolReadOnlyPollNonce
                        }
                        selectedSource={selectedSource}
                        handleLinkTargetSelection={handleLinkTargetSelection}
                        handleTeamSelection={handleTeamSelection}
                        handleScoreChange={handleScoreChange}
                        activeBracketViewProp={activeBracketViewProp}
                        teamOptions={teamOptions}
                        selectedDivision={selectedDivision}
                        standingsTeams={standingsTeamsRaw}
                        standingsGames={standingsGamesRaw}
                        slotResolutionOptions={slotResolutionOptions}
                        onStatsSlotFieldChange={handleStatsSlotFieldChange}
                        onStatsSlotFieldBlur={handleStatsSlotFieldBlur}
                        isPoolBracketsPage={isPoolBracketsPage}
                        bracketSlotMatchByGameNum={bracketAdvanceSourceByGameNum}
                        statsSlotPlaceholder={
                          activeBracketViewProp === 'ranked'
                            ? '1A ó L73'
                            : '1A, W12…'
                        }
                        statsSlotFieldTitle="Tabla de grupos (ej. 1A) y/o resultado de otro partido del torneo: W + número = ganador del juego con ese número en la tarjeta; L + número = perdedor."
                        incomingAdvanceDisplays={[
                          getIncomingAdvanceDisplay(displayedManualLinks, incomingLookupRounds, match.id, 0),
                          getIncomingAdvanceDisplay(displayedManualLinks, incomingLookupRounds, match.id, 1)
                        ]}
                      />
                    ) : null}
                  </article>
                  </React.Fragment>
                    );
                  })()
                ))}
                {canVisualDrag && round.matches.length > 0 ? (
                  <div
                    className={`placements-drop-zone-end ${
                      dragOverMatchIndex?.roundId === round.id && dragOverMatchIndex?.matchIndex === round.matches.length
                        ? 'placements-drop-zone-end-active'
                        : ''
                    }`}
                    onDragEnter={handleDragEnter(round.id, round.matches.length)}
                    onDragOver={handleDragOver(round.id, round.matches.length)}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop(round.id, round.matches.length)}
                  />
                ) : null}
              </div>
            </div>
          );})())}
        </div>
        </div>

        <svg
          className="placements-bracket-svg"
          width={svgSize.width}
          height={svgSize.height}
          viewBox={`0 0 ${svgSize.width} ${svgSize.height}`}
          aria-hidden="true"
        >
          {connectorPaths.map((connector) => (
            <path key={connector.id} d={connector.d} />
          ))}
        </svg>
      </div>
    </section>
  );
}

export default PlacementsBracket;
