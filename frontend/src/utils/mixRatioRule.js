/** @typedef {'3H4M' | '4H3M'} MixRatioCode */

const OTHER = { '3H4M': '4H3M', '4H3M': '3H4M' };

/**
 * Ratio aplicable al gol de índice n (1 = primer gol), dada la opción elegida para el primer gol.
 * @param {MixRatioCode} firstForGoalOne
 * @param {number} goalIndex - 1-based
 * @returns {MixRatioCode|null}
 */
export function getRatioForGoalIndex(firstForGoalOne, goalIndex) {
  if (firstForGoalOne !== '3H4M' && firstForGoalOne !== '4H3M') return null;
  const n = Number(goalIndex);
  if (!Number.isFinite(n) || n < 1) return null;
  if (n === 1) return firstForGoalOne;
  const pairGroup = Math.floor((n - 2) / 2);
  return pairGroup % 2 === 0 ? OTHER[firstForGoalOne] : firstForGoalOne;
}

export function mixRatioImageSrc(code) {
  if (code === '3H4M') return '/3h_4m.jpg';
  if (code === '4H3M') return '/4h_3m.jpg';
  return null;
}

/**
 * Cuenta goles con par GOAL+AST completo (misma lógica que deriveOffenseTeamId en live).
 * @param {Array} events
 * @returns {number}
 */
export function countCompletedGoals(events) {
  const sorted = [...(events || [])].sort((a, b) => Number(a.event_id) - Number(b.event_id));
  const byTime = new Map();
  for (const ev of sorted) {
    const ty = String(ev.event_type || '').toUpperCase();
    if (ty !== 'GOAL' && ty !== 'AST') continue;
    const k = ev.event_time;
    if (!byTime.has(k)) byTime.set(k, {});
    byTime.get(k)[ty] = ev;
  }
  let n = 0;
  const emitted = new Set();
  for (const ev of sorted) {
    if (String(ev.event_type || '').toUpperCase() !== 'GOAL') continue;
    const k = ev.event_time;
    if (emitted.has(k)) continue;
    const b = byTime.get(k);
    if (!b?.GOAL || !b?.AST) continue;
    emitted.add(k);
    n += 1;
  }
  return n;
}
