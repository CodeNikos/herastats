import { useEffect, useState } from 'react';
import { FIFA_WC_TOURNAMENT_ID } from '../config/fifaWcConfig';
import { configService } from '../services/configService';

let cachedId = null;
let inflight = null;

function fetchFifaWcTournamentId() {
  if (cachedId != null) return Promise.resolve(cachedId);
  if (!inflight) {
    inflight = configService
      .getAppSettings()
      .then((res) => {
        const fromApi = Number(res?.data?.fifaWcTournamentId);
        const resolved =
          Number.isInteger(fromApi) && fromApi > 0 ? fromApi : FIFA_WC_TOURNAMENT_ID;
        cachedId = resolved;
        return resolved;
      })
      .catch(() => {
        cachedId = FIFA_WC_TOURNAMENT_ID;
        return cachedId;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/**
 * Torneo WC (Anexo C, auto slots 3X): API (TOURNAMENT_2_SYNC_TARGET_TOURNAMENT_ID)
 * con fallback a REACT_APP_FIFA_WC_TOURNAMENT_ID del build.
 */
export function useFifaWcTournamentId() {
  const [fifaWcTournamentId, setFifaWcTournamentId] = useState(cachedId ?? FIFA_WC_TOURNAMENT_ID);
  const [loading, setLoading] = useState(cachedId == null);

  useEffect(() => {
    let cancelled = false;
    fetchFifaWcTournamentId().then((id) => {
      if (!cancelled) {
        setFifaWcTournamentId(id);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { fifaWcTournamentId, loading };
}
