import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { IoArrowBackSharp, IoCalendarOutline, IoLocationOutline, IoPeopleOutline, IoFootballOutline, IoLayersOutline, IoPersonOutline, IoFootball } from 'react-icons/io5';
import { configService } from '../services/configService';
import Navbar from '../components/navbar';
import Noauth_Navbar from '../components/noauth_Navbar';
import SeoHead from '../components/SeoHead';
import { DEFAULT_SITE_TITLE } from '../config/siteConfig';
import { buildSportsOrganizationJsonLd } from '../utils/seoJsonLd';
import { useAuth } from '../hooks/useAuth';
import { isFootballSport } from '../utils/tournamentSport';
import './tourn_home.css';

function Tourn_home() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const hasToken = localStorage.getItem('token') !== null;
  const isUserAuthenticated = isAuthenticated || hasToken;

  const [tournament, setTournament] = useState(null);
  const [overviewStats, setOverviewStats] = useState({
    teams: 0,
    games: 0,
    players: 0,
    goals: 0,
    yellowcards: 0,
    redcards: 0,
    ownGoals: 0,
    divisions: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadTournament = async () => {
      if (!id) {
        setError('ID de torneo no válido');
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        setError(null);
        const response = await configService.getTournamentById(id);
        if (response.success && response.data?.tournament) {
          const tournamentData = response.data.tournament;
          setTournament(tournamentData);
          const isFootballTournament = isFootballSport({
            sport_id: tournamentData.sport_id,
            sport_name: tournamentData.sport_name
          });

          const statsRequests = [
            configService.getTeams(id),
            configService.getGames(id),
            configService.getPlayers(id)
          ];
          if (isFootballTournament) {
            statsRequests.push(configService.getTournamentPlayerEventStats(id));
          }

          const settled = await Promise.allSettled(statsRequests);
          const teamsResponse = settled[0];
          const gamesResponse = settled[1];
          const playersResponse = settled[2];
          const playerStatsResponse = isFootballTournament ? settled[3] : null;

          const teams = teamsResponse.status === 'fulfilled' && teamsResponse.value?.success ? teamsResponse.value?.data?.teams || [] : [];
          const games = gamesResponse.status === 'fulfilled' && gamesResponse.value?.success ? gamesResponse.value?.data?.games || [] : [];
          const players = playersResponse.status === 'fulfilled' && playersResponse.value?.success ? playersResponse.value?.data?.players || [] : [];
          const playerStatsRows = isFootballTournament
            && playerStatsResponse?.status === 'fulfilled'
            && playerStatsResponse.value?.success
            ? playerStatsResponse.value?.data?.players
              || playerStatsResponse.value?.data?.playerStats
              || playerStatsResponse.value?.data?.stats
              || []
            : [];
          const goals = isFootballTournament
            ? playerStatsRows.reduce((sum, row) => sum + (Number(row.goals) || 0), 0)
            : 0;
          const yellowcards = isFootballTournament
            ? playerStatsRows.reduce((sum, row) => sum + (Number(row.yellowcards) || 0), 0)
            : 0;
          const redcards = isFootballTournament
            ? playerStatsRows.reduce((sum, row) => sum + (Number(row.redcards) || 0), 0)
            : 0;
          const ownGoals = isFootballTournament
            ? playerStatsRows.reduce((sum, row) => sum + (Number(row.own_goals) || 0), 0)
            : 0;
          const divisions = new Set(
            teams
              .map((team) => (team.division != null ? String(team.division).trim() : ''))
              .filter(Boolean)
          ).size;

          setOverviewStats({
            teams: teams.length,
            games: games.length,
            players: players.length,
            goals,
            yellowcards,
            redcards,
            ownGoals,
            divisions
          });
        } else {
          setError('No se pudo cargar el torneo');
        } 
      } catch (err) {
        console.error('Error al cargar torneo:', err);
        setError(err.response?.status === 404
          ? 'Torneo no encontrado'
          : 'Error al cargar el torneo. Intenta de nuevo.');
      } finally {
        setLoading(false);
      }
    };

    loadTournament();
  }, [id]);

  const isFootballTournament = isFootballSport({
    sport_id: tournament?.sport_id,
    sport_name: tournament?.sport_name
  });

  return (
    <div className="home_container">
      {tournament ? (
        <SeoHead
          title={`${tournament.name} | ${DEFAULT_SITE_TITLE}`}
          description={`Información, equipos y estadísticas del torneo ${tournament.name}${tournament.year ? ` (${tournament.year})` : ''}.`}
          pathname={`/tourn_home/${id}`}
          image={tournament.image_url || undefined}
          jsonLd={buildSportsOrganizationJsonLd({ ...tournament, torneo_id: id })}
        />
      ) : null}
      <div className="topbar_home">
        {isUserAuthenticated ? <Navbar tournamentId={id} /> : <Noauth_Navbar />}
      </div>
      <div className="body_container_home">
        {loading ? (
          <div className="loading_message">Cargando torneo...</div>
        ) : error ? (
          <div className="error_message">
            <p>{error}</p>
            <button
              type="button"
              className="create_tournament_link tourn_home_error_button"
              onClick={() => navigate('/home')}
            >
              Volver al inicio
            </button>
          </div>
        ) : tournament ? (
          <div className="tourn_home_detail">
            <IoArrowBackSharp
              className="tourn_home_back"
              onClick={() => navigate('/home')}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  navigate('/home');
                }
              }}
              role="button"
              tabIndex={0}
              aria-label="Volver a torneos"
            />
            <div className="tourn_home_card">
              {tournament.image_url ? (
                <div className="tournament_card_image tourn_home_image">
                  <img src={tournament.image_url} alt={tournament.name} />
                </div>
              ) : (
                <div className="tournament_card_placeholder tourn_home_placeholder">
                  <span>Sin imagen</span>
                </div>
              )}
              <div className="tournament_card_content tourn_home_content">
                <h1 className="tournament_card_title tourn_home_title">
                  {tournament.name}
                </h1>
                <div className="tourn_home_meta">
                  <span>
                    <IoCalendarOutline />
                    {tournament.year || 'Sin año'}
                  </span>
                  {tournament.country ? (
                    <span>
                      <IoLocationOutline />
                      {tournament.country}
                    </span>
                  ) : null}
                </div>
                <div className="tourn_home_stats">
                  <article className="tourn_home_stat_card">
                    <IoPeopleOutline />
                    <strong>{overviewStats.teams}</strong>
                    <small>Equipos</small>
                  </article>
                  <article className="tourn_home_stat_card">
                    <IoFootballOutline />
                    <strong>{overviewStats.games}</strong>
                    <small>Juegos</small>
                  </article>
                  <article className="tourn_home_stat_card">
                    <IoPersonOutline />
                    <strong>{overviewStats.players}</strong>
                    <small>Jugadores</small>
                  </article>
                  {isFootballTournament ? (
                    <>
                      <article className="tourn_home_stat_card">
                        <IoFootball />
                        <strong>{overviewStats.goals}</strong>
                        <small>Goles</small>
                      </article>
                      <article className="tourn_home_stat_card tourn_home_stat_card--yc">
                        <span className="tourn_home_stat_icon tourn_home_stat_icon--yc" aria-hidden />
                        <strong>{overviewStats.yellowcards}</strong>
                        <small>Amarillas</small>
                      </article>
                      <article className="tourn_home_stat_card tourn_home_stat_card--rc">
                        <span className="tourn_home_stat_icon tourn_home_stat_icon--rc" aria-hidden />
                        <strong>{overviewStats.redcards}</strong>
                        <small>Rojas</small>
                      </article>
                      <article className="tourn_home_stat_card tourn_home_stat_card--og">
                        <span className="tourn_home_stat_icon tourn_home_stat_icon--og" aria-hidden>
                          OG
                        </span>
                        <strong>{overviewStats.ownGoals}</strong>
                        <small>Autogoles</small>
                      </article>
                    </>
                  ) : null}
                  <article className="tourn_home_stat_card">
                    <IoLayersOutline />
                    <strong>{overviewStats.divisions}</strong>
                    <small>Divisiones</small>
                  </article>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default Tourn_home;
