import { useCallback, useEffect, useRef } from 'react';
import { fetchTournamentStandingsInventory } from '../utils/tournamentStandingsRefresh';

/**
 * Refresca inventario de equipos/partidos para standings en bracket.
 */
export function useTournamentStandingsRefresh(tournamentId, selectedDivision, onInventory, options = {}) {
  const { enabled = true, intervalMs = 0, deps = [] } = options;
  const onInventoryRef = useRef(onInventory);
  onInventoryRef.current = onInventory;

  const refresh = useCallback(async () => {
    if (!enabled || !tournamentId || String(selectedDivision || '').trim() === '') {
      return { cancelled: false };
    }
    try {
      const inventory = await fetchTournamentStandingsInventory(tournamentId);
      onInventoryRef.current(inventory);
      return { cancelled: false, inventory };
    } catch {
      return { cancelled: false };
    }
  }, [enabled, tournamentId, selectedDivision]);

  useEffect(() => {
    if (!intervalMs || intervalMs <= 0) return undefined;
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      await refresh();
    };
    tick();
    const id = window.setInterval(tick, intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [intervalMs, refresh, ...deps]);

  return { refresh };
}
