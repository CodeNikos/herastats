import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import Navbar from '../components/navbar';
import { configService } from '../services/configService';
import { isGameFinishedState } from '../utils/gamePhaseClock';
import './team_players.css';

const TEAM_FALLBACK_IMAGE = '/Hera_logo.png';

const parseScoreValue = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).trim());
  return Number.isFinite(n) ? n : null;
};

const normalizeGameDate = (raw) => {
  if (raw == null || raw === '') return '';
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw.toISOString().split('T')[0];
  }
  const s = String(raw).trim();
  return s.includes('T') ? s.split('T')[0] : s.slice(0, 10);
};

const normalizeGameTime = (raw) => {
  if (raw == null || raw === '') return '';
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    const h = raw.getHours();
    const m = raw.getMinutes();
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  const s = String(raw).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) return `${m[1].padStart(2, '0')}:${m[2]}`;
  return s.slice(0, 8);
};

const gameSortDateTimeMs = (game) => {
  const dateStr = normalizeGameDate(game?.game_date);
  if (!dateStr) return 0;
  const timeStr = normalizeGameTime(game?.game_time) || '00:00';
  const timePart = timeStr.length === 5 ? `${timeStr}:00` : timeStr;
  const parsed = Date.parse(`${dateStr}T${timePart}`);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatTeamGameDateTime = (game) => {
  const dateStr = normalizeGameDate(game?.game_date);
  const timeStr = normalizeGameTime(game?.game_time);
  if (!dateStr) return '—';
  const timePart = timeStr ? (timeStr.length === 5 ? `${timeStr}:00` : timeStr) : '00:00:00';
  const parsed = new Date(`${dateStr}T${timePart}`);
  if (Number.isNaN(parsed.getTime())) return `${dateStr}${timeStr ? ` ${timeStr}` : ''}`.trim();
  return parsed.toLocaleString('es-ES', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
};

function filterTeamGames(games, teamId, teamDivision) {
  const tid = Number(teamId);
  const div = (teamDivision || '').trim();
  return (games || []).filter((g) => {
    const local = g.local != null ? Number(g.local) : null;
    const visitor = g.visitor != null ? Number(g.visitor) : null;
    if (local !== tid && visitor !== tid) return false;
    if (g.division && div && String(g.division).trim() !== div) return false;
    return true;
  });
}

function gameRowEstado(game) {
  return game?.estado ?? game?.Estado ?? '';
}

/** Convierte respuesta de espíritu API (reglas, faltas, …) en dimensiones y total 0–20. */
function spiritDimsFromPayload(rec) {
  if (!rec) return null;
  const keys = ['rules', 'fouls', 'fairmind', 'attitude', 'communication'];
  const parts = keys.map((k) => Number(rec[k]));
  if (parts.every((n) => Number.isFinite(n))) {
    const total = parts.reduce((s, n) => s + n, 0);
    return {
      rules: parts[0],
      fouls: parts[1],
      fairmind: parts[2],
      attitude: parts[3],
      communication: parts[4],
      total,
      avgSpirit: total / 5
    };
  }
  return null;
}

function opponentSideMeta(game, isOurTeamLocal) {
  const name = isOurTeamLocal ? game.visitor_name || 'Visitante' : game.local_name || 'Local';
  const image = isOurTeamLocal ? game.visitor_image : game.local_image;
  const rawSlot = isOurTeamLocal ? game.stats_slot_visitor : game.stats_slot_local;
  let suffix = '';
  const slotTrim = rawSlot != null ? String(rawSlot).trim() : '';
  if (slotTrim !== '') suffix = ` (${slotTrim})`;
  else if (game.game_num != null && String(game.game_num).trim() !== '')
    suffix = ` (${String(game.game_num).trim()})`;
  return { opponentName: name, opponentImage: image || null, oppSuffix: suffix };
}

function scoreFirstOurTeam(game, isOurTeamLocal) {
  const ls = parseScoreValue(game.local_score);
  const vs = parseScoreValue(game.visitor_score);
  if (ls !== null && vs !== null) {
    const ours = isOurTeamLocal ? ls : vs;
    const theirs = isOurTeamLocal ? vs : ls;
    return `${ours} - ${theirs}`;
  }
  if (ls !== null || vs !== null) {
    const ours = isOurTeamLocal ? ls ?? '—' : vs ?? '—';
    const theirs = isOurTeamLocal ? vs ?? '—' : ls ?? '—';
    return `${ours} - ${theirs}`;
  }
  return '—';
}

/** Primer clic al cambiar columna: fechas/partido ascendente y nombre; puntajes numéricos con más altos primero. */
function defaultSpiritSortAsc(sortKey) {
  if (
    ['total', 'rules', 'fouls', 'fairmind', 'attitude', 'communication', 'avgSpirit'].includes(sortKey)
  ) {
    return false;
  }
  return true;
}

function compareSpiritSheetRows(a, b, sortKey, asc) {
  const dir = asc ? 1 : -1;
  const n = (v) =>
    typeof v === 'number' && Number.isFinite(v) ? v : Number.isFinite(Number(v)) ? Number(v) : null;
  let cmp = 0;
  switch (sortKey) {
    case 'sortMs':
      cmp = (a.sortMs || 0) - (b.sortMs || 0);
      break;
    case 'scoreLabel':
      cmp = String(a.scoreLabel || '').localeCompare(String(b.scoreLabel || ''), 'es', { numeric: true });
      break;
    case 'opponent':
      cmp = String(a.opponentName || '')
        .toLowerCase()
        .localeCompare(String(b.opponentName || '').toLowerCase(), 'es');
      break;
    case 'total':
      cmp = (n(a.total) ?? -1) - (n(b.total) ?? -1);
      break;
    case 'rules':
      cmp = (n(a.rules) ?? -1) - (n(b.rules) ?? -1);
      break;
    case 'fouls':
      cmp = (n(a.fouls) ?? -1) - (n(b.fouls) ?? -1);
      break;
    case 'fairmind':
      cmp = (n(a.fairmind) ?? -1) - (n(b.fairmind) ?? -1);
      break;
    case 'attitude':
      cmp = (n(a.attitude) ?? -1) - (n(b.attitude) ?? -1);
      break;
    case 'communication':
      cmp = (n(a.communication) ?? -1) - (n(b.communication) ?? -1);
      break;
    case 'avgSpirit':
      cmp = (n(a.avgSpirit) ?? -1) - (n(b.avgSpirit) ?? -1);
      break;
    default:
      cmp = 0;
  }
  return cmp * dir || (a.game_id || 0) - (b.game_id || 0);
}

function sortSpiritSheetRows(rows, { key, asc }) {
  return [...rows].sort((a, b) => compareSpiritSheetRows(a, b, key, asc));
}

const sortIconSvg = (
  <svg className="tp_sort_icon" width="14" height="14" viewBox="0 0 24 24" aria-hidden>
    <path
      fill="currentColor"
      d="M7 14l5-5 5 5H7zm0 4h10v-2H7v2zM4 6v2h16V6H4z"
    />
  </svg>
);

function aggregateTeamGames(games, teamId, teamDivision) {
  const filtered = filterTeamGames(games, teamId, teamDivision);
  const tid = Number(teamId);

  let wins = 0;
  let losses = 0;
  let goalsFor = 0;
  let goalsAgainst = 0;
  let playedWithScore = 0;

  filtered.forEach((g) => {
    const ls = parseScoreValue(g.local_score);
    const vs = parseScoreValue(g.visitor_score);
    const isLocal = Number(g.local) === tid;
    if (ls !== null && vs !== null) {
      playedWithScore += 1;
      const teamScore = isLocal ? ls : vs;
      const oppScore = isLocal ? vs : ls;
      goalsFor += teamScore;
      goalsAgainst += oppScore;
      if (teamScore > oppScore) wins += 1;
      else if (teamScore < oppScore) losses += 1;
    }
  });

  return {
    gamesPlayed: filtered.length,
    wins,
    losses,
    goalsFor,
    goalsAgainst,
    goalDiff: goalsFor - goalsAgainst,
    playedWithScore
  };
}

function TeamPlayersPage() {
  const { tournamentId: routeTournamentId, teamId: routeTeamId } = useParams();
  const [searchParams] = useSearchParams();
  const tournamentId = routeTournamentId || searchParams.get('tournamentId');
  const teamId = routeTeamId || searchParams.get('teamId');

  const [tournament, setTournament] = useState(null);
  const [team, setTeam] = useState(null);
  const [players, setPlayers] = useState([]);
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [playerEventStatsByPlayerId, setPlayerEventStatsByPlayerId] = useState({});
  const [spiritSheets, setSpiritSheets] = useState({ received: [], given: [] });
  const [spiritLoading, setSpiritLoading] = useState(false);
  const [spiritError, setSpiritError] = useState('');
  const [spiritSortReceived, setSpiritSortReceived] = useState({ key: 'sortMs', asc: true });
  const [spiritSortGiven, setSpiritSortGiven] = useState({ key: 'sortMs', asc: true });
  const [activeTab, setActiveTab] = useState('players');
  const [sortKey, setSortKey] = useState('total');
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!tournamentId || !teamId) {
        setError('Faltan el torneo o el equipo en la URL.');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');

      try {
        const [tRes, teamsRes, plRes, gRes] = await Promise.all([
          configService.getTournamentById(tournamentId),
          configService.getTeams(tournamentId),
          configService.getPlayers(tournamentId),
          configService.getGames(tournamentId)
        ]);

        if (!tRes?.success) {
          throw new Error(tRes?.message || 'No se pudo cargar el torneo.');
        }
        setTournament(tRes.data?.tournament || null);

        if (!teamsRes?.success) {
          throw new Error(teamsRes?.message || 'No se pudieron cargar los equipos.');
        }
        const teams = teamsRes.data?.teams || [];
        const found = teams.find((t) => String(t.team_id) === String(teamId));
        if (!found) {
          setTeam(null);
          setError('No se encontró el equipo en este torneo.');
          setPlayers([]);
          setGames([]);
          setPlayerEventStatsByPlayerId({});
          return;
        }
        setTeam(found);

        let statsMap = {};
        try {
          const divisionTrim =
            found.division != null && String(found.division).trim() !== '' ? String(found.division).trim() : '';
          const peOpts = divisionTrim !== '' ? { division: divisionTrim, scope: 'all' } : { scope: 'all' };
          const peRes = await configService.getTournamentPlayerEventStats(tournamentId, peOpts);
          if (peRes?.success && Array.isArray(peRes.data?.players)) {
            peRes.data.players.forEach((row) => {
              if (String(row.team_id) !== String(teamId)) return;
              statsMap[String(row.player_id)] = row;
            });
          }
        } catch (_) {
          statsMap = {};
        }
        setPlayerEventStatsByPlayerId(statsMap);

        if (!plRes?.success) {
          throw new Error(plRes?.message || 'No se pudieron cargar los jugadores.');
        }
        const allPlayers = plRes.data?.players || [];
        setPlayers(allPlayers.filter((p) => String(p.team_id) === String(teamId)));

        if (!gRes?.success) {
          throw new Error(gRes?.message || 'No se pudieron cargar los partidos.');
        }
        setGames(gRes.data?.games || []);
      } catch (e) {
        setError(e.response?.data?.message || e.message || 'Error al cargar datos.');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [tournamentId, teamId]);

  const teamStats = useMemo(
    () => aggregateTeamGames(games, teamId, team?.division),
    [games, teamId, team]
  );

  const teamGamesList = useMemo(() => {
    const tid = Number(teamId);
    return filterTeamGames(games, teamId, team?.division)
      .map((g) => {
        const isLocal = Number(g.local) === tid;
        const teamScore = parseScoreValue(isLocal ? g.local_score : g.visitor_score);
        const oppScore = parseScoreValue(isLocal ? g.visitor_score : g.local_score);
        const scoreLabel =
          teamScore !== null && oppScore !== null
            ? `${teamScore} - ${oppScore}`
            : teamScore !== null || oppScore !== null
              ? `${teamScore ?? '—'} - ${oppScore ?? '—'}`
              : '—';
        let result = '—';
        if (teamScore !== null && oppScore !== null) {
          if (teamScore > oppScore) result = 'Victoria';
          else if (teamScore < oppScore) result = 'Derrota';
          else result = 'Empate';
        }
        return {
          game: g,
          isLocal,
          opponentName: isLocal ? g.visitor_name || 'Visitante' : g.local_name || 'Local',
          scoreLabel,
          result,
          dateTimeLabel: formatTeamGameDateTime(g),
          sortMs: gameSortDateTimeMs(g)
        };
      })
      .sort((a, b) => a.sortMs - b.sortMs);
  }, [games, teamId, team?.division]);

  /** Promedio de espíritu recibido (~0–4) por partido con encuesta. */
  const teamSpiritAvgDisplay = useMemo(() => {
    const rows = spiritSheets.received;
    if (!rows.length) return null;
    const sum = rows.reduce((acc, r) => acc + (Number.isFinite(r.avgSpirit) ? r.avgSpirit : 0), 0);
    return sum / rows.length;
  }, [spiritSheets.received]);

  const sortedSpiritReceived = useMemo(
    () => sortSpiritSheetRows(spiritSheets.received, spiritSortReceived),
    [spiritSheets.received, spiritSortReceived]
  );

  const sortedSpiritGiven = useMemo(
    () => sortSpiritSheetRows(spiritSheets.given, spiritSortGiven),
    [spiritSheets.given, spiritSortGiven]
  );

  useEffect(() => {
    let cancelled = false;

    async function loadSpiritScores() {
      if (!tournamentId || !teamId) {
        setSpiritSheets({ received: [], given: [] });
        setSpiritLoading(false);
        setSpiritError('');
        return;
      }

      // Partidos donde juega el equipo sin filtro de división (evita ocultar partidos con espíritu si game.division ≠ team.division).
      const participationGames = filterTeamGames(games, teamId, '');
      let gamesForSpirit = participationGames.filter((g) => isGameFinishedState(gameRowEstado(g)));
      if (gamesForSpirit.length === 0 && participationGames.length > 0) {
        gamesForSpirit = participationGames;
      }
      if (gamesForSpirit.length === 0) {
        setSpiritSheets({ received: [], given: [] });
        setSpiritLoading(false);
        setSpiritError('');
        return;
      }

      setSpiritLoading(true);
      setSpiritError('');

      const receivedRows = [];
      const givenRows = [];
      const tidNum = Number(teamId);

      try {
        for (const g of [...gamesForSpirit].sort((a, b) => gameSortDateTimeMs(a) - gameSortDateTimeMs(b))) {
          if (cancelled) return;
          try {
            const pkg = await configService.getGameSpiritScores(tournamentId, g.game_id);
            if (!pkg?.success || !pkg.data) continue;
            const d = pkg.data;
            const isOurTeamLocal = Number(g.local) === tidNum;
            const received = isOurTeamLocal ? d.localReceived : d.visitorReceived;
            const givenRaw = isOurTeamLocal ? d.visitorReceived : d.localReceived;
            const recDims = spiritDimsFromPayload(received);
            const givenDims = spiritDimsFromPayload(givenRaw);
            const { opponentName, opponentImage, oppSuffix } = opponentSideMeta(g, isOurTeamLocal);
            const scoreLabel = scoreFirstOurTeam(g, isOurTeamLocal);
            const sortMs = gameSortDateTimeMs(g);
            const rowBase = {
              game_id: g.game_id,
              sortMs,
              scoreLabel,
              opponentName,
              opponentImage,
              oppSuffix,
              game: g
            };
            if (recDims) receivedRows.push({ ...rowBase, ...recDims });
            if (givenDims) givenRows.push({ ...rowBase, ...givenDims });
          } catch (_) {
            /* omitir partido si falla un fetch individual */
          }
        }
        if (!cancelled) {
          receivedRows.sort((a, b) => a.sortMs - b.sortMs);
          givenRows.sort((a, b) => a.sortMs - b.sortMs);
          setSpiritSheets({ received: receivedRows, given: givenRows });
        }
      } catch (e) {
        if (!cancelled) setSpiritError(e.response?.data?.message || e.message || 'No se pudieron cargar datos de espíritu.');
      } finally {
        setSpiritLoading(false);
      }
    }

    loadSpiritScores();

    return () => {
      cancelled = true;
    };
  }, [tournamentId, teamId, team?.division, games]);

  const countryLabel = tournament?.country || tournament?.location || '—';

  const tableRows = useMemo(() => {
    return players.map((p) => {
      const stat = playerEventStatsByPlayerId[String(p.player_id)] || {};
      const goals = Number(stat.goals) || 0;
      const assists = Number(stat.assists) || 0;
      const gamesPlayedEv = Number(stat.games) || 0;
      const callahans = Number(stat.callahans) || 0;
      const total = goals + assists;
      const gamesDenom = gamesPlayedEv > 0 ? gamesPlayedEv : 1;
      return {
        ...p,
        _total: total,
        _assists: assists,
        _goals: goals,
        _callahans: callahans,
        _games: gamesPlayedEv,
        _totGm: total / gamesDenom,
        _astGm: assists / gamesDenom,
        _glsGm: goals / gamesDenom
      };
    });
  }, [players, playerEventStatsByPlayerId]);

  const sortedRows = useMemo(() => {
    const dir = sortAsc ? 1 : -1;
    const key = sortKey;
    return [...tableRows].sort((a, b) => {
      switch (key) {
        case 'player_number':
          return ((Number(a.player_number) || 0) - (Number(b.player_number) || 0)) * dir;
        case 'player_name':
          return String(a.player_name || '')
            .toLowerCase()
            .localeCompare(String(b.player_name || '').toLowerCase(), 'es') * dir;
        case 'total':
          return (a._total - b._total) * dir;
        case 'assists':
          return (a._assists - b._assists) * dir;
        case 'goals':
          return (a._goals - b._goals) * dir;
        case 'games':
          return (a._games - b._games) * dir;
        case 'tot_gm':
          return (a._totGm - b._totGm) * dir;
        case 'ast_gm':
          return (a._astGm - b._astGm) * dir;
        case 'gls_gm':
          return (a._glsGm - b._glsGm) * dir;
        case 'callahans':
          return (a._callahans - b._callahans) * dir;
        default:
          return 0;
      }
    });
  }, [tableRows, sortKey, sortAsc]);

  const onSort = (key) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortAsc((a) => !a);
        return prev;
      }
      setSortAsc(key === 'player_name' || key === 'player_number');
      return key;
    });
  };

  const fmtNum = (n) => (Number.isFinite(n) ? n.toFixed(2) : '0.00');

  const headerBtn = (colKey, label) => {
    const active = sortKey === colKey;
    return (
      <button type="button" className={`tp_th_btn${active ? ' tp_th_btn--active' : ''}`} onClick={() => onSort(colKey)}>
        <span>{label}</span>
        {sortIconSvg}
      </button>
    );
  };

  const statsLink = tournamentId ? `/stats?tournamentId=${encodeURIComponent(tournamentId)}` : '/stats';

  const buildGamePath = (game) => {
    const params = new URLSearchParams();
    params.set('gameId', String(game.game_id));
    params.set('tournamentId', String(tournamentId));
    if (game.local != null) params.set('homeTeamId', String(game.local));
    if (game.visitor != null) params.set('awayTeamId', String(game.visitor));
    return `/game?${params.toString()}`;
  };

  const renderPlayersTable = () => (
    <div className="tp_table_wrap">
      <table className="tp_table" aria-label="Estadísticas por jugador">
        <thead>
          <tr>
            <th className="tp_th tp_th--left">{headerBtn('player_number', '#')}</th>
            <th className="tp_th tp_th--left">{headerBtn('player_name', 'Nombre')}</th>
            <th className="tp_th tp_th--total">{headerBtn('total', 'Total')}</th>
            <th className="tp_th">{headerBtn('assists', 'Asistencias')}</th>
            <th className="tp_th">{headerBtn('goals', 'Goles')}</th>
            <th className="tp_th">{headerBtn('games', 'Partidos')}</th>
            <th className="tp_th">{headerBtn('tot_gm', 'Tot/P')}</th>
            <th className="tp_th">{headerBtn('ast_gm', 'Ast/P')}</th>
            <th className="tp_th">{headerBtn('gls_gm', 'Gol/P')}</th>
            <th className="tp_th">{headerBtn('callahans', 'Callahans')}</th>
          </tr>
        </thead>
        <tbody>
          {sortedRows.length === 0 ? (
            <tr>
              <td colSpan={10} className="tp_empty">
                No hay jugadores registrados para este equipo.
              </td>
            </tr>
          ) : (
            sortedRows.map((row, idx) => (
              <tr key={row.player_id ?? `${row.team_id}-${row.player_number}-${idx}`} className="tp_tr">
                <td className="tp_td tp_td--left">{row.player_number ?? '—'}</td>
                <td className="tp_td tp_td--left">{row.player_name ?? '—'}</td>
                <td className="tp_td tp_td--total">{row._total}</td>
                <td className="tp_td">{row._assists}</td>
                <td className="tp_td">{row._goals}</td>
                <td className="tp_td">{row._games}</td>
                <td className="tp_td">{fmtNum(row._totGm)}</td>
                <td className="tp_td">{fmtNum(row._astGm)}</td>
                <td className="tp_td">{fmtNum(row._glsGm)}</td>
                <td className="tp_td">{row._callahans}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );

  const renderGamesTable = () => (
    <div className="tp_table_wrap">
      <table className="tp_table tp_games_table" aria-label="Partidos del equipo">
        <thead>
          <tr>
            <th className="tp_th tp_th--left">Fecha y hora</th>
            <th className="tp_th tp_th--left">Rival</th>
            <th className="tp_th">Condición</th>
            <th className="tp_th">Marcador</th>
            <th className="tp_th">Resultado</th>
            <th className="tp_th tp_th--left">Fase</th>
            <th className="tp_th tp_th--left">Ubicación</th>
            <th className="tp_th">Estado</th>
          </tr>
        </thead>
        <tbody>
          {teamGamesList.length === 0 ? (
            <tr>
              <td colSpan={8} className="tp_empty">
                No hay partidos registrados para este equipo.
              </td>
            </tr>
          ) : (
            teamGamesList.map((row) => {
              const { game } = row;
              const estado =
                game.estado != null && String(game.estado).trim() !== '' ? String(game.estado).trim() : '—';
              return (
                <tr key={game.game_id} className="tp_tr">
                  <td className="tp_td tp_td--left tp_td--datetime">{row.dateTimeLabel}</td>
                  <td className="tp_td tp_td--left">
                    <Link to={buildGamePath(game)} className="tp_game_link">
                      {row.opponentName}
                    </Link>
                  </td>
                  <td className="tp_td">{row.isLocal ? 'Local' : 'Visitante'}</td>
                  <td className="tp_td tp_td--score">
                    <Link to={buildGamePath(game)} className="tp_game_link">
                      {row.scoreLabel}
                    </Link>
                  </td>
                  <td className="tp_td">{row.result}</td>
                  <td className="tp_td tp_td--left">{game.phase_name || '—'}</td>
                  <td className="tp_td tp_td--left">{game.game_location || '—'}</td>
                  <td className="tp_td">{estado}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );

  const spiritRecvSortBtn = (colKey, label) => {
    const active = spiritSortReceived.key === colKey;
    return (
      <button
        type="button"
        className={`tp_th_btn${active ? ' tp_th_btn--active' : ''}`}
        onClick={() =>
          setSpiritSortReceived((prev) => ({
            key: colKey,
            asc: prev.key === colKey ? !prev.asc : defaultSpiritSortAsc(colKey)
          }))
        }
      >
        <span>{label}</span>
        {sortIconSvg}
      </button>
    );
  };

  const spiritGivenSortBtn = (colKey, label) => {
    const active = spiritSortGiven.key === colKey;
    return (
      <button
        type="button"
        className={`tp_th_btn${active ? ' tp_th_btn--active' : ''}`}
        onClick={() =>
          setSpiritSortGiven((prev) => ({
            key: colKey,
            asc: prev.key === colKey ? !prev.asc : defaultSpiritSortAsc(colKey)
          }))
        }
      >
        <span>{label}</span>
        {sortIconSvg}
      </button>
    );
  };

  const dimSpiritInt = (n) =>
    Number.isFinite(n) && !Number.isNaN(n) ? String(Math.round(Number(n))) : '—';

  const spiritSheetTableColumns = (
    <>
      <th className="tp_th tp_th--score">{spiritRecvSortBtn('total', 'Total')}</th>
      <th className="tp_th">{spiritRecvSortBtn('rules', 'Reglas')}</th>
      <th className="tp_th">{spiritRecvSortBtn('fouls', 'Contacto')}</th>
      <th className="tp_th">{spiritRecvSortBtn('fairmind', 'Fair')}</th>
      <th className="tp_th">{spiritRecvSortBtn('attitude', 'Actitud')}</th>
      <th className="tp_th">{spiritRecvSortBtn('communication', 'Comunic.')}</th>
    </>
  );

  const spiritSheetTableGivenColumns = (
    <>
      <th className="tp_th tp_th--score">{spiritGivenSortBtn('total', 'Total')}</th>
      <th className="tp_th">{spiritGivenSortBtn('rules', 'Reglas')}</th>
      <th className="tp_th">{spiritGivenSortBtn('fouls', 'Contacto')}</th>
      <th className="tp_th">{spiritGivenSortBtn('fairmind', 'Fair')}</th>
      <th className="tp_th">{spiritGivenSortBtn('attitude', 'Actitud')}</th>
      <th className="tp_th">{spiritGivenSortBtn('communication', 'Comunic.')}</th>
    </>
  );

  const renderSpiritSheetBodyRows = (rows) =>
    rows.map((r, idx) => (
      <tr key={r.game_id} className={`tp_tr tp_spirit_tr${idx % 2 === 1 ? ' tp_spirit_tr--alt' : ''}`}>
        <td className="tp_td tp_td--left">
          <Link to={buildGamePath(r.game)} className="tp_game_link">
            {r.scoreLabel}
          </Link>
        </td>
        <td className="tp_td tp_td--left">
          <span className="tp_spirit_team_cell">
            <img
              className="tp_spirit_team_flag"
              src={r.opponentImage || TEAM_FALLBACK_IMAGE}
              alt=""
              onError={(e) => {
                if (!e.currentTarget.src.includes(TEAM_FALLBACK_IMAGE)) e.currentTarget.src = TEAM_FALLBACK_IMAGE;
              }}
            />
            <span className="tp_spirit_opp_text">
              <span className="tp_spirit_opp_name">{r.opponentName}</span>
              {r.oppSuffix ? <span className="tp_spirit_opp_suffix">{r.oppSuffix}</span> : null}
            </span>
          </span>
        </td>
        <td className="tp_td tp_td--num">{dimSpiritInt(r.total)}</td>
        <td className="tp_td tp_td--num">{dimSpiritInt(r.rules)}</td>
        <td className="tp_td tp_td--num">{dimSpiritInt(r.fouls)}</td>
        <td className="tp_td tp_td--num">{dimSpiritInt(r.fairmind)}</td>
        <td className="tp_td tp_td--num">{dimSpiritInt(r.attitude)}</td>
        <td className="tp_td tp_td--num">{dimSpiritInt(r.communication)}</td>
      </tr>
    ));

  const renderSpiritSection = () => {
    if (
      spiritLoading &&
      spiritSheets.received.length === 0 &&
      spiritSheets.given.length === 0
    ) {
      return <div className="tp_state">Cargando espiritu...</div>;
    }
    if (spiritError) {
      return <div className="tp_empty tp_state--error">{spiritError}</div>;
    }
    if (
      !spiritLoading &&
      spiritSheets.received.length === 0 &&
      spiritSheets.given.length === 0
    ) {
      return (
        <div className="tp_empty">
          No hay encuestas de espíritu en partidos finalizados de este equipo, o los rivales aún no enviaron la
          encuesta.
        </div>
      );
    }

    const wrapTable = (
      headingId,
      ariaTableLabel,
      displayTitle,
      emptyHint,
      headerSecondLabel,
      sortBtn,
      colsFragment,
      sortedRowsInner
    ) => (
      <section className="tp_spirit_sheet" aria-labelledby={headingId}>
        <h3 id={headingId} className="tp_spirit_sheet_title">
          {displayTitle}
        </h3>
        {sortedRowsInner.length === 0 ? (
          <p className="tp_spirit_sheet_empty">{emptyHint}</p>
        ) : (
          <div className="tp_table_wrap tp_table_wrap--spirit_sheet">
            <table className="tp_table tp_spirit_sheet_table" aria-label={ariaTableLabel}>
              <thead>
                <tr>
                  <th className="tp_th tp_th--left">{sortBtn('scoreLabel', 'Marcador')}</th>
                  <th className="tp_th tp_th--left">{sortBtn('opponent', headerSecondLabel)}</th>
                  {colsFragment}
                </tr>
              </thead>
              <tbody>{renderSpiritSheetBodyRows(sortedRowsInner)}</tbody>
            </table>
          </div>
        )}
      </section>
    );

    return (
      <div className="tp_spirit_sheets_stack">
        {wrapTable(
          'tp-spirit-received',
          'Espíritu recibido por partido',
          'Espíritu recibido',
          'Aún no hay puntuaciones de espíritu recibidas en partidos con encuesta registrada.',
          'Otorgado por',
          spiritRecvSortBtn,
          spiritSheetTableColumns,
          sortedSpiritReceived
        )}
        {wrapTable(
          'tp-spirit-given',
          'Espíritu otorgado al rival por partido',
          'Espíritu otorgado',
          'Aún no hay puntuaciones de espíritu otorgadas al rival en partidos con encuesta registrada.',
          'Otorgado a',
          spiritGivenSortBtn,
          spiritSheetTableGivenColumns,
          sortedSpiritGiven
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="tp_page">
        <div className="tp_topbar">
          <Navbar tournamentId={tournamentId} />
        </div>
        <div className="tp_content">
          <div className="tp_state">Cargando equipo...</div>
        </div>
      </div>
    );
  }

  if (error && !team) {
    return (
      <div className="tp_page">
        <div className="tp_topbar">
          <Navbar tournamentId={tournamentId} />
        </div>
        <div className="tp_content">
          <Link to={statsLink} className="tp_back">
            Volver a estadísticas
          </Link>
          <div className="tp_state tp_state--error">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="tp_page">
      <div className="tp_topbar">
        <Navbar tournamentId={tournamentId} />
      </div>

      <div className="tp_content">
        <Link to={statsLink} className="tp_back">
          Volver a estadísticas por grupos
        </Link>

        <div className="tp_card">
          <header className="tp_header">
            <div className="tp_title_row">
              <img
                className="tp_flag"
                src={team?.url_imagen || TEAM_FALLBACK_IMAGE}
                alt=""
                onError={(e) => {
                  if (!e.currentTarget.src.includes(TEAM_FALLBACK_IMAGE)) e.currentTarget.src = TEAM_FALLBACK_IMAGE;
                }}
              />
              <h1 className="tp_team_name">{team?.name || 'Equipo'}</h1>
            </div>

            <div className="tp_stat_grid">
              <div className="tp_stat_card">
                <span className="tp_stat_value">{team?.division || '—'}</span>
                <span className="tp_stat_label">División</span>
              </div>
              <div className="tp_stat_card">
                <span className="tp_stat_value">{countryLabel}</span>
                <span className="tp_stat_label">País</span>
              </div>
              <div className="tp_stat_card">
                <span className="tp_stat_value">{teamStats.gamesPlayed}</span>
                <span className="tp_stat_label">Partidos jugados</span>
              </div>
              <div className="tp_stat_card">
                <span className="tp_stat_value">
                  {teamStats.wins} - {teamStats.losses}
                </span>
                <span className="tp_stat_label">Ganados - Perdidos</span>
              </div>
              <div className="tp_stat_card">
                <span className="tp_stat_value">
                  {spiritLoading ? '…' : teamSpiritAvgDisplay != null ? fmtNum(teamSpiritAvgDisplay) : '—'}
                </span>
                <span className="tp_stat_label">Espiritu (media)</span>
              </div>
              <div className="tp_stat_card">
                <span className="tp_stat_value">{players.length}</span>
                <span className="tp_stat_label">Jugadores activos</span>
              </div>
            </div>
          </header>

          <nav className="tp_tabs" aria-label="Secciones del equipo">
            <button
              type="button"
              className={`tp_tab${activeTab === 'games' ? ' tp_tab--active' : ''}`}
              onClick={() => setActiveTab('games')}
            >
              Partidos
            </button>
            <button
              type="button"
              className={`tp_tab${activeTab === 'players' ? ' tp_tab--active' : ''}`}
              onClick={() => setActiveTab('players')}
            >
              Jugadores
            </button>
            <button
              type="button"
              className={`tp_tab${activeTab === 'spirit' ? ' tp_tab--active' : ''}`}
              onClick={() => setActiveTab('spirit')}
            >
              Espiritu
            </button>
            <button
              type="button"
              className={`tp_tab${activeTab === 'all' ? ' tp_tab--active' : ''}`}
              onClick={() => setActiveTab('all')}
            >
              Ver todo
            </button>
          </nav>

          <div className="tp_panel">
            {activeTab === 'players' && renderPlayersTable()}
            {activeTab === 'games' && renderGamesTable()}
            {activeTab === 'spirit' && renderSpiritSection()}
            {activeTab === 'all' && (
              <div className="tp_panel_sections">
                <section aria-labelledby="tp_sec_games_all">
                  <h2 id="tp_sec_games_all" className="tp_section_title">
                    Partidos
                  </h2>
                  {renderGamesTable()}
                </section>
                <section aria-labelledby="tp_sec_players_all">
                  <h2 id="tp_sec_players_all" className="tp_section_title">
                    Jugadores
                  </h2>
                  {renderPlayersTable()}
                </section>
                <section aria-labelledby="tp_sec_spirit_all">
                  <h2 id="tp_sec_spirit_all" className="tp_section_title">
                    Espiritu
                  </h2>
                  {renderSpiritSection()}
                </section>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default TeamPlayersPage;
