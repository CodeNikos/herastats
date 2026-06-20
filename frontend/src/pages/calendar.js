import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/navbar';
import Noauth_Navbar from '../components/noauth_Navbar';
import SeoHead from '../components/SeoHead';
import { DEFAULT_SITE_DESCRIPTION, DEFAULT_SITE_TITLE } from '../config/siteConfig';
import { useAuth } from '../hooks/useAuth';
import { useGameMatchScore } from '../hooks/useGameMatchScore';
import { useResolvedTournamentId } from '../hooks/useResolvedTournamentId';
import { useTournamentScheduleData } from '../hooks/useTournamentScheduleData';
import {
  formatDateHeader,
  formatGameDateTime,
  formatGameNumCell,
  getMatchWinner,
  parseScoreValue
} from '../utils/gameDisplayFormat';
import './calendar.css';

const TEAM_FALLBACK_IMAGE = '/Hera_logo.png';

/** Una fila del calendario: marcador desde goal-totals (eventos), con fallback al listado getGames. */
function CalendarScheduleTableRow({ game }) {
  const { localGoals, visitorGoals, loading, error } = useGameMatchScore(game.tournamentId, game.id, {
    enabled: Boolean(game.tournamentId && game.id)
  });

  const fallbackHome = parseScoreValue(game.homeScore);
  const fallbackAway = parseScoreValue(game.awayScore);

  let homePts;
  let awayPts;
  if (error) {
    homePts = fallbackHome;
    awayPts = fallbackAway;
  } else if (!loading) {
    homePts = localGoals;
    awayPts = visitorGoals;
  } else if (fallbackHome !== null || fallbackAway !== null) {
    homePts = fallbackHome;
    awayPts = fallbackAway;
  } else {
    homePts = null;
    awayPts = null;
  }

  const winner = getMatchWinner(homePts, awayPts);
  const homeBold = winner === 'home';
  const awayBold = winner === 'away';
  const scoreLabel =
    homePts !== null && awayPts !== null
      ? `${homePts} - ${awayPts}`
      : homePts !== null || awayPts !== null
        ? `${homePts ?? '—'} - ${awayPts ?? '—'}`
        : '—';

  const gameSearch = new URLSearchParams();
  gameSearch.set('gameId', String(game.id));
  gameSearch.set('tournamentId', String(game.tournamentId));
  if (game.homeTeamId != null) gameSearch.set('homeTeamId', String(game.homeTeamId));
  if (game.awayTeamId != null) gameSearch.set('awayTeamId', String(game.awayTeamId));

  return (
    <tr>
      <td className="calendar-td-datetime">
        <span className="calendar-datetime-text">{formatGameDateTime(game.date, game.time)}</span>
      </td>
      <td className="calendar-td-game-num" title={formatGameNumCell(game.gameNum)}>
        <span className="calendar-game-num-text">{formatGameNumCell(game.gameNum)}</span>
      </td>
      <td className="calendar-td-team calendar-td-team-home">
        <span className="calendar-team-cell">
          <img
            className="calendar-team-logo"
            src={game.homeTeamImage || TEAM_FALLBACK_IMAGE}
            alt=""
            loading="lazy"
            decoding="async"
            onError={(event) => {
              if (!event.currentTarget.src.includes(TEAM_FALLBACK_IMAGE)) {
                event.currentTarget.src = TEAM_FALLBACK_IMAGE;
              }
            }}
          />
          <span className={homeBold ? 'calendar-team-name calendar-team-name-winner' : 'calendar-team-name'}>
            {game.homeTeamName}
          </span>
        </span>
      </td>
      <td className="calendar-td-score">
        <Link className="calendar-score-link" to={`/game?${gameSearch.toString()}`} title="Ver partido">
          <span className="calendar-score-inner">
            {winner === 'home' ? <span className="calendar-score-arrow">&#9664;</span> : null}
            <span className="calendar-score-numbers">{scoreLabel}</span>
            {winner === 'away' ? <span className="calendar-score-arrow">&#9654;</span> : null}
          </span>
        </Link>
      </td>
      <td className="calendar-td-team calendar-td-team-away">
        <span className="calendar-team-cell">
          <span className={awayBold ? 'calendar-team-name calendar-team-name-winner' : 'calendar-team-name'}>
            {game.awayTeamName}
          </span>
          <img
            className="calendar-team-logo"
            src={game.awayTeamImage || TEAM_FALLBACK_IMAGE}
            alt=""
            loading="lazy"
            decoding="async"
            onError={(event) => {
              if (!event.currentTarget.src.includes(TEAM_FALLBACK_IMAGE)) {
                event.currentTarget.src = TEAM_FALLBACK_IMAGE;
              }
            }}
          />
        </span>
      </td>
      <td className="calendar-td-meta">{[game.category, game.phaseName].filter(Boolean).join(' · ') || '—'}</td>
      <td className="calendar-td-meta">{game.place || '—'}</td>
      <td className="calendar-td-meta calendar-td-estado" title={game.estado || undefined}>
        {game.estado || '—'}
      </td>
    </tr>
  );
}

function CalendarPage() {
  const { isAuthenticated } = useAuth();
  const hasToken = localStorage.getItem('token') !== null;
  const isUserAuthenticated = isAuthenticated || hasToken;

  const tournamentId = useResolvedTournamentId();
  const { tournaments, games, loading, error, activeTournament } = useTournamentScheduleData(tournamentId, 'calendar');

  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedDate, setSelectedDate] = useState('all');
  const [selectedTeam, setSelectedTeam] = useState('all');
  const [selectedLocation, setSelectedLocation] = useState('all');

  const pinnedTournamentName =
    activeTournament?.name != null && String(activeTournament.name).trim() !== ''
      ? String(activeTournament.name).trim()
      : '';

  useEffect(() => {
    setSelectedCategory('all');
    setSelectedDate('all');
    setSelectedTeam('all');
    setSelectedLocation('all');
  }, [tournamentId]);

  const orderedGames = useMemo(() => {
    return [...games].sort((a, b) => {
      const aValue = `${a.date}T${a.time || '00:00'}`;
      const bValue = `${b.date}T${b.time || '00:00'}`;
      const cmp = aValue.localeCompare(bValue);
      if (cmp !== 0) return cmp;
      const aGameNum =
        typeof a.gameNum === 'number' && Number.isFinite(a.gameNum) ? a.gameNum : Number.MAX_SAFE_INTEGER;
      const bGameNum =
        typeof b.gameNum === 'number' && Number.isFinite(b.gameNum) ? b.gameNum : Number.MAX_SAFE_INTEGER;
      return aGameNum - bGameNum;
    });
  }, [games]);

  const categoryOptions = useMemo(
    () => [...new Set(orderedGames.map((game) => game.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')),
    [orderedGames]
  );

  const categoryFilteredGames = useMemo(() => {
    if (selectedCategory === 'all') return orderedGames;
    return orderedGames.filter((game) => game.category === selectedCategory);
  }, [orderedGames, selectedCategory]);

  const dateFilteredGames = useMemo(() => {
    if (selectedDate === 'all') return categoryFilteredGames;
    return categoryFilteredGames.filter((game) => game.date === selectedDate);
  }, [categoryFilteredGames, selectedDate]);

  const dateOptions = useMemo(
    () => [...new Set(categoryFilteredGames.map((game) => game.date).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [categoryFilteredGames]
  );

  const teamOptions = useMemo(() => {
    const names = new Set();
    dateFilteredGames.forEach((game) => {
      if (game.homeTeamName) names.add(game.homeTeamName);
      if (game.awayTeamName) names.add(game.awayTeamName);
    });
    return [...names].sort((a, b) => a.localeCompare(b, 'es'));
  }, [dateFilteredGames]);

  const teamFilteredGames = useMemo(() => {
    if (selectedTeam === 'all') return dateFilteredGames;
    return dateFilteredGames.filter(
      (game) => game.homeTeamName === selectedTeam || game.awayTeamName === selectedTeam
    );
  }, [dateFilteredGames, selectedTeam]);

  const locationOptions = useMemo(() => {
    const hasEmpty = teamFilteredGames.some((game) => !(game.place || '').trim());
    const places = [
      ...new Set(teamFilteredGames.map((game) => (game.place || '').trim()).filter(Boolean))
    ].sort((a, b) => a.localeCompare(b, 'es'));
    return { places, hasEmpty };
  }, [teamFilteredGames]);

  const filteredGames = useMemo(() => {
    if (selectedLocation === 'all') return teamFilteredGames;
    if (selectedLocation === '__empty__') {
      return teamFilteredGames.filter((game) => !(game.place || '').trim());
    }
    return teamFilteredGames.filter((game) => (game.place || '').trim() === selectedLocation);
  }, [teamFilteredGames, selectedLocation]);

  useEffect(() => {
    if (selectedDate !== 'all' && !dateOptions.includes(selectedDate)) {
      setSelectedDate('all');
    }
  }, [dateOptions, selectedDate]);

  useEffect(() => {
    if (selectedTeam !== 'all' && !teamOptions.includes(selectedTeam)) {
      setSelectedTeam('all');
    }
  }, [teamOptions, selectedTeam]);

  useEffect(() => {
    if (selectedLocation === 'all') return;
    if (selectedLocation === '__empty__') {
      if (!locationOptions.hasEmpty) setSelectedLocation('all');
      return;
    }
    if (!locationOptions.places.includes(selectedLocation)) {
      setSelectedLocation('all');
    }
  }, [locationOptions, selectedLocation]);

  return (
    <div className="calendar-page">
      <SeoHead
        title={
          pinnedTournamentName
            ? `Calendario — ${pinnedTournamentName} | ${DEFAULT_SITE_TITLE}`
            : `Calendario de torneos | ${DEFAULT_SITE_TITLE}`
        }
        description={
          pinnedTournamentName
            ? `Partidos, horarios y resultados del torneo ${pinnedTournamentName}.`
            : 'Consulta el calendario de partidos de todos los torneos en Herastats.'
        }
        pathname="/calendar"
        search={tournamentId ? `tournamentId=${tournamentId}` : ''}
        image={activeTournament?.image_url || undefined}
      />
      <div className="calendar-topbar">
        {isUserAuthenticated ? <Navbar tournamentId={tournamentId} /> : <Noauth_Navbar />}
      </div>

      <main className="calendar-content">
        <header className="calendar-header">
          <h1>Calendario de Torneo</h1>
          {tournamentId != null ? (
            <p className="calendar-pinned-hint">
              Mostrando partidos de este torneo
              {pinnedTournamentName ? <strong>{` · ${pinnedTournamentName}`}</strong> : null}.
            </p>
          ) : null}
        </header>

        {!loading && !error && orderedGames.length > 0 ? (
          <div className="calendar-filter-row">
            <div className="calendar-filter-field">
              <label htmlFor="calendar-category-filter">Categoría:</label>
              <select
                id="calendar-category-filter"
                value={selectedCategory}
                onChange={(event) => setSelectedCategory(event.target.value)}
              >
                <option value="all">Todas</option>
                {categoryOptions.map((categoryOption) => (
                  <option key={categoryOption} value={categoryOption}>
                    {categoryOption}
                  </option>
                ))}
              </select>
            </div>

            <div className="calendar-filter-field">
              <label htmlFor="calendar-date-filter">Día:</label>
              <select
                id="calendar-date-filter"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
              >
                <option value="all">Todos</option>
                {dateOptions.map((dateOption) => (
                  <option key={dateOption} value={dateOption}>
                    {formatDateHeader(dateOption)}
                  </option>
                ))}
              </select>
            </div>

            <div className="calendar-filter-field">
              <label htmlFor="calendar-team-filter">Equipo:</label>
              <select
                id="calendar-team-filter"
                value={selectedTeam}
                onChange={(event) => setSelectedTeam(event.target.value)}
              >
                <option value="all">Todos</option>
                {teamOptions.map((teamName) => (
                  <option key={teamName} value={teamName}>
                    {teamName}
                  </option>
                ))}
              </select>
            </div>

            <div className="calendar-filter-field">
              <label htmlFor="calendar-location-filter">Ubicación:</label>
              <select
                id="calendar-location-filter"
                value={selectedLocation}
                onChange={(event) => setSelectedLocation(event.target.value)}
              >
                <option value="all">Todas</option>
                {locationOptions.hasEmpty ? (
                  <option value="__empty__">Sin ubicación</option>
                ) : null}
                {locationOptions.places.map((place) => (
                  <option key={place} value={place}>
                    {place}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : null}

        {!loading && !error && activeTournament ? (
          <section className="calendar-header-card-wrap">
            <article className="calendar-tournament-card">
              <div className="calendar-tournament-content">
                {activeTournament.image_url ? (
                  <img src={activeTournament.image_url} alt={activeTournament.name} loading="lazy" decoding="async" />
                ) : (
                  <div className="calendar-tournament-placeholder">Sin imagen</div>
                )}
                <div className="calendar-tournament-meta">
                  <h2>{activeTournament.name}</h2>
                  <p><strong>Año:</strong> {activeTournament.year}</p>
                  {activeTournament.country ? <p><strong>Pais:</strong> {activeTournament.country}</p> : null}
                </div>
              </div>
            </article>
          </section>
        ) : null}

        {loading ? <div className="calendar-state">Cargando juegos...</div> : null}
        {!loading && error ? <div className="calendar-state calendar-state-error">{error}</div> : null}

        {!loading && !error && tournaments.length === 0 ? (
          <div className="calendar-state">No hay torneos registrados todavia.</div>
        ) : null}

        {!loading && !error && tournaments.length > 0 && orderedGames.length === 0 ? (
          <div className="calendar-state">No hay juegos registrados todavia.</div>
        ) : null}

        {!loading && !error && tournaments.length > 0 && orderedGames.length > 0 && filteredGames.length === 0 ? (
          <div className="calendar-state">No hay juegos para los filtros seleccionados.</div>
        ) : null}

        {!loading && !error && filteredGames.length > 0 ? (
          <section className="calendar-games-section">
            <div className="calendar-table-wrap">
              <table className="calendar-schedule-table">
                <thead>
                  <tr>
                    <th className="calendar-th-datetime">Fecha y hora</th>
                    <th className="calendar-th-game-num">Nº juego</th>
                    <th className="calendar-th-team calendar-th-team-home">Local</th>
                    <th className="calendar-th-score">Marcador</th>
                    <th className="calendar-th-team calendar-th-team-away">Visitante</th>
                    <th className="calendar-th-meta">División</th>
                    <th className="calendar-th-meta">Ubicación</th>
                    <th className="calendar-th-meta calendar-th-estado">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredGames.map((game) => (
                    <CalendarScheduleTableRow key={`${game.tournamentId}-${game.id}`} game={game} />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}

export default CalendarPage;
