/**
 * Coordinación liviana entre vistas (stats, calendario, Pool & brackets).
 * Misma pestaña: CustomEvent. Otras pestañas del mismo navegador: localStorage/storage.
 */

export const HERASTATS_TOURNAMENT_COHERENCE = 'herastats:tournament-coherence';
export const HERASTATS_GAMES_CHANGED_STORAGE = 'herastats:games-changed';

/**
 * Misma clave de torneo entre query (`live`) y rutas (`/stats/:id/...`), evita fallos de igualdad "5" vs "05".
 * Si el id no es numérico (p. ej. slug), se usa el string trim.
 */
export function normalizeTournamentIdForCoherence(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  const n = Number(s);
  if (Number.isFinite(n) && n > 0) return String(n);
  return s;
}

/**
 * Notifica cambios entre vistas (stats, calendario, Pool & brackets).
 * @param {string|number|null|undefined} tournamentId
 * @param {{ fullBracketReload?: boolean }} [options]
 *   `fullBracketReload`: calendario/lienzo (nuevo juego, enlaces…) → GET bracket + lienzos.
 *   Sin flag o false: solo equipos/clasificación (slots 1A, cruces desde stats/live).
 */
export function broadcastTournamentCoherenceChanged(tournamentId, options = {}) {
  const tid = normalizeTournamentIdForCoherence(tournamentId);
  if (!tid) return;
  const fullBracketReload = Boolean(options.fullBracketReload);
  const detail = { tournamentId: tid, fullBracketReload };
  try {
    window.dispatchEvent(new CustomEvent(HERASTATS_TOURNAMENT_COHERENCE, { detail }));
  } catch (_) {
    /* ignorar */
  }
  try {
    localStorage.setItem(
      HERASTATS_GAMES_CHANGED_STORAGE,
      JSON.stringify({ tournamentId: tid, ts: Date.now(), fullBracketReload })
    );
  } catch (_) {
    /* ignorar modo privado o cuota */
  }
}
