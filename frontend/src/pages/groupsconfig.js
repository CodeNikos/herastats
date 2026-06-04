import { useEffect, useMemo, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import Navbar from '../components/navbar';
import { configService } from '../services/configService';
import './groupsconfig.css';

const DIVISION_OPTIONS = ['Open', 'Femenino', 'Mixto', 'Open Jr', 'Fem Jr', 'Mixto Jr'];

/** Letras de pool guardadas en team."group" (A, B, C… sin prefijo «Grupo»). */
const getGroupLetters = (count) =>
  Array.from({ length: Math.max(1, count) }, (_, i) => String.fromCharCode(65 + i));

/** Etiqueta solo para la UI. */
const formatGroupLabel = (letter) => {
  const L = String(letter || '').trim().toUpperCase();
  return L ? `Grupo ${L}` : '';
};

/** Normaliza valor leído de BD («Grupo A», «grupo b», «A») → letra única. */
const groupLetterFromDb = (raw) => {
  const s = String(raw || '').trim();
  if (!s) return '';
  const prefixed = s.match(/^grupo\s+([A-Za-z])$/i);
  if (prefixed) return prefixed[1].toUpperCase();
  if (/^[A-Za-z]$/.test(s)) return s.toUpperCase();
  return s;
};

const shuffleTeams = (items) => {
  const array = [...items];
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
};

function CalendarConfig() {
  const { id: routeTournamentId } = useParams();
  const location = useLocation();
  const queryTournamentId = new URLSearchParams(location.search).get('tournamentId');
  const tournamentId = routeTournamentId || queryTournamentId;

  const [teams, setTeams] = useState([]);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [teamsError, setTeamsError] = useState('');
  const [division, setDivision] = useState(DIVISION_OPTIONS[0]);
  const [groupCount, setGroupCount] = useState(2);
  const [assignments, setAssignments] = useState({});
  const [savingGroups, setSavingGroups] = useState(false);
  const [saveMessage, setSaveMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    const loadTeams = async () => {
      if (!tournamentId) {
        setTeams([]);
        setTeamsError('No se encontró el ID del torneo para cargar equipos.');
        setLoadingTeams(false);
        return;
      }

      try {
        setLoadingTeams(true);
        setTeamsError('');
        const response = await configService.getTeams(tournamentId);
        if (!response.success) {
          throw new Error(response.message || 'No se pudieron cargar los equipos.');
        }
        const dbTeams = (response.data?.teams || []).map((team) => ({
          id: String(team.team_id),
          name: team.name,
          division: team.division || 'Sin división',
          group: groupLetterFromDb(team.group)
        }));
        setTeams(dbTeams);
      } catch (error) {
        const errorMessage = error.response?.data?.message || error.message || 'Error al cargar equipos.';
        setTeamsError(errorMessage);
      } finally {
        setLoadingTeams(false);
      }
    };

    loadTeams();
  }, [tournamentId]);

  const teamsInDivision = useMemo(
    () => teams.filter((team) => (team.division || '').toLowerCase() === division.toLowerCase()),
    [teams, division]
  );

  const groupOptions = useMemo(() => getGroupLetters(groupCount), [groupCount]);

  useEffect(() => {
    const nextAssignments = {};
    teamsInDivision.forEach((team) => {
      const letter = groupLetterFromDb(team.group);
      if (letter && groupOptions.includes(letter)) {
        nextAssignments[team.id] = letter;
      }
    });
    setAssignments(nextAssignments);
    setSaveMessage({ type: '', text: '' });
  }, [teamsInDivision, groupOptions]);

  const groupedTeams = useMemo(() => {
    const groupsMap = groupOptions.reduce((acc, group) => {
      acc[group] = [];
      return acc;
    }, {});

    teamsInDivision.forEach((team) => {
      const assignedGroup = assignments[team.id] && groupsMap[assignments[team.id]] ? assignments[team.id] : groupOptions[0];
      groupsMap[assignedGroup].push(team);
    });

    return groupOptions.map((group) => ({
      group,
      teams: groupsMap[group]
    }));
  }, [teamsInDivision, assignments, groupOptions]);

  const handleAssignTeam = (teamId, groupName) => {
    if (savingGroups) return;
    setAssignments((prev) => ({ ...prev, [teamId]: groupName }));
  };

  const handleAutoAssign = () => {
    if (savingGroups) return;
    if (teamsInDivision.length === 0) return;

    const shuffledTeams = shuffleTeams(teamsInDivision);
    const next = {};
    shuffledTeams.forEach((team, index) => {
      const groupIndex = index % groupOptions.length;
      next[team.id] = groupOptions[groupIndex];
    });
    setAssignments(next);
    setSaveMessage({ type: '', text: '' });
  };

  const handleSave = async () => {
    if (savingGroups) {
      return;
    }

    if (!tournamentId) {
      setSaveMessage({ type: 'error', text: 'No se encontró el torneo para guardar grupos.' });
      return;
    }

    if (teamsInDivision.length === 0) {
      setSaveMessage({ type: 'error', text: 'No hay equipos para guardar en esta división.' });
      return;
    }

    const payload = teamsInDivision.map((team) => ({
      teamId: team.id,
      group: assignments[team.id] || groupOptions[0]
    }));

    try {
      setSavingGroups(true);
      setSaveMessage({ type: '', text: '' });
      const response = await configService.saveTeamGroups(tournamentId, payload);
      if (!response.success) {
        throw new Error(response.message || 'No se pudieron guardar los grupos.');
      }

      const updatedById = {};
      (response.data?.teams || []).forEach((team) => {
        updatedById[String(team.team_id)] = groupLetterFromDb(team.group);
      });

      setTeams((prev) =>
        prev.map((team) =>
          updatedById[team.id] !== undefined ? { ...team, group: updatedById[team.id] } : team
        )
      );

      setSaveMessage({ type: 'success', text: 'Grupos guardados correctamente en el backend.' });
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'No se pudo guardar la agrupación.';
      setSaveMessage({ type: 'error', text: errorMessage });
    } finally {
      setSavingGroups(false);
    }
  };

  return (
    <div className="calendarconfig_page">
      <div className="calendarconfig_topbar">
        <Navbar tournamentId={tournamentId} />
      </div>

      <div className="calendarconfig_content">
        <div className="calendarconfig_header">
          <div>
            <h1 className="calendarconfig_title">Configuración de Grupos</h1>
            <p className="calendarconfig_subtitle">Selecciona una división y organiza los equipos por grupos.</p>
          </div>
        </div>

        <section className="calendarconfig_controls">
          <label className="calendarconfig_field">
            <span>División</span>
            <select value={division} onChange={(event) => setDivision(event.target.value)} disabled={savingGroups}>
              {DIVISION_OPTIONS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label className="calendarconfig_field">
            <span>Cantidad de grupos</span>
            <input
              type="number"
              min="1"
              max="8"
              value={groupCount}
              disabled={savingGroups}
              onChange={(event) => setGroupCount(Math.max(1, Math.min(8, Number(event.target.value) || 1)))}
            />
          </label>

          <div className="calendarconfig_actions">
            <button
              type="button"
              className="calendarconfig_btn calendarconfig_btn_secondary"
              onClick={handleAutoAssign}
              disabled={savingGroups}
            >
              Auto Asignar
            </button>
            <button type="button" className="calendarconfig_btn calendarconfig_btn_primary" onClick={handleSave} disabled={savingGroups}>
              {savingGroups ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </section>

        {saveMessage.text ? (
          <div className={`calendarconfig_message ${saveMessage.type === 'error' ? 'calendarconfig_message_error' : 'calendarconfig_message_success'}`}>
            {saveMessage.text}
          </div>
        ) : null}

        {loadingTeams ? (
          <div className="calendarconfig_empty">Cargando equipos...</div>
        ) : teamsError ? (
          <div className="calendarconfig_empty">{teamsError}</div>
        ) : teamsInDivision.length === 0 ? (
          <div className="calendarconfig_empty">No hay equipos en la división seleccionada.</div>
        ) : (
          <section className="calendarconfig_grid">
            <article className="calendarconfig_card">
              <h2 className="calendarconfig_card_title">Asignación por equipo</h2>
              <div className="calendarconfig_table">
                {teamsInDivision.map((team) => (
                  <div key={team.id} className="calendarconfig_table_row">
                    <span className="calendarconfig_team_name">{team.name}</span>
                    <select
                      className="calendarconfig_team_select"
                      value={assignments[team.id] || groupOptions[0]}
                      disabled={savingGroups}
                      onChange={(event) => handleAssignTeam(team.id, event.target.value)}
                    >
                      {groupOptions.map((letter) => (
                        <option key={letter} value={letter}>
                          {formatGroupLabel(letter)}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </article>

            <article className="calendarconfig_card">
              <h2 className="calendarconfig_card_title">Vista agrupada</h2>
              <div className="calendarconfig_groups">
                {groupedTeams.map((groupData) => (
                  <div key={groupData.group} className="calendarconfig_group_block">
                    <h3>{formatGroupLabel(groupData.group)}</h3>
                    {groupData.teams.length === 0 ? (
                      <p className="calendarconfig_group_empty">Sin equipos</p>
                    ) : (
                      <ul>
                        {groupData.teams.map((team) => (
                          <li key={team.id}>{team.name}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </article>
          </section>
        )}
      </div>
    </div>
  );
}

export default CalendarConfig;
