import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import Navbar from '../components/navbar';
import SeoHead from '../components/SeoHead';
import { DEFAULT_SITE_DESCRIPTION, DEFAULT_SITE_TITLE } from '../config/siteConfig';
import { configService } from '../services/configService';
import { HERASTATS_GAMES_CHANGED_STORAGE, HERASTATS_TOURNAMENT_COHERENCE, normalizeTournamentIdForCoherence } from '../utils/tournamentSync';
import {
  buildGroupStandingsRows,
  normalizeDivisionName,
  normalizeGroupName
} from '../utils/groupStandings';
import { isFootballSport } from '../utils/tournamentSport';
import './stats.css';

const MIN_ROWS_PER_GROUP = 4;
/** Partidos clasificatorio superior vs inferior en la clasificación por grupos (banda verde vs naranja). */
const STANDINGS_UPPER_BRACKET_MAX_RANK = 4;
const TEAM_FALLBACK_IMAGE = '/Hera_logo.png';

const sortIconSvg = (
  <svg className="stats_sort_icon" width="14" height="14" viewBox="0 0 24 24" aria-hidden>
    <path
      fill="currentColor"
      d="M4 18h6v-2H4v2zM4 6v2h16V6H4zm0 7h12v-2H4v2z"
    />
  </svg>
);

const getDivisionThemeClass = (divisionValue) => {
  const value = (divisionValue || '').toLowerCase();
  if (value.includes('fem')) return 'stats_theme_femenino';
  if (value.includes('mixto')) return 'stats_theme_mixto';
  return 'stats_theme_default';
};

function standingsRowStripeClass(rank) {
  if (rank == null || !Number.isFinite(rank)) return '';
  if (rank <= STANDINGS_UPPER_BRACKET_MAX_RANK) return 'stats_standings_row--tier-upper';
  return 'stats_standings_row--tier-lower';
}

function enrichFootballPlayerRow(row) {
  const goals = Number(row.goals) || 0;
  const games = Number(row.games) || 0;
  const yellowcards = Number(row.yellowcards) || 0;
  const redcards = Number(row.redcards) || 0;
  const denom = games > 0 ? games : 1;
  return {
    ...row,
    goals,
    games,
    yellowcards,
    redcards,
    glsGm: goals / denom,
    ycGm: yellowcards / denom,
    rcGm: redcards / denom
  };
}

function enrichPlayerRow(row) {
  const goals = Number(row.goals) || 0;
  const assists = Number(row.assists) || 0;
  const games = Number(row.games) || 0;
  const total = goals + assists;
  const denom = games > 0 ? games : 1;
  return {
    ...row,
    goals,
    assists,
    games,
    total,
    totGm: total / denom,
    astGm: assists / denom,
    glsGm: goals / denom
  };
}

function sortSpiritRows(rows, sortKey, asc) {
  const dir = asc ? 1 : -1;
  return [...rows].sort((a, b) => {
    let va;
    let vb;
    switch (sortKey) {
      case 'rated_team_name':
        va = String(a.rated_team_name || '').toLowerCase();
        vb = String(b.rated_team_name || '').toLowerCase();
        return va.localeCompare(vb, 'es') * dir;
      case 'avg_spirit':
      case 'response_count':
      case 'avg_rules':
      case 'avg_fouls':
      case 'avg_fairmind':
      case 'avg_attitude':
      case 'avg_communication':
        va = Number(a[sortKey]);
        vb = Number(b[sortKey]);
        if (!Number.isFinite(va)) va = asc ? Infinity : -Infinity;
        if (!Number.isFinite(vb)) vb = asc ? Infinity : -Infinity;
        return (va - vb) * dir;
      default:
        return 0;
    }
  });
}

function sortPlayerRows(rows, sortKey, asc) {
  const dir = asc ? 1 : -1;
  return [...rows].sort((a, b) => {
    let va;
    let vb;
    switch (sortKey) {
      case 'player_name':
        va = String(a.player_name || '').toLowerCase();
        vb = String(b.player_name || '').toLowerCase();
        return va.localeCompare(vb, 'es') * dir;
      case 'team_name':
        va = String(a.team_name || '').toLowerCase();
        vb = String(b.team_name || '').toLowerCase();
        return va.localeCompare(vb, 'es') * dir;
      case 'total':
      case 'goals':
      case 'assists':
      case 'games':
      case 'totGm':
      case 'astGm':
      case 'glsGm':
        va = Number(a[sortKey]) || 0;
        vb = Number(b[sortKey]) || 0;
        return (va - vb) * dir;
      case 'yellowcards':
      case 'redcards':
      case 'ycGm':
      case 'rcGm':
        va = Number(a[sortKey]) || 0;
        vb = Number(b[sortKey]) || 0;
        return (va - vb) * dir;
      default:
        return 0;
    }
  });
}

function StatsPage() {
  const { id: routeTournamentId } = useParams();
  const location = useLocation();
  const queryTournamentId = new URLSearchParams(location.search).get('tournamentId');
  const tournamentId = routeTournamentId || queryTournamentId;

  const [teams, setTeams] = useState([]);
  const [tournamentGames, setTournamentGames] = useState([]);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [teamsError, setTeamsError] = useState('');
  const [division, setDivision] = useState('');
  const [tournamentSportName, setTournamentSportName] = useState('');
  const [tournamentSportId, setTournamentSportId] = useState(null);
  const [tournamentDisplayName, setTournamentDisplayName] = useState('');

  const [statsSection, setStatsSection] = useState('groups');
  const [playerTabKey, setPlayerTabKey] = useState('');
  const [playerRowsRaw, setPlayerRowsRaw] = useState([]);
  const [playerStatsLoading, setPlayerStatsLoading] = useState(false);
  const [playerStatsError, setPlayerStatsError] = useState('');
  const [playerStatsScope, setPlayerStatsScope] = useState('all');
  const [playerSort, setPlayerSort] = useState({ key: 'total', asc: false });

  const [spiritStatsLoading, setSpiritStatsLoading] = useState(false);
  const [spiritStatsError, setSpiritStatsError] = useState('');
  const [spiritRows, setSpiritRows] = useState([]);
  const [spiritDivisionTab, setSpiritDivisionTab] = useState('');
  const [spiritSort, setSpiritSort] = useState({ key: 'avg_spirit', asc: false });

  /** Tras FINALIZAR en live u otras pestañas (storage): mismo torneo debe recargar equipos/partidos/tablas player/espíritu. */
  const [catalogRefreshNonce, setCatalogRefreshNonce] = useState(0);

  useEffect(() => {
    setCatalogRefreshNonce(0);
  }, [tournamentId]);

  useEffect(() => {
    if (!tournamentId) return undefined;
    const tid = normalizeTournamentIdForCoherence(tournamentId);
    const bump = () => setCatalogRefreshNonce((n) => n + 1);

    const onCoherence = (event) => {
      if (!event?.detail) return;
      if (normalizeTournamentIdForCoherence(event.detail.tournamentId) !== tid) return;
      bump();
    };

    const onStorage = (e) => {
      if (e.key !== HERASTATS_GAMES_CHANGED_STORAGE || !e.newValue) return;
      try {
        const p = JSON.parse(e.newValue);
        if (p && normalizeTournamentIdForCoherence(p.tournamentId) === tid) bump();
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
  }, [tournamentId]);

  useEffect(() => {
    const loadTeams = async () => {
      if (!tournamentId) {
        setTeams([]);
        setTournamentGames([]);
        setTeamsError('No se encontro el ID del torneo para cargar estadisticas.');
        setLoadingTeams(false);
        return;
      }

      try {
        const silentTeamsRefresh = catalogRefreshNonce > 0;
        if (!silentTeamsRefresh) {
          setLoadingTeams(true);
        }
        setTeamsError('');
        const [response, gamesResponse, tournamentResponse] = await Promise.all([
          configService.getTeams(tournamentId),
          configService.getGames(tournamentId),
          configService.getTournamentById(tournamentId)
        ]);

        if (!response.success) {
          throw new Error(response.message || 'No se pudieron cargar los equipos.');
        }

        if (!gamesResponse?.success) {
          setTournamentGames([]);
        } else {
          setTournamentGames(Array.isArray(gamesResponse.data?.games) ? gamesResponse.data.games : []);
        }

        if (tournamentResponse?.success && tournamentResponse.data?.tournament) {
          const tournament = tournamentResponse.data.tournament;
          setTournamentSportName(tournament.sport_name || '');
          setTournamentSportId(tournament.sport_id ?? null);
          setTournamentDisplayName(tournament.name || '');
        } else {
          setTournamentSportName('');
          setTournamentSportId(null);
          setTournamentDisplayName('');
        }

        const dbTeams = (response.data?.teams || []).map((team) => ({
          id: String(team.team_id),
          name: team.name,
          division: normalizeDivisionName(team.division),
          group: normalizeGroupName(team.group),
          games: Number(team.games) || 0,
          wins: Number(team.wins) || 0,
          losses: Number(team.losses) || 0,
          imageUrl:
            team.url_imagen != null && String(team.url_imagen).trim() !== ''
              ? String(team.url_imagen).trim()
              : TEAM_FALLBACK_IMAGE
        }));

        setTeams(dbTeams);
      } catch (error) {
        const errorMessage = error.response?.data?.message || error.message || 'Error al cargar los equipos.';
        setTeamsError(errorMessage);
        setTournamentGames([]);
        setTournamentSportName('');
        setTournamentSportId(null);
      } finally {
        setLoadingTeams(false);
      }
    };

    loadTeams();
  }, [tournamentId, catalogRefreshNonce]);

  useEffect(() => {
    if (!tournamentId || statsSection !== 'players') return;
    const isFootball = isFootballSport({ sportId: tournamentSportId, sportName: tournamentSportName });
    if (!isFootball && (!playerTabKey || playerTabKey === '__all__')) return;
    let cancelled = false;
    const silentRefresh = catalogRefreshNonce > 0;
    (async () => {
      if (!silentRefresh) {
        setPlayerStatsLoading(true);
      }
      setPlayerStatsError('');
      try {
        const res = await configService.getTournamentPlayerEventStats(
          tournamentId,
          isFootball
            ? { scope: 'all' }
            : {
                division: playerTabKey,
                scope: playerStatsScope === 'groups' ? 'groups' : 'all'
              }
        );
        if (cancelled) return;
        if (!res?.success) {
          throw new Error(res?.message || 'No se pudieron cargar las estadisticas de jugadores.');
        }
        setPlayerRowsRaw(res.data?.players || []);
      } catch (e) {
        if (!cancelled) {
          setPlayerStatsError(e.response?.data?.message || e.message || 'Error al cargar estadisticas.');
          setPlayerRowsRaw([]);
        }
      } finally {
        if (!cancelled) setPlayerStatsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    tournamentId,
    statsSection,
    playerTabKey,
    playerStatsScope,
    catalogRefreshNonce,
    tournamentSportId,
    tournamentSportName
  ]);

  useEffect(() => {
    if (!tournamentId || statsSection !== 'spirit') return undefined;
    if (!spiritDivisionTab || spiritDivisionTab === '__all__') return undefined;
    let cancelled = false;
    const silentRefresh = catalogRefreshNonce > 0;
    (async () => {
      if (!silentRefresh) {
        setSpiritStatsLoading(true);
      }
      setSpiritStatsError('');
      try {
        const res = await configService.getTournamentSpiritStats(tournamentId, {
          division: spiritDivisionTab
        });
        if (cancelled) return;
        if (!res?.success) {
          throw new Error(res?.message || 'No se pudieron cargar las estadisticas de espiritu.');
        }
        setSpiritRows(res.data?.spiritStats || []);
      } catch (e) {
        if (!cancelled) {
          setSpiritStatsError(e.response?.data?.message || e.message || 'Error al cargar espiritu.');
          setSpiritRows([]);
        }
      } finally {
        if (!cancelled) setSpiritStatsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tournamentId, statsSection, spiritDivisionTab, catalogRefreshNonce]);

  const isFootballTournament = useMemo(
    () => isFootballSport({ sportId: tournamentSportId, sportName: tournamentSportName }),
    [tournamentSportId, tournamentSportName]
  );

  const playerRows = useMemo(() => {
    const enriched = (playerRowsRaw || []).map((row) =>
      isFootballTournament ? enrichFootballPlayerRow(row) : enrichPlayerRow(row)
    );
    return sortPlayerRows(enriched, playerSort.key, playerSort.asc);
  }, [playerRowsRaw, playerSort, isFootballTournament]);

  useEffect(() => {
    if (isFootballTournament && statsSection === 'spirit') {
      setStatsSection('groups');
    }
  }, [isFootballTournament, statsSection]);

  useEffect(() => {
    if (isFootballTournament && playerSort.key === 'total') {
      setPlayerSort({ key: 'goals', asc: false });
    }
  }, [isFootballTournament, playerSort.key]);

  const divisionOptions = useMemo(
    () => [...new Set(teams.map((team) => team.division))].sort((a, b) => a.localeCompare(b, 'es')),
    [teams]
  );

  useEffect(() => {
    if (statsSection !== 'players') return;
    if (divisionOptions.length === 0) return;
    if (playerTabKey === '__all__' || !playerTabKey || !divisionOptions.includes(playerTabKey)) {
      setPlayerTabKey(divisionOptions[0]);
    }
  }, [statsSection, divisionOptions, playerTabKey]);

  useEffect(() => {
    if (statsSection !== 'spirit') return;
    if (divisionOptions.length === 0) return;
    if (
      spiritDivisionTab === '__all__' ||
      !spiritDivisionTab ||
      !divisionOptions.includes(spiritDivisionTab)
    ) {
      setSpiritDivisionTab(divisionOptions[0]);
    }
  }, [statsSection, divisionOptions, spiritDivisionTab]);

  const spiritRowsSorted = useMemo(
    () => sortSpiritRows(spiritRows || [], spiritSort.key, spiritSort.asc),
    [spiritRows, spiritSort]
  );

  useEffect(() => {
    if (divisionOptions.length === 0) {
      setDivision('');
      return;
    }

    if (!divisionOptions.includes(division)) {
      setDivision(divisionOptions[0]);
    }
  }, [divisionOptions, division]);

  const teamsInDivision = useMemo(() => teams.filter((team) => team.division === division), [teams, division]);
  const divisionThemeClass = useMemo(() => getDivisionThemeClass(division), [division]);

  const groupedTables = useMemo(() => {
    const groupsMap = {};

    teamsInDivision.forEach((team) => {
      if (!team.group) return;
      if (!groupsMap[team.group]) {
        groupsMap[team.group] = [];
      }
      groupsMap[team.group].push(team);
    });

    return Object.keys(groupsMap)
      .sort((a, b) => a.localeCompare(b, 'es'))
      .map((groupName) => ({
        groupName,
        standingsRows: buildGroupStandingsRows(groupsMap[groupName], tournamentGames, division)
      }));
  }, [teamsInDivision, tournamentGames, division]);

  const onPlayerHeaderClick = (key) => {
    setPlayerSort((prev) =>
      prev.key === key ? { key, asc: !prev.asc } : { key, asc: key === 'player_name' || key === 'team_name' }
    );
  };

  const playerHeaderBtn = (colKey, label) => {
    const active = playerSort.key === colKey;
    return (
      <button
        type="button"
        className={`stats_player_th_btn${active ? ' stats_player_th_btn--active' : ''}`}
        onClick={() => onPlayerHeaderClick(colKey)}
      >
        <span>{label}</span>
        {sortIconSvg}
      </button>
    );
  };

  const onSpiritHeaderClick = (key) => {
    setSpiritSort((prev) =>
      prev.key === key ? { key, asc: !prev.asc } : { key, asc: key === 'rated_team_name' }
    );
  };

  const spiritHeaderBtn = (colKey, label, opts = {}) => {
    const { highlight } = opts;
    const active = spiritSort.key === colKey;
    return (
      <button
        type="button"
        className={`stats_spirit_th_btn${highlight ? ' stats_spirit_th_btn--in_col' : ''}${
          active ? ' stats_spirit_th_btn--active' : ''
        }`}
        onClick={() => onSpiritHeaderClick(colKey)}
      >
        <span className="stats_spirit_th_label">{label}</span>
        <span className="stats_spirit_sort_caret" aria-hidden>
          {active ? (spiritSort.asc ? '▲' : '▼') : '▼'}
        </span>
      </button>
    );
  };

  const fmt2 = (n) => (Number.isFinite(n) ? n.toFixed(2) : '0.00');

  const renderCategoryTabs = (activeValue, onSelect, ariaLabel = 'Categorias del torneo') => (
    <nav className="stats_division_tabs" aria-label={ariaLabel}>
      {divisionOptions.map((item) => (
        <button
          key={item}
          type="button"
          className={`stats_division_tab${activeValue === item ? ' stats_division_tab--active' : ''}`}
          onClick={() => onSelect(item)}
        >
          {item}
        </button>
      ))}
    </nav>
  );

  const renderDivisionSelector = () => renderCategoryTabs(division, setDivision);

  return (
    <div className={`stats_page${isFootballTournament ? ' stats_page--football' : ''}`}>
      <SeoHead
        title={
          tournamentDisplayName
            ? `Estadísticas — ${tournamentDisplayName} | ${DEFAULT_SITE_TITLE}`
            : `Estadísticas | ${DEFAULT_SITE_TITLE}`
        }
        description={
          tournamentDisplayName
            ? `Tablas, rankings y espíritu de juego del torneo ${tournamentDisplayName}.`
            : DEFAULT_SITE_DESCRIPTION
        }
        pathname="/stats"
        search={tournamentId ? `tournamentId=${tournamentId}` : ''}
      />
      <div className="stats_topbar">
        <Navbar tournamentId={tournamentId} />
      </div>

      <div
        className={`stats_content ${
          statsSection === 'groups' ? divisionThemeClass : statsSection === 'spirit' ? 'stats_theme_spirit' : 'stats_theme_player'
        }`}
      >
        <header className="stats_header">
          <h1 className={`stats_title${statsSection === 'spirit' ? ' stats_title--spirit_main' : ''}`}>
            {statsSection === 'groups'
              ? 'Estadisticas por Grupos'
              : statsSection === 'players'
                ? isFootballTournament
                  ? 'Ranking de jugadores'
                  : 'Player Stats'
                : 'Spirit Stats'}
          </h1>
          <nav className="stats_section_tabs" aria-label="Tipo de estadisticas">
            <button
              type="button"
              className={`stats_section_tab${statsSection === 'groups' ? ' stats_section_tab--active' : ''}`}
              onClick={() => setStatsSection('groups')}
            >
              Grupos
            </button>
            <button
              type="button"
              className={`stats_section_tab${statsSection === 'players' ? ' stats_section_tab--active' : ''}`}
              onClick={() => setStatsSection('players')}
            >
              Player
            </button>
            {!isFootballTournament ? (
              <button
                type="button"
                className={`stats_section_tab${statsSection === 'spirit' ? ' stats_section_tab--active' : ''}`}
                onClick={() => setStatsSection('spirit')}
              >
                Espiritu
              </button>
            ) : null}
          </nav>
        </header>

        {statsSection === 'spirit' ? (
          <>
            {!tournamentId ? (
              <div className="stats_empty">No se encontro el torneo.</div>
            ) : (
              <section className="stats_spirit_panel">
                {renderCategoryTabs(spiritDivisionTab, setSpiritDivisionTab, 'Categorias del torneo (espiritu)')}

                <p className="stats_spirit_hint">
                  Promedios (escala 0–4) por equipo <strong>evaluado</strong> tras partidos finalizados. Visible solo
                  para el organizador del torneo.
                </p>

                {loadingTeams ? (
                  <div className="stats_empty stats_empty--spirit">Cargando categorias del torneo...</div>
                ) : teamsError ? (
                  <div className="stats_empty stats_empty--spirit">{teamsError}</div>
                ) : divisionOptions.length === 0 ? (
                  <div className="stats_empty stats_empty--spirit">
                    No hay equipos registrados para mostrar categorias.
                  </div>
                ) : spiritStatsLoading ? (
                  <div className="stats_empty stats_empty--spirit">Cargando encuestas de espiritu...</div>
                ) : spiritStatsError ? (
                  <div className="stats_empty stats_empty--spirit">{spiritStatsError}</div>
                ) : spiritRowsSorted.length === 0 ? (
                  <div className="stats_empty stats_empty--spirit">
                    No hay datos de espiritu para esta categoria.
                  </div>
                ) : (
                  <div className="stats_spirit_table_wrap">
                    <table className="stats_spirit_table" aria-label="Espiritu por equipo">
                      <thead>
                        <tr>
                          <th className="stats_spirit_th stats_spirit_th--team">
                            {spiritHeaderBtn('rated_team_name', 'Equipo')}
                          </th>
                          <th className="stats_spirit_th stats_spirit_th--avg stats_spirit_col_avg">
                            {spiritHeaderBtn('avg_spirit', 'Promedio', { highlight: true })}
                          </th>
                          <th className="stats_spirit_th">{spiritHeaderBtn('response_count', 'Partidos')}</th>
                          <th className="stats_spirit_th">
                            {spiritHeaderBtn('avg_rules', 'Reglas y uso')}
                          </th>
                          <th className="stats_spirit_th">
                            {spiritHeaderBtn('avg_fouls', 'Faltas y contacto')}
                          </th>
                          <th className="stats_spirit_th">{spiritHeaderBtn('avg_fairmind', 'Imparcialidad')}</th>
                          <th className="stats_spirit_th">{spiritHeaderBtn('avg_attitude', 'Actitud')}</th>
                          <th className="stats_spirit_th">{spiritHeaderBtn('avg_communication', 'Comunicacion')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {spiritRowsSorted.map((row, idx) => (
                          <tr key={row.rated_team_id} className={idx % 2 === 1 ? 'stats_spirit_tr--alt' : ''}>
                            <td className="stats_spirit_td stats_spirit_td--team">
                              <span className="stats_spirit_team_cell">
                                <img
                                  className="stats_spirit_team_flag"
                                  src={row.rated_team_image || TEAM_FALLBACK_IMAGE}
                                  alt=""
                                  onError={(e) => {
                                    if (!e.currentTarget.src.includes(TEAM_FALLBACK_IMAGE)) {
                                      e.currentTarget.src = TEAM_FALLBACK_IMAGE;
                                    }
                                  }}
                                />
                                <Link
                                  className="stats_spirit_team_link"
                                  to={`/team_players/${encodeURIComponent(tournamentId)}/${encodeURIComponent(row.rated_team_id)}`}
                                >
                                  {row.rated_team_name || `Equipo ${row.rated_team_id}`}
                                </Link>
                              </span>
                            </td>
                            <td className="stats_spirit_td stats_spirit_td--avg stats_spirit_col_avg">{fmt2(Number(row.avg_spirit))}</td>
                            <td className="stats_spirit_td stats_spirit_td--num">{row.response_count ?? '—'}</td>
                            <td className="stats_spirit_td stats_spirit_td--num">{fmt2(Number(row.avg_rules))}</td>
                            <td className="stats_spirit_td stats_spirit_td--num">{fmt2(Number(row.avg_fouls))}</td>
                            <td className="stats_spirit_td stats_spirit_td--num">{fmt2(Number(row.avg_fairmind))}</td>
                            <td className="stats_spirit_td stats_spirit_td--num">{fmt2(Number(row.avg_attitude))}</td>
                            <td className="stats_spirit_td stats_spirit_td--num">{fmt2(Number(row.avg_communication))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}
          </>
        ) : null}

        {statsSection === 'players' ? (
          <>
            {!tournamentId ? (
              <div className="stats_empty">No se encontro el torneo.</div>
            ) : (
              <>
                {!isFootballTournament ? (
                  <div className="stats_player_toolbar">
                    {renderCategoryTabs(playerTabKey, setPlayerTabKey, 'Categorias del torneo (player)')}
                    <div className="stats_player_scope">
                      <label htmlFor="stats-player-scope-select" className="stats_player_scope_label">
                        Partidos incluidos
                      </label>
                      <select
                        id="stats-player-scope-select"
                        className="stats_player_scope_select"
                        value={playerStatsScope}
                        onChange={(event) => setPlayerStatsScope(event.target.value)}
                      >
                        <option value="all">Todo el torneo</option>
                        <option value="groups">Solo fase de grupos</option>
                      </select>
                    </div>
                  </div>
                ) : (
                  <p className="stats_player_football_hint">
                    Ranking del torneo según eventos registrados en los partidos (goles y tarjetas).
                  </p>
                )}

                {loadingTeams && !isFootballTournament ? (
                  <div className="stats_empty">Cargando categorias del torneo...</div>
                ) : teamsError ? (
                  <div className="stats_empty">{teamsError}</div>
                ) : !isFootballTournament && divisionOptions.length === 0 ? (
                  <div className="stats_empty">No hay equipos registrados para mostrar categorias.</div>
                ) : playerStatsLoading ? (
                  <div className="stats_empty">Cargando estadisticas por jugador...</div>
                ) : playerStatsError ? (
                  <div className="stats_empty">{playerStatsError}</div>
                ) : (
                  <div className="stats_player_table_wrap">
                    <table className="stats_player_table" aria-label="Estadisticas por jugador">
                      <thead>
                        <tr>
                          <th className="stats_player_th stats_player_th--left">
                            {playerHeaderBtn('player_name', 'Nombre')}
                          </th>
                          <th className="stats_player_th stats_player_th--left">
                            {playerHeaderBtn('team_name', 'Equipo')}
                          </th>
                          {isFootballTournament ? (
                            <>
                              <th className="stats_player_th stats_player_th--highlight">
                                {playerHeaderBtn('goals', 'Goles')}
                              </th>
                              <th className="stats_player_th">{playerHeaderBtn('games', 'Partidos')}</th>
                              <th className="stats_player_th">{playerHeaderBtn('glsGm', 'Gol/P')}</th>
                              <th className="stats_player_th">{playerHeaderBtn('yellowcards', 'YC')}</th>
                              <th className="stats_player_th">{playerHeaderBtn('redcards', 'RC')}</th>
                            </>
                          ) : (
                            <>
                              <th className="stats_player_th stats_player_th--highlight">
                                {playerHeaderBtn('total', 'Total')}
                              </th>
                              <th className="stats_player_th">{playerHeaderBtn('assists', 'Assists')}</th>
                              <th className="stats_player_th">{playerHeaderBtn('goals', 'Goals')}</th>
                              <th className="stats_player_th">{playerHeaderBtn('games', 'Games')}</th>
                              <th className="stats_player_th">{playerHeaderBtn('totGm', 'Tot/Gm')}</th>
                              <th className="stats_player_th">{playerHeaderBtn('astGm', 'Ast/Gm')}</th>
                              <th className="stats_player_th">{playerHeaderBtn('glsGm', 'Gls/Gm')}</th>
                            </>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {playerRows.length === 0 ? (
                          <tr>
                            <td colSpan={isFootballTournament ? 7 : 9} className="stats_player_empty_cell">
                              {isFootballTournament
                                ? 'No hay eventos de fútbol registrados en este torneo.'
                                : 'No hay eventos GOAL/AST registrados para este filtro.'}
                            </td>
                          </tr>
                        ) : (
                          playerRows.map((row, idx) => (
                            <tr key={row.player_id ?? idx} className={idx % 2 === 1 ? 'stats_player_tr--alt' : ''}>
                              <td className="stats_player_td stats_player_td--name">{row.player_name || '—'}</td>
                              <td className="stats_player_td stats_player_td--team">
                                <span className="stats_player_team_cell">
                                  <img
                                    className="stats_player_team_flag"
                                    src={row.team_image || TEAM_FALLBACK_IMAGE}
                                    alt=""
                                    onError={(e) => {
                                      if (!e.currentTarget.src.includes(TEAM_FALLBACK_IMAGE)) {
                                        e.currentTarget.src = TEAM_FALLBACK_IMAGE;
                                      }
                                    }}
                                  />
                                  <Link
                                    className="stats_player_team_link"
                                    to={`/team_players/${encodeURIComponent(tournamentId)}/${encodeURIComponent(row.team_id)}`}
                                  >
                                    {row.team_name || '—'}
                                  </Link>
                                </span>
                              </td>
                              {isFootballTournament ? (
                                <>
                                  <td className="stats_player_td stats_player_td--highlight">{row.goals}</td>
                                  <td className="stats_player_td">{row.games}</td>
                                  <td className="stats_player_td">{fmt2(row.glsGm)}</td>
                                  <td className="stats_player_td">{row.yellowcards}</td>
                                  <td className="stats_player_td">{row.redcards}</td>
                                </>
                              ) : (
                                <>
                                  <td className="stats_player_td stats_player_td--highlight">{row.total}</td>
                                  <td className="stats_player_td">{row.assists}</td>
                                  <td className="stats_player_td">{row.goals}</td>
                                  <td className="stats_player_td">{row.games}</td>
                                  <td className="stats_player_td">{fmt2(row.totGm)}</td>
                                  <td className="stats_player_td">{fmt2(row.astGm)}</td>
                                  <td className="stats_player_td">{fmt2(row.glsGm)}</td>
                                </>
                              )}
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </>
        ) : statsSection === 'groups' ? (
        loadingTeams ? (
          <div className="stats_empty">Cargando estadisticas...</div>
        ) : teamsError ? (
          <div className="stats_empty">{teamsError}</div>
        ) : divisionOptions.length === 0 ? (
          <div className="stats_empty">No hay equipos registrados para mostrar divisiones.</div>
        ) : groupedTables.length === 0 ? (
          <>
            {renderDivisionSelector()}
            <div className="stats_empty">No hay grupos asignados para la division seleccionada.</div>
          </>
        ) : (
          <>
            {renderDivisionSelector()}


            <section className={`stats_grid${isFootballTournament ? ' stats_grid--football' : ''}`}>
              {groupedTables.map((groupData) => {
                const standingsColCount = isFootballTournament ? 10 : 8;
                const rowsToRender = [...groupData.standingsRows];
                while (rowsToRender.length < MIN_ROWS_PER_GROUP) {
                  rowsToRender.push(null);
                }

                return (
                  <article key={groupData.groupName} className="stats_table_card stats_standings_card">
                    <table className="stats_table stats_standings_table" aria-label={groupData.groupName}>
                      {isFootballTournament ? (
                        <colgroup>
                          <col className="stats_football_col_rank" />
                          <col className="stats_football_col_team" />
                          <col className="stats_football_col_stat" />
                          <col className="stats_football_col_stat" />
                          <col className="stats_football_col_stat" />
                          <col className="stats_football_col_stat" />
                          <col className="stats_football_col_stat" />
                          <col className="stats_football_col_stat" />
                          <col className="stats_football_col_stat" />
                          <col className="stats_football_col_stat" />
                        </colgroup>
                      ) : null}
                      <thead>
                        <tr>
                          <th colSpan={standingsColCount} className="stats_table_group_title">
                            {groupData.groupName}
                          </th>
                        </tr>
                        <tr>
                          <th className="stats_standings_th stats_standings_th--rank">#</th>
                          <th className="stats_standings_th stats_standings_th--team">Equipo</th>
                          <th className="stats_standings_th">PG</th>
                          <th className="stats_standings_th">W</th>
                          {isFootballTournament ? <th className="stats_standings_th">D</th> : null}
                          <th className="stats_standings_th">L</th>
                          <th className="stats_standings_th">GF</th>
                          <th className="stats_standings_th">GA</th>
                          <th className="stats_standings_th">GD</th>
                          {isFootballTournament ? <th className="stats_standings_th">Pts</th> : null}
                        </tr>
                      </thead>
                      <tbody>
                        {rowsToRender.map((row, index) =>
                          row == null ? (
                            <tr
                              key={`${groupData.groupName}-empty-${index}`}
                              className="stats_standings_row--placeholder"
                            >
                              <td colSpan={standingsColCount} />
                            </tr>
                          ) : (
                            <tr key={row.id} className={standingsRowStripeClass(row.rank)}>
                              <td className="stats_standings_td stats_standings_td--rank">{row.rank}</td>
                              <td className="stats_standings_td stats_standings_td--team">
                                <span className="stats_standings_team_cell">
                                  <img
                                    className="stats_standings_team_logo"
                                    src={row.imageUrl || TEAM_FALLBACK_IMAGE}
                                    alt=""
                                    onError={(e) => {
                                      if (!e.currentTarget.src.includes(TEAM_FALLBACK_IMAGE)) {
                                        e.currentTarget.src = TEAM_FALLBACK_IMAGE;
                                      }
                                    }}
                                  />
                                  <Link
                                    className="stats_team_link stats_standings_team_link"
                                    to={`/team_players/${encodeURIComponent(tournamentId)}/${encodeURIComponent(row.id)}`}
                                  >
                                    {row.name}
                                  </Link>
                                </span>
                              </td>
                              <td>{row.pg}</td>
                              <td>{row.wins}</td>
                              {isFootballTournament ? (
                                <td>{Math.max(0, (Number(row.pg) || 0) - (Number(row.wins) || 0) - (Number(row.losses) || 0))}</td>
                              ) : null}
                              <td>{row.losses}</td>
                              <td>{row.gf}</td>
                              <td>{row.ga}</td>
                              <td>{row.gd}</td>
                              {isFootballTournament ? (
                                <td>
                                  {(Number(row.wins) || 0) * 3 +
                                    Math.max(
                                      0,
                                      (Number(row.pg) || 0) - (Number(row.wins) || 0) - (Number(row.losses) || 0)
                                    )}
                                </td>
                              ) : null}
                            </tr>
                          )
                        )}
                      </tbody>
                    </table>
                  </article>
                );
              })}
            </section>
            <footer className="stats_standings_meta stats_standings_meta--below_grid" aria-label="Leyenda y clasificación playoff">
              <p className="stats_standings_legend">
                PG — Partidos jugados | W — Victorias
                {isFootballTournament ? ' | D — Empates | Pts — Puntos' : ''}
                {' '}| L — Derrotas | GF — Goles a favor | GA — Goles en contra | GD — Diferencia de gol.
                Empate en victorias: desempate por enfrentamientos directos en fase de grupos; si no hubo esos partidos, por diferencia de goles.
              </p>
              <div className="stats_standings_continue">
                <span className="stats_standings_continue_label">Continúa a:</span>
                <span className="stats_standings_badge stats_standings_badge--upper">
                  <span className="stats_standings_badge_bar stats_standings_badge_bar--upper" />
                  Playoff (1-8)
                </span>
                <span className="stats_standings_badge stats_standings_badge--lower">
                  <span className="stats_standings_badge_bar stats_standings_badge_bar--lower" />
                  Playoff (9-Ꝏ)
                </span>
              </div>
            </footer>
          </>
        )
        ) : null}
      </div>
    </div>
  );
}

export default StatsPage;
