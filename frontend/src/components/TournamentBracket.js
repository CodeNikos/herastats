import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { configService } from '../services/configService';
import {
  HERASTATS_GAMES_CHANGED_STORAGE,
  HERASTATS_TOURNAMENT_COHERENCE,
  normalizeTournamentIdForCoherence
} from '../utils/tournamentSync';
import './tournamentBracket.css';

const TEAM_FALLBACK_IMAGE = '/Hera_logo.png';
const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const readStat = (team, keys) => {
  for (const key of keys) {
    if (team?.[key] !== undefined && team?.[key] !== null && team?.[key] !== '') {
      return toNumber(team[key]);
    }
  }
  return 0;
};

const readDivision = (team) => {
  const divisionValue = String(
    team?.division || team?.categoria || team?.category || team?.division_name || ''
  ).trim();
  return divisionValue || 'Sin division';
};

function TournamentBracket({
  tournamentId,
  selectedDivision: selectedDivisionProp,
  onDivisionChange,
  activeBracketView = 'main',
  onBracketViewChange,
  hideBracketFilter = false,
  /** Incrementar solo al cambiar torneo/ruta para mostrar spinner de carga inicial. */
  routeReloadNonce = 0
}) {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [internalSelectedDivision, setInternalSelectedDivision] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('all');
  const isDivisionControlled = selectedDivisionProp !== undefined;
  const selectedDivision = isDivisionControlled ? selectedDivisionProp : internalSelectedDivision;
  const coherenceTeamsTimerRef = useRef(null);

  const setSelectedDivision = useCallback((value) => {
    if (!isDivisionControlled) {
      setInternalSelectedDivision(value);
    }
    if (onDivisionChange) {
      onDivisionChange(value);
    }
  }, [isDivisionControlled, onDivisionChange]);

  useEffect(() => {
    const loadGroups = async () => {
      if (!tournamentId) {
        setTeams([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        const teamsResponse = await configService.getTeams(tournamentId);
        const teamsData = teamsResponse?.success ? teamsResponse?.data?.teams || [] : [];
        setTeams(teamsData);
      } finally {
        setLoading(false);
      }
    };

    loadGroups();
  }, [tournamentId, routeReloadNonce]);

  /** Coherencia (stats/live): GET equipos en segundo plano sin parpadeo de «Cargando grupos». */
  useEffect(() => {
    if (!tournamentId) return undefined;
    const tid = normalizeTournamentIdForCoherence(tournamentId);

    const scheduleSilentTeamsReload = () => {
      window.clearTimeout(coherenceTeamsTimerRef.current);
      coherenceTeamsTimerRef.current = window.setTimeout(async () => {
        coherenceTeamsTimerRef.current = null;
        try {
          const teamsResponse = await configService.getTeams(tournamentId);
          const teamsData = teamsResponse?.success ? teamsResponse?.data?.teams || [] : [];
          setTeams(teamsData);
        } catch (_) {
          /* ignorar fallback */
        }
      }, 380);
    };

    const onCoherence = (event) => {
      if (!event.detail || normalizeTournamentIdForCoherence(event.detail.tournamentId) !== tid) return;
      scheduleSilentTeamsReload();
    };

    const onStorage = (event) => {
      if (event?.key !== HERASTATS_GAMES_CHANGED_STORAGE || !event.newValue) return;
      try {
        const payload = JSON.parse(event.newValue);
        if (payload && normalizeTournamentIdForCoherence(payload.tournamentId) === tid) {
          scheduleSilentTeamsReload();
        }
      } catch (_) {
        /* ignorar JSON inválido */
      }
    };

    window.addEventListener(HERASTATS_TOURNAMENT_COHERENCE, onCoherence);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(HERASTATS_TOURNAMENT_COHERENCE, onCoherence);
      window.removeEventListener('storage', onStorage);
      window.clearTimeout(coherenceTeamsTimerRef.current);
      coherenceTeamsTimerRef.current = null;
    };
  }, [tournamentId]);

  const groupsByDivision = useMemo(() => {
    const divisionsMap = teams.reduce((acc, team) => {
      const divisionName = readDivision(team);
      const groupName = String(team.group || team.grupo || '').trim() || 'Sin grupo';

      if (!acc[divisionName]) acc[divisionName] = {};
      if (!acc[divisionName][groupName]) acc[divisionName][groupName] = [];
      acc[divisionName][groupName].push(team);
      return acc;
    }, {});

    return Object.entries(divisionsMap)
      .sort((a, b) => a[0].localeCompare(b[0], 'es'))
      .map(([divisionName, divisionGroups]) => ({
        divisionName,
        groups: Object.entries(divisionGroups)
          .sort((a, b) => a[0].localeCompare(b[0], 'es'))
          .map(([name, groupTeams]) => ({
            name,
            teams: [...groupTeams]
              .map((team) => {
                const gamesPlayed = readStat(team, ['games_played', 'played_games', 'played', 'pg', 'pj', 'games']);
                const wins = readStat(team, ['wins', 'won', 'victories', 'victorias', 'w']);
                const losses = readStat(team, ['losses', 'lost', 'derrotas', 'l']);
                const goalsFor = readStat(team, ['goals_for', 'gf', 'goals', 'goles_favor', 'points_for']);
                const goalsAgainst = readStat(team, ['goals_against', 'ga', 'goles_contra', 'points_against']);
                const goalDiff = team.goal_diff !== undefined || team.gd !== undefined
                  ? readStat(team, ['goal_diff', 'gd', 'diferencia'])
                  : goalsFor - goalsAgainst;
                const points = readStat(team, ['points', 'pts', 'puntos']);

                return {
                  ...team,
                  gamesPlayed,
                  wins,
                  losses,
                  goalsFor,
                  goalsAgainst,
                  goalDiff,
                  points
                };
              })
              .sort((a, b) => {
                if (b.points !== a.points) return b.points - a.points;
                if (b.wins !== a.wins) return b.wins - a.wins;
                if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff;
                if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
                return String(a.name || '').localeCompare(String(b.name || ''), 'es');
              })
          }))
      }));
  }, [teams]);

  const divisionOptions = useMemo(
    () => groupsByDivision.map((division) => division.divisionName),
    [groupsByDivision]
  );

  useEffect(() => {
    if (divisionOptions.length === 0) {
      if (!isDivisionControlled) {
        setInternalSelectedDivision('');
      }
      return;
    }

    if (!divisionOptions.includes(selectedDivision)) {
      const preferred = divisionOptions.includes('Femenino') ? 'Femenino' : divisionOptions[0];
      setSelectedDivision(preferred);
    }
  }, [divisionOptions, selectedDivision, isDivisionControlled, setSelectedDivision]);

  const filteredDivisions = useMemo(() => {
    return groupsByDivision.filter((division) => division.divisionName === selectedDivision);
  }, [groupsByDivision, selectedDivision]);

  const groupOptions = useMemo(() => {
    const selectedDivisionData = groupsByDivision.find((division) => division.divisionName === selectedDivision);
    if (!selectedDivisionData) return [];
    return selectedDivisionData.groups.map((group) => group.name);
  }, [groupsByDivision, selectedDivision]);

  useEffect(() => {
    if (groupOptions.length === 0) {
      setSelectedGroup('all');
      return;
    }

    if (selectedGroup !== 'all' && !groupOptions.includes(selectedGroup)) {
      setSelectedGroup('all');
    }
  }, [groupOptions, selectedGroup]);

  const activeGroup = useMemo(() => {
    if (groupOptions.length === 0) return 'all';
    if (selectedGroup === 'all') return 'all';
    return groupOptions.includes(selectedGroup) ? selectedGroup : 'all';
  }, [groupOptions, selectedGroup]);

  const shouldShowGroups = hideBracketFilter ? false : !activeBracketView;

  if (loading) {
    return <section className="tourn-bracket-root">Cargando grupos...</section>;
  }

  if (groupsByDivision.length === 0) {
    return <section className="tourn-bracket-root">No hay grupos configurados.</section>;
  }

  return (
    <div className="tourn-bracket-groups-board">
      <div className="tourn-bracket-filter-row">
        <div className="tourn-bracket-filter-field tourn-bracket-filter-stack">
          <div className="tourn-bracket-filter-subfield">
            <label htmlFor="division-filter">Division</label>
            <select
              id="division-filter"
              value={selectedDivision}
              onChange={(event) => setSelectedDivision(event.target.value)}
            >
              {divisionOptions.map((divisionName) => (
                <option key={divisionName} value={divisionName}>
                  {divisionName}
                </option>
              ))}
            </select>
          </div>

          {!hideBracketFilter ? (
            <div className="tourn-bracket-filter-subfield">
              <label htmlFor="bracket-view-filter">Bracket</label>
              <select
                id="bracket-view-filter"
                value={activeBracketView}
                onChange={(event) => onBracketViewChange?.(event.target.value)}
              >
                <option value="">--</option>
                <option value="main">Principal</option>
                <option value="ranked">Ranked / Posicionamiento</option>
                <option value="all">Todos</option>
              </select>
            </div>
          ) : null}
        </div>

        {shouldShowGroups ? (
          <div className="tourn-bracket-filter-field">
            <label htmlFor="group-filter">Grupo</label>
            <select
              id="group-filter"
              value={activeGroup}
              onChange={(event) => setSelectedGroup(event.target.value)}
              disabled={groupOptions.length === 0}
            >
              <option value="all">Todas</option>
              {groupOptions.map((groupName) => (
                <option key={groupName} value={groupName}>
                  {groupName}
                </option>
              ))}
            </select>
          </div>
        ) : null}

      </div>

      {shouldShowGroups ? filteredDivisions.map((division) => (
        <section key={division.divisionName} className="tourn-bracket-division-section">
          <h3 className="tourn-bracket-division-title">{division.divisionName}</h3>
          {division.groups
            .filter((group) => activeGroup === 'all' || group.name === activeGroup)
            .map((group) => (
            <article key={`${division.divisionName}-${group.name}`} className="tourn-bracket-group-card">
              <h4 className="tourn-bracket-group-title">{group.name}</h4>
              <div className="tourn-bracket-table-wrap">
                <table className="tourn-bracket-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th className="tourn-bracket-team-col">Equipos</th>
                      <th>PJ</th>
                      <th>G</th>
                      <th>P</th>
                      <th>GA</th>
                      <th>GC</th>
                      <th>DG</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.teams.map((team, index) => (
                      <tr key={team.team_id || team.id || `${group.name}-${team.name}`}>
                        <td>{index + 1}</td>
                        <td className="tourn-bracket-team-cell">
                          <img
                            src={team.url_imagen || TEAM_FALLBACK_IMAGE}
                            alt={team.name || 'Equipo'}
                            loading="lazy"
                            decoding="async"
                            onError={(event) => {
                              if (!event.currentTarget.src.includes(TEAM_FALLBACK_IMAGE)) {
                                event.currentTarget.src = TEAM_FALLBACK_IMAGE;
                              }
                            }}
                          />
                          <span>{team.name || 'Equipo'}</span>
                        </td>
                        <td>{team.gamesPlayed}</td>
                        <td>{team.wins}</td>
                        <td>{team.losses}</td>
                        <td>{team.goalsFor}</td>
                        <td>{team.goalsAgainst}</td>
                        <td>{team.goalDiff}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          ))}
        </section>
      )) : null}
    </div>
  );
}

export default TournamentBracket;
