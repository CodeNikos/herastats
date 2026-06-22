import { useEffect, useMemo, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

export function parseTournamentId(value) {
  if (value == null || String(value).trim() === '') return null;
  const n = Number(String(value).trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Torneo activo: prop explícita > ruta (:id, :tournamentId) > query ?tournamentId=
 * Siempre usar este hook (o pasar tournamentId al Navbar) para no mezclar torneos.
 */
export function useResolvedTournamentId(explicitId = null) {
  const params = useParams();
  const [searchParams] = useSearchParams();

  return useMemo(() => {
    const fromProp = parseTournamentId(explicitId);
    if (fromProp != null) return fromProp;

    const fromRoute = parseTournamentId(params.id ?? params.tournamentId);
    if (fromRoute != null) return fromRoute;

    return parseTournamentId(searchParams.get('tournamentId'));
  }, [explicitId, params.id, params.tournamentId, searchParams]);
}

/**
 * Ejecuta reset al cambiar de torneo (evita mostrar datos del torneo anterior mientras carga).
 * @param {number|string|null} tournamentId
 * @param {() => void} onReset
 */
export function useTournamentPageReset(tournamentId, onReset) {
  const prevRef = useRef(tournamentId);
  useEffect(() => {
    if (prevRef.current === tournamentId) return;
    prevRef.current = tournamentId;
    onReset();
  }, [tournamentId, onReset]);
}
