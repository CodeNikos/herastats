import { isGameFinishedState } from './gameEstado';

export { isGameFinishedState };

/** `created_at` del evento en BD (ancla de reloj de pared). */
export function parseEventWallMs(createdAt) {
  if (createdAt == null || createdAt === '') return null;
  if (createdAt instanceof Date) {
    const t = createdAt.getTime();
    return Number.isFinite(t) ? t : null;
  }
  const t = Date.parse(String(createdAt));
  return Number.isFinite(t) ? t : null;
}

/** Duración de fase en segundos a partir de H/M/S. */
export function phaseHmsToSeconds(horas, minutos, segundos) {
  return Math.max(0, (Number(horas) || 0) * 3600 + (Number(minutos) || 0) * 60 + (Number(segundos) || 0));
}

/**
 * Segundos de juego desde START (created_at) menos tiempo en JUEGO EN PAUSA (intervalos por created_at).
 * Ancla: primer evento START; pausas: created_at de metaeventos, no event_time del disco.
 */
export function computeLiveClockFromEvents(events, phaseDurationSeconds, nowMs = Date.now()) {
  const sorted = [...(events || [])].sort((a, b) => Number(a.event_id) - Number(b.event_id));
  const startEv = sorted.find((e) => String(e.event_type || '').trim().toUpperCase() === 'START');
  if (!startEv) {
    return { elapsedSeconds: 0, pausedByUser: false, hasStart: false };
  }
  const t0 = parseEventWallMs(startEv.created_at);
  if (t0 == null) {
    return { elapsedSeconds: 0, pausedByUser: false, hasStart: true };
  }

  let pausedSumMs = 0;
  let openPauseMs = null;
  for (const ev of sorted) {
    const ty = String(ev.event_type || '').trim().toUpperCase();
    if (ty === 'JUEGO EN PAUSA') {
      const w = parseEventWallMs(ev.created_at);
      if (w != null) openPauseMs = w;
    } else if (ty === 'JUEGO REANUDADO') {
      const w = parseEventWallMs(ev.created_at);
      if (openPauseMs != null && w != null && w >= openPauseMs) {
        pausedSumMs += w - openPauseMs;
      }
      openPauseMs = null;
    }
  }
  if (openPauseMs != null) {
    pausedSumMs += nowMs - openPauseMs;
  }

  const wallMs = nowMs - t0;
  const rawSeconds = Math.floor((wallMs - pausedSumMs) / 1000);
  const dur = Math.max(0, Number(phaseDurationSeconds) || 0);
  const elapsedSeconds = dur > 0 ? Math.min(Math.max(0, rawSeconds), dur) : Math.max(0, rawSeconds);
  const pausedByUser = openPauseMs != null;
  return { elapsedSeconds, pausedByUser, hasStart: true };
}

/** Último `created_at` conocido entre eventos; ancla estable para recomputos sin usar `Date.now()`. */
export function freezeWallMsFromLatestEvent(events) {
  let max = null;
  for (const ev of events || []) {
    const ms = parseEventWallMs(ev.created_at);
    if (ms != null && (max == null || ms > max)) max = ms;
  }
  return max;
}

/**
 * Reloj derivado para partido terminado sin evento FINAL en BD: usa el tiempo de pared del último evento
 * como "ahora", para que el valor mostrado no siga avanzando en cada efecto/recarga.
 */
export function computeLiveClockDisplayForFinishedGame(events, phaseDurationSeconds) {
  const anchor = freezeWallMsFromLatestEvent(events);
  const nowMs = anchor != null ? anchor : Date.now();
  return computeLiveClockFromEvents(events, phaseDurationSeconds, nowMs);
}

/** ¿Hay evento «JUEGO FINALIZADO» en la línea de tiempo? */
export function hasGameFinishedMarker(events) {
  return (events || []).some(
    (e) => String(e.event_type || '').trim().toUpperCase() === 'JUEGO FINALIZADO'
  );
}

/** Partido terminado por estado en BD o por marcador en eventos. */
export function isGameClockStopped(gameRow, events) {
  return isGameFinishedState(gameRow?.estado) || hasGameFinishedMarker(events);
}

/** Segundos congelados en BD (`game.live_clock_elapsed_sec`), si existen. */
export function readLiveClockElapsedSec(gameRow) {
  const raw = gameRow?.live_clock_elapsed_sec ?? gameRow?.liveClockElapsedSec;
  if (raw == null || raw === '') return null;
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** ¿Hay pausa de usuario activa (último meta-evento = JUEGO EN PAUSA)? */
export function isUserPauseActive(events) {
  const sorted = [...(events || [])].sort((a, b) => Number(a.event_id) - Number(b.event_id));
  let open = false;
  for (const ev of sorted) {
    const ty = String(ev.event_type || '').trim().toUpperCase();
    if (ty === 'JUEGO EN PAUSA') open = true;
    else if (ty === 'JUEGO REANUDADO') open = false;
  }
  return open;
}

/**
 * Segundos del cronómetro en pausa: `event_time` del último JUEGO EN PAUSA (fuente al pausar),
 * luego `live_clock_elapsed_sec`; se usa el mayor si ambos existen (evita BD desfasada ~1–2 s).
 */
export function elapsedSecondsAtUserPause(events, gameRow = null) {
  const sorted = [...(events || [])].sort((a, b) => Number(a.event_id) - Number(b.event_id));
  let lastPauseEv = null;
  for (const ev of sorted) {
    const ty = String(ev.event_type || '').trim().toUpperCase();
    if (ty === 'JUEGO EN PAUSA') lastPauseEv = ev;
    else if (ty === 'JUEGO REANUDADO') lastPauseEv = null;
  }
  let fromEvent = null;
  if (lastPauseEv?.event_time) {
    fromEvent = parseGameClockHmsToSeconds(String(lastPauseEv.event_time).trim());
  }
  const fromDb = readLiveClockElapsedSec(gameRow);
  if (fromEvent != null && fromDb != null) {
    return Math.max(fromEvent, fromDb);
  }
  return fromEvent ?? fromDb ?? null;
}

/**
 * Reloj en partido Ongoing: en pausa usa snapshot de BD / event_time (no reloj de pared por created_at).
 */
export function elapsedSecondsForOngoingGame(events, phaseDurationSeconds, gameRow = null, nowMs = Date.now()) {
  const dur = Math.max(0, Number(phaseDurationSeconds) || 0);
  if (!isUserPauseActive(events)) {
    return computeLiveClockFromEvents(events, dur, nowMs);
  }
  const atPause = elapsedSecondsAtUserPause(events, gameRow);
  const clock = computeLiveClockFromEvents(events, dur, nowMs);
  if (atPause == null || !Number.isFinite(atPause)) {
    return { ...clock, pausedByUser: true };
  }
  const elapsedSeconds = dur > 0 ? Math.min(Math.max(0, Math.floor(atPause)), dur) : Math.max(0, Math.floor(atPause));
  return { elapsedSeconds, pausedByUser: true, hasStart: clock.hasStart };
}

/**
 * Tiempo de juego a mostrar con partido finalizado: usa snapshot guardado al pulsar FIN (servidor),
 * si no hay, deriva desde eventos como antes.
 */
export function elapsedSecondsForFinishedGame(events, phaseDurationSeconds, gameRow = null) {
  const dur = Math.max(0, Number(phaseDurationSeconds) || 0);
  const raw = gameRow?.live_clock_elapsed_sec ?? gameRow?.liveClockElapsedSec;
  let fromSnap =
    raw != null && raw !== ''
      ? Math.max(0, Math.floor(Number(raw)))
      : null;
  if (fromSnap != null && Number.isFinite(fromSnap)) {
    return dur > 0 ? Math.min(fromSnap, dur) : fromSnap;
  }
  const finEv = (events || []).find(
    (e) => String(e.event_type || '').trim().toUpperCase() === 'JUEGO FINALIZADO'
  );
  if (finEv?.event_time != null && String(finEv.event_time).trim() !== '') {
    const fromMarker = parseGameClockHmsToSeconds(String(finEv.event_time).trim());
    if (fromMarker != null && Number.isFinite(fromMarker)) {
      return dur > 0 ? Math.min(fromMarker, dur) : fromMarker;
    }
  }
  const clock = computeLiveClockDisplayForFinishedGame(events, dur);
  return clock.hasStart ? clock.elapsedSeconds : 0;
}

/** Parsea `HH:MM:SS` o `MM:SS` del cronómetro de juego a segundos. */
export function parseGameClockHmsToSeconds(raw) {
  const t = raw == null ? '' : String(raw).trim();
  if (!t) return null;
  const m = t.match(/^(\d{1,3}):(\d{2}):(\d{2})$/);
  if (m) {
    const h = Number(m[1]);
    const min = Number(m[2]);
    const sec = Number(m[3]);
    if (!Number.isFinite(min) || !Number.isFinite(sec) || min > 59 || sec > 59) return null;
    return Math.max(0, h * 3600 + min * 60 + sec);
  }
  const m2 = t.match(/^(\d{1,3}):(\d{2})$/);
  if (m2) {
    const min = Number(m2[1]);
    const sec = Number(m2[2]);
    if (!Number.isFinite(sec) || sec > 59) return null;
    return Math.max(0, min * 60 + sec);
  }
  return null;
}

export function isGameOngoingState(estado) {
  const s = String(estado == null ? '' : estado).trim().toLowerCase();
  return s === 'ongoing' || s === 'en curso';
}

/** Umbral (s) para no «saltar» el reloj al traer eventos del servidor si la diferencia es pequeña. */
export const LIVE_CLOCK_RESYNC_THRESHOLD_SEC = 2;

/**
 * @deprecated Ya no se persiste el reloj de forma periódica. La BD (`live_clock_elapsed_sec`)
 * solo se escribe al ocurrir eventos de control (pausa/finalizar); mientras corre, el reloj se
 * reconstruye desde los `created_at` de los eventos (START/PAUSA/REANUDADO).
 */
export const LIVE_CLOCK_PERSIST_INTERVAL_MS = 10000;

/** Segundos transcurridos desde ancla BD + pared (misma fórmula en LIVE y persistencia). */
export function extrapolateLiveClockSec(baseSec, wallMs, nowMs = Date.now()) {
  const base = Math.max(0, Math.floor(Number(baseSec) || 0));
  const anchor = Number(wallMs);
  if (!Number.isFinite(anchor)) return base;
  return Math.max(0, base + Math.floor((nowMs - anchor) / 1000));
}

export function elapsedSecondsToHms(totalSeg) {
  const s = Math.max(0, Math.floor(Number(totalSeg) || 0));
  return {
    horas: Math.floor(s / 3600),
    minutos: Math.floor((s % 3600) / 60),
    segundos: s % 60,
    totalSegundos: s
  };
}

function pad2(n) {
  return String(Math.floor(Number(n) || 0)).padStart(2, '0');
}

/** `HH:MM:SS` para `event_time` en game_events. */
export function formatEventTimeFromElapsedSeconds(totalSeg) {
  const t = elapsedSecondsToHms(totalSeg);
  return `${pad2(t.horas)}:${pad2(t.minutos)}:${pad2(t.segundos)}`;
}

/**
 * @param {{ elapsedSeconds: number, pausedByUser: boolean, hasStart: boolean }} local
 * @param {{ elapsedSeconds: number, pausedByUser: boolean, hasStart: boolean }} server
 */
export function shouldApplyServerClockResync(local, server, thresholdSec = LIVE_CLOCK_RESYNC_THRESHOLD_SEC) {
  if (Boolean(local.pausedByUser) !== Boolean(server.pausedByUser)) return true;
  if (Boolean(local.hasStart) !== Boolean(server.hasStart)) return true;
  return Math.abs(Number(local.elapsedSeconds) - Number(server.elapsedSeconds)) > thresholdSec;
}
