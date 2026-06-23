import { useEffect, useMemo, useState } from 'react';
import { configService } from '../services/configService';
import { mapTournamentGamesToScheduleRows } from '../utils/scheduleGameMapper';
import { parseTournamentId } from './useResolvedTournamentId';

/**
 * Carga torneos + partidos para calendario / anotación.
 * Con `tournamentId` solo trae ese torneo; si no, agrega todos (vista global).
 */
export function useTournamentScheduleData(tournamentId, variant = 'calendar') {
  const pinnedId = parseTournamentId(tournamentId);
  const [tournaments, setTournaments] = useState([]);
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      try {
        setLoading(true);
        setError('');
        setTournaments([]);
        setGames([]);

        if (pinnedId != null) {
          const [tournamentRes, teamsRes, gamesRes] = await Promise.all([
            configService.getTournamentById(pinnedId),
            configService.getTeams(pinnedId),
            configService.getGames(pinnedId)
          ]);
          if (cancelled) return;

          const tournament = tournamentRes?.success ? tournamentRes.data?.tournament : null;
          if (!tournament) {
            setError('No se encontró el torneo seleccionado.');
            return;
          }

          const tournamentsData = [tournament];
          const mergedGames = mapTournamentGamesToScheduleRows({
            tournamentsData,
            teamsResponses: [{ status: 'fulfilled', value: teamsRes }],
            gameResponses: [{ status: 'fulfilled', value: gamesRes }],
            variant
          });

          setTournaments(tournamentsData);
          setGames(mergedGames);
          return;
        }

        // Anotación: sin torneo en URL no cargar listados globales.
        if (variant === 'anotacion') {
          setTournaments([]);
          setGames([]);
          return;
        }

        const tournamentsResponse = await configService.getTournaments();
        if (cancelled) return;

        if (!tournamentsResponse.success) {
          throw new Error(tournamentsResponse.message || 'No se pudieron cargar los torneos.');
        }

        const tournamentsData = tournamentsResponse.data?.tournaments || [];
        setTournaments(tournamentsData);

        if (tournamentsData.length === 0) return;

        const [teamsResponses, gameResponses] = await Promise.all([
          Promise.allSettled(tournamentsData.map((tournament) => configService.getTeams(tournament.torneo_id))),
          Promise.allSettled(tournamentsData.map((tournament) => configService.getGames(tournament.torneo_id)))
        ]);
        if (cancelled) return;

        setGames(
          mapTournamentGamesToScheduleRows({
            tournamentsData,
            teamsResponses,
            gameResponses,
            variant
          })
        );
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.response?.data?.message || loadError.message || 'Error al cargar datos.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadData();
    return () => {
      cancelled = true;
    };
  }, [pinnedId, variant]);

  const activeTournament = useMemo(() => {
    if (pinnedId != null) {
      return tournaments.find((t) => Number(t.torneo_id) === pinnedId) || null;
    }
    return tournaments[0] || null;
  }, [tournaments, pinnedId]);

  return {
    tournaments,
    games,
    loading,
    error,
    tournamentId: pinnedId,
    activeTournament
  };
}
