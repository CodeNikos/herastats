import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Navbar from '../components/navbar';
import Noauth_Navbar from '../components/noauth_Navbar';
import { useAuth } from '../hooks/useAuth';
import { configService } from '../services/configService';
import { isAdminOrSuperuser } from '../utils/userRoles';
import {
  FOOTBALL_SCORING_TYPES,
  footballEventAbbrev,
  formatFootballEventMinute,
  buildFootballEventMinuteString,
  parseFootballEventMinuteParts
} from '../utils/footballEventTypes';
import { broadcastTournamentCoherenceChanged } from '../utils/tournamentSync';
import './football_events.css';

const FOOTBALL_EVENT_TYPES = [
  { key: 'GOAL', label: 'Gol', className: 'football-events-action-btn--goal' },
  { key: 'OWN_GOAL', label: 'Autogol', className: 'football-events-action-btn--og' },
  { key: 'YELLOW_CARD', label: 'Tarjeta amarilla', className: 'football-events-action-btn--yc' },
  { key: 'RED_CARD', label: 'Tarjeta roja', className: 'football-events-action-btn--rc' },
  { key: 'PENALTY', label: 'Penal', className: 'football-events-action-btn--penalty' }
];

function FootballEventIcon({ eventType }) {
  const ty = String(eventType || '').trim().toUpperCase();
  if (ty === 'YELLOW_CARD') {
    return <span className="football-events-icon-card football-events-icon-card--yellow" aria-hidden />;
  }
  if (ty === 'RED_CARD') {
    return <span className="football-events-icon-card football-events-icon-card--red" aria-hidden />;
  }
  if (FOOTBALL_SCORING_TYPES.has(ty)) {
    return <span className="football-events-icon-ball" aria-hidden />;
  }
  return null;
}

function FootballEventsPage() {
  const { isAuthenticated, user } = useAuth();
  const hasToken = localStorage.getItem('token') !== null;
  const isUserAuthenticated = isAuthenticated || hasToken;
  const canAnnotate = isAdminOrSuperuser(user);

  const [searchParams] = useSearchParams();
  const tournamentId = searchParams.get('tournamentId');
  const gameId = searchParams.get('gameId');
  const homeTeamId = searchParams.get('homeTeamId');
  const awayTeamId = searchParams.get('awayTeamId');
  const homeTeamName = searchParams.get('homeTeamName') || 'Equipo local';
  const awayTeamName = searchParams.get('awayTeamName') || 'Equipo visitante';

  const [activeTeam, setActiveTeam] = useState('home');
  const [homePlayers, setHomePlayers] = useState([]);
  const [awayPlayers, setAwayPlayers] = useState([]);
  const [events, setEvents] = useState([]);
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);
  const [minute, setMinute] = useState('');
  const [addedMinute, setAddedMinute] = useState('');
  const [loading, setLoading] = useState(true);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [editingEventId, setEditingEventId] = useState(null);
  const [editMinute, setEditMinute] = useState('');
  const [editAddedMinute, setEditAddedMinute] = useState('');
  const [editEventType, setEditEventType] = useState('GOAL');
  const [editPlayerId, setEditPlayerId] = useState(null);
  const [editTeamTab, setEditTeamTab] = useState('home');

  const loadEvents = useCallback(async () => {
    if (!tournamentId || !gameId) return;
    setEventsLoading(true);
    try {
      const res = await configService.getGameEvents(tournamentId, gameId);
      if (!res?.success) {
        throw new Error(res?.message || 'No se pudieron cargar los eventos.');
      }
      const rows = res.data?.events || [];
      const footballOnly = rows.filter((ev) => {
        const ty = String(ev.event_type || '').trim().toUpperCase();
        return ['GOAL', 'OWN_GOAL', 'YELLOW_CARD', 'RED_CARD', 'PENALTY'].includes(ty);
      });
      setEvents(footballOnly);
    } catch (e) {
      setError(e.response?.data?.message || e.message || 'Error al cargar eventos.');
    } finally {
      setEventsLoading(false);
    }
  }, [tournamentId, gameId]);

  const loadPlayers = useCallback(async () => {
    if (!tournamentId) {
      setError('Falta el identificador del torneo.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      let effHome =
        homeTeamId != null && String(homeTeamId).trim() !== '' ? String(homeTeamId).trim() : '';
      let effAway =
        awayTeamId != null && String(awayTeamId).trim() !== '' ? String(awayTeamId).trim() : '';

      if (gameId && (!effHome || !effAway)) {
        const gRes = await configService.getGames(tournamentId);
        if (gRes?.success) {
          const gm = (gRes.data?.games || []).find((row) => Number(row.game_id) === Number(gameId));
          if (gm) {
            if (!effHome && gm.local != null) effHome = String(gm.local);
            if (!effAway && gm.visitor != null) effAway = String(gm.visitor);
          }
        }
      }

      const res = await configService.getPlayers(tournamentId);
      if (!res?.success) {
        throw new Error(res?.message || 'No se pudieron cargar los jugadores.');
      }
      const all = res.data?.players || [];
      const byNumber = (a, b) => (Number(a.player_number) || 0) - (Number(b.player_number) || 0);
      setHomePlayers(effHome ? [...all.filter((p) => String(p.team_id) === effHome)].sort(byNumber) : []);
      setAwayPlayers(effAway ? [...all.filter((p) => String(p.team_id) === effAway)].sort(byNumber) : []);
    } catch (e) {
      setError(e.response?.data?.message || e.message || 'Error al cargar jugadores.');
    } finally {
      setLoading(false);
    }
  }, [tournamentId, homeTeamId, awayTeamId, gameId]);

  useEffect(() => {
    loadPlayers();
  }, [loadPlayers]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const currentPlayers = activeTeam === 'home' ? homePlayers : awayPlayers;

  const sortedEvents = useMemo(
    () => [...events].sort((a, b) => Number(b.event_id) - Number(a.event_id)),
    [events]
  );

  const displayNumber = (player, index) => {
    const n = player.player_number;
    if (n != null && n !== '' && Number.isFinite(Number(n))) return Number(n);
    return index + 1;
  };

  const playerName = (p) => String(p.player_name || p.name || '—').trim() || '—';

  const resolvePlayerTeamSide = (playerTeamId) => {
    if (homeTeamId != null && String(playerTeamId) === String(homeTeamId)) return 'home';
    if (awayTeamId != null && String(playerTeamId) === String(awayTeamId)) return 'away';
    return 'home';
  };

  const editPlayers = editTeamTab === 'home' ? homePlayers : awayPlayers;

  const cancelEdit = () => {
    setEditingEventId(null);
    setEditMinute('');
    setEditAddedMinute('');
    setEditEventType('GOAL');
    setEditPlayerId(null);
    setEditTeamTab('home');
  };

  const startEditEvent = (ev) => {
    const ty = String(ev.event_type || '').trim().toUpperCase();
    const { minute: m, addedMinute: a } = parseFootballEventMinuteParts(ev.event_time);
    setEditingEventId(Number(ev.event_id));
    setEditMinute(m);
    setEditAddedMinute(a);
    setEditEventType(ty);
    setEditPlayerId(ev.player_id != null ? Number(ev.player_id) : null);
    setEditTeamTab(resolvePlayerTeamSide(ev.player_team_id));
    setFeedback('');
  };

  const handleSaveEdit = async () => {
    if (!tournamentId || !gameId || editingEventId == null) return;
    if (editPlayerId == null) {
      alert('Selecciona un jugador.');
      return;
    }
    const eventTime = buildFootballEventMinuteString(editMinute, editAddedMinute);
    if (eventTime == null) {
      const addedTrim = String(editAddedMinute).trim();
      alert(addedTrim !== '' ? 'Indica un tiempo agregado válido (0–30).' : 'Indica un minuto válido (0–200).');
      return;
    }

    setSubmitting(true);
    setFeedback('');
    try {
      const res = await configService.updateGameEvent(tournamentId, gameId, editingEventId, {
        event_type: editEventType,
        event_time: eventTime,
        player_id: editPlayerId
      });
      if (!res?.success) {
        throw new Error(res?.message || 'No se pudo actualizar el evento.');
      }
      const editingEv = events.find((row) => Number(row.event_id) === Number(editingEventId));
      const wasScoring = editingEv
        ? FOOTBALL_SCORING_TYPES.has(String(editingEv.event_type || '').trim().toUpperCase())
        : false;
      setFeedback('Evento actualizado.');
      cancelEdit();
      await loadEvents();
      if (wasScoring || FOOTBALL_SCORING_TYPES.has(editEventType)) {
        broadcastTournamentCoherenceChanged(tournamentId, { fullBracketReload: true });
      }
    } catch (e) {
      alert(e.response?.data?.message || e.message || 'Error al actualizar el evento.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteEvent = async (ev) => {
    if (!tournamentId || !gameId) return;
    const ty = String(ev.event_type || '').trim().toUpperCase();
    const minuteLabel = formatFootballEventMinute(ev.event_time);
    const name = ev.player_name || '—';
    if (!window.confirm(`¿Eliminar ${footballEventAbbrev(ty)} de ${name} (${minuteLabel})?`)) return;

    setSubmitting(true);
    setFeedback('');
    try {
      const res = await configService.deleteGameEvent(tournamentId, gameId, ev.event_id);
      if (!res?.success) {
        throw new Error(res?.message || 'No se pudo eliminar el evento.');
      }
      if (editingEventId != null && Number(editingEventId) === Number(ev.event_id)) {
        cancelEdit();
      }
      setFeedback('Evento eliminado.');
      await loadEvents();
      if (FOOTBALL_SCORING_TYPES.has(ty)) {
        broadcastTournamentCoherenceChanged(tournamentId, { fullBracketReload: true });
      }
    } catch (e) {
      alert(e.response?.data?.message || e.message || 'Error al eliminar el evento.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateEvent = async (eventType) => {
    if (!canAnnotate) {
      alert('Solo administradores y superusuarios pueden anotar eventos en partidos finalizados.');
      return;
    }
    if (!tournamentId || !gameId) {
      alert('Faltan datos del partido.');
      return;
    }
    if (selectedPlayerId == null) {
      alert('Selecciona un jugador.');
      return;
    }
    const eventTime = buildFootballEventMinuteString(minute, addedMinute);
    if (eventTime == null) {
      const addedTrim = String(addedMinute).trim();
      if (addedTrim !== '') {
        alert('Indica un tiempo agregado válido (0–30).');
      } else {
        alert('Indica un minuto válido (0–200).');
      }
      return;
    }

    setSubmitting(true);
    setFeedback('');
    try {
      const res = await configService.createGameEvent(tournamentId, gameId, {
        event_type: eventType,
        event_time: eventTime,
        player_id: selectedPlayerId,
        goals: FOOTBALL_SCORING_TYPES.has(eventType) ? 1 : 0,
        assists: 0
      });
      if (!res?.success) {
        throw new Error(res?.message || 'No se pudo registrar el evento.');
      }
      setFeedback('Evento registrado.');
      await loadEvents();
      if (FOOTBALL_SCORING_TYPES.has(eventType)) {
        broadcastTournamentCoherenceChanged(tournamentId, { fullBracketReload: true });
      }
    } catch (e) {
      alert(e.response?.data?.message || e.message || 'Error al registrar el evento.');
    } finally {
      setSubmitting(false);
    }
  };

  const anotacionBackHref = '/anotacion';

  if (!isUserAuthenticated) {
    return (
      <div className="football-events-page">
        <div className="football-events-topbar">
          <Noauth_Navbar />
        </div>
        <main className="football-events-main">
          <p className="football-events-state">Inicia sesión para anotar eventos.</p>
        </main>
      </div>
    );
  }

  if (!canAnnotate) {
    return (
      <div className="football-events-page">
        <div className="football-events-topbar">
          <Navbar tournamentId={tournamentId} />
        </div>
        <main className="football-events-main">
          <p className="football-events-state football-events-state-error">
            Solo administradores y superusuarios pueden anotar eventos en partidos finalizados de fútbol.
          </p>
          <Link to={anotacionBackHref} className="football-events-back-btn">
            Volver al panel
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="football-events-page">
      <div className="football-events-topbar">
        <Navbar tournamentId={tournamentId} />
      </div>

      <main className="football-events-main">
        <header className="football-events-header">
          <Link to={anotacionBackHref} className="football-events-back-btn">
            ← Panel de anotación
          </Link>
          <h1 className="football-events-title">Eventos del partido</h1>
          <p className="football-events-matchup">
            {homeTeamName} vs {awayTeamName}
          </p>
        </header>

        {loading ? <p className="football-events-state">Cargando jugadores…</p> : null}
        {!loading && error ? (
          <p className="football-events-state football-events-state-error" role="alert">
            {error}
          </p>
        ) : null}

        {!loading && !error ? (
          <>
            <div className="football-events-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={activeTeam === 'home'}
                className={`football-events-tab${activeTeam === 'home' ? ' football-events-tab--active' : ''}`}
                onClick={() => {
                  setActiveTeam('home');
                  setSelectedPlayerId(null);
                }}
              >
                {homeTeamName}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTeam === 'away'}
                className={`football-events-tab${activeTeam === 'away' ? ' football-events-tab--active' : ''}`}
                onClick={() => {
                  setActiveTeam('away');
                  setSelectedPlayerId(null);
                }}
              >
                {awayTeamName}
              </button>
            </div>

            <div className="football-events-minute-row">
              <label htmlFor="football-minute">Minuto</label>
              <div className="football-events-minute-fields">
                <input
                  id="football-minute"
                  type="number"
                  min={0}
                  max={200}
                  className="football-events-minute-input"
                  value={minute}
                  onChange={(e) => setMinute(e.target.value)}
                  placeholder="45"
                />
                {String(addedMinute).trim() !== '' ? (
                  <span className="football-events-minute-plus" aria-hidden>
                    +
                  </span>
                ) : null}
                <input
                  id="football-added-minute"
                  type="number"
                  min={0}
                  max={30}
                  className="football-events-minute-input football-events-minute-input--added"
                  value={addedMinute}
                  onChange={(e) => setAddedMinute(e.target.value)}
                  placeholder="Agregado"
                  aria-label="Tiempo agregado"
                />
              </div>
            </div>

            <div className="football-events-players">
              {currentPlayers.length === 0 ? (
                <p className="football-events-state">No hay jugadores en este equipo.</p>
              ) : (
                currentPlayers.map((player, index) => {
                  const pid = player.player_id;
                  const selected = selectedPlayerId != null && Number(selectedPlayerId) === Number(pid);
                  return (
                    <button
                      key={pid != null ? `p-${pid}` : `idx-${index}`}
                      type="button"
                      className={`football-events-player-btn${selected ? ' football-events-player-btn--selected' : ''}`}
                      onClick={() => setSelectedPlayerId(pid)}
                    >
                      <span className="football-events-player-num">{displayNumber(player, index)}</span>
                      <span>{playerName(player)}</span>
                    </button>
                  );
                })
              )}
            </div>

            <div className="football-events-actions">
              {FOOTBALL_EVENT_TYPES.map((action) => (
                <button
                  key={action.key}
                  type="button"
                  className={`football-events-action-btn ${action.className}`}
                  disabled={submitting || selectedPlayerId == null}
                  onClick={() => handleCreateEvent(action.key)}
                >
                  {action.label}
                </button>
              ))}
            </div>

            {feedback ? <p className="football-events-state">{feedback}</p> : null}

            <h2 className="football-events-list-title">Eventos registrados</h2>
            {eventsLoading ? <p className="football-events-state">Cargando eventos…</p> : null}
            {!eventsLoading && sortedEvents.length === 0 ? (
              <p className="football-events-state">Aún no hay eventos de fútbol en este partido.</p>
            ) : null}
            {!eventsLoading && sortedEvents.length > 0 ? (
              <ul className="football-events-list">
                {sortedEvents.map((ev) => {
                  const ty = String(ev.event_type || '').trim().toUpperCase();
                  const abbrev = footballEventAbbrev(ty);
                  const minuteLabel = formatFootballEventMinute(ev.event_time);
                  const name = ev.player_name || '—';
                  const isEditing = editingEventId != null && Number(editingEventId) === Number(ev.event_id);

                  if (isEditing) {
                    return (
                      <li key={ev.event_id} className="football-events-list-item football-events-list-item--editing">
                        <div className="football-events-edit-form">
                          <div className="football-events-minute-row football-events-minute-row--compact">
                            <label htmlFor={`edit-minute-${ev.event_id}`}>Minuto</label>
                            <div className="football-events-minute-fields">
                              <input
                                id={`edit-minute-${ev.event_id}`}
                                type="number"
                                min={0}
                                max={200}
                                className="football-events-minute-input"
                                value={editMinute}
                                onChange={(e) => setEditMinute(e.target.value)}
                              />
                              {String(editAddedMinute).trim() !== '' ? (
                                <span className="football-events-minute-plus" aria-hidden>
                                  +
                                </span>
                              ) : null}
                              <input
                                type="number"
                                min={0}
                                max={30}
                                className="football-events-minute-input football-events-minute-input--added"
                                value={editAddedMinute}
                                onChange={(e) => setEditAddedMinute(e.target.value)}
                                placeholder="Agregado"
                                aria-label="Tiempo agregado"
                              />
                            </div>
                          </div>

                          <label className="football-events-edit-label" htmlFor={`edit-type-${ev.event_id}`}>
                            Tipo
                          </label>
                          <select
                            id={`edit-type-${ev.event_id}`}
                            className="football-events-edit-select"
                            value={editEventType}
                            onChange={(e) => setEditEventType(e.target.value)}
                          >
                            {FOOTBALL_EVENT_TYPES.map((action) => (
                              <option key={action.key} value={action.key}>
                                {action.label}
                              </option>
                            ))}
                          </select>

                          <div className="football-events-edit-tabs" role="tablist">
                            <button
                              type="button"
                              role="tab"
                              className={`football-events-edit-tab${editTeamTab === 'home' ? ' football-events-edit-tab--active' : ''}`}
                              onClick={() => setEditTeamTab('home')}
                            >
                              {homeTeamName}
                            </button>
                            <button
                              type="button"
                              role="tab"
                              className={`football-events-edit-tab${editTeamTab === 'away' ? ' football-events-edit-tab--active' : ''}`}
                              onClick={() => setEditTeamTab('away')}
                            >
                              {awayTeamName}
                            </button>
                          </div>

                          <select
                            className="football-events-edit-select"
                            value={editPlayerId ?? ''}
                            onChange={(e) =>
                              setEditPlayerId(e.target.value === '' ? null : Number(e.target.value))
                            }
                          >
                            <option value="">Selecciona jugador</option>
                            {editPlayers.map((player, index) => (
                              <option key={player.player_id} value={player.player_id}>
                                {displayNumber(player, index)} — {playerName(player)}
                              </option>
                            ))}
                          </select>

                          <div className="football-events-edit-actions">
                            <button
                              type="button"
                              className="football-events-edit-btn football-events-edit-btn--save"
                              disabled={submitting}
                              onClick={handleSaveEdit}
                            >
                              Guardar
                            </button>
                            <button
                              type="button"
                              className="football-events-edit-btn football-events-edit-btn--cancel"
                              disabled={submitting}
                              onClick={cancelEdit}
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      </li>
                    );
                  }

                  return (
                    <li key={ev.event_id} className="football-events-list-item">
                      <span className="football-events-list-minute">{minuteLabel}</span>
                      <span className="football-events-list-name">{name}</span>
                      <FootballEventIcon eventType={ty} />
                      <span className="football-events-list-badge">({abbrev})</span>
                      <div className="football-events-list-actions">
                        <button
                          type="button"
                          className="football-events-list-btn"
                          disabled={submitting}
                          onClick={() => startEditEvent(ev)}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="football-events-list-btn football-events-list-btn--danger"
                          disabled={submitting}
                          onClick={() => handleDeleteEvent(ev)}
                        >
                          Eliminar
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </>
        ) : null}
      </main>
    </div>
  );
}

export default FootballEventsPage;
