import { useEffect, useMemo, useState } from 'react';
import { configService } from '../services/configService';
import { isFootballSport } from '../utils/tournamentSport';

/**
 * Carga sport_id / sport_name del torneo y expone isFootballTournament unificado.
 * @param {string|number|null|undefined} tournamentId
 */
export function useTournamentSport(tournamentId) {
  const [sportId, setSportId] = useState(null);
  const [sportName, setSportName] = useState('');
  const [tournamentName, setTournamentName] = useState('');
  const [tournamentImageUrl, setTournamentImageUrl] = useState('');
  const [loading, setLoading] = useState(Boolean(tournamentId));

  useEffect(() => {
    if (!tournamentId) {
      setSportId(null);
      setSportName('');
      setTournamentName('');
      setTournamentImageUrl('');
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);

    configService
      .getTournamentById(tournamentId)
      .then((res) => {
        if (cancelled) return;
        const tournament = res?.success ? res.data?.tournament : null;
        setSportId(tournament?.sport_id ?? null);
        setSportName(tournament?.sport_name ?? '');
        setTournamentName(tournament?.name || '');
        setTournamentImageUrl(tournament?.image_url || '');
      })
      .catch(() => {
        if (!cancelled) {
          setSportId(null);
          setSportName('');
          setTournamentName('');
          setTournamentImageUrl('');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tournamentId]);

  const isFootballTournament = useMemo(
    () => isFootballSport({ sportId, sportName }),
    [sportId, sportName]
  );

  return {
    sportId,
    sportName,
    tournamentName,
    tournamentImageUrl,
    isFootballTournament,
    loading
  };
}
