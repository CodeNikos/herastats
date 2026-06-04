import { useCallback, useEffect, useRef, useState } from 'react';
import { configService } from '../services/configService';
import {
  computeLiveClockFromEvents,
  elapsedSecondsAtUserPause,
  elapsedSecondsForFinishedGame,
  extrapolateLiveClockSec,
  elapsedSecondsToHms,
  formatEventTimeFromElapsedSeconds,
  hasGameFinishedMarker,
  isUserPauseActive,
  readLiveClockElapsedSec,
  shouldApplyServerClockResync
} from '../utils/gamePhaseClock';

function hasStartEvent(events) {
  return (events || []).some((e) => String(e.event_type || '').trim().toUpperCase() === 'START');
}

/**
 * Reloj de fase compartido (LIVE, GamePages, etc.): ancla en `live_clock_elapsed_sec` (BD)
 * + extrapolación de pared mientras corre. Solo LIVE debe usar `persistEnabled: true`.
 */
export function useGamePhaseClock({
  events,
  phaseSeconds,
  gameFinished,
  gameRow,
  persistEnabled = false,
  tournamentId,
  gameId
}) {
  const eventsRef = useRef(events || []);
  const phaseSecRef = useRef(Math.max(0, Number(phaseSeconds) || 0));
  const displayElapsedRef = useRef(0);
  const optimisticPausedRef = useRef(false);
  const frozenElapsedRef = useRef(0);
  const localStartWallMsRef = useRef(null);
  const lastPersistedSecRef = useRef(-1);
  const pausedByUserRef = useRef(false);
  const clockRunningRef = useRef(false);
  const liveClockAnchorRef = useRef(null);
  const hadStartRef = useRef(false);
  const persistElapsedNowRef = useRef(async () => {});

  const frozenFinishSecRef = useRef(null);
  const [finishFrozen, setFinishFrozen] = useState(false);

  const [tiempo, setTiempo] = useState(() => elapsedSecondsToHms(0));
  const [isPausedByUser, setIsPausedByUser] = useState(false);
  const [clockRunning, setClockRunning] = useState(false);

  eventsRef.current = events || [];
  phaseSecRef.current = Math.max(0, Number(phaseSeconds) || 0);
  pausedByUserRef.current = isPausedByUser;
  clockRunningRef.current = clockRunning;

  const syncLiveClockAnchor = useCallback((baseSec, wallMs = Date.now()) => {
    const sec = Math.max(0, Math.floor(Number(baseSec) || 0));
    liveClockAnchorRef.current = { baseSec: sec, wallMs };
  }, []);

  const extrapolateFromAnchor = useCallback((nowMs = Date.now()) => {
    const anchor = liveClockAnchorRef.current;
    if (!anchor) return null;
    return extrapolateLiveClockSec(anchor.baseSec, anchor.wallMs, nowMs);
  }, []);

  useEffect(() => {
    const db = readLiveClockElapsedSec(gameRow);
    if (db == null) return;
    const anchor = liveClockAnchorRef.current;
    const extrap = anchor ? extrapolateLiveClockSec(anchor.baseSec, anchor.wallMs) : null;
    if (extrap != null && extrap > db) {
      return;
    }
    syncLiveClockAnchor(db);
    lastPersistedSecRef.current = db;
  }, [gameRow?.live_clock_elapsed_sec, syncLiveClockAnchor]);

  useEffect(() => {
    const evs = events || [];
    if (!hasStartEvent(evs)) return;
    if (localStartWallMsRef.current != null) {
      localStartWallMsRef.current = null;
    }
    if (!hadStartRef.current) {
      hadStartRef.current = true;
      const db = readLiveClockElapsedSec(gameRow);
      // Reconstruir el tiempo desde START (created_at) contra el reloj del sistema, descontando
      // pausas: así una recarga no pierde la continuidad. `live_clock_elapsed_sec` (BD) solo se
      // escribe en eventos de control (pausa/fin), por lo que mientras corre suele estar atrasado;
      // se usa solo como piso de seguridad (max) para no retroceder nunca.
      const fromEvents = computeLiveClockFromEvents(evs, phaseSecRef.current, Date.now()).elapsedSeconds;
      const baseSec = db != null ? Math.max(db, fromEvents) : fromEvents;
      syncLiveClockAnchor(baseSec);
    }
  }, [events, gameRow, syncLiveClockAnchor]);

  const computeSnapshot = useCallback(
    (nowMs = Date.now()) => {
      const phaseSec = phaseSecRef.current;
      const evs = eventsRef.current;
      const stopped = gameFinished || finishFrozen || hasGameFinishedMarker(evs);

      if (stopped) {
        const frozenSec = frozenFinishSecRef.current;
        const sec = Math.max(
          0,
          Math.floor(
            frozenSec != null && Number.isFinite(frozenSec)
              ? frozenSec
              : elapsedSecondsForFinishedGame(evs, phaseSec, gameRow)
          )
        );
        return {
          elapsedSeconds: phaseSec > 0 ? Math.min(sec, phaseSec) : sec,
          pausedByUser: false,
          hasStart: true,
          running: false
        };
      }

      if (optimisticPausedRef.current) {
        const frozen = Math.max(0, Math.floor(frozenElapsedRef.current));
        return {
          elapsedSeconds: phaseSec > 0 ? Math.min(frozen, phaseSec) : frozen,
          pausedByUser: true,
          hasStart: true,
          running: false
        };
      }

      if (isUserPauseActive(evs)) {
        const atPause = elapsedSecondsAtUserPause(evs, gameRow);
        const clock = computeLiveClockFromEvents(evs, phaseSec, nowMs);
        const sec =
          atPause != null && Number.isFinite(atPause)
            ? phaseSec > 0
              ? Math.min(Math.max(0, Math.floor(atPause)), phaseSec)
              : Math.max(0, Math.floor(atPause))
            : clock.elapsedSeconds;
        if (atPause != null) {
          syncLiveClockAnchor(sec, nowMs);
        }
        return {
          elapsedSeconds: sec,
          pausedByUser: true,
          hasStart: clock.hasStart,
          running: false
        };
      }

      const hasStart = hasStartEvent(evs);

      if (!hasStart && localStartWallMsRef.current != null) {
        const localSec = Math.min(
          phaseSec > 0 ? phaseSec : Number.MAX_SAFE_INTEGER,
          Math.max(0, Math.floor((nowMs - localStartWallMsRef.current) / 1000))
        );
        return {
          elapsedSeconds: localSec,
          pausedByUser: false,
          hasStart: false,
          running: true
        };
      }

      const extrap = extrapolateFromAnchor(nowMs);
      if (hasStart && extrap != null) {
        const sec = phaseSec > 0 ? Math.min(Math.max(0, extrap), phaseSec) : Math.max(0, extrap);
        const running = phaseSec <= 0 || sec < phaseSec;
        return {
          elapsedSeconds: sec,
          pausedByUser: false,
          hasStart: true,
          running
        };
      }

      const clock = computeLiveClockFromEvents(evs, phaseSec, nowMs);
      if (clock.hasStart) {
        localStartWallMsRef.current = null;
        syncLiveClockAnchor(clock.elapsedSeconds, nowMs);
      }

      const running =
        clock.hasStart && !clock.pausedByUser && (phaseSec <= 0 || clock.elapsedSeconds < phaseSec);
      return {
        elapsedSeconds: clock.elapsedSeconds,
        pausedByUser: clock.pausedByUser,
        hasStart: clock.hasStart,
        running
      };
    },
    [gameFinished, finishFrozen, gameRow, extrapolateFromAnchor, syncLiveClockAnchor]
  );

  const applySnapshotToUi = useCallback((snap) => {
    displayElapsedRef.current = snap.elapsedSeconds;
    setTiempo(elapsedSecondsToHms(snap.elapsedSeconds));
    setIsPausedByUser(snap.pausedByUser);
    setClockRunning(snap.running);
  }, []);

  const persistElapsedNow = useCallback(
    async (options = {}) => {
      const force = options?.force === true;
      const stopped = gameFinished || finishFrozen;
      if (!persistEnabled || stopped || !tournamentId || !gameId) return;
      if (!force) {
        if (optimisticPausedRef.current) return;
        if (pausedByUserRef.current || !clockRunningRef.current) return;
      }
      const sec = displayElapsedRef.current;
      if (!force && sec === lastPersistedSecRef.current) return;
      try {
        const res = await configService.patchLiveClockElapsed(tournamentId, gameId, sec);
        if (res?.success) {
          lastPersistedSecRef.current = sec;
          syncLiveClockAnchor(sec);
        }
      } catch {
        /* mejor esfuerzo */
      }
    },
    [persistEnabled, gameFinished, finishFrozen, tournamentId, gameId, syncLiveClockAnchor]
  );

  persistElapsedNowRef.current = persistElapsedNow;

  useEffect(() => {
    let rafId;
    let lastSec = -1;

    const frame = () => {
      const snap = computeSnapshot();
      displayElapsedRef.current = snap.elapsedSeconds;
      if (snap.elapsedSeconds !== lastSec) {
        lastSec = snap.elapsedSeconds;
        setTiempo(elapsedSecondsToHms(snap.elapsedSeconds));
        // No se persiste cada segundo: el reloj se reconstruye desde los eventos
        // (START/PAUSA/REANUDADO) y la BD solo se escribe al ocurrir esos eventos.
      }
      setIsPausedByUser(snap.pausedByUser);
      setClockRunning(snap.running);
      rafId = requestAnimationFrame(frame);
    };

    const initial = computeSnapshot();
    lastSec = initial.elapsedSeconds;
    applySnapshotToUi(initial);
    rafId = requestAnimationFrame(frame);

    return () => cancelAnimationFrame(rafId);
  }, [events, phaseSeconds, gameFinished, finishFrozen, gameRow, computeSnapshot, applySnapshotToUi, persistEnabled]);

  const freezeForFinish = useCallback(
    (elapsedSeconds) => {
      const sec = Math.max(0, Math.floor(Number(elapsedSeconds) || 0));
      frozenFinishSecRef.current = sec;
      optimisticPausedRef.current = false;
      syncLiveClockAnchor(sec);
      lastPersistedSecRef.current = sec;
      setFinishFrozen(true);
      applySnapshotToUi(computeSnapshot());
    },
    [applySnapshotToUi, computeSnapshot, syncLiveClockAnchor]
  );

  const resetFinishFreeze = useCallback(() => {
    frozenFinishSecRef.current = null;
    setFinishFrozen(false);
  }, []);

  const evaluateServerResync = useCallback((serverEvents, { force = false } = {}) => {
    const phaseSec = phaseSecRef.current;
    const serverClock = computeLiveClockFromEvents(serverEvents, phaseSec, Date.now());
    const local = {
      elapsedSeconds: displayElapsedRef.current,
      pausedByUser: optimisticPausedRef.current || pausedByUserRef.current,
      hasStart: computeLiveClockFromEvents(eventsRef.current, phaseSec, Date.now()).hasStart
    };
    return force || shouldApplyServerClockResync(local, serverClock);
  }, []);

  const setOptimisticPause = useCallback(() => {
    frozenElapsedRef.current = displayElapsedRef.current;
    optimisticPausedRef.current = true;
    syncLiveClockAnchor(frozenElapsedRef.current);
    applySnapshotToUi(computeSnapshot());
  }, [applySnapshotToUi, computeSnapshot, syncLiveClockAnchor]);

  const clearOptimisticPause = useCallback(() => {
    optimisticPausedRef.current = false;
  }, []);

  const confirmServerPauseIfOptimistic = useCallback(
    (serverEvents, serverGameRow = gameRow) => {
      if (!optimisticPausedRef.current) return;
      if (!isUserPauseActive(serverEvents)) return;
      const frozen = Math.max(0, Math.floor(frozenElapsedRef.current));
      const atPause = elapsedSecondsAtUserPause(serverEvents, serverGameRow);
      const phaseSec = phaseSecRef.current;
      let sec = frozen;
      if (atPause != null && Number.isFinite(atPause)) {
        sec = Math.max(frozen, Math.floor(atPause));
      }
      if (phaseSec > 0) sec = Math.min(sec, phaseSec);
      frozenElapsedRef.current = sec;
      displayElapsedRef.current = sec;
      lastPersistedSecRef.current = sec;
      syncLiveClockAnchor(sec);
      optimisticPausedRef.current = false;
    },
    [gameRow, syncLiveClockAnchor]
  );

  const beginLocalStartCountdown = useCallback(() => {
    localStartWallMsRef.current = Date.now();
    syncLiveClockAnchor(0);
    applySnapshotToUi(computeSnapshot());
  }, [applySnapshotToUi, computeSnapshot, syncLiveClockAnchor]);

  const captureEventTime = useCallback(() => {
    return formatEventTimeFromElapsedSeconds(displayElapsedRef.current);
  }, []);

  const getElapsedSeconds = useCallback(() => displayElapsedRef.current, []);

  return {
    tiempo,
    isPausedByUser,
    clockRunning,
    finishFrozen,
    displayElapsedRef,
    evaluateServerResync,
    setOptimisticPause,
    clearOptimisticPause,
    confirmServerPauseIfOptimistic,
    freezeForFinish,
    resetFinishFreeze,
    beginLocalStartCountdown,
    captureEventTime,
    getElapsedSeconds,
    persistElapsedNow,
    syncLiveClockAnchor
  };
}

/** @deprecated Usar `useGamePhaseClock` */
export const useLivePhaseClock = useGamePhaseClock;
