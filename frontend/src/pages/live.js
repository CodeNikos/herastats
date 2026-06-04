import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Navbar from '../components/navbar';
import Noauth_Navbar from '../components/noauth_Navbar';
import { useAuth } from '../hooks/useAuth';
import { useGameMatchScore } from '../hooks/useGameMatchScore';
import GamePhaseClockDisplay from '../components/GamePhaseClockDisplay';
import { useGamePhaseClock } from '../hooks/useGamePhaseClock';
import { configService } from '../services/configService';
import {
  computeLiveClockFromEvents,
  formatEventTimeFromElapsedSeconds,
  isGameFinishedState,
  phaseHmsToSeconds
} from '../utils/gamePhaseClock';
import { countCompletedGoals, getRatioForGoalIndex, mixRatioImageSrc } from '../utils/mixRatioRule';
import { broadcastTournamentCoherenceChanged } from '../utils/tournamentSync';
import { showToast } from '../utils/toast';
import '../styles/toast.css';
import './live.css';

const TEAM_FALLBACK_IMAGE = '/Hera_logo.png';

function trimNonemptyStr(v) {
  if (v == null) return '';
  const s = String(v).trim();
  return s;
}

function normalizeTeamImageSrc(raw) {
  const t = trimNonemptyStr(raw);
  return t !== '' ? t : TEAM_FALLBACK_IMAGE;
}

/**
 * Lado visual en LIVE (`homeTeamId` / roster izquierda) puede no coincidir con `game.local` en BD
 * (lienzo, calendario, slots). Une nombre + logo + bando estadístico (local vs visitante FK).
 *
 * @returns {{ label: string, logoSrc: string, dbSide: 'local' | 'visitor' | null }}
 */
function resolveLiveSideVisual(teamIdStr, fallbackNameFromUrl, gameRow) {
  const urlName = trimNonemptyStr(fallbackNameFromUrl);
  const hidStr = teamIdStr != null ? String(teamIdStr).trim() : '';
  const lokStr = gameRow?.local != null ? String(gameRow.local).trim() : '';
  const visStr = gameRow?.visitor != null ? String(gameRow.visitor).trim() : '';

  const hidNum = hidStr !== '' ? Number(hidStr) : NaN;
  const lokNum = lokStr !== '' ? Number(lokStr) : NaN;
  const visNum = visStr !== '' ? Number(visStr) : NaN;

  if (Number.isFinite(hidNum) && Number.isFinite(lokNum) && hidNum === lokNum) {
    return {
      label: trimNonemptyStr(gameRow?.local_name) || urlName || 'Equipo local',
      logoSrc: normalizeTeamImageSrc(gameRow?.local_image),
      dbSide: 'local'
    };
  }
  if (Number.isFinite(hidNum) && Number.isFinite(visNum) && hidNum === visNum) {
    return {
      label: trimNonemptyStr(gameRow?.visitor_name) || urlName || 'Equipo visitante',
      logoSrc: normalizeTeamImageSrc(gameRow?.visitor_image),
      dbSide: 'visitor'
    };
  }

  if (hidStr !== '' && lokStr !== '' && hidStr === lokStr) {
    return {
      label: trimNonemptyStr(gameRow?.local_name) || urlName || 'Equipo local',
      logoSrc: normalizeTeamImageSrc(gameRow?.local_image),
      dbSide: 'local'
    };
  }
  if (hidStr !== '' && visStr !== '' && hidStr === visStr) {
    return {
      label: trimNonemptyStr(gameRow?.visitor_name) || urlName || 'Equipo visitante',
      logoSrc: normalizeTeamImageSrc(gameRow?.visitor_image),
      dbSide: 'visitor'
    };
  }

  return {
    label: urlName || 'Equipo',
    logoSrc: TEAM_FALLBACK_IMAGE,
    dbSide: null
  };
}

/** Marcador desde GET goal-totals (por FK local vs visitante en BD). */
function scoreFromDbSide(dbSide, localGoals, visitorGoals) {
  const lg = Number(localGoals) || 0;
  const vg = Number(visitorGoals) || 0;
  if (dbSide === 'local') return lg;
  if (dbSide === 'visitor') return vg;
  return NaN;
}

/** Igual que en GamePages: convierte `phases.duration` a H/M/S. */
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

const TIMEOUT_COUNTDOWN_SECONDS = 75;
const MAX_TIMEOUTS_PER_TEAM = 2;

function formatTimeoutClock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

function getOtherTeamId(offenseId, localId, awayId) {
  const o = Number(offenseId);
  const l = localId != null && localId !== '' ? Number(localId) : null;
  const v = awayId != null && awayId !== '' ? Number(awayId) : null;
  if (l != null && !Number.isNaN(l) && o === l) return v;
  if (v != null && !Number.isNaN(v) && o === v) return l;
  return o;
}

/**
 * team_id que debe enviar el backend en TIMEOUT: pestaña «home» = local DB, «away» = visitante DB.
 * Prioriza los IDs del partido cargado desde la API; si falta alguno en fila parcialmente vacía (TBD), usa la URL.
 */
function resolveTeamIdForActiveTab(activeTeam, gameRow, homeTeamIdUrl, awayTeamIdUrl) {
  const rowLocal =
    gameRow?.local != null && String(gameRow.local).trim() !== '' ? Number(gameRow.local) : NaN;
  const rowVisitor =
    gameRow?.visitor != null && String(gameRow.visitor).trim() !== '' ? Number(gameRow.visitor) : NaN;
  const urlHome =
    homeTeamIdUrl != null && String(homeTeamIdUrl).trim() !== '' ? Number(homeTeamIdUrl) : NaN;
  const urlAway =
    awayTeamIdUrl != null && String(awayTeamIdUrl).trim() !== '' ? Number(awayTeamIdUrl) : NaN;
  if (activeTeam === 'home') {
    const pick = Number.isFinite(rowLocal) ? rowLocal : urlHome;
    return Number.isFinite(pick) ? pick : NaN;
  }
  const pick = Number.isFinite(rowVisitor) ? rowVisitor : urlAway;
  return Number.isFinite(pick) ? pick : NaN;
}

/**
 * Equipo en ofensiva para el punto actual, según START y los goles previos.
 * Hold (anota el ataque): alterna ofensiva. Break (anota la defensa): la ofensiva no cambia.
 */
function deriveOffenseTeamId(events, localId, awayId) {
  const sorted = [...(events || [])].sort((a, b) => Number(a.event_id) - Number(b.event_id));
  const byTime = new Map();
  for (const ev of sorted) {
    const ty = String(ev.event_type || '').toUpperCase();
    if (ty !== 'GOAL' && ty !== 'AST') continue;
    const k = ev.event_time;
    if (!byTime.has(k)) byTime.set(k, {});
    byTime.get(k)[ty] = ev;
  }
  let offenseTeamId = null;
  const emitted = new Set();
  for (const ev of sorted) {
    const ty = String(ev.event_type || '').toUpperCase();
    if (ty === 'START') {
      offenseTeamId = ev.team_id != null ? Number(ev.team_id) : null;
      continue;
    }
    if (ty === 'GOAL') {
      const k = ev.event_time;
      if (emitted.has(k)) continue;
      const b = byTime.get(k);
      if (!b?.GOAL || !b?.AST) continue;
      emitted.add(k);
      const g = b.GOAL;
      const scorerTeamId = g.player_team_id != null ? Number(g.player_team_id) : null;
      if (offenseTeamId == null || scorerTeamId == null || Number.isNaN(scorerTeamId)) continue;
      if (Number(scorerTeamId) === Number(offenseTeamId)) {
        offenseTeamId = getOtherTeamId(offenseTeamId, localId, awayId);
      }
    }
  }
  return offenseTeamId;
}

function LivePage() {
  const { isAuthenticated } = useAuth();
  const hasToken = localStorage.getItem('token') !== null;
  const isUserAuthenticated = isAuthenticated || hasToken;
  const navigate = useNavigate();

  const [searchParams, setSearchParams] = useSearchParams();
  const gameIdParam = searchParams.get('gameId');
  const tournamentIdParam = searchParams.get('tournamentId');
  const homeTeamId = searchParams.get('homeTeamId');
  const awayTeamId = searchParams.get('awayTeamId');
  const homeTeamNameParam = searchParams.get('homeTeamName') || 'Equipo local';
  const awayTeamNameParam = searchParams.get('awayTeamName') || 'Equipo visitante';

  const { localGoals, visitorGoals, refetch: refetchMatchScore } = useGameMatchScore(
    tournamentIdParam,
    gameIdParam,
    { enabled: Boolean(gameIdParam && tournamentIdParam) }
  );

  const [phaseSeconds, setPhaseSeconds] = useState(0);
  const [gameRow, setGameRow] = useState(null);

  /** Roster y lógica de ofensiva alineadas con BD si faltan IDs en la URL. */
  const rosterHomeIdStr = useMemo(() => {
    if (homeTeamId != null && String(homeTeamId).trim() !== '') return String(homeTeamId).trim();
    if (gameRow?.local != null && String(gameRow.local).trim() !== '') return String(gameRow.local).trim();
    return '';
  }, [homeTeamId, gameRow]);

  const rosterAwayIdStr = useMemo(() => {
    if (awayTeamId != null && String(awayTeamId).trim() !== '') return String(awayTeamId).trim();
    if (gameRow?.visitor != null && String(gameRow.visitor).trim() !== '')
      return String(gameRow.visitor).trim();
    return '';
  }, [awayTeamId, gameRow]);

  const [gameLoading, setGameLoading] = useState(true);
  const [gameLoadError, setGameLoadError] = useState('');

  const [activeTeam, setActiveTeam] = useState('home');

  const [homePlayers, setHomePlayers] = useState([]);
  const [awayPlayers, setAwayPlayers] = useState([]);
  const [playersLoading, setPlayersLoading] = useState(false);
  const [playersError, setPlayersError] = useState('');

  const [goalModalOpen, setGoalModalOpen] = useState(false);
  /** Pestaña activa del modal de gol */
  const [goalModalTab, setGoalModalTab] = useState('scorer');
  /** Goleador (obligatorio para confirmar) */
  const [goalScorerId, setGoalScorerId] = useState(null);
  /** null hasta elegir; luego 'callahan' | player_id */
  const [assistChoice, setAssistChoice] = useState(null);

  const [timeoutModalOpen, setTimeoutModalOpen] = useState(false);
  const [timeoutSecondsLeft, setTimeoutSecondsLeft] = useState(TIMEOUT_COUNTDOWN_SECONDS);
  const [timeoutPosting, setTimeoutPosting] = useState(false);
  const [goalSubmitting, setGoalSubmitting] = useState(false);
  const [metaSubmitting, setMetaSubmitting] = useState(false);
  const [endGameSubmitting, setEndGameSubmitting] = useState(false);
  const [endGameConfirmOpen, setEndGameConfirmOpen] = useState(false);
  const [forfeitModalOpen, setForfeitModalOpen] = useState(false);
  /** Equipo que comete el forfeit: 'home' | 'away' */
  const [forfeitTeamChoice, setForfeitTeamChoice] = useState(null);
  const [forfeitSubmitting, setForfeitSubmitting] = useState(false);
  /** Equipo que ataca en el punto actual (desde START + goles). null si aún no hay START. */
  const [offenseTeamId, setOffenseTeamId] = useState(null);
  const [liveEvents, setLiveEvents] = useState([]);

  /** Evita acciones tras FINALIZADO en handlers síncronos. */
  const gameFinishedRef = useRef(false);
  const timeoutIntervalRef = useRef(null);
  /** Tiempo del cronómetro capturado al pulsar GOAL (antes de elegir goleador/asistencia). */
  const goalEventTimeRef = useRef('');
  const startedQueryRef = useRef(searchParams.get('started'));
  startedQueryRef.current = searchParams.get('started');

  useEffect(() => {
    gameFinishedRef.current = isGameFinishedState(gameRow?.estado);
  }, [gameRow]);

  const gameFinished = useMemo(() => isGameFinishedState(gameRow?.estado), [gameRow]);

  const {
    tiempo,
    isPausedByUser,
    clockRunning,
    finishFrozen,
    setOptimisticPause,
    clearOptimisticPause,
    confirmServerPauseIfOptimistic,
    beginLocalStartCountdown,
    captureEventTime,
    getElapsedSeconds,
    syncLiveClockAnchor,
    freezeForFinish,
    resetFinishFreeze
  } = useGamePhaseClock({
    events: liveEvents,
    phaseSeconds,
    gameFinished,
    gameRow,
    persistEnabled: isUserAuthenticated && !gameFinished,
    tournamentId: tournamentIdParam,
    gameId: gameIdParam
  });

  const gameEnded = gameFinished || finishFrozen;

  useEffect(() => {
    let cancelled = false;

    const loadGame = async () => {
      setGameLoadError('');
      setGameRow(null);
      if (!gameIdParam || !tournamentIdParam) {
        setGameLoading(false);
        setGameLoadError('Faltan parámetros del partido (gameId o tournamentId).');
        return;
      }
      try {
        setGameLoading(true);
        const res = await configService.getGames(tournamentIdParam);
        if (cancelled) return;
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
        setGameRow(found);
      } catch (e) {
        if (!cancelled) {
          setGameLoadError(e.response?.data?.message || e.message || 'Error al cargar el partido.');
        }
      } finally {
        if (!cancelled) setGameLoading(false);
      }
    };
    loadGame();
    return () => {
      cancelled = true;
    };
  }, [gameIdParam, tournamentIdParam]);

  const loadPlayers = useCallback(async () => {
    if (!tournamentIdParam) {
      setPlayersError('');
      setHomePlayers([]);
      setAwayPlayers([]);
      return;
    }
    setPlayersLoading(true);
    setPlayersError('');
    try {
      const res = await configService.getPlayers(tournamentIdParam);
      if (!res?.success) {
        throw new Error(res?.message || 'No se pudieron cargar los jugadores.');
      }
      const all = res.data?.players || [];
      const homeList = rosterHomeIdStr ? all.filter((p) => String(p.team_id) === rosterHomeIdStr) : [];
      const awayList = rosterAwayIdStr ? all.filter((p) => String(p.team_id) === rosterAwayIdStr) : [];
      const byNumber = (a, b) => (Number(a.player_number) || 0) - (Number(b.player_number) || 0);
      setHomePlayers([...homeList].sort(byNumber));
      setAwayPlayers([...awayList].sort(byNumber));
    } catch (e) {
      setPlayersError(e.response?.data?.message || e.message || 'Error al cargar jugadores.');
      setHomePlayers([]);
      setAwayPlayers([]);
    } finally {
      setPlayersLoading(false);
    }
  }, [tournamentIdParam, rosterHomeIdStr, rosterAwayIdStr]);

  useEffect(() => {
    loadPlayers();
  }, [loadPlayers]);

  const resyncLiveClockFromDb = useCallback(async () => {
    if (!gameRow || !tournamentIdParam || !gameIdParam) return;
    if (isGameFinishedState(gameRow.estado)) return;
    if (!(phaseSeconds > 0)) return;
    try {
      const [resEv, resGames] = await Promise.all([
        configService.getGameEvents(tournamentIdParam, gameIdParam),
        configService.getGames(tournamentIdParam)
      ]);
      if (!resEv?.success) return;
      const events = resEv.data?.events || [];
      setOffenseTeamId(deriveOffenseTeamId(events, rosterHomeIdStr, rosterAwayIdStr));

      let mergedRow = gameRow;
      if (resGames?.success) {
        const found = (resGames.data?.games || []).find(
          (g) => Number(g.game_id) === Number(gameIdParam)
        );
        if (found) {
          mergedRow = { ...gameRow, ...found };
          setGameRow(mergedRow);
        }
      }

      confirmServerPauseIfOptimistic(events, mergedRow);
      setLiveEvents(events);
    } catch {
      /* ignorar */
    }
  }, [
    confirmServerPauseIfOptimistic,
    gameRow,
    phaseSeconds,
    tournamentIdParam,
    gameIdParam,
    rosterHomeIdStr,
    rosterAwayIdStr
  ]);

  useEffect(() => {
    if (!gameRow || !tournamentIdParam || !gameIdParam) return;

    let cancelled = false;
    const wantStart = startedQueryRef.current === '1';

    const stripStartedParam = () =>
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete('started');
          return next;
        },
        { replace: true }
      );

    const applyPhaseAndClock = async () => {
      if (cancelled) return;

      try {
        const [resEv, resPhases] = await Promise.all([
          configService.getGameEvents(tournamentIdParam, gameIdParam),
          configService.getPhases(tournamentIdParam)
        ]);
        if (cancelled) return;

        const events = resEv?.success ? resEv.data?.events || [] : [];
        setOffenseTeamId(deriveOffenseTeamId(events, rosterHomeIdStr, rosterAwayIdStr));

        const phaseId = gameRow.phas_id;
        let horas = 0;
        let minutos = 1;
        let segundos = 30;
        if (phaseId != null && phaseId !== '' && resPhases?.success) {
          const phases = resPhases.data?.phases || [];
          const phase = phases.find((p) => Number(p.phas_id) === Number(phaseId));
          const hms = parsePhaseDurationToHms(phase?.duration);
          horas = hms.horas;
          minutos = hms.minutos;
          segundos = hms.segundos;
        }

        const phaseSec = phaseHmsToSeconds(horas, minutos, segundos);
        setPhaseSeconds(phaseSec);

        const forceResync = isGameFinishedState(gameRow.estado);
        if (!forceResync) {
          confirmServerPauseIfOptimistic(events);
        } else {
          clearOptimisticPause();
        }
        setLiveEvents(events);

        const clock = computeLiveClockFromEvents(events, phaseSec, Date.now());
        if (!isGameFinishedState(gameRow.estado) && wantStart && !clock.hasStart) {
          beginLocalStartCountdown();
        }
        if (wantStart) stripStartedParam();
      } catch {
        if (cancelled) return;
        const fb = parsePhaseDurationToHms(null);
        const phaseSec = phaseHmsToSeconds(fb.horas, fb.minutos, fb.segundos);
        setPhaseSeconds(phaseSec);
        if (wantStart) {
          beginLocalStartCountdown();
          stripStartedParam();
        }
      }
    };

    applyPhaseAndClock();
    return () => {
      cancelled = true;
    };
  }, [
    beginLocalStartCountdown,
    clearOptimisticPause,
    confirmServerPauseIfOptimistic,
    gameRow,
    tournamentIdParam,
    gameIdParam,
    rosterHomeIdStr,
    rosterAwayIdStr,
    setSearchParams
  ]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        resyncLiveClockFromDb();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [resyncLiveClockFromDb]);

  const halfEventAlreadyRecorded = useMemo(
    () =>
      (liveEvents || []).some((ev) => String(ev.event_type || '').trim().toUpperCase() === 'HALF'),
    [liveEvents]
  );

  const canEndGame =
    isUserAuthenticated &&
    !gameLoading &&
    !gameFinished &&
    String(gameRow?.estado || '').trim().toLowerCase() === 'ongoing';

  const canForfeit = canEndGame && !forfeitSubmitting;

  const closeForfeitModal = useCallback(() => {
    if (forfeitSubmitting) return;
    setForfeitModalOpen(false);
    setForfeitTeamChoice(null);
  }, [forfeitSubmitting]);

  const openForfeitModal = useCallback(() => {
    if (!canForfeit) return;
    setForfeitTeamChoice(null);
    setForfeitModalOpen(true);
  }, [canForfeit]);

  const confirmForfeit = useCallback(async () => {
    if (!canForfeit || forfeitSubmitting || !forfeitTeamChoice) return;
    const forfeitTeamId = resolveTeamIdForActiveTab(forfeitTeamChoice, gameRow, homeTeamId, awayTeamId);
    if (!Number.isFinite(forfeitTeamId)) {
      alert('No se pudo identificar el equipo seleccionado.');
      return;
    }
    const forfeitLabel =
      forfeitTeamChoice === 'home' ? homeTeamNameParam || 'Equipo local' : awayTeamNameParam || 'Equipo visitante';
    const winnerLabel =
      forfeitTeamChoice === 'home' ? awayTeamNameParam || 'Equipo visitante' : homeTeamNameParam || 'Equipo local';

    const finishElapsedSeconds = Math.max(0, Math.floor(getElapsedSeconds()));
    const ft = String(captureEventTime() || '').trim();
    gameFinishedRef.current = true;
    freezeForFinish(finishElapsedSeconds);
    setForfeitSubmitting(true);
    try {
      const body = {
        forfeit_team_id: forfeitTeamId,
        finish_elapsed_seconds: finishElapsedSeconds
      };
      if (ft !== '') body.event_time = ft;

      const res = await configService.postGameForfeit(tournamentIdParam, gameIdParam, body);
      if (!res?.success) {
        throw new Error(res?.message || 'No se pudo registrar el forfeit.');
      }

      gameFinishedRef.current = true;
      const patchedGame = res?.data?.game;
      setGameRow((prev) =>
        prev
          ? {
              ...prev,
              ...(patchedGame && typeof patchedGame === 'object' ? patchedGame : {}),
              estado: 'Finished',
              live_clock_elapsed_sec: finishElapsedSeconds,
              local_score: patchedGame?.local_score ?? prev.local_score,
              visitor_score: patchedGame?.visitor_score ?? prev.visitor_score
            }
          : prev
      );

      try {
        const resEv = await configService.getGameEvents(tournamentIdParam, gameIdParam);
        if (resEv?.success) {
          const evs = resEv.data?.events || [];
          setLiveEvents(evs);
          setOffenseTeamId(deriveOffenseTeamId(evs, rosterHomeIdStr, rosterAwayIdStr));
        }
      } catch {
        /* mejor esfuerzo */
      }

      if (goalModalOpen) setGoalModalOpen(false);
      setForfeitModalOpen(false);
      setForfeitTeamChoice(null);
      setEndGameConfirmOpen(false);

      try {
        await refetchMatchScore();
      } catch (_) {
        /* ignorar */
      }
      broadcastTournamentCoherenceChanged(tournamentIdParam, { fullBracketReload: true });
    } catch (e) {
      gameFinishedRef.current = false;
      resetFinishFreeze();
      alert(
        e?.response?.data?.message ||
          e?.message ||
          `No se pudo registrar el forfeit. ${forfeitLabel} no recibe goles ni asistencias; ${winnerLabel} gana 15–0.`
      );
    } finally {
      setForfeitSubmitting(false);
    }
  }, [
    awayTeamNameParam,
    canForfeit,
    captureEventTime,
    forfeitSubmitting,
    forfeitTeamChoice,
    freezeForFinish,
    gameIdParam,
    getElapsedSeconds,
    goalModalOpen,
    homeTeamNameParam,
    homeTeamId,
    awayTeamId,
    gameRow,
    refetchMatchScore,
    resetFinishFreeze,
    rosterAwayIdStr,
    rosterHomeIdStr,
    tournamentIdParam
  ]);

  const closeEndGameConfirm = useCallback(() => {
    if (endGameSubmitting) return;
    setEndGameConfirmOpen(false);
  }, [endGameSubmitting]);

  const openEndGameConfirm = useCallback(() => {
    if (!canEndGame || endGameSubmitting) return;
    setEndGameConfirmOpen(true);
  }, [canEndGame, endGameSubmitting]);

  const confirmEndGame = useCallback(async () => {
    if (!canEndGame || endGameSubmitting) return;
    const finishElapsedSeconds = Math.max(0, Math.floor(getElapsedSeconds()));
    const ft = String(captureEventTime() || '').trim();
    gameFinishedRef.current = true;
    freezeForFinish(finishElapsedSeconds);
    setEndGameSubmitting(true);
    try {
      /** Reloj visible al pulsar FIN: el servidor lo guarda (`live_clock_elapsed_sec`) para todas las vistas. */
      const patchOpts = { finish_elapsed_seconds: finishElapsedSeconds };
      if (ft !== '') patchOpts.finish_event_time = ft;

      const res = await configService.patchGameEstado(tournamentIdParam, gameIdParam, 'Finished', patchOpts);
      if (!res?.success) {
        throw new Error(res?.message || 'No se pudo actualizar el estado del partido.');
      }
      const psMeta = res?.data?.ps_game_upd;
      if (psMeta && psMeta.ok === false && process.env.NODE_ENV !== 'production') {
        console.warn('[live] ps_game_upd no aplicado:', psMeta.reason || psMeta);
      }
      gameFinishedRef.current = true;
      const patchedGame = res?.data?.game;
      setGameRow((prev) =>
        prev
          ? {
              ...prev,
              ...(patchedGame && typeof patchedGame === 'object' ? patchedGame : {}),
              estado: 'Finished',
              live_clock_elapsed_sec: finishElapsedSeconds
            }
          : prev
      );
      try {
        const resEv = await configService.getGameEvents(tournamentIdParam, gameIdParam);
        if (resEv?.success) {
          const evs = resEv.data?.events || [];
          setLiveEvents(evs);
          setOffenseTeamId(deriveOffenseTeamId(evs, rosterHomeIdStr, rosterAwayIdStr));
        }
      } catch {
        /* mejor esfuerzo */
      }
      if (goalModalOpen) setGoalModalOpen(false);
      setEndGameConfirmOpen(false);
      try {
        await refetchMatchScore();
      } catch (_) {
        /* mejor esfuerzo: el marcador sigue el GET goal-totals */
      }
      broadcastTournamentCoherenceChanged(tournamentIdParam, { fullBracketReload: true });
    } catch (e) {
      gameFinishedRef.current = false;
      resetFinishFreeze();
      alert(e?.response?.data?.message || e?.message || 'Error al finalizar el partido.');
    } finally {
      setEndGameSubmitting(false);
    }
  }, [
    canEndGame,
    captureEventTime,
    endGameSubmitting,
    freezeForFinish,
    gameIdParam,
    getElapsedSeconds,
    goalModalOpen,
    refetchMatchScore,
    resetFinishFreeze,
    rosterAwayIdStr,
    rosterHomeIdStr,
    tournamentIdParam
  ]);

  const postMetaGameEvent = useCallback(
    async (eventType, options = {}) => {
      if (!isUserAuthenticated) {
        alert('Inicia sesión para registrar el evento en el servidor.');
        return false;
      }
      if (!gameIdParam || !tournamentIdParam) {
        alert('Faltan datos del partido (gameId o tournamentId).');
        return false;
      }
      const elapsedSeconds =
        options.elapsedSeconds != null && Number.isFinite(Number(options.elapsedSeconds))
          ? Math.max(0, Math.floor(Number(options.elapsedSeconds)))
          : Math.max(0, Math.floor(getElapsedSeconds()));
      const eventTime =
        options.eventTime != null && String(options.eventTime).trim() !== ''
          ? String(options.eventTime).trim()
          : formatEventTimeFromElapsedSeconds(elapsedSeconds);
      if (!eventTime) {
        alert('No se pudo leer el tiempo del cronómetro.');
        return false;
      }
      const res = await configService.createGameEvent(tournamentIdParam, gameIdParam, {
        event_time: eventTime,
        elapsed_seconds: elapsedSeconds,
        player_id: null,
        goals: 0,
        assists: 0,
        event_type: eventType
      });
      if (!res?.success) {
        throw new Error(res?.message || 'No se pudo registrar el evento.');
      }
      return true;
    },
    [gameIdParam, getElapsedSeconds, isUserAuthenticated, tournamentIdParam]
  );

  const handleTimeoutPress = useCallback(async () => {
    if (gameFinished) return;
    if (!isUserAuthenticated) return;
    /** Sin fila del partido aún cargada, los team_id pueden no coincidir con local/visitor en BD → 400 silenciosa. */
    if (gameLoading || !gameRow) return;
    const teamNum = resolveTeamIdForActiveTab(activeTeam, gameRow, homeTeamId, awayTeamId);
    if (!Number.isFinite(teamNum)) return;
    if (!gameIdParam || !tournamentIdParam) return;
    const eventTime = captureEventTime();
    if (!eventTime) return;

    const countTimeoutsFromEvents = (events) =>
      (events || []).filter(
        (ev) =>
          String(ev.event_type || '').trim().toUpperCase() === 'TIMEOUT' &&
          Number(ev.team_id) === teamNum
      ).length;

    setTimeoutPosting(true);
    try {
      let timeoutUsed = countTimeoutsFromEvents(liveEvents);
      try {
        const resCounts = await configService.getGameTimeoutCounts(tournamentIdParam, gameIdParam);
        if (resCounts?.success) {
          const rows = resCounts.data?.by_team || [];
          const row = rows.find((r) => Number(r.team_id) === teamNum);
          timeoutUsed = Number(row?.cantidad_to) || 0;
        }
      } catch {
        /* API antigua o sin red: usar conteo local de eventos ya cargados */
      }
      if (timeoutUsed >= MAX_TIMEOUTS_PER_TEAM) {
        showToast('TIMEOUT agotados', { variant: 'warning' });
        return;
      }

      setTimeoutSecondsLeft(TIMEOUT_COUNTDOWN_SECONDS);
      setTimeoutModalOpen(true);

      const res = await configService.createGameEvent(tournamentIdParam, gameIdParam, {
        event_time: eventTime,
        player_id: null,
        goals: 0,
        assists: 0,
        event_type: 'TIMEOUT',
        team_id: teamNum
      });
      if (!res?.success) {
        throw new Error(res?.message || 'No se pudo registrar el timeout.');
      }
      try {
        const resEv = await configService.getGameEvents(tournamentIdParam, gameIdParam);
        if (resEv?.success) {
          const evs = resEv.data?.events || [];
          setLiveEvents(evs);
          setOffenseTeamId(deriveOffenseTeamId(evs, rosterHomeIdStr, rosterAwayIdStr));
        }
      } catch {
        /* ignorar refresco */
      }
    } catch (e) {
      const msg = e?.response?.data?.message || e?.message || '';
      if (String(msg).trim().toUpperCase().includes('TIMEOUT AGOTADOS')) {
        setTimeoutModalOpen(false);
        showToast('TIMEOUT agotados', { variant: 'warning' });
        return;
      }
      setTimeoutModalOpen(false);
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.warn(
          '[live] No se registró TIMEOUT:',
          msg,
          '— Si usas backend `npm run start:test` (puerto 5001), el frontend debe ir con `npm run start:test` o `REACT_APP_API_URL=http://localhost:5001/api`.'
        );
      }
    } finally {
      setTimeoutPosting(false);
    }
  }, [
    activeTeam,
    captureEventTime,
    gameFinished,
    gameRow,
    gameIdParam,
    gameLoading,
    homeTeamId,
    awayTeamId,
    isUserAuthenticated,
    rosterAwayIdStr,
    rosterHomeIdStr,
    tournamentIdParam,
    liveEvents
  ]);

  const closeGoalModal = useCallback(() => {
    if (goalSubmitting) return;
    setGoalModalOpen(false);
  }, [goalSubmitting]);

  const openGoalModal = useCallback(() => {
    if (gameFinished) return;
    goalEventTimeRef.current = captureEventTime();
    setGoalScorerId(null);
    setAssistChoice(null);
    setGoalModalTab('scorer');
    setGoalModalOpen(true);
    loadPlayers();
  }, [captureEventTime, gameFinished, loadPlayers]);

  const confirmGoalFromModal = useCallback(async () => {
    if (gameFinished) return;
    if (goalScorerId == null) {
      alert('Selecciona quién anotó el gol.');
      setGoalModalTab('scorer');
      return;
    }
    if (assistChoice == null) {
      alert('Selecciona quién asistió.');
      setGoalModalTab('assist');
      return;
    }
    if (!isUserAuthenticated) {
      alert('Inicia sesión para registrar el gol en el servidor.');
      return;
    }
    if (!gameIdParam || !tournamentIdParam) {
      alert('Faltan datos del partido (gameId o tournamentId).');
      return;
    }
    const eventTime = goalEventTimeRef.current;
    if (!eventTime) {
      alert('No se pudo capturar el tiempo del cronómetro. Vuelve a abrir GOAL.');
      return;
    }

    const isCallahan = assistChoice === 'callahan';
    const assistPlayerId = isCallahan ? goalScorerId : assistChoice;
    /** Callahan: fila AST con assists 0 para no sumar asistencia en estadísticas. */
    const assistStatValue = isCallahan ? 0 : 1;

    const scorerTeamIdNum =
      activeTeam === 'home' && rosterHomeIdStr !== ''
        ? Number(rosterHomeIdStr)
        : activeTeam === 'away' && rosterAwayIdStr !== ''
          ? Number(rosterAwayIdStr)
          : null;

    const isBreakGoal =
      offenseTeamId != null &&
      scorerTeamIdNum != null &&
      !Number.isNaN(scorerTeamIdNum) &&
      Number(scorerTeamIdNum) !== Number(offenseTeamId);

    setGoalSubmitting(true);
    try {
      const resGoal = await configService.createGameEvent(tournamentIdParam, gameIdParam, {
        event_time: eventTime,
        player_id: goalScorerId,
        goals: 1,
        assists: 0,
        event_type: 'GOAL'
      });
      if (!resGoal?.success) {
        throw new Error(resGoal?.message || 'No se pudo registrar el gol.');
      }
      const resAst = await configService.createGameEvent(tournamentIdParam, gameIdParam, {
        event_time: eventTime,
        player_id: assistPlayerId,
        goals: 0,
        assists: assistStatValue,
        event_type: 'AST'
      });
      if (!resAst?.success) {
        throw new Error(resAst?.message || 'El gol se registró pero falló la asistencia. Revisa en el servidor.');
      }
      if (isBreakGoal) {
        const resBreak = await configService.createGameEvent(tournamentIdParam, gameIdParam, {
          event_time: eventTime,
          player_id: null,
          goals: 0,
          assists: 0,
          event_type: 'BREAK'
        });
        if (!resBreak?.success) {
          throw new Error(resBreak?.message || 'Gol registrado pero no se pudo registrar el BREAK.');
        }
      }
      try {
        const [resEv] = await Promise.all([
          configService.getGameEvents(tournamentIdParam, gameIdParam),
          refetchMatchScore()
        ]);
        if (resEv?.success) {
          const evs = resEv.data?.events || [];
          setLiveEvents(evs);
          setOffenseTeamId(deriveOffenseTeamId(evs, rosterHomeIdStr, rosterAwayIdStr));
        }
      } catch {
        setOffenseTeamId((prev) => {
          if (prev == null || scorerTeamIdNum == null || Number.isNaN(scorerTeamIdNum)) return prev;
          if (Number(scorerTeamIdNum) === Number(prev)) {
            return getOtherTeamId(prev, rosterHomeIdStr, rosterAwayIdStr);
          }
          return prev;
        });
      }
      setGoalModalOpen(false);
      broadcastTournamentCoherenceChanged(tournamentIdParam);
    } catch (e) {
      const msg =
        e?.response?.data?.message ||
        e?.message ||
        'Error al registrar el evento. Comprueba la conexión y que el jugador pertenezca al torneo.';
      alert(msg);
    } finally {
      setGoalSubmitting(false);
    }
  }, [
    activeTeam,
    assistChoice,
    gameFinished,
    gameIdParam,
    goalScorerId,
    isUserAuthenticated,
    offenseTeamId,
    refetchMatchScore,
    rosterAwayIdStr,
    rosterHomeIdStr,
    tournamentIdParam
  ]);

  useEffect(() => {
    if (!timeoutModalOpen) return undefined;
    timeoutIntervalRef.current = setInterval(() => {
      setTimeoutSecondsLeft((prev) => {
        if (prev <= 1) {
          if (timeoutIntervalRef.current) {
            clearInterval(timeoutIntervalRef.current);
            timeoutIntervalRef.current = null;
          }
          setTimeoutModalOpen(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (timeoutIntervalRef.current) {
        clearInterval(timeoutIntervalRef.current);
        timeoutIntervalRef.current = null;
      }
    };
  }, [timeoutModalOpen]);

  useEffect(() => {
    setEndGameConfirmOpen(false);
    setForfeitModalOpen(false);
    setForfeitTeamChoice(null);
  }, [gameIdParam]);

  useEffect(() => {
    if (!goalModalOpen && !timeoutModalOpen && !endGameConfirmOpen && !forfeitModalOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (goalModalOpen && !goalSubmitting) closeGoalModal();
      else if (forfeitModalOpen && !forfeitSubmitting) closeForfeitModal();
      else if (endGameConfirmOpen && !endGameSubmitting) closeEndGameConfirm();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [
    closeEndGameConfirm,
    closeForfeitModal,
    endGameConfirmOpen,
    endGameSubmitting,
    forfeitModalOpen,
    forfeitSubmitting,
    goalModalOpen,
    goalSubmitting,
    timeoutModalOpen,
    closeGoalModal
  ]);

  const handlePauseResumeClick = useCallback(async () => {
    if (gameFinished) return;
    if (metaSubmitting) return;

    if (isPausedByUser) {
      setMetaSubmitting(true);
      try {
        const ok = await postMetaGameEvent('Juego reanudado');
        if (!ok) return;
        await resyncLiveClockFromDb();
      } catch (e) {
        alert(e?.response?.data?.message || e?.message || 'Error al registrar el evento.');
      } finally {
        setMetaSubmitting(false);
      }
      return;
    }

    if (!clockRunning) {
      return;
    }

    setOptimisticPause();
    const frozenSec = Math.max(0, Math.floor(getElapsedSeconds()));
    const frozenEventTime = formatEventTimeFromElapsedSeconds(frozenSec);

    setMetaSubmitting(true);
    try {
      if (isUserAuthenticated && tournamentIdParam && gameIdParam) {
        await configService.freezeLiveClockElapsed(tournamentIdParam, gameIdParam, frozenSec);
      }
      const ok = await postMetaGameEvent('Juego en Pausa', {
        elapsedSeconds: frozenSec,
        eventTime: frozenEventTime
      });
      if (!ok) {
        await resyncLiveClockFromDb();
        return;
      }
      if (isUserAuthenticated && tournamentIdParam && gameIdParam) {
        await configService.freezeLiveClockElapsed(tournamentIdParam, gameIdParam, frozenSec);
      }
      setGameRow((prev) =>
        prev ? { ...prev, live_clock_elapsed_sec: frozenSec } : prev
      );
      syncLiveClockAnchor(frozenSec);
      await resyncLiveClockFromDb();
    } catch (e) {
      await resyncLiveClockFromDb();
      alert(e?.response?.data?.message || e?.message || 'Error al registrar el evento.');
    } finally {
      setMetaSubmitting(false);
    }
  }, [
    clockRunning,
    gameFinished,
    getElapsedSeconds,
    isPausedByUser,
    isUserAuthenticated,
    gameIdParam,
    metaSubmitting,
    postMetaGameEvent,
    resyncLiveClockFromDb,
    setOptimisticPause,
    syncLiveClockAnchor,
    tournamentIdParam
  ]);

  const handleHalfClick = useCallback(async () => {
    if (gameFinished) return;
    if (metaSubmitting) return;
    if (halfEventAlreadyRecorded) return;
    setMetaSubmitting(true);
    try {
      const ok = await postMetaGameEvent('HALF');
      if (!ok) return;
      await resyncLiveClockFromDb();
    } catch (e) {
      alert(e?.response?.data?.message || e?.message || 'Error al registrar el evento.');
    } finally {
      setMetaSubmitting(false);
    }
  }, [gameFinished, halfEventAlreadyRecorded, metaSubmitting, postMetaGameEvent, resyncLiveClockFromDb]);

  const liveHomeSide = useMemo(
    () => resolveLiveSideVisual(rosterHomeIdStr, homeTeamNameParam, gameRow),
    [rosterHomeIdStr, homeTeamNameParam, gameRow]
  );
  const liveAwaySide = useMemo(
    () => resolveLiveSideVisual(rosterAwayIdStr, awayTeamNameParam, gameRow),
    [rosterAwayIdStr, awayTeamNameParam, gameRow]
  );

  const homeLabel = liveHomeSide.label;
  const awayLabel = liveAwaySide.label;
  const homeLogo = liveHomeSide.logoSrc;
  const awayLogo = liveAwaySide.logoSrc;

  const displayHomeScore = useMemo(() => {
    const n = scoreFromDbSide(liveHomeSide.dbSide, localGoals, visitorGoals);
    return Number.isFinite(n) ? n : Number(localGoals) || 0;
  }, [liveHomeSide.dbSide, localGoals, visitorGoals]);

  const displayAwayScore = useMemo(() => {
    const n = scoreFromDbSide(liveAwaySide.dbSide, localGoals, visitorGoals);
    return Number.isFinite(n) ? n : Number(visitorGoals) || 0;
  }, [liveAwaySide.dbSide, localGoals, visitorGoals]);

  const anotacionHref = useMemo(() => {
    const params = new URLSearchParams();
    if (tournamentIdParam) params.set('tournamentId', tournamentIdParam);
    const q = params.toString();
    return q ? `/anotacion?${q}` : '/anotacion';
  }, [tournamentIdParam]);

  const currentTeamLabel = activeTeam === 'home' ? homeLabel : awayLabel;
  const currentPlayers = activeTeam === 'home' ? homePlayers : awayPlayers;

  const displayNumber = (player, index) => {
    const n = player.player_number;
    if (n != null && n !== '' && Number.isFinite(Number(n))) return Number(n);
    return index + 1;
  };

  /** Primero apodo (si existe); si hay nombre formal también se muestra entre paréntesis. */
  const playerName = (p) => {
    const legal = String(p.player_name || p.name || '').trim();
    const nick = String(p.nickname != null ? p.nickname : p.apodo ?? '').trim();
    if (nick && legal) return `${nick} (${legal})`;
    if (nick) return nick;
    return legal || '—';
  };

  const rowKey = (p, index) => (p.player_id != null ? `p-${p.player_id}` : `idx-${index}`);

  const mixRatioLiveHint = useMemo(() => {
    if (!gameRow) return null;
    if (!/mixto/i.test(String(gameRow.division || ''))) return null;
    const first = String(gameRow.mix_ratio_first || '').trim().toUpperCase();
    if (first !== '3H4M' && first !== '4H3M') return null;
    const done = countCompletedGoals(liveEvents);
    const nextN = done + 1;
    const code = getRatioForGoalIndex(first, nextN);
    if (!code) return null;
    return {
      nextN,
      code,
      src: mixRatioImageSrc(code)
    };
  }, [gameRow, liveEvents]);

  return (
    <div className="live-page">
      <div className="live-topbar">
        {isUserAuthenticated ? (
          <Navbar hideAmbientToggle={goalModalOpen} />
        ) : (
          <Noauth_Navbar hideAmbientToggle={goalModalOpen} />
        )}
      </div>

      <main className="live-main">
        <header className="live-header-block">
          <div className="live-header-stack">
            <div className="live-scoreboard" aria-label="Marcador">
              <div className="live-team-block live-team-block--home">
                <img
                  className="live-team-logo"
                  src={homeLogo}
                  alt=""
                  onError={(e) => {
                    if (!e.currentTarget.src.includes(TEAM_FALLBACK_IMAGE)) e.currentTarget.src = TEAM_FALLBACK_IMAGE;
                  }}
                />
                <div className="live-team-text">
                  <span className="live-team-label">{homeLabel}</span>
                  <span className="live-team-score">{displayHomeScore}</span>
                </div>
              </div>
              <div className="live-team-block live-team-block--away">
                <div className="live-team-text live-team-text--away">
                  <span className="live-team-label">{awayLabel}</span>
                  <span className="live-team-score">{displayAwayScore}</span>
                </div>
                <img
                  className="live-team-logo"
                  src={awayLogo}
                  alt=""
                  onError={(e) => {
                    if (!e.currentTarget.src.includes(TEAM_FALLBACK_IMAGE)) e.currentTarget.src = TEAM_FALLBACK_IMAGE;
                  }}
                />
              </div>
            </div>

            <div className="live-timer-wrap">
              {gameLoading ? <p className="live-game-state">Cargando partido…</p> : null}
              {!gameLoading && gameLoadError ? <p className="live-game-state live-game-state--error">{gameLoadError}</p> : null}

              <GamePhaseClockDisplay tiempo={tiempo} variant="live" />
            </div>
            <button
              type="button"
              className="live-back-btn"
              onClick={() => navigate(anotacionHref)}
            >
              Volver a anotaciones
            </button>
          </div>
        </header>

        <section className="live-roster-card" aria-label="Acciones de equipo">
          <div className="live-team-tabs" role="tablist" aria-label="Equipo activo para GOAL">
            <button
              type="button"
              role="tab"
              aria-selected={activeTeam === 'home'}
              disabled={gameFinished}
              className={`live-team-tab ${activeTeam === 'home' ? 'live-team-tab--active' : ''}`}
              onClick={() => {
                if (!gameEnded) setActiveTeam('home');
              }}
            >
              <img
                className="live-team-tab-logo"
                src={homeLogo}
                alt=""
                onError={(e) => {
                  if (!e.currentTarget.src.includes(TEAM_FALLBACK_IMAGE)) e.currentTarget.src = TEAM_FALLBACK_IMAGE;
                }}
              />
              <span className="live-team-tab-name">{homeLabel}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTeam === 'away'}
              disabled={gameFinished}
              className={`live-team-tab ${activeTeam === 'away' ? 'live-team-tab--active' : ''}`}
              onClick={() => {
                if (!gameEnded) setActiveTeam('away');
              }}
            >
              <img
                className="live-team-tab-logo"
                src={awayLogo}
                alt=""
                onError={(e) => {
                  if (!e.currentTarget.src.includes(TEAM_FALLBACK_IMAGE)) e.currentTarget.src = TEAM_FALLBACK_IMAGE;
                }}
              />
              <span className="live-team-tab-name">{awayLabel}</span>
            </button>
          </div>

          <div className="live-roster-panel" role="tabpanel">
            {gameEnded ? (
              <p className="live-game-finished-banner" role="status">
                Partido finalizado — el cronómetro está detenido.
              </p>
            ) : null}
            <p className="live-roster-hint">
              {gameEnded
                ? 'No se pueden registrar más acciones en este partido.'
                : 'El gol se anota al equipo seleccionado arriba.'}
            </p>
            {mixRatioLiveHint && !gameEnded ? (
              <div className="live-mix-ratio-hint" role="status" aria-label="Regla A ratio del próximo gol">
                <span className="live-mix-ratio-hint-text">
                  Ratio (regla A) — próximo gol (#{mixRatioLiveHint.nextN}):
                </span>
                {mixRatioLiveHint.src ? (
                  <img
                    className="live-mix-ratio-hint-img"
                    src={mixRatioLiveHint.src}
                    alt={mixRatioLiveHint.code === '3H4M' ? '3H 4M' : '4H 3M'}
                  />
                ) : (
                  <span className="live-mix-ratio-hint-code">{mixRatioLiveHint.code}</span>
                )}
              </div>
            ) : null}
            <div className="live-action-row">
              <button
                type="button"
                className="live-action-btn live-action-btn--goal"
                onClick={openGoalModal}
                disabled={gameEnded}
              >
                <span className="live-action-btn-label">GOAL</span>
              </button>
              <button
                type="button"
                className="live-action-btn live-action-btn--timeout"
                onClick={handleTimeoutPress}
                disabled={gameEnded || timeoutPosting}
              >
                <span className="live-action-btn-label">{timeoutPosting ? '…' : 'TIMEOUT'}</span>
              </button>
            </div>
            <div className="live-action-row live-action-row--secondary">
              <button
                type="button"
                className="live-action-btn live-action-btn--pause"
                onClick={handlePauseResumeClick}
                disabled={gameEnded || metaSubmitting || (!isPausedByUser && !clockRunning)}
                aria-pressed={isPausedByUser}
                title={
                  isPausedByUser
                    ? 'Registrar reanudación y seguir el cronómetro del partido'
                    : 'Registrar pausa y detener el cronómetro del partido'
                }
              >
                <span className="live-action-btn-label">{isPausedByUser ? 'REANUDAR' : 'PAUSA'}</span>
              </button>
              <button
                type="button"
                className="live-action-btn live-action-btn--half"
                onClick={handleHalfClick}
                disabled={gameEnded || metaSubmitting || halfEventAlreadyRecorded}
                title={
                  halfEventAlreadyRecorded
                    ? 'Medio tiempo ya registrado'
                    : 'Registrar medio tiempo (HALF) en la línea de tiempo'
                }
              >
                <span className="live-action-btn-label">HALF</span>
              </button>
              <button
                type="button"
                className="live-action-btn live-action-btn--forfeit"
                onClick={openForfeitModal}
                disabled={!canForfeit || gameEnded}
                title={
                  canForfeit
                    ? 'Forfeit: elegir equipo que abandona; el rival gana 15–0 sin goles ni asistencias'
                    : 'Solo disponible con el partido en curso (Ongoing) e iniciada sesión'
                }
              >
                <span className="live-action-btn-label">{forfeitSubmitting ? '…' : 'FORFEIT'}</span>
              </button>
            </div>
            <div className="live-action-row live-action-row--endgame">
              <button
                type="button"
                className="live-action-btn live-action-btn--endgame"
                onClick={openEndGameConfirm}
                disabled={!canEndGame || endGameSubmitting}
                title={
                  canEndGame
                    ? 'Finalizar partido: detiene el cronómetro y marca el juego como finalizado'
                    : 'Solo disponible con el partido en curso (Ongoing) e iniciada sesión'
                }
              >
                <span className="live-action-btn-label">
                  {endGameSubmitting ? 'Finalizando…' : 'END'}
                </span>
              </button>
            </div>
          </div>
        </section>
      </main>

      {forfeitModalOpen ? (
        <div
          className="live-modal-backdrop live-modal-backdrop--forfeit-confirm"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeForfeitModal();
          }}
        >
          <div
            className="live-modal live-forfeit-confirm"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="live-forfeit-confirm-title"
            aria-describedby="live-forfeit-confirm-desc"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="live-forfeit-confirm-inner">
              <h2 id="live-forfeit-confirm-title" className="live-forfeit-confirm-title">
                Registrar forfeit
              </h2>
              <p id="live-forfeit-confirm-desc" className="live-forfeit-confirm-desc">
                Indica qué equipo comete el <strong>forfeit</strong>. El rival gana{' '}
                <strong>15 – 0</strong>. No se registran goles ni asistencias a ningún jugador. El partido
                quedará <strong>finalizado</strong>.
              </p>
              <div className="live-forfeit-team-pick" role="group" aria-label="Equipo que comete forfeit">
                <button
                  type="button"
                  className={`live-forfeit-team-opt${forfeitTeamChoice === 'home' ? ' live-forfeit-team-opt--active' : ''}`}
                  onClick={() => setForfeitTeamChoice('home')}
                  disabled={forfeitSubmitting}
                >
                  <img
                    className="live-forfeit-team-opt-logo"
                    src={homeLogo}
                    alt=""
                    onError={(e) => {
                      if (!e.currentTarget.src.includes(TEAM_FALLBACK_IMAGE)) {
                        e.currentTarget.src = TEAM_FALLBACK_IMAGE;
                      }
                    }}
                  />
                  <span className="live-forfeit-team-opt-name">{homeLabel}</span>
                  <span className="live-forfeit-team-opt-hint">Comete forfeit</span>
                </button>
                <button
                  type="button"
                  className={`live-forfeit-team-opt${forfeitTeamChoice === 'away' ? ' live-forfeit-team-opt--active' : ''}`}
                  onClick={() => setForfeitTeamChoice('away')}
                  disabled={forfeitSubmitting}
                >
                  <img
                    className="live-forfeit-team-opt-logo"
                    src={awayLogo}
                    alt=""
                    onError={(e) => {
                      if (!e.currentTarget.src.includes(TEAM_FALLBACK_IMAGE)) {
                        e.currentTarget.src = TEAM_FALLBACK_IMAGE;
                      }
                    }}
                  />
                  <span className="live-forfeit-team-opt-name">{awayLabel}</span>
                  <span className="live-forfeit-team-opt-hint">Comete forfeit</span>
                </button>
              </div>
              {forfeitTeamChoice ? (
                <p className="live-forfeit-result-preview" role="status">
                  Marcador:{' '}
                  <strong>
                    {forfeitTeamChoice === 'home' ? `0 – 15 (${awayLabel})` : `15 – 0 (${homeLabel})`}
                  </strong>
                </p>
              ) : null}
              <div className="live-forfeit-confirm-actions">
                <button
                  type="button"
                  className="live-forfeit-confirm-btn live-forfeit-confirm-btn--secondary"
                  onClick={closeForfeitModal}
                  disabled={forfeitSubmitting}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="live-forfeit-confirm-btn live-forfeit-confirm-btn--primary"
                  onClick={() => confirmForfeit()}
                  disabled={forfeitSubmitting || !forfeitTeamChoice}
                >
                  {forfeitSubmitting ? 'Registrando…' : 'Confirmar forfeit'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {endGameConfirmOpen ? (
        <div
          className="live-modal-backdrop live-modal-backdrop--endgame-confirm"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeEndGameConfirm();
          }}
        >
          <div
            className="live-modal live-endgame-confirm"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="live-endgame-confirm-title"
            aria-describedby="live-endgame-confirm-desc"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="live-endgame-confirm-inner">
              <div className="live-endgame-confirm-badge" aria-hidden="true">
                <span className="live-endgame-confirm-badge-icon">⏹</span>
              </div>
              <h2 id="live-endgame-confirm-title" className="live-endgame-confirm-title">
                ¿Finalizar el partido?
              </h2>
              <p id="live-endgame-confirm-desc" className="live-endgame-confirm-desc">
                Se detendrá el <strong>cronómetro</strong> y el encuentro quedará como{' '}
                <strong>finalizado</strong> en el torneo. Los eventos ya registrados no se eliminan.
              </p>
              <div className="live-endgame-confirm-actions">
                <button
                  type="button"
                  className="live-endgame-confirm-btn live-endgame-confirm-btn--secondary"
                  onClick={closeEndGameConfirm}
                  disabled={endGameSubmitting}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="live-endgame-confirm-btn live-endgame-confirm-btn--primary"
                  onClick={() => confirmEndGame()}
                  disabled={endGameSubmitting}
                >
                  {endGameSubmitting ? 'Finalizando…' : 'Sí, finalizar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {goalModalOpen ? (
        <div
          className="live-modal-backdrop"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeGoalModal();
          }}
        >
          <div
            className="live-modal live-modal--minimal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="live-goal-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="live-modal-head-min">
              <h2 id="live-goal-modal-title" className="live-modal-title-min">
                Gol
              </h2>
              <p className="live-modal-team-min">{currentTeamLabel}</p>
            </header>

            {!playersLoading && !playersError && currentPlayers.length > 0 ? (
              <div className="live-modal-tabs" role="tablist" aria-label="Datos del gol">
                <button
                  type="button"
                  role="tab"
                  aria-selected={goalModalTab === 'scorer'}
                  className={`live-modal-tab ${goalModalTab === 'scorer' ? 'live-modal-tab--active' : ''}`}
                  onClick={() => setGoalModalTab('scorer')}
                >
                  <span className="live-modal-tab-text">Quién anotó</span>
                  {goalScorerId != null ? (
                    <span className="live-modal-tab-done" aria-hidden="true">
                      ✓
                    </span>
                  ) : null}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={goalModalTab === 'assist'}
                  className={`live-modal-tab ${goalModalTab === 'assist' ? 'live-modal-tab--active' : ''}`}
                  onClick={() => setGoalModalTab('assist')}
                >
                  <span className="live-modal-tab-text">Quién asistió</span>
                  {assistChoice != null ? (
                    <span className="live-modal-tab-done" aria-hidden="true">
                      ✓
                    </span>
                  ) : null}
                </button>
              </div>
            ) : null}

            <div className="live-modal-body-min">
              {playersLoading ? <p className="live-modal-state">Cargando jugadores…</p> : null}
              {!playersLoading && playersError ? <p className="live-modal-state live-modal-state--error">{playersError}</p> : null}

              {!playersLoading && !playersError && currentPlayers.length > 0 && goalModalTab === 'scorer' ? (
                <section className="live-modal-panel" role="tabpanel" aria-label="Goleador">
                  <p className="live-modal-panel-hint">Elige al jugador que anotó.</p>
                  <ul className="live-modal-pick-list">
                    {currentPlayers.map((player, index) => {
                      const pid = player.player_id;
                      const picked = pid != null && goalScorerId === pid;
                      return (
                        <li key={`scorer-${rowKey(player, index)}`}>
                          <button
                            type="button"
                            disabled={pid == null}
                            aria-pressed={picked}
                            className={`live-modal-pick ${picked ? 'live-modal-pick--on' : ''}`}
                            onClick={() => pid != null && setGoalScorerId(pid)}
                          >
                            <span className="live-modal-pick-num">{displayNumber(player, index)}</span>
                            <span className="live-modal-pick-name">{playerName(player)}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ) : null}

              {!playersLoading && !playersError && currentPlayers.length > 0 && goalModalTab === 'assist' ? (
                <section className="live-modal-panel" role="tabpanel" aria-label="Asistencia">
                  <p className="live-modal-panel-hint">Callahan o jugador que asistió.</p>
                  <ul className="live-modal-pick-list">
                    <li>
                      <button
                        type="button"
                        aria-pressed={assistChoice === 'callahan'}
                        className={`live-modal-pick live-modal-pick--callahan ${assistChoice === 'callahan' ? 'live-modal-pick--on' : ''}`}
                        onClick={() => setAssistChoice('callahan')}
                      >
                        <span className="live-modal-pick-name">Callahan</span>
                      </button>
                    </li>
                    {currentPlayers.map((player, index) => {
                      const pid = player.player_id;
                      const picked = typeof assistChoice === 'number' && assistChoice === pid;
                      return (
                        <li key={`assist-${rowKey(player, index)}`}>
                          <button
                            type="button"
                            disabled={pid == null}
                            aria-pressed={picked}
                            className={`live-modal-pick ${picked ? 'live-modal-pick--on' : ''}`}
                            onClick={() => pid != null && setAssistChoice(pid)}
                          >
                            <span className="live-modal-pick-num">{displayNumber(player, index)}</span>
                            <span className="live-modal-pick-name">{playerName(player)}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ) : null}

              {!playersLoading && !playersError && currentPlayers.length === 0 ? (
                <p className="live-modal-state">No hay jugadores en este equipo.</p>
              ) : null}
            </div>

            <footer className="live-modal-foot-min">
              <button
                type="button"
                className="live-modal-btn-min live-modal-btn-min--muted"
                disabled={goalSubmitting}
                onClick={closeGoalModal}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="live-modal-btn-min live-modal-btn-min--accent"
                disabled={goalScorerId == null || assistChoice == null || goalSubmitting}
                onClick={confirmGoalFromModal}
              >
                {goalSubmitting ? 'Guardando…' : 'Confirmar'}
              </button>
            </footer>
          </div>
        </div>
      ) : null}

      {timeoutModalOpen ? (
        <div className="live-modal-backdrop live-modal-backdrop--timeout" role="presentation">
          <div
            className="live-timeout-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="live-timeout-title"
            aria-live="polite"
          >
            <h2 id="live-timeout-title" className="live-timeout-title">
              Timeout
            </h2>
            <p className="live-timeout-desc">
              Equipo solicitante (pestaña activa): <strong>{currentTeamLabel}</strong>. Cuenta regresiva de 75 s.
              El cronómetro del partido sigue corriendo.
            </p>
            <div className="live-timeout-counter" aria-label={`Segundos restantes: ${timeoutSecondsLeft}`}>
              {formatTimeoutClock(timeoutSecondsLeft)}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default LivePage;
