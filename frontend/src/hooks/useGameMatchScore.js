import { useCallback, useEffect, useRef, useState } from 'react';
import { configService } from '../services/configService';
import {
  HERASTATS_GAMES_CHANGED_STORAGE,
  HERASTATS_TOURNAMENT_COHERENCE,
  normalizeTournamentIdForCoherence
} from '../utils/tournamentSync';

/**
 * Marcador por partido según agregado de eventos en BD (GET …/goal-totals).
 *
 * Tras el primer resultado válido, los refetches periódicos no ponen `loading=true`
 * para evitar que la UI del marcador parpadee (p. ej. "—" cada pocos segundos).
 *
 * @param {string|number|null|undefined} tournamentId
 * @param {string|number|null|undefined} gameId
 * @param {{ enabled?: boolean, refetchIntervalMs?: number }} [options]
 */
export function useGameMatchScore(tournamentId, gameId, options = {}) {
  const { enabled: enabledOption = true, refetchIntervalMs } = options;

  const hasIds =
    tournamentId != null &&
    gameId != null &&
    String(tournamentId).trim() !== '' &&
    String(gameId).trim() !== '';
  const enabled = Boolean(enabledOption && hasIds);

  const [localGoals, setLocalGoals] = useState(0);
  const [visitorGoals, setVisitorGoals] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /** Torneo/partido actual del último fetch; si cambian, volvemos a mostrar estado de carga inicial. */
  const scoreKeyRef = useRef('');
  /** Ya hubo una respuesta exitosa para ese par (refetch en silencio). */
  const hasScoreDataRef = useRef(false);

  const load = useCallback(async () => {
    if (!enabled) {
      scoreKeyRef.current = '';
      hasScoreDataRef.current = false;
      setLocalGoals(0);
      setVisitorGoals(0);
      setError(null);
      setLoading(false);
      return;
    }

    const scoreKey = `${String(tournamentId)}:${String(gameId)}`;
    if (scoreKeyRef.current !== scoreKey) {
      scoreKeyRef.current = scoreKey;
      hasScoreDataRef.current = false;
    }

    if (!hasScoreDataRef.current) {
      setLoading(true);
    }
    setError(null);
    try {
      const res = await configService.getGameGoalTotals(tournamentId, gameId);
      if (res?.success && res.data) {
        setLocalGoals(Number(res.data.local_goals) || 0);
        setVisitorGoals(Number(res.data.visitor_goals) || 0);
        hasScoreDataRef.current = true;
      } else {
        setError(res?.message || 'No se pudo cargar el marcador.');
      }
    } catch (e) {
      setError(e.response?.data?.message || e.message || 'Error al cargar el marcador.');
    } finally {
      setLoading(false);
    }
  }, [enabled, tournamentId, gameId]);

  useEffect(() => {
    load();
  }, [load]);

  /** Stats / Pool & brackets / calendario: mismo torneo debe volver a leer marcador tras FINALIZAR desde live */
  useEffect(() => {
    if (!enabled) return undefined;
    const tidNorm = normalizeTournamentIdForCoherence(tournamentId);
    if (!tidNorm) return undefined;

    const onCoherence = (event) => {
      if (!event?.detail) return;
      if (normalizeTournamentIdForCoherence(event.detail.tournamentId) !== tidNorm) return;
      load();
    };

    const onStorage = (e) => {
      if (e.key !== HERASTATS_GAMES_CHANGED_STORAGE || !e.newValue) return;
      try {
        const p = JSON.parse(e.newValue);
        if (p && normalizeTournamentIdForCoherence(p.tournamentId) === tidNorm) load();
      } catch (_) {
        /* ignorar */
      }
    };

    window.addEventListener(HERASTATS_TOURNAMENT_COHERENCE, onCoherence);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(HERASTATS_TOURNAMENT_COHERENCE, onCoherence);
      window.removeEventListener('storage', onStorage);
    };
  }, [enabled, tournamentId, load]);

  useEffect(() => {
    if (!enabled || refetchIntervalMs == null || refetchIntervalMs <= 0) {
      return undefined;
    }
    const id = setInterval(() => {
      load();
    }, refetchIntervalMs);
    return () => clearInterval(id);
  }, [enabled, refetchIntervalMs, load]);

  const refetch = useCallback(() => load(), [load]);

  return {
    localGoals,
    visitorGoals,
    loading,
    error,
    refetch
  };
}