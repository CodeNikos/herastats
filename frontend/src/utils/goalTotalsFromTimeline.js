/**
 * Reparto local/visitante de goles desde la línea temporal (game_events ya cargados en cliente).
 * Misma filosofía que `Game.computeGoalTotalsFromEvents` en backend: sin servidor extra cuando
 * el GET goal-totals devuelve 0 pero los eventos GOAL están en pantalla.
 *
 * @param {Array<{ event_type?: string, goals?: number, team_id?: number|null, player_team_id?: number|null }>} events
 * @param {number|undefined|null} localTeamId
 * @param {number|undefined|null} visitorTeamId
 */
export function goalTotalsFromTimelineEvents(events, localTeamId, visitorTeamId) {
  const localDb =
    localTeamId != null && Number.isFinite(Number(localTeamId)) && Number(localTeamId) > 0
      ? Number(localTeamId)
      : null;
  const visitorDb =
    visitorTeamId != null && Number.isFinite(Number(visitorTeamId)) && Number(visitorTeamId) > 0
      ? Number(visitorTeamId)
      : null;
  const hasLocal = localDb != null;
  const hasVisitor = visitorDb != null;

  /** @type {Map<number, number>} */
  const byTeam = new Map();
  if (!Array.isArray(events)) {
    return { local_goals: 0, visitor_goals: 0 };
  }
  for (const ev of events) {
    const ty = String(ev?.event_type ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
    if (!['GOAL', 'PENALTY', 'OWN_GOAL'].includes(ty)) continue;
    const gRaw = ev.goals !== undefined && ev.goals !== null ? Number(ev.goals) : 1;
    const gInc = Number.isFinite(gRaw) && gRaw > 0 ? gRaw : 1;
    const tidRaw =
      ev.team_id != null && ev.team_id !== ''
        ? ev.team_id
        : ev.player_team_id != null && ev.player_team_id !== ''
          ? ev.player_team_id
          : null;
    const tidNum = tidRaw != null ? Number(tidRaw) : NaN;
    if (!Number.isFinite(tidNum) || tidNum <= 0) continue;
    byTeam.set(tidNum, (byTeam.get(tidNum) || 0) + gInc);
  }

  let localGoals = 0;
  let visitorGoals = 0;
  let orphanGoals = 0;

  if (hasLocal && hasVisitor) {
    for (const [tid, gc] of byTeam) {
      if (tid === localDb) localGoals += gc;
      else if (tid === visitorDb) visitorGoals += gc;
      else orphanGoals += gc;
    }
    if (orphanGoals > 0 && localGoals === 0 && visitorGoals === 0 && byTeam.size <= 2) {
      const ids = [...byTeam.keys()].sort((a, b) => a - b);
      localGoals = ids[0] != null ? byTeam.get(ids[0]) || 0 : 0;
      visitorGoals = ids[1] != null ? byTeam.get(ids[1]) || 0 : 0;
    }
  } else if (hasLocal && !hasVisitor) {
    for (const [tid, gc] of byTeam) {
      if (tid === localDb) localGoals += gc;
      else visitorGoals += gc;
    }
  } else if (!hasLocal && hasVisitor) {
    for (const [tid, gc] of byTeam) {
      if (tid === visitorDb) visitorGoals += gc;
      else localGoals += gc;
    }
  } else {
    const ids = [...byTeam.keys()].sort((a, b) => a - b);
    if (ids.length === 1) {
      localGoals = byTeam.get(ids[0]) || 0;
    } else if (ids.length >= 2) {
      const ranked = [...byTeam.entries()].sort((aa, bb) => {
        const gd = bb[1] - aa[1];
        if (gd !== 0) return gd;
        return aa[0] - bb[0];
      });
      const topTwo = ranked.slice(0, 2).sort((a, b) => a[0] - b[0]);
      localGoals = topTwo[0][1];
      visitorGoals = topTwo[1][1];
    }
  }

  return {
    local_goals: Math.floor(localGoals),
    visitor_goals: Math.floor(visitorGoals)
  };
}
