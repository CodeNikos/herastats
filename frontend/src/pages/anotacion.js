import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/navbar';
import Noauth_Navbar from '../components/noauth_Navbar';
import { useAuth } from '../hooks/useAuth';
import { useGameMatchScore } from '../hooks/useGameMatchScore';
import { useResolvedTournamentId } from '../hooks/useResolvedTournamentId';
import { useTournamentScheduleData } from '../hooks/useTournamentScheduleData';
import {
  isGameFinishedState,
  isGameOngoingState,
  isGameUpcomingState
} from '../utils/gameEstado';
import {
  formatDateHeader,
  formatGameDateTime,
  getMatchWinner,
  parseScoreValue
} from '../utils/gameDisplayFormat';
import { isFootballSport } from '../utils/tournamentSport';
import { isAdminOrSuperuser } from '../utils/userRoles';

import './anotacion.css';

const TEAM_FALLBACK_IMAGE = '/Hera_logo.png';

/** Celda División: en ranked «Mixto · placement» o «Mixto · Ranked» si no hay placement. */
const formatAnotacionDivisionCell = (game) => {
  const isRanked = String(game.canvasBracket || '').trim().toLowerCase() === 'ranked';
  const category = String(game.category || '').trim() || 'Sin categoría';
  const phase = String(game.phaseName || '').trim();

  if (!isRanked) {
    return [category, phase].filter(Boolean).join(' · ') || '—';
  }

  const placement = String(game.placement || '').trim();
  return placement ? `Mixto · ${placement}` : 'Mixto · Ranked';
};

const isEstadoOngoing = isGameOngoingState;
const isEstadoUpcoming = isGameUpcomingState;
const isEstadoFinished = isGameFinishedState;

/** Query compartida: previo al partido (game_events). */
function buildGameEventsPath(game) {
  const p = new URLSearchParams();
  p.set('tournamentId', String(game.tournamentId));
  p.set('gameId', String(game.id));
  if (game.gameNum != null && Number.isFinite(Number(game.gameNum))) {
    p.set('gameNum', String(game.gameNum));
  }
  if (game.homeTeamId != null) p.set('homeTeamId', String(game.homeTeamId));
  if (game.awayTeamId != null) p.set('awayTeamId', String(game.awayTeamId));
  p.set('homeTeamName', game.homeTeamName || '');
  p.set('awayTeamName', game.awayTeamName || '');
  if (game.category != null && String(game.category).trim() !== '') {
    p.set('division', String(game.category).trim());
  }
  return `/game_events?${p.toString()}`;
}

/** Partido en vivo (live.js). */
function buildLivePath(game) {
  const p = new URLSearchParams();
  p.set('tournamentId', String(game.tournamentId));
  p.set('gameId', String(game.id));
  if (game.gameNum != null && Number.isFinite(Number(game.gameNum))) {
    p.set('gameNum', String(game.gameNum));
  }
  if (game.homeTeamId != null) p.set('homeTeamId', String(game.homeTeamId));
  if (game.awayTeamId != null) p.set('awayTeamId', String(game.awayTeamId));
  p.set('homeTeamName', game.homeTeamName || '');
  p.set('awayTeamName', game.awayTeamName || '');
  return `/live?${p.toString()}`;
}

/** Resumen / stats del partido (GamePages — /game). */
function buildGamePagePath(game) {
  const p = new URLSearchParams();
  p.set('tournamentId', String(game.tournamentId));
  p.set('gameId', String(game.id));
  return `/game?${p.toString()}`;
}

/** Eventos post-partido fútbol (admin/superuser). */
function buildFootballEventsPath(game) {
  const p = new URLSearchParams();
  p.set('tournamentId', String(game.tournamentId));
  p.set('gameId', String(game.id));
  if (game.homeTeamId != null) p.set('homeTeamId', String(game.homeTeamId));
  if (game.awayTeamId != null) p.set('awayTeamId', String(game.awayTeamId));
  p.set('homeTeamName', game.homeTeamName || '');
  p.set('awayTeamName', game.awayTeamName || '');
  return `/football_events?${p.toString()}`;
}

/** Fila del panel: marcador desde goal-totals (eventos), con fallback al listado getGames. */
function AnotacionScheduleTableRow({
  game,
  navigate,
  onIrAPrevioPartido,
  canPostMatchFootball
}) {
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

  const livePath = buildLivePath(game);
  const footballEventsPath = buildFootballEventsPath(game);
  const ongoing = isEstadoOngoing(game.estado);
  const finished = isEstadoFinished(game.estado);
  const isFootball = isFootballSport({ sportId: game.sportId });
  const showFootballPostMatch = finished && isFootball && canPostMatchFootball;
  const actionDisabled = finished && !showFootballPostMatch;

  const gameNumLabel =
    game.gameNum != null && Number.isFinite(Number(game.gameNum)) && Number(game.gameNum) > 0
      ? `Juego ${Number(game.gameNum)}`
      : '—';

  const scoreInner = (
    <span className="anotacion-score-inner">
      {winner === 'home' ? <span className="anotacion-score-arrow">&#9664;</span> : null}
      <span className="anotacion-score-numbers">{scoreLabel}</span>
      {winner === 'away' ? <span className="anotacion-score-arrow">&#9654;</span> : null}
    </span>
  );

  return (
    <tr>
      <td className="anotacion-td-datetime">
        <span className="anotacion-datetime-text">{formatGameDateTime(game.date, game.time)}</span>
      </td>
      <td className="anotacion-td-game-num" title={game.gameNum ? `game_num=${game.gameNum}` : `game_id=${game.id}`}>
        <span className="anotacion-game-num-text">{gameNumLabel}</span>
      </td>
      <td className="anotacion-td-team anotacion-td-team-home">
        <span className="anotacion-team-cell">
          <img
            className="anotacion-team-logo"
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
          <span className={homeBold ? 'anotacion-team-name anotacion-team-name-winner' : 'anotacion-team-name'}>
            {game.homeTeamName}
          </span>
        </span>
      </td>
      <td className="anotacion-td-score">
        {finished ? (
          <button
            type="button"
            className="anotacion-score-display anotacion-score-display--finished-link"
            onClick={() => navigate(buildGamePagePath(game))}
            title="Ver resumen del partido"
          >
            {scoreInner}
          </button>
        ) : (
          <span className="anotacion-score-display">{scoreInner}</span>
        )}
      </td>
      <td className="anotacion-td-team anotacion-td-team-away">
        <span className="anotacion-team-cell">
          <span className={awayBold ? 'anotacion-team-name anotacion-team-name-winner' : 'anotacion-team-name'}>
            {game.awayTeamName}
          </span>
          <img
            className="anotacion-team-logo"
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
      <td className="anotacion-td-meta">{formatAnotacionDivisionCell(game)}</td>
      <td className="anotacion-td-meta">{game.place || '—'}</td>
      <td className="anotacion-td-meta anotacion-td-estado" title={game.estado || undefined}>
        {game.estado || '—'}
      </td>
      <td className="anotacion-td-meta anotacion-td-accion">
        <button
          type="button"
          className={`anotacion-anotar-btn${finished && !showFootballPostMatch ? ' anotacion-anotar-btn--finished' : ''}${ongoing ? ' anotacion-anotar-btn--ongoing' : ''}${showFootballPostMatch ? ' anotacion-anotar-btn--football-post' : ''}`}
          disabled={actionDisabled}
          onClick={() => {
            if (actionDisabled) return;
            if (showFootballPostMatch) {
              navigate(footballEventsPath);
              return;
            }
            if (ongoing) navigate(livePath);
            else onIrAPrevioPartido(game);
          }}
          title={
            showFootballPostMatch
              ? 'Anotar goles, tarjetas y penales (partido finalizado)'
              : finished
                ? 'Partido finalizado'
                : ongoing
                  ? 'Ir al partido en vivo (live)'
                  : isEstadoUpcoming(game.estado)
                    ? 'Previo al partido: posesión y arranque (game_events)'
                    : 'Ir a previo del partido (game_events)'
          }
        >
          {showFootballPostMatch ? 'Anotar eventos' : finished ? 'Finalizado' : ongoing ? 'Ingresar' : 'Comenzar partido'}
        </button>
      </td>
    </tr>
  );
}

function AnotacionPage() {
  const { isAuthenticated, user } = useAuth();
  const hasToken = localStorage.getItem('token') !== null;
  const isUserAuthenticated = isAuthenticated || hasToken;
  const canPostMatchFootball = isAdminOrSuperuser(user);
  const navigate = useNavigate();

  const tournamentId = useResolvedTournamentId();
  const { tournaments, games, loading, error, activeTournament } = useTournamentScheduleData(tournamentId, 'anotacion');

  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedDate, setSelectedDate] = useState('all');
  const [selectedTeam, setSelectedTeam] = useState('all');
  const [selectedLocation, setSelectedLocation] = useState('all');
  const [selectedEstado, setSelectedEstado] = useState('all');

  const pinnedTournamentName =
    activeTournament?.name != null && String(activeTournament.name).trim() !== ''
      ? String(activeTournament.name).trim()
      : '';

  /** Upcoming (y otros no Ongoing): ir a previo (game_events). El estado Ongoing en vivo se marca desde game_events. */
  const handleIrAPrevioPartido = (game) => {
    if (!isUserAuthenticated) {
      alert('Inicia sesión para comenzar el partido.');
      return;
    }
    navigate(buildGameEventsPath(game));
  };

  useEffect(() => {
    setSelectedCategory('all');
    setSelectedDate('all');
    setSelectedTeam('all');
    setSelectedLocation('all');
    setSelectedEstado('all');
  }, [tournamentId]);

  const orderedGames = useMemo(() => {
    return [...games].sort((a, b) => {
      const aValue = `${a.date}T${a.time || '00:00'}`;
      const bValue = `${b.date}T${b.time || '00:00'}`;
      const cmp = aValue.localeCompare(bValue);
      if (cmp !== 0) return cmp;
      const aGameNum = Number.isFinite(a.gameNum) ? a.gameNum : Number.MAX_SAFE_INTEGER;
      const bGameNum = Number.isFinite(b.gameNum) ? b.gameNum : Number.MAX_SAFE_INTEGER;
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

  const locationFilteredGames = useMemo(() => {
    if (selectedLocation === 'all') return teamFilteredGames;
    if (selectedLocation === '__empty__') {
      return teamFilteredGames.filter((game) => !(game.place || '').trim());
    }
    return teamFilteredGames.filter((game) => (game.place || '').trim() === selectedLocation);
  }, [teamFilteredGames, selectedLocation]);

  const estadoOptions = useMemo(
    () =>
      [...new Set(locationFilteredGames.map((game) => (game.estado || '').trim()).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, 'es')
      ),
    [locationFilteredGames]
  );

  const estadoFilterOptions = useMemo(() => {
    const hasEmpty = locationFilteredGames.some((game) => !(game.estado || '').trim());
    return { values: estadoOptions, hasEmpty };
  }, [locationFilteredGames, estadoOptions]);

  const filteredGames = useMemo(() => {
    if (selectedEstado === 'all') return locationFilteredGames;
    if (selectedEstado === '__empty__') {
      return locationFilteredGames.filter((game) => !(game.estado || '').trim());
    }
    return locationFilteredGames.filter((game) => (game.estado || '').trim() === selectedEstado);
  }, [locationFilteredGames, selectedEstado]);

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

  useEffect(() => {
    if (selectedEstado === 'all') return;
    if (selectedEstado === '__empty__') {
      if (!estadoFilterOptions.hasEmpty) setSelectedEstado('all');
      return;
    }
    if (!estadoFilterOptions.values.includes(selectedEstado)) {
      setSelectedEstado('all');
    }
  }, [estadoFilterOptions, selectedEstado]);

  return (
    <div className="anotacion-page">
      <div className="anotacion-topbar">
        {isUserAuthenticated ? <Navbar tournamentId={tournamentId} /> : <Noauth_Navbar />}
      </div>

      <main className="anotacion-content">
        <header className="anotacion-header">
          <h1>Panel de anotación</h1>
          {tournamentId != null ? (
            <p className="anotacion-pinned-hint">
              Mostrando partidos de este torneo
              {pinnedTournamentName ? <strong>{` · ${pinnedTournamentName}`}</strong> : null}.
            </p>
          ) : null}
        </header>

        {!loading && !error && orderedGames.length > 0 ? (
          <div className="anotacion-filter-row">
            <div className="anotacion-filter-field">
              <label htmlFor="anotacion-category-filter">Categoría:</label>
              <select
                id="anotacion-category-filter"
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

            <div className="anotacion-filter-field">
              <label htmlFor="anotacion-date-filter">Día:</label>
              <select
                id="anotacion-date-filter"
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

            <div className="anotacion-filter-field">
              <label htmlFor="anotacion-team-filter">Equipo:</label>
              <select
                id="anotacion-team-filter"
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

            <div className="anotacion-filter-field">
              <label htmlFor="anotacion-location-filter">Ubicación:</label>
              <select
                id="anotacion-location-filter"
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

            <div className="anotacion-filter-field">
              <label htmlFor="anotacion-estado-filter">Estado:</label>
              <select
                id="anotacion-estado-filter"
                value={selectedEstado}
                onChange={(event) => setSelectedEstado(event.target.value)}
              >
                <option value="all">Todos</option>
                {estadoFilterOptions.hasEmpty ? (
                  <option value="__empty__">Sin estado</option>
                ) : null}
                {estadoFilterOptions.values.map((estadoValue) => (
                  <option key={estadoValue} value={estadoValue}>
                    {estadoValue}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : null}

        {!loading && !error && activeTournament ? (
          <section className="anotacion-header-card-wrap">
            <article className="anotacion-tournament-card">
              <div className="anotacion-tournament-content">
                {activeTournament.image_url ? (
                  <img src={activeTournament.image_url} alt={activeTournament.name} loading="lazy" decoding="async" />
                ) : (
                  <div className="anotacion-tournament-placeholder">Sin imagen</div>
                )}
                <div className="anotacion-tournament-meta">
                  <h2>{activeTournament.name}</h2>
                  <p><strong>Año:</strong> {activeTournament.year}</p>
                  {activeTournament.country ? <p><strong>Pais:</strong> {activeTournament.country}</p> : null}
                </div>
              </div>
            </article>
          </section>
        ) : null}

        {loading ? <div className="anotacion-state">Cargando juegos...</div> : null}
        {!loading && error ? <div className="anotacion-state anotacion-state-error">{error}</div> : null}

        {!loading && !error && tournaments.length === 0 ? (
          <div className="anotacion-state">No hay torneos registrados todavia.</div>
        ) : null}

        {!loading && !error && tournaments.length > 0 && orderedGames.length === 0 ? (
          <div className="anotacion-state">No hay juegos registrados todavia.</div>
        ) : null}

        {!loading && !error && tournaments.length > 0 && orderedGames.length > 0 && filteredGames.length === 0 ? (
          <div className="anotacion-state">No hay juegos para los filtros seleccionados.</div>
        ) : null}

        {!loading && !error && filteredGames.length > 0 ? (
          <section className="anotacion-games-section">
            <div className="anotacion-table-wrap">
              <table className="anotacion-schedule-table">
                <thead>
                  <tr>
                    <th className="anotacion-th-datetime">Fecha y hora</th>
                    <th className="anotacion-th-game-num">Juego</th>
                    <th className="anotacion-th-team anotacion-th-team-home">Local</th>
                    <th className="anotacion-th-score">Marcador</th>
                    <th className="anotacion-th-team anotacion-th-team-away">Visitante</th>
                    <th className="anotacion-th-meta">División</th>
                    <th className="anotacion-th-meta">Ubicación</th>
                    <th className="anotacion-th-meta anotacion-th-estado">Estado</th>
                    <th className="anotacion-th-meta anotacion-th-accion">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredGames.map((game) => (
                    <AnotacionScheduleTableRow
                      key={`${game.tournamentId}-${game.id}`}
                      game={game}
                      navigate={navigate}
                      onIrAPrevioPartido={handleIrAPrevioPartido}
                      canPostMatchFootball={canPostMatchFootball}
                    />
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

export default AnotacionPage;
