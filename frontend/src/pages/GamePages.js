import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import './GamesPages.css';
import GamePhaseClockDisplay from '../components/GamePhaseClockDisplay';
import Navbar from '../components/navbar';
import Noauth_Navbar from '../components/noauth_Navbar';
import { useAuth } from '../hooks/useAuth';
import { useGameMatchScore } from '../hooks/useGameMatchScore';
import { useGamePhaseClock } from '../hooks/useGamePhaseClock';
import { configService } from '../services/configService';
import { normalizeDivisionName } from '../utils/groupStandings';
import {
  buildTorneoTeamLookup,
  resolveParticipantTeamDisplay
} from '../utils/teamDisplayResolution';
import {
  enrichScheduleParticipantFromSlots,
  rosterTeamIdForNavigation
} from '../utils/schedulePlayoffSlotResolution';
import {
  isGameFinishedState,
  phaseHmsToSeconds
} from '../utils/gamePhaseClock';
import { goalTotalsFromTimelineEvents } from '../utils/goalTotalsFromTimeline';

/** Estado del partido con variantes habituales de la API ({estado}/{Estado}). */
const gameEstadoRaw = (row) => {
  if (row == null) return null;
  return row.estado ?? row.Estado;
};

const TEAM_FALLBACK_IMAGE = '/Hera_logo.png';

/** Filas de la tabla Spirit Scores (misma escala 0–4 que la encuesta). */
const GAME_SPIRIT_CATEGORY_ROWS = [
  { key: 'rules', label: 'Conocimiento y uso de las reglas' },
  { key: 'fouls', label: 'Faltas y contacto físico' },
  { key: 'fairmind', label: 'Imparcialidad' },
  { key: 'attitude', label: 'Actitud y autocontrol' },
  { key: 'communication', label: 'Comunicación' }
];

const formatSpiritScoreCell = (v) => {
  if (v == null || !Number.isFinite(Number(v))) return '—';
  return String(v);
};

/** Campos por encuesta manual; un borrador independiente por `slotKey` (visitante→local vs local→visitante). */
const SPIRIT_MANUAL_DIMENSION_ROWS = [
  ['Conocimiento y uso de las reglas', 'rules'],
  ['Faltas y contacto físico', 'fouls'],
  ['Imparcialidad', 'fairmind'],
  ['Actitud positiva y autocontrol', 'attitude'],
  ['Comunicación', 'communication']
];

function emptySpiritManualDraft() {
  return {
    rules: null,
    fouls: null,
    fairmind: null,
    attitude: null,
    communication: null,
    comments: ''
  };
}

function isSpiritManualDraftComplete(d) {
  if (!d) return false;
  return (
    d.rules != null &&
    d.fouls != null &&
    d.fairmind != null &&
    d.attitude != null &&
    d.communication != null
  );
}

/** Misma rejilla de puntuaciones 0–4 que `/spirit-survey` (ráster táctil en móvil). */
function GameSpiritManualScaleRow({ label, name, value, onChange, disabled }) {
  return (
    <fieldset className="game-spirit-manual-scale-row" disabled={disabled}>
      <legend className="game-spirit-manual-scale-label">{label}</legend>
      <div className="game-spirit-manual-radios" role="group" aria-label={label}>
        {[0, 1, 2, 3, 4].map((n) => {
          const selected = value === n;
          return (
            <label
              key={n}
              className={`game-spirit-manual-opt${selected ? ' game-spirit-manual-opt--selected' : ''}`}
            >
              <input
                type="radio"
                className="game-spirit-manual-input"
                name={name}
                value={n}
                checked={selected}
                onChange={() => onChange(n)}
              />
              <span className="game-spirit-manual-num">{n}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

const parseScoreValue = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).trim());
  return Number.isFinite(n) ? n : null;
};

/** Columnas snake/camel desde GET /games */
const pickGameRowScoreValue = (row, side) => {
  if (!row || typeof row !== 'object') return null;
  const raw =
    side === 'home' ? row.local_score ?? row.localScore : row.visitor_score ?? row.visitorScore;
  return parseScoreValue(raw);
};

const getMatchWinner = (homeScore, awayScore) => {
  if (homeScore === null || awayScore === null) return null;
  if (homeScore > awayScore) return 'home';
  if (awayScore > homeScore) return 'away';
  return 'draw';
};

/** Extrae un número de una fila de Game_Rank_V probando nombres de columna habituales. */
const pickNumericFromRankRow = (row, synonyms) => {
  if (!row || typeof row !== 'object') return 0;
  for (const k of synonyms) {
    if (Object.prototype.hasOwnProperty.call(row, k) && row[k] != null && row[k] !== '') {
      const n = Number(row[k]);
      if (Number.isFinite(n)) return n;
    }
  }
  for (const key of Object.keys(row)) {
    const lk = key.toLowerCase();
    if (synonyms.some((s) => s.toLowerCase() === lk)) {
      const n = Number(row[key]);
      if (Number.isFinite(n)) return n;
    }
  }
  return 0;
};

const findPlayerIdInRankRow = (row) => {
  if (!row || typeof row !== 'object') return null;
  const direct =
    row.player_id ?? row.Player_ID ?? row.PLAYER_ID ?? row.playerid ?? row.PlayerId;
  if (direct != null && direct !== '') return direct;
  for (const key of Object.keys(row)) {
    if (/player.*id/i.test(key) || key.toLowerCase() === 'player_id') {
      const v = row[key];
      if (v != null && v !== '') return v;
    }
  }
  return null;
};

/** Mapa player_id → { goals, assists } desde filas de Game_Rank_V */
const buildPlayerRankMap = (rows) => {
  const map = new Map();
  if (!Array.isArray(rows)) return map;
  for (const row of rows) {
    const rawPid = findPlayerIdInRankRow(row);
    if (rawPid == null || rawPid === '') continue;
    const pid = Number(rawPid);
    if (!Number.isFinite(pid)) continue;
    const goals = pickNumericFromRankRow(row, ['goals', 'Goals', 'GOAL', 'Goles', 'goal', 'Goles_']);
    const assists = pickNumericFromRankRow(row, ['assists', 'Assists', 'AST', 'assist', 'Assist', 'Ast']);
    map.set(pid, { goals, assists });
  }
  return map;
};

const getPlayerGameStats = (player, rankMap) => {
  if (!rankMap || player?.player_id == null) return { assists: 0, goals: 0 };
  const st = rankMap.get(Number(player.player_id));
  if (!st) return { assists: 0, goals: 0 };
  return { goals: st.goals ?? 0, assists: st.assists ?? 0 };
};

const sortIconSvg = (
  <svg className="game-stats-sort-icon" width="14" height="14" viewBox="0 0 24 24" aria-hidden>
    <path
      fill="currentColor"
      d="M4 18h6v-2H4v2zM4 6v2h16V6H4zm0 7h12v-2H4v2z"
    />
  </svg>
);

const filterIconSvg = (
  <svg className="game-stats-filter-icon" width="14" height="14" viewBox="0 0 24 24" aria-hidden>
    <path
      fill="currentColor"
      d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z"
    />
  </svg>
);

const sortPlayersForStats = (list, sortKey, ascending, rankMap) => {
  const dir = ascending ? 1 : -1;
  return [...list].sort((a, b) => {
    const sa = getPlayerGameStats(a, rankMap);
    const sb = getPlayerGameStats(b, rankMap);
    const totalA = sa.goals + sa.assists;
    const totalB = sb.goals + sb.assists;
    switch (sortKey) {
      case 'player_number': {
        const na = Number(a.player_number) || 0;
        const nb = Number(b.player_number) || 0;
        return (na - nb) * dir;
      }
      case 'player_name': {
        const ca = String(a.player_name || '').toLowerCase();
        const cb = String(b.player_name || '').toLowerCase();
        return ca.localeCompare(cb, 'es') * dir;
      }
      case 'total':
        return (totalA - totalB) * dir;
      case 'assists':
        return (sa.assists - sb.assists) * dir;
      case 'goals':
        return (sa.goals - sb.goals) * dir;
      default:
        return 0;
    }
  });
};

function GameStatsTable({
  teamName,
  teamLogo,
  playersRaw,
  rankMap,
  nameColorClass,
  sortKey,
  sortAsc,
  onSort
}) {
  const sorted = useMemo(
    () => sortPlayersForStats(playersRaw, sortKey, sortAsc, rankMap),
    [playersRaw, rankMap, sortKey, sortAsc]
  );

  const headerBtn = (colKey, label, icon, extraClass) => {
    const active = sortKey === colKey;
    return (
      <button
        type="button"
        className={`game-stats-th-btn${active ? ' game-stats-th-btn--active' : ''}${extraClass ? ` ${extraClass}` : ''}`}
        onClick={() => onSort(colKey)}
      >
        <span>{label}</span>
        {icon}
      </button>
    );
  };

  return (
    <div className="game-stats-team">
      <div className="game-stats-team-head">
        <img
          className="game-stats-team-logo"
          src={teamLogo || TEAM_FALLBACK_IMAGE}
          alt=""
          onError={(e) => {
            if (!e.currentTarget.src.includes(TEAM_FALLBACK_IMAGE)) e.currentTarget.src = TEAM_FALLBACK_IMAGE;
          }}
        />
        <div className="game-stats-team-head-text">
          <div className={`game-stats-team-name ${nameColorClass}`}>{teamName}</div>
          <div className="game-stats-headline">Game Statistics</div>
        </div>
      </div>
      <div className="game-stats-table-wrap">
        <table className="game-stats-table">
          <thead>
            <tr>
              <th className="game-stats-th game-stats-th--num">{headerBtn('player_number', '#', sortIconSvg)}</th>
              <th className="game-stats-th game-stats-th--name">{headerBtn('player_name', 'Name', sortIconSvg)}</th>
              <th className="game-stats-th game-stats-th--total game-stats-th--highlight">
                {headerBtn('total', 'Total', filterIconSvg, 'game-stats-th-btn--total')}
              </th>
              <th className="game-stats-th game-stats-th--stat">{headerBtn('assists', 'Assists', sortIconSvg)}</th>
              <th className="game-stats-th game-stats-th--stat">{headerBtn('goals', 'Goals', sortIconSvg)}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={5} className="game-stats-empty">
                  Sin jugadores registrados
                </td>
              </tr>
            ) : (
              sorted.map((p, idx) => {
                const st = getPlayerGameStats(p, rankMap);
                const total = st.goals + st.assists;
                return (
                  <tr key={p.player_id ?? `${p.team_id}-${p.player_number}-${idx}`} className={idx % 2 === 1 ? 'game-stats-tr--alt' : ''}>
                    <td className="game-stats-td game-stats-td--num">{p.player_number ?? '—'}</td>
                    <td className="game-stats-td game-stats-td--name">{p.player_name ?? '—'}</td>
                    <td className="game-stats-td game-stats-td--total game-stats-td--highlight">{total}</td>
                    <td className="game-stats-td game-stats-td--stat">{st.assists}</td>
                    <td className="game-stats-td game-stats-td--stat">{st.goals}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Valores tal como vienen de la tabla `game` (game_date, game_time). */
const normalizeGameDate = (raw) => {
  if (raw == null || raw === '') return '';
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw.toISOString().split('T')[0];
  }
  const s = String(raw).trim();
  return s.includes('T') ? s.split('T')[0] : s.slice(0, 10);
};

const normalizeGameTime = (raw) => {
  if (raw == null || raw === '') return '';
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    const h = raw.getHours();
    const m = raw.getMinutes();
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  const s = String(raw).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) return `${m[1].padStart(2, '0')}:${m[2]}`;
  return s.slice(0, 8);
};

/** Convierte `phases.duration` (texto libre) a H/M/S para el cronómetro. */
const parsePhaseDurationToHms = (raw) => {
  const fallback = { horas: 0, minutos: 1, segundos: 30 };
  if (raw == null || raw === '') return fallback;
  const s = String(raw).trim();
  if (!s) return fallback;

  if (/^\d+(\.\d+)?$/.test(s)) {
    const minutes = parseFloat(s);
    if (!Number.isFinite(minutes) || minutes <= 0) return fallback;
    const totalSec = Math.round(minutes * 60);
    return {
      horas: Math.floor(totalSec / 3600),
      minutos: Math.floor((totalSec % 3600) / 60),
      segundos: totalSec % 60
    };
  }

  const parts = s.split(':').map((p) => parseInt(String(p).trim(), 10));
  if (parts.some((n) => Number.isNaN(n) || n < 0)) return fallback;
  if (parts.length === 3) {
    const [h, m, sec] = parts;
    return { horas: h, minutos: m, segundos: sec };
  }
  if (parts.length === 2) {
    const [m, sec] = parts;
    return { horas: 0, minutos: m, segundos: sec };
  }
  return fallback;
};

const formatGameMetaDateTime = (dateValue, timeValue) => {
  if (!dateValue && !timeValue) return '—';
  if (!dateValue && timeValue) return timeValue;
  if (dateValue && !timeValue) {
    const parsed = new Date(`${dateValue}T12:00:00`);
    if (Number.isNaN(parsed.getTime())) return dateValue;
    return parsed.toLocaleDateString('es-ES', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }
  const combined = `${dateValue}T${timeValue}:00`;
  const parsed = new Date(combined);
  if (Number.isNaN(parsed.getTime())) {
    return [dateValue, timeValue].filter(Boolean).join(' · ');
  }
  return parsed.toLocaleString('es-ES', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
};

/** Tiempo de evento (HH:MM:SS o MM:SS) a etiqueta corta tipo 2:20 */
const formatTimelineClock = (eventTimeStr) => {
  if (eventTimeStr == null || eventTimeStr === '') return '—';
  const parts = String(eventTimeStr)
    .trim()
    .split(':')
    .map((p) => parseInt(p, 10));
  if (parts.length < 2 || parts.some((n) => Number.isNaN(n))) return String(eventTimeStr);
  const h = parts[0] ?? 0;
  const m = parts[1] ?? 0;
  const s = parts[2] ?? 0;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
};

/**
 * Construye filas de timeline a partir de filas de `game_events` (START + pares GOAL/AST + metadatos).
 */
const buildGameTimelineItems = (events, localId, visitorId, homeTeamName, awayTeamName) => {
  const sorted = [...(events || [])].sort((a, b) => Number(a.event_id) - Number(b.event_id));
  const byTime = new Map();
  for (const ev of sorted) {
    const ty = String(ev.event_type || '').trim().toUpperCase();
    if (ty !== 'GOAL' && ty !== 'AST') continue;
    const k = ev.event_time;
    if (!byTime.has(k)) byTime.set(k, {});
    byTime.get(k)[ty] = ev;
  }

  const emittedGoalTimes = new Set();
  const items = [];
  let homeScore = 0;
  let awayScore = 0;

  const breakTimesWithGoal = new Set();
  for (const ev of sorted) {
    if (String(ev.event_type || '').trim().toUpperCase() !== 'BREAK') continue;
    const k = ev.event_time;
    const b = byTime.get(k);
    if (b?.GOAL && b?.AST) breakTimesWithGoal.add(k);
  }

  for (const ev of sorted) {
    const ty = String(ev.event_type || '').trim().toUpperCase();
    if (ty === 'START') {
      const name = ev.offense_team_name || '—';
      items.push({
        key: `start-${ev.event_id}`,
        kind: 'start',
        timeLabel: '0:00',
        lineMain: 'Inicia el partido',
        lineSub: `${name} inicia en ataque.`,
        homeScore: 0,
        awayScore: 0,
        side: 'neutral'
      });
      continue;
    }
    if (ty === 'JUEGO EN PAUSA' || ty === 'JUEGO REANUDADO') {
      items.push({
        key: `pause-${ev.event_id}`,
        kind: 'meta',
        timeLabel: formatTimelineClock(ev.event_time),
        lineMain: ty === 'JUEGO EN PAUSA' ? 'Juego en pausa' : 'Juego reanudado',
        lineSub: null,
        homeScore,
        awayScore,
        side: 'neutral'
      });
      continue;
    }
    if (ty === 'HALF') {
      items.push({
        key: `half-${ev.event_id}`,
        kind: 'meta',
        timeLabel: formatTimelineClock(ev.event_time),
        lineMain: 'HALF',
        lineSub: 'Medio tiempo',
        homeScore,
        awayScore,
        side: 'neutral'
      });
      continue;
    }
    if (ty === 'TIMEOUT') {
      let tn = String(ev.offense_team_name || '').trim();
      if (!tn) {
        const tid = ev.team_id != null ? Number(ev.team_id) : NaN;
        if (localId != null && Number.isFinite(tid) && tid === Number(localId)) {
          tn = String(homeTeamName || 'Local').trim() || 'Local';
        } else if (visitorId != null && Number.isFinite(tid) && tid === Number(visitorId)) {
          tn = String(awayTeamName || 'Visitante').trim() || 'Visitante';
        }
      }
      tn = tn || '—';
      items.push({
        key: `timeout-${ev.event_id}`,
        kind: 'meta',
        timeLabel: formatTimelineClock(ev.event_time),
        lineMain: `Timeout — ${tn}`,
        lineSub: 'Tiempo solicitado por el equipo',
        homeScore,
        awayScore,
        side: 'neutral'
      });
      continue;
    }
    if (ty === 'JUEGO FINALIZADO') {
      items.push({
        key: `finished-${ev.event_id}`,
        kind: 'meta',
        timeLabel: formatTimelineClock(ev.event_time),
        lineMain: 'Juego finalizado',
        lineSub: null,
        homeScore,
        awayScore,
        side: 'neutral'
      });
      continue;
    }
    if (ty === 'BREAK') {
      if (breakTimesWithGoal.has(ev.event_time)) {
        continue;
      }
      items.push({
        key: `break-${ev.event_id}`,
        kind: 'meta',
        timeLabel: formatTimelineClock(ev.event_time),
        lineMain: 'BREAK',
        lineSub: null,
        homeScore,
        awayScore,
        side: 'neutral'
      });
      continue;
    }
    if (ty === 'GOAL') {
      const k = ev.event_time;
      if (emittedGoalTimes.has(k)) continue;
      const b = byTime.get(k);
      if (!b?.GOAL || !b?.AST) continue;
      emittedGoalTimes.add(k);
      const g = b.GOAL;
      const ast = b.AST;
      const scorerName = g.player_name || '—';
      const assistName = ast.player_name || '—';
      const isCallahan = ast.assists === 0 || Number(ast.player_id) === Number(g.player_id);

      const scorerTeamId = g.player_team_id;
      if (visitorId != null && Number(scorerTeamId) === Number(visitorId)) {
        awayScore += 1;
      } else if (localId != null && Number(scorerTeamId) === Number(localId)) {
        homeScore += 1;
      } else {
        homeScore += 1;
      }

      const side = visitorId != null && Number(scorerTeamId) === Number(visitorId) ? 'away' : 'home';
      const timeLabel = formatTimelineClock(g.event_time);
      const homeLabel = String(homeTeamName || 'Local').trim() || 'Local';
      const awayLabel = String(awayTeamName || 'Visitante').trim() || 'Visitante';
      const scorerTeamLabel =
        visitorId != null && Number(scorerTeamId) === Number(visitorId)
          ? awayLabel
          : localId != null && Number(scorerTeamId) === Number(localId)
            ? homeLabel
            : homeLabel;

      const scoringSentence = isCallahan
        ? `Callahan: ${scorerName}`
        : `De ${assistName} a ${scorerName}`;
      const isBreakGoal = breakTimesWithGoal.has(k);
      const lineMain = isBreakGoal ? `BREAK. ${scoringSentence}` : scoringSentence;
      const lineSub = `Anotación del equipo ${scorerTeamLabel}`;

      items.push({
        key: `goal-${g.event_id}`,
        kind: 'goal',
        timeLabel,
        lineMain,
        lineSub,
        homeScore,
        awayScore,
        side
      });
    }
  }

  return items;
};

function GamePages() {
  const { isAuthenticated } = useAuth();
  const hasToken = localStorage.getItem('token') !== null;
  const isUserAuthenticated = isAuthenticated || hasToken;

  const [searchParams] = useSearchParams();
  const gameIdParam = searchParams.get('gameId');
  const tournamentIdParam = searchParams.get('tournamentId');

  const [phaseSeconds, setPhaseSeconds] = useState(0);
  const [gameRow, setGameRow] = useState(null);
  const [torneoTeamsRows, setTorneoTeamsRows] = useState([]);
  const [torneoGamesNormalized, setTorneoGamesNormalized] = useState([]);
  const [gameLoadError, setGameLoadError] = useState('');
  const [gameLoading, setGameLoading] = useState(true);
  const [rosterHome, setRosterHome] = useState([]);
  const [rosterAway, setRosterAway] = useState([]);
  const [playersLoading, setPlayersLoading] = useState(false);
  const [playersError, setPlayersError] = useState('');
  const [sortHome, setSortHome] = useState({ key: 'player_number', asc: true });
  const [sortAway, setSortAway] = useState({ key: 'player_number', asc: true });
  const [gameSectionTab, setGameSectionTab] = useState('resumen');
  const [gameEvents, setGameEvents] = useState([]);
  const [gameEventsError, setGameEventsError] = useState('');
  const [gameRankRows, setGameRankRows] = useState([]);
  const [gameRankError, setGameRankError] = useState('');
  const [gameSpiritLoading, setGameSpiritLoading] = useState(false);
  const [gameSpiritError, setGameSpiritError] = useState('');
  const [gameSpiritPayload, setGameSpiritPayload] = useState(null);

  /** Encuesta de espíritu manual (organizador): modal con mismas preguntas que el enlace público. */
  const [spiritManualOpen, setSpiritManualOpen] = useState(false);
  /** Copia de pendientes al abrir el modal (uno o dos ítems); un Guardar envía todas las encuestas completas. */
  const [spiritManualSessionSlots, setSpiritManualSessionSlots] = useState([]);
  /** Clave = `visitor-rates-local` | `local-rates-visitor`; cada lado tiene valores propios en el modal. */
  const [spiritManualDraftBySlot, setSpiritManualDraftBySlot] = useState({});
  const [spiritManualSaving, setSpiritManualSaving] = useState(false);
  const [spiritManualFormError, setSpiritManualFormError] = useState('');

  const gameFinished = useMemo(() => isGameFinishedState(gameEstadoRaw(gameRow)), [gameRow]);

  const { tiempo } = useGamePhaseClock({
    events: gameEvents,
    phaseSeconds,
    gameFinished,
    gameRow,
    persistEnabled: false,
    tournamentId: tournamentIdParam,
    gameId: gameIdParam
  });

  const { localGoals, visitorGoals, loading: scoreLoading, error: scoreError } = useGameMatchScore(
    tournamentIdParam,
    gameIdParam,
    {
      enabled: Boolean(tournamentIdParam && gameIdParam),
      refetchIntervalMs: 4000
    }
  );

  useEffect(() => {
    if (!gameRow || !tournamentIdParam) return undefined;
    let cancelled = false;

    const loadPhaseSeconds = async () => {
      try {
        const resPhases = await configService.getPhases(tournamentIdParam);
        const phaseId = gameRow.phas_id;
        let hms = parsePhaseDurationToHms(null);
        if (phaseId != null && phaseId !== '' && resPhases?.success) {
          const phases = resPhases.data?.phases || [];
          const phase = phases.find((p) => Number(p.phas_id) === Number(phaseId));
          if (phase) hms = parsePhaseDurationToHms(phase.duration);
        }
        if (!cancelled) {
          setPhaseSeconds(phaseHmsToSeconds(hms.horas, hms.minutos, hms.segundos));
        }
      } catch {
        if (!cancelled) {
          const fb = parsePhaseDurationToHms(null);
          setPhaseSeconds(phaseHmsToSeconds(fb.horas, fb.minutos, fb.segundos));
        }
      }
    };

    loadPhaseSeconds();
    return () => {
      cancelled = true;
    };
  }, [gameRow, tournamentIdParam]);

  const loadGameEvents = useCallback(async () => {
    if (!tournamentIdParam || !gameIdParam) return;
    try {
      const [resEv, resGames] = await Promise.all([
        configService.getGameEvents(tournamentIdParam, gameIdParam),
        configService.getGames(tournamentIdParam)
      ]);
      if (resEv?.success && Array.isArray(resEv.data?.events)) {
        setGameEvents(resEv.data.events);
        setGameEventsError('');
      }
      if (resGames?.success) {
        const found = (resGames.data?.games || []).find(
          (g) => Number(g.game_id) === Number(gameIdParam)
        );
        if (found) {
          setGameRow((prev) => (prev ? { ...prev, ...found } : found));
        }
      }
    } catch (e) {
      setGameEventsError(e.response?.data?.message || e.message || 'No se pudo cargar el resumen.');
    }
  }, [tournamentIdParam, gameIdParam]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        loadGameEvents();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [loadGameEvents]);

  const loadGamePlayerRank = useCallback(async () => {
    if (!tournamentIdParam || !gameIdParam) return;
    try {
      const res = await configService.getGamePlayerRank(tournamentIdParam, gameIdParam);
      if (res?.success && Array.isArray(res.data?.rows)) {
        setGameRankRows(res.data.rows);
        setGameRankError('');
      } else {
        setGameRankRows([]);
        setGameRankError(res?.message || 'No se pudieron cargar las estadísticas del partido.');
      }
    } catch (e) {
      setGameRankRows([]);
      setGameRankError(e.response?.data?.message || e.message || 'No se pudieron cargar las estadísticas (Game_Rank_V).');
    }
  }, [tournamentIdParam, gameIdParam]);

  const loadGameSpiritScores = useCallback(async (opts = {}) => {
    const silent = opts.silent === true;
    if (!tournamentIdParam || !gameIdParam) return;
    if (!silent) {
      setGameSpiritLoading(true);
      setGameSpiritError('');
    }
    try {
      const res = await configService.getGameSpiritScores(tournamentIdParam, gameIdParam);
      if (!res?.success) {
        throw new Error(res?.message || 'No se pudieron cargar las puntuaciones de espíritu.');
      }
      setGameSpiritPayload(res.data || null);
      setGameSpiritError('');
    } catch (e) {
      if (!silent) {
        setGameSpiritPayload(null);
        setGameSpiritError(e.response?.data?.message || e.message || 'Error al cargar espíritu del partido.');
      }
    } finally {
      if (!silent) setGameSpiritLoading(false);
    }
  }, [tournamentIdParam, gameIdParam]);

  useEffect(() => {
    if (gameSectionTab !== 'espiritu') return undefined;
    loadGameSpiritScores({ silent: false });
    const id = setInterval(() => loadGameSpiritScores({ silent: true }), 8000);
    return () => clearInterval(id);
  }, [gameSectionTab, loadGameSpiritScores]);

  useEffect(() => {
    loadGameEvents();
    loadGamePlayerRank();
    // Partido finalizado: eventos y ranking ya no cambian. Sin esta guarda, el polling cada 4 s
    // reescribe gameRow/eventos/ranking con referencias nuevas y hace parpadear la pestaña Player Stats.
    if (gameFinished) return undefined;
    const id = setInterval(() => {
      loadGameEvents();
      loadGamePlayerRank();
    }, 4000);
    return () => clearInterval(id);
  }, [loadGameEvents, loadGamePlayerRank, gameFinished]);

  useEffect(() => {
    const loadGame = async () => {
      setGameLoadError('');
      setGameRow(null);
      setTorneoTeamsRows([]);
      setTorneoGamesNormalized([]);
      if (!gameIdParam || !tournamentIdParam) {
        setGameLoading(false);
        setGameLoadError('Faltan parámetros del partido (gameId o tournamentId).');
        return;
      }
      try {
        setGameLoading(true);
        const res = await configService.getGames(tournamentIdParam);
        if (!res?.success) {
          setGameLoadError(res?.message || 'No se pudo cargar el partido.');
          return;
        }
        const games = res.data?.games || [];
        const found = games.find((g) => Number(g.game_id) === Number(gameIdParam));
        if (!found) {
          setGameLoadError('No se encontró el partido.');
          return;
        }
        const tournamentGamesNormalized = games.map((g) => {
          const gn = g.game_num != null && g.game_num !== '' ? Number(g.game_num) : NaN;
          return {
            game_id: Number(g.game_id),
            game_num: Number.isFinite(gn) ? gn : null,
            division: normalizeDivisionName(String(g.division || '').trim()),
            local: g.local != null ? Number(g.local) : null,
            visitor: g.visitor != null ? Number(g.visitor) : null,
            local_score: g.local_score,
            visitor_score: g.visitor_score,
            estado: g.estado ?? g.Estado ?? g.estatus ?? ''
          };
        });
        setTorneoGamesNormalized(tournamentGamesNormalized);
        let teamRows = [];
        try {
          const tr = await configService.getTeams(tournamentIdParam);
          if (tr?.success) teamRows = tr.data?.teams || [];
        } catch {
          /* sin equipos (permisos) se sigue intentando resolver slots parcialmente */
        }
        setTorneoTeamsRows(teamRows);
        setGameRow(found);
      } catch (e) {
        setGameLoadError(e.response?.data?.message || e.message || 'Error al cargar el partido.');
      } finally {
        setGameLoading(false);
      }
    };
    loadGame();
  }, [gameIdParam, tournamentIdParam]);

  const gamePageSlotResolution = useMemo(() => {
    if (!gameRow) return null;
    const rows = torneoTeamsRows || [];
    const teamLookup = buildTorneoTeamLookup(rows);
    const divisionNorm = normalizeDivisionName(String(gameRow.division || '').trim());
    const statsSlotLocal =
      gameRow.stats_slot_local != null || gameRow.statsSlotLocal != null
        ? String(gameRow.stats_slot_local ?? gameRow.statsSlotLocal ?? '').trim()
        : '';
    const statsSlotVisitor =
      gameRow.stats_slot_visitor != null || gameRow.statsSlotVisitor != null
        ? String(gameRow.stats_slot_visitor ?? gameRow.statsSlotVisitor ?? '').trim()
        : '';

    const localFk = gameRow.local != null ? Number(gameRow.local) : null;
    const visitorFk = gameRow.visitor != null ? Number(gameRow.visitor) : null;

    const localDisplay = enrichScheduleParticipantFromSlots(
      {
        teamId: localFk,
        joinName: gameRow.local_name,
        joinImage: gameRow.local_image,
        statsSlotRaw: statsSlotLocal,
        teamLookup,
        teamsRows: rows,
        division: divisionNorm,
        tournamentGamesNormalized: torneoGamesNormalized
      },
      resolveParticipantTeamDisplay
    );

    const visitorDisplay = enrichScheduleParticipantFromSlots(
      {
        teamId: visitorFk,
        joinName: gameRow.visitor_name,
        joinImage: gameRow.visitor_image,
        statsSlotRaw: statsSlotVisitor,
        teamLookup,
        teamsRows: rows,
        division: divisionNorm,
        tournamentGamesNormalized: torneoGamesNormalized
      },
      resolveParticipantTeamDisplay
    );

    const localRosterId = rosterTeamIdForNavigation(localFk, localDisplay);
    const visitorRosterId = rosterTeamIdForNavigation(visitorFk, visitorDisplay);

    return {
      localRosterId,
      visitorRosterId,
      homeName: localDisplay?.name ?? 'Local',
      awayName: visitorDisplay?.name ?? 'Visitante',
      homeImg: localDisplay?.image || '',
      awayImg: visitorDisplay?.image || ''
    };
  }, [gameRow, torneoTeamsRows, torneoGamesNormalized]);

  useEffect(() => {
    const loadPlayers = async () => {
      if (!gameRow || !tournamentIdParam) {
        setRosterHome([]);
        setRosterAway([]);
        return;
      }
      setPlayersLoading(true);
      setPlayersError('');
      try {
        const res = await configService.getPlayers(tournamentIdParam);
        if (!res?.success) {
          setPlayersError(res?.message || 'No se pudieron cargar los jugadores.');
          setRosterHome([]);
          setRosterAway([]);
          return;
        }
        const all = res.data?.players || [];
        const fkLocal = gameRow.local != null ? Number(gameRow.local) : null;
        const fkVisitor = gameRow.visitor != null ? Number(gameRow.visitor) : null;
        const localId =
          gamePageSlotResolution?.localRosterId != null &&
          Number.isFinite(Number(gamePageSlotResolution.localRosterId)) &&
          Number(gamePageSlotResolution.localRosterId) > 0
            ? Number(gamePageSlotResolution.localRosterId)
            : Number.isFinite(fkLocal) && fkLocal > 0
              ? fkLocal
              : null;
        const visitorId =
          gamePageSlotResolution?.visitorRosterId != null &&
          Number.isFinite(Number(gamePageSlotResolution.visitorRosterId)) &&
          Number(gamePageSlotResolution.visitorRosterId) > 0
            ? Number(gamePageSlotResolution.visitorRosterId)
            : Number.isFinite(fkVisitor) && fkVisitor > 0
              ? fkVisitor
              : null;
        const byTeam = (tid) => {
          if (tid == null || !Number.isFinite(tid)) return [];
          return all
            .filter((p) => Number(p.team_id) === tid)
            .sort((a, b) => (Number(a.player_number) || 0) - (Number(b.player_number) || 0));
        };
        setRosterHome(byTeam(localId));
        setRosterAway(byTeam(visitorId));
      } catch (e) {
        setPlayersError(e.response?.data?.message || e.message || 'Error al cargar jugadores.');
        setRosterHome([]);
        setRosterAway([]);
      } finally {
        setPlayersLoading(false);
      }
    };
    loadPlayers();
  }, [gameRow, tournamentIdParam, gamePageSlotResolution]);

  /** Mismos IDs que roster local/visitante (FK o resolución por slot) para calcular marcador desde la línea temporal. */
  const matchupScoreTeamIds = useMemo(() => {
    const sr = gamePageSlotResolution;
    const fkLocal = gameRow?.local != null ? Number(gameRow.local) : null;
    const fkVisitor = gameRow?.visitor != null ? Number(gameRow.visitor) : null;
    const localId =
      sr?.localRosterId != null &&
      Number.isFinite(Number(sr.localRosterId)) &&
      Number(sr.localRosterId) > 0
        ? Number(sr.localRosterId)
        : Number.isFinite(fkLocal) && fkLocal > 0
          ? fkLocal
          : null;
    const visitorId =
      sr?.visitorRosterId != null &&
      Number.isFinite(Number(sr.visitorRosterId)) &&
      Number(sr.visitorRosterId) > 0
        ? Number(sr.visitorRosterId)
        : Number.isFinite(fkVisitor) && fkVisitor > 0
          ? fkVisitor
          : null;
    return { localId, visitorId };
  }, [gameRow, gamePageSlotResolution]);

  const timelineDerivedGoalTotals = useMemo(
    () => goalTotalsFromTimelineEvents(gameEvents, matchupScoreTeamIds.localId, matchupScoreTeamIds.visitorId),
    [gameEvents, matchupScoreTeamIds]
  );

  const handleSortHome = (key) => {
    setSortHome((prev) => (prev.key === key ? { ...prev, asc: !prev.asc } : { key, asc: true }));
  };

  const handleSortAway = (key) => {
    setSortAway((prev) => (prev.key === key ? { ...prev, asc: !prev.asc } : { key, asc: true }));
  };

  const matchup = useMemo(() => {
    if (!gameRow) return null;
    const dateStr = normalizeGameDate(gameRow.game_date);
    const timeStr = normalizeGameTime(gameRow.game_time);
    const fallbackHome = pickGameRowScoreValue(gameRow, 'home');
    const fallbackAway = pickGameRowScoreValue(gameRow, 'away');
    const fhNum = fallbackHome != null ? fallbackHome : NaN;
    const faNum = fallbackAway != null ? fallbackAway : NaN;
    const dbBothNumeric = Number.isFinite(fhNum) && Number.isFinite(faNum);
    let homePts;
    let awayPts;
    if (scoreError) {
      homePts = fallbackHome;
      awayPts = fallbackAway;
    } else if (!scoreLoading) {
      /** GET goal-totals; si llega vacío igual que BD, repetir cómputo desde timeline ya cargada (fallback visual). */
      const glHook = Number(localGoals) || 0;
      const gvHook = Number(visitorGoals) || 0;
      let gl = glHook;
      let gv = gvHook;
      if (
        gl === 0 &&
        gv === 0 &&
        (timelineDerivedGoalTotals.local_goals > 0 || timelineDerivedGoalTotals.visitor_goals > 0)
      ) {
        gl = timelineDerivedGoalTotals.local_goals;
        gv = timelineDerivedGoalTotals.visitor_goals;
      }
      /** Preferir marcador desde eventos/goal-totals salvo que todo sea 0 y la fila `game` ya tenga goles. */
      const totalsEmpty = gl === 0 && gv === 0;
      const dbHasScore = dbBothNumeric && (fhNum !== 0 || faNum !== 0);
      if (totalsEmpty && dbHasScore) {
        homePts = fhNum;
        awayPts = faNum;
      } else {
        homePts = gl;
        awayPts = gv;
      }
    } else if (fallbackHome !== null || fallbackAway !== null) {
      homePts = fallbackHome;
      awayPts = fallbackAway;
    } else {
      homePts = null;
      awayPts = null;
    }
    const winner = getMatchWinner(homePts, awayPts);
    const locationFromDb = String(gameRow.game_location ?? '').trim();
    const rawEstado = gameRow.estado ?? gameRow.Estado;
    const estadoLabel =
      rawEstado != null && String(rawEstado).trim() !== '' ? String(rawEstado).trim() : '—';
    const sr = gamePageSlotResolution;
    const homeNm =
      sr?.homeName && String(sr.homeName).trim() !== ''
        ? String(sr.homeName).trim()
        : gameRow.local_name || 'Local';
    const awayNm =
      sr?.awayName && String(sr.awayName).trim() !== ''
        ? String(sr.awayName).trim()
        : gameRow.visitor_name || 'Visitante';

    return {
      dateStr,
      timeStr,
      metaDateTimeLabel: formatGameMetaDateTime(dateStr, timeStr),
      locationLabel: locationFromDb || '—',
      estadoLabel,
      homeName: homeNm,
      awayName: awayNm,
      homeImg: (sr?.homeImg && String(sr.homeImg).trim()) || gameRow.local_image || '',
      awayImg: (sr?.awayImg && String(sr.awayImg).trim()) || gameRow.visitor_image || '',
      homePts,
      awayPts,
      winner
    };
  }, [
    gameRow,
    gamePageSlotResolution,
    localGoals,
    visitorGoals,
    scoreLoading,
    scoreError,
    timelineDerivedGoalTotals
  ]);

  const spiritManualSlots = useMemo(() => {
    if (!gameRow || !gameSpiritPayload || gameSpiritLoading) return [];
    const fkLoc = gameRow.local != null ? Number(gameRow.local) : NaN;
    const fkVis = gameRow.visitor != null ? Number(gameRow.visitor) : NaN;
    const localResolved = gamePageSlotResolution?.localRosterId ?? NaN;
    const visitorResolved = gamePageSlotResolution?.visitorRosterId ?? NaN;
    const localId =
      Number.isFinite(localResolved) && localResolved > 0 ? localResolved : fkLoc;
    const visitorId =
      Number.isFinite(visitorResolved) && visitorResolved > 0 ? visitorResolved : fkVis;
    if (
      !Number.isFinite(localId) ||
      !Number.isFinite(visitorId) ||
      localId <= 0 ||
      visitorId <= 0
    ) {
      return [];
    }
    const homeNm = matchup?.homeName ?? 'Local';
    const awayNm = matchup?.awayName ?? 'Visitante';
    /** Visitante evalúa al local → puntuación recibe el local. */
    const slots = [];
    if (!gameSpiritPayload.localReceived) {
      slots.push({
        responding_team_id: visitorId,
        respondentLabel: awayNm,
        ratedLabel: homeNm,
        slotKey: 'visitor-rates-local'
      });
    }
    if (!gameSpiritPayload.visitorReceived) {
      slots.push({
        responding_team_id: localId,
        respondentLabel: homeNm,
        ratedLabel: awayNm,
        slotKey: 'local-rates-visitor'
      });
    }
    return slots;
  }, [gameRow, gamePageSlotResolution, gameSpiritPayload, gameSpiritLoading, matchup]);

  /** Partido Finished: coincide con backend (Game.estadoAllowsSpiritSurveyManual). */
  const gameAllowsSpiritSurveyManualEntry = Boolean(
    gameRow && isGameFinishedState(gameEstadoRaw(gameRow))
  );

  const resetSpiritManualForm = useCallback(() => {
    setSpiritManualSessionSlots([]);
    setSpiritManualDraftBySlot({});
    setSpiritManualFormError('');
  }, []);

  const patchSpiritManualDraftForSlot = useCallback((slotKey, partial) => {
    if (!slotKey) return;
    setSpiritManualDraftBySlot((prev) => ({
      ...prev,
      [slotKey]: {
        ...(prev[slotKey] || emptySpiritManualDraft()),
        ...partial
      }
    }));
  }, []);

  const openSpiritManualModal = useCallback(() => {
    setSpiritManualFormError('');
    const slotsCopy = spiritManualSlots.map((s) => ({ ...s }));
    if (!slotsCopy.length) return;
    setSpiritManualSessionSlots(slotsCopy);
    const drafts = {};
    slotsCopy.forEach((s) => {
      drafts[s.slotKey] = emptySpiritManualDraft();
    });
    setSpiritManualDraftBySlot(drafts);
    setSpiritManualOpen(true);
  }, [spiritManualSlots]);

  const spiritManualAllDraftsReady = useMemo(() => {
    if (!spiritManualSessionSlots.length) return false;
    return spiritManualSessionSlots.every((s) =>
      isSpiritManualDraftComplete(spiritManualDraftBySlot[s.slotKey])
    );
  }, [spiritManualSessionSlots, spiritManualDraftBySlot]);

  const closeSpiritManualModal = useCallback(() => {
    setSpiritManualOpen(false);
    resetSpiritManualForm();
  }, [resetSpiritManualForm]);

  const handleSpiritManualSubmit = async (e) => {
    e.preventDefault();
    const slots = spiritManualSessionSlots;
    if (spiritManualSaving || !slots.length || !tournamentIdParam || !gameIdParam) {
      setSpiritManualFormError('No hay encuestas para guardar.');
      return;
    }
    for (const slot of slots) {
      const d = spiritManualDraftBySlot[slot.slotKey] || emptySpiritManualDraft();
      if (!isSpiritManualDraftComplete(d)) {
        setSpiritManualFormError(
          slots.length > 1
            ? 'Completa las cinco categorías en ambas evaluaciones antes de guardar.'
            : 'Completa las cinco categorías antes de guardar.'
        );
        return;
      }
    }
    setSpiritManualSaving(true);
    setSpiritManualFormError('');
    try {
      /* Guardado independiente en BD: dos POST si faltaban las dos encuestas. */
      for (let i = 0; i < slots.length; i += 1) {
        const slot = slots[i];
        const d = spiritManualDraftBySlot[slot.slotKey] || emptySpiritManualDraft();
        const res = await configService.submitSpiritSurveyManual(tournamentIdParam, gameIdParam, {
          responding_team_id: slot.responding_team_id,
          s_rules: d.rules,
          s_fouls: d.fouls,
          s_fairmind: d.fairmind,
          s_attitude: d.attitude,
          s_communication: d.communication,
          comments: d.comments
        });
        if (!res?.success) {
          throw new Error(res?.message || `No se pudo guardar la encuesta (${i + 1}/${slots.length}).`);
        }
      }
      closeSpiritManualModal();
      await loadGameSpiritScores({ silent: false });
    } catch (err) {
      setSpiritManualFormError(err.response?.data?.message || err.message || 'Error al guardar.');
      await loadGameSpiritScores({ silent: false });
    } finally {
      setSpiritManualSaving(false);
    }
  };

  useEffect(() => {
    if (!spiritManualOpen) return undefined;
    const onKey = (ev) => {
      if (ev.key === 'Escape') closeSpiritManualModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [spiritManualOpen, closeSpiritManualModal]);

  const timelineItems = useMemo(() => {
    if (!gameRow) return [];
    const fkLoc = gameRow.local != null ? Number(gameRow.local) : null;
    const fkVis = gameRow.visitor != null ? Number(gameRow.visitor) : null;
    const localId =
      gamePageSlotResolution?.localRosterId != null &&
      Number.isFinite(Number(gamePageSlotResolution.localRosterId)) &&
      Number(gamePageSlotResolution.localRosterId) > 0
        ? Number(gamePageSlotResolution.localRosterId)
        : fkLoc != null && Number.isFinite(fkLoc)
          ? fkLoc
          : null;
    const visitorId =
      gamePageSlotResolution?.visitorRosterId != null &&
      Number.isFinite(Number(gamePageSlotResolution.visitorRosterId)) &&
      Number(gamePageSlotResolution.visitorRosterId) > 0
        ? Number(gamePageSlotResolution.visitorRosterId)
        : fkVis != null && Number.isFinite(fkVis)
          ? fkVis
          : null;
    const homeNm =
      gamePageSlotResolution?.homeName && String(gamePageSlotResolution.homeName).trim() !== ''
        ? String(gamePageSlotResolution.homeName).trim()
        : gameRow.local_name != null && String(gameRow.local_name).trim() !== ''
          ? String(gameRow.local_name).trim()
          : 'Local';
    const awayNm =
      gamePageSlotResolution?.awayName && String(gamePageSlotResolution.awayName).trim() !== ''
        ? String(gamePageSlotResolution.awayName).trim()
        : gameRow.visitor_name != null && String(gameRow.visitor_name).trim() !== ''
          ? String(gameRow.visitor_name).trim()
          : 'Visitante';
    return buildGameTimelineItems(gameEvents, localId, visitorId, homeNm, awayNm);
  }, [gameEvents, gameRow, gamePageSlotResolution]);

  /** Orden por defecto: más recientes arriba (último event_id primero). */
  const displayedTimeline = useMemo(() => [...timelineItems].reverse(), [timelineItems]);

  const gameRankMap = useMemo(() => buildPlayerRankMap(gameRankRows), [gameRankRows]);

  const scoreDisplay = (pts) => (pts !== null ? String(pts) : '—');

  const calendarBackHref = useMemo(() => {
    const qs = new URLSearchParams();
    if (tournamentIdParam != null && String(tournamentIdParam).trim() !== '') {
      qs.set('tournamentId', String(tournamentIdParam).trim());
    }
    const suffix = qs.toString();
    return suffix ? `/calendar?${suffix}` : '/calendar';
  }, [tournamentIdParam]);

  return (
    <div className="game_container">
      <div className="topbar">
        {isUserAuthenticated ? <Navbar /> : <Noauth_Navbar />}
      </div>
      <div className="body_container">
        {!gameLoading ? (
          <div className="game-back-nav">
            <Link className="game-back-to-calendar-link" to={calendarBackHref}>
              ← Volver al calendario
            </Link>
          </div>
        ) : null}
        {gameLoading ? (
          <div className="game-matchup game-matchup--state">Cargando partido…</div>
        ) : null}
        {!gameLoading && gameLoadError ? (
          <div className="game-matchup game-matchup--state game-matchup--error">{gameLoadError}</div>
        ) : null}
        {!gameLoading && !gameLoadError && matchup ? (
          <div className="game-matchup">
            <div className="game-matchup-meta">
              <span className="game-matchup-meta-left">{matchup.metaDateTimeLabel}</span>
              <span className="game-matchup-meta-estado" title="Estado del partido">
                {matchup.estadoLabel}
              </span>
              <span className="game-matchup-meta-right">{matchup.locationLabel}</span>
            </div>
            <div className="game-matchup-main">
              <div className="game-matchup-team game-matchup-team--home">
                <div className="game-matchup-team-row">
                  <img
                    className="game-matchup-logo"
                    src={matchup.homeImg || TEAM_FALLBACK_IMAGE}
                    alt=""
                    onError={(e) => {
                      if (!e.currentTarget.src.includes(TEAM_FALLBACK_IMAGE)) e.currentTarget.src = TEAM_FALLBACK_IMAGE;
                    }}
                  />
                  <span
                    className={
                      matchup.winner === 'home'
                        ? 'game-matchup-name game-matchup-name--emphasis'
                        : matchup.winner === 'draw'
                          ? 'game-matchup-name game-matchup-name--tie'
                          : matchup.winner === 'away'
                            ? 'game-matchup-name game-matchup-name--muted'
                            : 'game-matchup-name game-matchup-name--pending'
                    }
                  >
                    {matchup.homeName}
                  </span>
                </div>
              </div>

              <div className="game-matchup-score">
                <div className="game-matchup-score-row">
                  {matchup.winner === 'home' ? <span className="game-matchup-arrow">&#9664;</span> : null}
                  <span
                    className={
                      matchup.winner === 'draw'
                        ? 'game-matchup-score-num game-matchup-score-num--tie'
                        : matchup.winner === 'home'
                          ? 'game-matchup-score-num game-matchup-score-num--win'
                          : 'game-matchup-score-num game-matchup-score-num--lose'
                    }
                  >
                    {scoreDisplay(matchup.homePts)}
                  </span>
                  <span className="game-matchup-score-sep"> - </span>
                  <span
                    className={
                      matchup.winner === 'draw'
                        ? 'game-matchup-score-num game-matchup-score-num--tie'
                        : matchup.winner === 'away'
                          ? 'game-matchup-score-num game-matchup-score-num--win'
                          : 'game-matchup-score-num game-matchup-score-num--lose'
                    }
                  >
                    {scoreDisplay(matchup.awayPts)}
                  </span>
                  {matchup.winner === 'away' ? <span className="game-matchup-arrow">&#9654;</span> : null}
                </div>
              </div>

              <div className="game-matchup-team game-matchup-team--away">
                <div className="game-matchup-team-row">
                  <span
                    className={
                      matchup.winner === 'away'
                        ? 'game-matchup-name game-matchup-name--away-win'
                        : matchup.winner === 'draw'
                          ? 'game-matchup-name game-matchup-name--away-tie'
                          : matchup.winner === 'home'
                            ? 'game-matchup-name game-matchup-name--away'
                            : 'game-matchup-name game-matchup-name--away-pending'
                    }
                  >
                    {matchup.awayName}
                  </span>
                  <img
                    className="game-matchup-logo"
                    src={matchup.awayImg || TEAM_FALLBACK_IMAGE}
                    alt=""
                    onError={(e) => {
                      if (!e.currentTarget.src.includes(TEAM_FALLBACK_IMAGE)) e.currentTarget.src = TEAM_FALLBACK_IMAGE;
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <div className="game-crono-stack">
          <GamePhaseClockDisplay tiempo={tiempo} variant="gamepages" />

          {!gameLoading && !gameLoadError && matchup ? (
            <div className="game-stats-section">
              <div className="game-detail-card">
                <nav className="game-detail-card-nav" aria-label="Secciones del partido">
                  <button
                    type="button"
                    className={
                      gameSectionTab === 'resumen'
                        ? 'game-detail-tab game-detail-tab--active'
                        : 'game-detail-tab'
                    }
                    onClick={() => setGameSectionTab('resumen')}
                  >
                    Resumen
                  </button>
                  <button
                    type="button"
                    className={
                      gameSectionTab === 'playerStats'
                        ? 'game-detail-tab game-detail-tab--active'
                        : 'game-detail-tab'
                    }
                    onClick={() => setGameSectionTab('playerStats')}
                  >
                    Player Stats
                  </button>
                  <button
                    type="button"
                    className={
                      gameSectionTab === 'espiritu'
                        ? 'game-detail-tab game-detail-tab--active'
                        : 'game-detail-tab'
                    }
                    onClick={() => setGameSectionTab('espiritu')}
                  >
                    Espíritu
                  </button>
                </nav>
                <div className="game-detail-card-body">
                  {gameSectionTab === 'playerStats' ? (
                    <>
                      {playersLoading ? <div className="game-stats-state">Cargando jugadores…</div> : null}
                      {!playersLoading && playersError ? (
                        <div className="game-stats-state game-stats-state--error">{playersError}</div>
                      ) : null}
                      {!playersLoading && gameRankError ? (
                        <div className="game-stats-state game-stats-state--error" role="alert">
                          {gameRankError}
                        </div>
                      ) : null}
                      {!playersLoading && !playersError && !gameRankError && gameRankRows.length === 0 ? (
                        <p className="game-stats-state game-stats-state--muted">
                          No hay estadísticas por jugador para este partido (p. ej. sin eventos GOAL en la línea de
                          tiempo). Sí puede haber filas en <strong>Resumen</strong> sin anotaciones con jugador.
                        </p>
                      ) : null}
                      {!playersLoading && !playersError ? (
                        <div className="game-stats-grid">
                          <GameStatsTable
                            teamName={matchup.homeName}
                            teamLogo={matchup.homeImg}
                            playersRaw={rosterHome}
                            rankMap={gameRankMap}
                            nameColorClass="game-stats-team-name--home"
                            sortKey={sortHome.key}
                            sortAsc={sortHome.asc}
                            onSort={handleSortHome}
                          />
                          <GameStatsTable
                            teamName={matchup.awayName}
                            teamLogo={matchup.awayImg}
                            playersRaw={rosterAway}
                            rankMap={gameRankMap}
                            nameColorClass="game-stats-team-name--away"
                            sortKey={sortAway.key}
                            sortAsc={sortAway.asc}
                            onSort={handleSortAway}
                          />
                        </div>
                      ) : null}
                    </>
                  ) : null}
                  {gameSectionTab === 'resumen' ? (
                    <div className="game-timeline-wrap">
                      <div className="game-timeline-header">
                        <h3 className="game-timeline-title">Resumen del partido</h3>
                      </div>
                      {gameEventsError ? (
                        <p className="game-timeline-error" role="alert">
                          {gameEventsError}
                        </p>
                      ) : null}
                      {displayedTimeline.length === 0 && !gameEventsError ? (
                        <p className="game-timeline-empty">Aún no hay eventos registrados para este partido.</p>
                      ) : null}
                      <ul className="game-timeline-list" aria-label="Línea de tiempo del partido">
                        {displayedTimeline.map((item) => (
                          <li
                            key={item.key}
                            className={`game-timeline-card game-timeline-card--${item.side}`}
                          >
                            <div className="game-timeline-card-inner">
                              <span className="game-timeline-time">{item.timeLabel}</span>
                              <div className="game-timeline-body">
                                <p className="game-timeline-main">{item.lineMain}</p>
                                {item.lineSub ? <p className="game-timeline-sub">{item.lineSub}</p> : null}
                              </div>
                              <div className="game-timeline-scores" aria-label="Marcador tras el evento">
                                <div className="game-timeline-score-line">
                                  <span className="game-timeline-score-num">{item.homeScore}</span>
                                  <span className="game-timeline-score-name">{matchup.homeName}</span>
                                </div>
                                <div className="game-timeline-score-line">
                                  <span className="game-timeline-score-num">{item.awayScore}</span>
                                  <span className="game-timeline-score-name">{matchup.awayName}</span>
                                </div>
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {gameSectionTab === 'espiritu' ? (
                    <div className="game-spirit-panel">
                      <h3 className="game-spirit-title">Spirit Scores</h3>
                      {gameAllowsSpiritSurveyManualEntry &&
                      isUserAuthenticated &&
                      spiritManualSlots.length > 0 ? (
                        <div
                          className="game-spirit-manual-bar"
                          role="region"
                          aria-label="Encuesta de espíritu manual"
                        >
                          <p className="game-spirit-manual-intro">
                            Sin correo del representante o sin acceso al enlace, puedes registrar aquí la
                            encuesta como organizador (mismas preguntas que por correo).
                          </p>
                          <button
                            type="button"
                            className="game-spirit-manual-open"
                            onClick={openSpiritManualModal}
                          >
                            Encuesta manual
                          </button>
                        </div>
                      ) : null}
                      {gameSpiritLoading ? (
                        <p className="game-stats-state">Cargando puntuaciones de espíritu…</p>
                      ) : null}
                      {!gameSpiritLoading && gameSpiritError ? (
                        <p className="game-stats-state game-stats-state--error" role="alert">
                          {gameSpiritError}
                        </p>
                      ) : null}
                      {!gameSpiritLoading && !gameSpiritError && matchup ? (
                        <>
                          {!gameSpiritPayload?.localReceived && !gameSpiritPayload?.visitorReceived ? (
                            <p className="game-spirit-empty">
                              Aún no hay encuestas de espíritu registradas para este partido.
                            </p>
                          ) : (
                            <>
                              <div className="game-spirit-table-wrap">
                                <table className="game-spirit-table" aria-label="Puntuaciones de espíritu por equipo">
                                  <thead>
                                    <tr>
                                      <th className="game-spirit-th game-spirit-th--score">
                                        <span className="game-spirit-received">Recibido por</span>
                                        <span className="game-spirit-teamhead">
                                          <img
                                            className="game-spirit-flag"
                                            src={matchup.homeImg || TEAM_FALLBACK_IMAGE}
                                            alt=""
                                            onError={(e) => {
                                              if (!e.currentTarget.src.includes(TEAM_FALLBACK_IMAGE)) {
                                                e.currentTarget.src = TEAM_FALLBACK_IMAGE;
                                              }
                                            }}
                                          />
                                          <span className="game-spirit-teamname">{matchup.homeName}</span>
                                        </span>
                                      </th>
                                      <th className="game-spirit-th game-spirit-th--cat" aria-hidden />
                                      <th className="game-spirit-th game-spirit-th--score">
                                        <span className="game-spirit-received">Recibido por</span>
                                        <span className="game-spirit-teamhead">
                                          <img
                                            className="game-spirit-flag"
                                            src={matchup.awayImg || TEAM_FALLBACK_IMAGE}
                                            alt=""
                                            onError={(e) => {
                                              if (!e.currentTarget.src.includes(TEAM_FALLBACK_IMAGE)) {
                                                e.currentTarget.src = TEAM_FALLBACK_IMAGE;
                                              }
                                            }}
                                          />
                                          <span className="game-spirit-teamname">{matchup.awayName}</span>
                                        </span>
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {GAME_SPIRIT_CATEGORY_ROWS.map((row, idx) => (
                                      <tr
                                        key={row.key}
                                        className={
                                          idx % 2 === 1 ? 'game-spirit-tr game-spirit-tr--alt' : 'game-spirit-tr'
                                        }
                                      >
                                        <td className="game-spirit-td game-spirit-td--num">
                                          {formatSpiritScoreCell(gameSpiritPayload?.localReceived?.[row.key])}
                                        </td>
                                        <td className="game-spirit-td game-spirit-td--label">{row.label}</td>
                                        <td className="game-spirit-td game-spirit-td--num">
                                          {formatSpiritScoreCell(gameSpiritPayload?.visitorReceived?.[row.key])}
                                        </td>
                                      </tr>
                                    ))}
                                    <tr className="game-spirit-tr game-spirit-tr--total">
                                      <td className="game-spirit-td game-spirit-td--num">
                                        {formatSpiritScoreCell(gameSpiritPayload?.localReceived?.total)}
                                      </td>
                                      <td className="game-spirit-td game-spirit-td--label">Total</td>
                                      <td className="game-spirit-td game-spirit-td--num">
                                        {formatSpiritScoreCell(gameSpiritPayload?.visitorReceived?.total)}
                                      </td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                              <div className="game-spirit-comments-grid">
                                <div className="game-spirit-comment-block">
                                  <div className="game-spirit-comment-heading">
                                    Comentarios — {matchup.homeName}
                                  </div>
                                  <p className="game-spirit-comment-body">
                                    {gameSpiritPayload?.localReceived?.comments?.trim()
                                      ? gameSpiritPayload.localReceived.comments
                                      : 'Sin comentarios.'}
                                  </p>
                                </div>
                                <div className="game-spirit-comment-block">
                                  <div className="game-spirit-comment-heading">
                                    Comentarios — {matchup.awayName}
                                  </div>
                                  <p className="game-spirit-comment-body">
                                    {gameSpiritPayload?.visitorReceived?.comments?.trim()
                                      ? gameSpiritPayload.visitorReceived.comments
                                      : 'Sin comentarios.'}
                                  </p>
                                </div>
                              </div>
                            </>
                          )}
                        </>
                      ) : null}
                      {spiritManualOpen ? (
                        <div
                          className="game-spirit-modal-backdrop"
                          role="dialog"
                          aria-modal="true"
                          aria-labelledby="game-spirit-modal-title"
                          onMouseDown={(ev) => {
                            if (ev.target === ev.currentTarget && !spiritManualSaving) closeSpiritManualModal();
                          }}
                        >
                          <div className="game-spirit-modal-card" onMouseDown={(e) => e.stopPropagation()}>
                            <div className="game-spirit-modal-head">
                              <h2 id="game-spirit-modal-title" className="game-spirit-modal-title">
                                Encuesta de espíritu (manual)
                              </h2>
                              <button
                                type="button"
                                className="game-spirit-modal-close"
                                onClick={() => !spiritManualSaving && closeSpiritManualModal()}
                                disabled={spiritManualSaving}
                                aria-label="Cerrar"
                              >
                                ×
                              </button>
                            </div>
                            <p className="game-spirit-modal-intro">
                              Partido <strong>{matchup.homeName}</strong> vs <strong>{matchup.awayName}</strong>.
                              {spiritManualSessionSlots.length > 1 ? (
                                <>
                                  {' '}
                                  Completá las <strong>dos</strong> evaluaciones debajo (cada equipo califica al
                                  rival); al pulsar <strong>Guardar</strong> se registran{' '}
                                  <strong>por separado</strong> en la base de datos (escala 0–4).
                                </>
                              ) : (
                                <>
                                  {' '}
                                  Escala de 0 (pobre) a 4 (excelente).
                                </>
                              )}
                            </p>
                            <form
                              className="game-spirit-modal-form"
                              id="game-spirit-manual-form"
                              onSubmit={handleSpiritManualSubmit}
                            >
                              <div className="game-spirit-modal-body">
                              {spiritManualSessionSlots.map((slot, idx) => {
                                const draft = spiritManualDraftBySlot[slot.slotKey] || emptySpiritManualDraft();
                                return (
                                  <section
                                    key={slot.slotKey}
                                    className="game-spirit-manual-slot-block"
                                    aria-labelledby={`spirit-slot-title-${slot.slotKey}`}
                                  >
                                    <h3 id={`spirit-slot-title-${slot.slotKey}`} className="game-spirit-manual-slot-heading">
                                      {slot.respondentLabel} evalúa a {slot.ratedLabel}
                                    </h3>
                                    <p className="game-spirit-manual-slot-meta">
                                      {spiritManualSessionSlots.length > 1
                                        ? 'Puntuaciones y comentarios solo para esta encuesta (independientes de la otra).'
                                        : 'Puntuaciones y comentarios para esta única evaluación pendiente.'}
                                    </p>
                                    <fieldset className="game-spirit-manual-fieldset-inner" disabled={spiritManualSaving}>
                                      {SPIRIT_MANUAL_DIMENSION_ROWS.map(([lbl, draftKey]) => (
                                        <GameSpiritManualScaleRow
                                          key={`${slot.slotKey}-${draftKey}`}
                                          label={lbl}
                                          name={`spirit-${slot.slotKey}-${draftKey}`}
                                          value={draft[draftKey]}
                                          onChange={(n) =>
                                            patchSpiritManualDraftForSlot(slot.slotKey, { [draftKey]: n })
                                          }
                                          disabled={spiritManualSaving}
                                        />
                                      ))}
                                      <label className="game-spirit-manual-comments">
                                        <span>Comentarios (opcional)</span>
                                        <textarea
                                          value={draft.comments}
                                          onChange={(ev) =>
                                            patchSpiritManualDraftForSlot(slot.slotKey, {
                                              comments: ev.target.value
                                            })
                                          }
                                          rows={2}
                                          maxLength={4000}
                                          disabled={spiritManualSaving}
                                        />
                                      </label>
                                    </fieldset>
                                    {idx < spiritManualSessionSlots.length - 1 ? (
                                      <div className="game-spirit-manual-slot-rule" aria-hidden />
                                    ) : null}
                                  </section>
                                );
                              })}
                              {spiritManualFormError ? (
                                <p className="game-spirit-manual-feedback game-spirit-manual-feedback--err" role="alert">
                                  {spiritManualFormError}
                                </p>
                              ) : null}
                              </div>
                              <div className="game-spirit-modal-actions">
                                <button
                                  type="button"
                                  className="game-spirit-modal-btn game-spirit-modal-btn--ghost"
                                  onClick={() => !spiritManualSaving && closeSpiritManualModal()}
                                  disabled={spiritManualSaving}
                                >
                                  Cancelar
                                </button>
                                <button
                                  type="submit"
                                  className="game-spirit-modal-btn game-spirit-modal-btn--primary"
                                  disabled={spiritManualSaving || !spiritManualAllDraftsReady}
                                >
                                  {spiritManualSaving
                                    ? 'Guardando…'
                                    : spiritManualSessionSlots.length > 1
                                      ? 'Guardar ambas'
                                      : 'Guardar'}
                                </button>
                              </div>
                            </form>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default GamePages;
