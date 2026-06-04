import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import Navbar from '../components/navbar';
import { configService } from '../services/configService';
import { broadcastTournamentCoherenceChanged } from '../utils/tournamentSync';
import './calendarconfig.css';

const TEAM_FALLBACK_IMAGE = '/Hera_logo.png';

const formatDateHeader = (dateValue) => {
  if (!dateValue) return '';
  const parsed = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateValue;
  return parsed.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
};

const formatGameDateTime = (dateValue, timeValue) => {
  if (!dateValue) return '';
  const combined = timeValue ? `${dateValue}T${timeValue}:00` : `${dateValue}T00:00:00`;
  const parsed = new Date(combined);
  if (Number.isNaN(parsed.getTime())) return `${dateValue} ${timeValue || ''}`.trim();
  return parsed.toLocaleString('en-US', {
    weekday: 'short',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
};

const getCalendarApiErrorMessage = (requestError, fallbackMessage) => {
  const status = requestError?.response?.status;
  if (status === 404) {
    return 'No se encontro el servicio de juegos (404). Verifica que el backend este actualizado y reiniciado.';
  }
  return requestError?.response?.data?.message || requestError?.message || fallbackMessage;
};

const isGroupPhaseName = (phaseName) => {
  const text = String(phaseName || '').toLowerCase().trim();
  return text.includes('grupo') || text.includes('group');
};

const normalizeLookupText = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const getRowValue = (row, aliases) => {
  const entries = Object.entries(row || {});
  for (const [key, value] of entries) {
    const normalizedKey = normalizeLookupText(key).replace(/\s+/g, '');
    if (aliases.includes(normalizedKey)) return value;
  }
  return '';
};

const normalizeDateInput = (value) => {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const text = String(value).trim();
  if (!text) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const slashMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, day, month, year] = slashMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  return text;
};

const normalizeTimeInput = (value) => {
  if (!value) return '';
  const text = String(value).trim();
  if (!text) return '';
  const match = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return text;
  const [, hour, minute] = match;
  return `${hour.padStart(2, '0')}:${minute}`;
};

const mapDbGameToUi = (game) => ({
  id: Number(game.game_id),
  gameNum: Number.isFinite(Number(game.game_num)) ? Number(game.game_num) : null,
  date: String(game.game_date).split('T')[0],
  time: String(game.game_time || '').slice(0, 5),
  place: game.game_location || '',
  phaseId: String(game.phas_id),
  phaseName: game.phase_name || '',
  homeTeamId: String(game.local),
  homeTeamName: game.local_name || '',
  homeTeamImage: game.local_image || '',
  awayTeamId: String(game.visitor),
  awayTeamName: game.visitor_name || '',
  awayTeamImage: game.visitor_image || '',
  division: String(game.division || '').trim()
});

function CalendarConfigPage() {
  const { id: routeTournamentId } = useParams();
  const location = useLocation();
  const queryTournamentId = new URLSearchParams(location.search).get('tournamentId');
  const tournamentId = routeTournamentId || queryTournamentId;

  const [games, setGames] = useState([]);
  const [loadingGames, setLoadingGames] = useState(true);
  const [gamesError, setGamesError] = useState('');
  const [tournament, setTournament] = useState(null);
  const [loadingTournament, setLoadingTournament] = useState(true);
  const [tournamentError, setTournamentError] = useState('');
  const [teams, setTeams] = useState([]);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [teamsError, setTeamsError] = useState('');
  const [phases, setPhases] = useState([]);
  const [loadingPhases, setLoadingPhases] = useState(true);
  const [phasesError, setPhasesError] = useState('');
  const [formData, setFormData] = useState({
    date: '',
    time: '',
    place: '',
    phaseId: '',
    division: '',
    homeTeamId: '',
    awayTeamId: ''
  });
  const [error, setError] = useState('');
  const [editingGameId, setEditingGameId] = useState(null);
  const [savingGame, setSavingGame] = useState(false);
  const [bulkMessage, setBulkMessage] = useState('');
  const [bulkError, setBulkError] = useState('');
  const [importingGames, setImportingGames] = useState(false);
  const formCardRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const loadTournament = async () => {
      if (!tournamentId) {
        setTournament(null);
        setTournamentError('No se encontro el ID del torneo.');
        setLoadingTournament(false);
        return;
      }

      try {
        setLoadingTournament(true);
        setTournamentError('');
        const response = await configService.getTournamentById(tournamentId);
        if (!response.success || !response.data?.tournament) {
          throw new Error(response.message || 'No se pudo cargar el torneo.');
        }
        setTournament(response.data.tournament);
      } catch (loadError) {
        setTournament(null);
        setTournamentError(loadError.response?.data?.message || loadError.message || 'Error al cargar torneo.');
      } finally {
        setLoadingTournament(false);
      }
    };

    loadTournament();
  }, [tournamentId]);

  useEffect(() => {
    const loadTeams = async () => {
      if (!tournamentId) {
        setTeams([]);
        setTeamsError('No se encontro el ID del torneo para cargar equipos.');
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

        const mappedTeams = (response.data?.teams || []).map((team) => ({
          id: String(team.team_id),
          name: team.name,
          division: (team.division || 'Sin division').trim() || 'Sin division',
          url_imagen: team.url_imagen || ''
        }));
        setTeams(mappedTeams.sort((a, b) => a.name.localeCompare(b.name, 'es')));
      } catch (loadError) {
        const errorMessage = loadError.response?.data?.message || loadError.message || 'Error al cargar los equipos.';
        setTeams([]);
        setTeamsError(errorMessage);
      } finally {
        setLoadingTeams(false);
      }
    };

    loadTeams();
  }, [tournamentId]);

  useEffect(() => {
    const loadPhases = async () => {
      if (!tournamentId) {
        setPhases([]);
        setPhasesError('No se encontro el ID del torneo para cargar fases.');
        setLoadingPhases(false);
        return;
      }

      try {
        setLoadingPhases(true);
        setPhasesError('');
        const response = await configService.getPhases(tournamentId);
        if (!response.success) {
          throw new Error(response.message || 'No se pudieron cargar las fases.');
        }

        const mappedPhases = (response.data?.phases || []).map((phase, index) => {
          const phaseName = (phase.stage || '').trim() || `Fase ${index + 1}`;
          const phaseNum = phase.phase_num != null ? Number(phase.phase_num) : null;
          return {
            id: String(phase.phas_id),
            name: phaseName,
            phase_num: phaseNum,
            isGroup: phaseNum === 1 || isGroupPhaseName(phaseName)
          };
        });
        setPhases(mappedPhases);
      } catch (loadError) {
        const errorMessage = loadError.response?.data?.message || loadError.message || 'Error al cargar las fases.';
        setPhases([]);
        setPhasesError(errorMessage);
      } finally {
        setLoadingPhases(false);
      }
    };

    loadPhases();
  }, [tournamentId]);

  useEffect(() => {
    const loadGames = async () => {
      if (!tournamentId) {
        setGames([]);
        setGamesError('No se encontro el ID del torneo para cargar juegos.');
        setLoadingGames(false);
        return;
      }

      try {
        setLoadingGames(true);
        setGamesError('');
        const response = await configService.getGames(tournamentId);
        if (!response.success) {
          throw new Error(response.message || 'No se pudieron cargar los juegos.');
        }

        const mappedGames = (response.data?.games || []).map(mapDbGameToUi);
        setGames(mappedGames);
      } catch (loadError) {
        const errorMessage = getCalendarApiErrorMessage(loadError, 'Error al cargar juegos.');
        setGames([]);
        setGamesError(errorMessage);
      } finally {
        setLoadingGames(false);
      }
    };

    loadGames();
  }, [tournamentId]);

  const handleChange = (field) => (event) => {
    setFormData((prev) => ({ ...prev, [field]: event.target.value }));
    if (error) setError('');
  };

  const handleAddGame = async (event) => {
    event.preventDefault();
    if (savingGame) return;

    const normalizedPlace = formData.place.trim();
    const selectedPhase = phases.find((phase) => phase.id === formData.phaseId);
    const selectedHomeTeam = filteredTeams.find((team) => team.id === formData.homeTeamId);
    const selectedAwayTeam = filteredTeams.find((team) => team.id === formData.awayTeamId);

    if (!formData.date || !formData.time || !normalizedPlace || !selectedPhase || !formData.division || !selectedHomeTeam || !selectedAwayTeam) {
      setError('Completa fecha, hora, lugar, fase, division y ambos equipos.');
      return;
    }

    if (!selectedPhase.isGroup) {
      setError('Solo se pueden registrar juegos de fase de grupos desde esta pantalla.');
      return;
    }

    if (selectedHomeTeam.id === selectedAwayTeam.id) {
      setError('El equipo local y visitante no pueden ser el mismo.');
      return;
    }

    try {
      setSavingGame(true);
      const payload = {
        game_date: formData.date,
        game_time: formData.time,
        game_location: normalizedPlace,
        phas_id: Number(selectedPhase.id),
        ...(selectedPhase.phase_num != null ? { phas_num: selectedPhase.phase_num } : {}),
        visitor: Number(selectedAwayTeam.id),
        local: Number(selectedHomeTeam.id),
        division: String(formData.division).trim()
      };

      const response = editingGameId
        ? await configService.updateGame(tournamentId, editingGameId, payload)
        : await configService.createGame(tournamentId, payload);

      if (!response.success) {
        throw new Error(response.message || 'No se pudo guardar el juego.');
      }

      const dbGame = response.data?.game;
      const savedGame = dbGame
        ? mapDbGameToUi(dbGame)
        : {
            id: Number(editingGameId || Date.now()),
            date: formData.date,
            time: formData.time,
            place: normalizedPlace,
            phaseId: selectedPhase.id,
            phaseName: selectedPhase.name,
            homeTeamId: selectedHomeTeam.id,
            homeTeamName: selectedHomeTeam.name,
            homeTeamImage: selectedHomeTeam.url_imagen || '',
            awayTeamId: selectedAwayTeam.id,
            awayTeamName: selectedAwayTeam.name,
            awayTeamImage: selectedAwayTeam.url_imagen || '',
            division: formData.division
          };

      setGames((prev) =>
        (editingGameId ? prev.map((game) => (game.id === editingGameId ? savedGame : game)) : [...prev, savedGame]).sort((a, b) => {
          const aValue = `${a.date}T${a.time}`;
          const bValue = `${b.date}T${b.time}`;
          return aValue.localeCompare(bValue);
        })
      );

      broadcastTournamentCoherenceChanged(tournamentId, { fullBracketReload: true });

      setFormData({
        date: '',
        time: '',
        place: '',
        phaseId: '',
        division: '',
        homeTeamId: '',
        awayTeamId: ''
      });
      setEditingGameId(null);
      setError('');
    } catch (saveError) {
      const errorMessage = getCalendarApiErrorMessage(saveError, 'No se pudo guardar el juego.');
      setError(errorMessage);
    } finally {
      setSavingGame(false);
    }
  };

  const handleDeleteGame = async (id) => {
    if (savingGame) return;
    try {
      setSavingGame(true);
      const response = await configService.deleteGame(tournamentId, id);
      if (!response.success) {
        throw new Error(response.message || 'No se pudo eliminar el juego.');
      }

      setGames((prev) => prev.filter((game) => game.id !== id));
      broadcastTournamentCoherenceChanged(tournamentId, { fullBracketReload: true });
      if (editingGameId === id) {
        setEditingGameId(null);
        setFormData({
          date: '',
          time: '',
          place: '',
          phaseId: '',
          division: '',
          homeTeamId: '',
          awayTeamId: ''
        });
      }
      setError('');
    } catch (deleteError) {
      const errorMessage = getCalendarApiErrorMessage(deleteError, 'No se pudo eliminar el juego.');
      setError(errorMessage);
    } finally {
      setSavingGame(false);
    }
  };

  const handleEditGame = (game) => {
    const homeId = game.homeTeamId || teams.find((team) => team.name === game.homeTeamName || team.name === game.homeTeam)?.id || '';
    const awayId = game.awayTeamId || teams.find((team) => team.name === game.awayTeamName || team.name === game.awayTeam)?.id || '';
    const phaseId = game.phaseId || phases.find((phase) => phase.name === game.phaseName)?.id || '';

    const homeTeam = teams.find((team) => team.id === homeId);
    const awayTeam = teams.find((team) => team.id === awayId);
    const division = game.division || homeTeam?.division || awayTeam?.division || '';

    setFormData({
      date: game.date || '',
      time: game.time || '',
      place: game.place || '',
      phaseId,
      division,
      homeTeamId: homeId,
      awayTeamId: awayId
    });
    setEditingGameId(game.id);
    setError('');

    if (formCardRef.current) {
      formCardRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleCancelEdit = () => {
    setEditingGameId(null);
    setFormData({
      date: '',
      time: '',
      place: '',
      phaseId: '',
      division: '',
      homeTeamId: '',
      awayTeamId: ''
    });
    setError('');
  };

  const divisionOptions = useMemo(
    () => [...new Set(teams.map((team) => team.division))].sort((a, b) => a.localeCompare(b, 'es')),
    [teams]
  );

  const filteredTeams = useMemo(
    () => teams.filter((team) => team.division === formData.division),
    [teams, formData.division]
  );

  const handleDivisionChange = (event) => {
    const nextDivision = event.target.value;
    setFormData((prev) => ({
      ...prev,
      division: nextDivision,
      homeTeamId: '',
      awayTeamId: ''
    }));
    if (error) setError('');
  };

  const handleDownloadTemplate = () => {
    if (!tournamentId) {
      setBulkError('No se encontro el ID del torneo para generar la plantilla.');
      setBulkMessage('');
      return;
    }

    const workbook = XLSX.utils.book_new();
    const templateRows = [
      {
        TorneoId: String(tournamentId),
        Fecha: '2026-03-15',
        Hora: '18:30',
        Lugar: 'Cancha principal',
        Fase: '',
        Division: '',
        'Equipo local': '',
        'Equipo visitante': ''
      }
    ];
    const templateSheet = XLSX.utils.json_to_sheet(templateRows);
    const instructionsSheet = XLSX.utils.aoa_to_sheet([
      ['Instrucciones'],
      ['1) No cambies los nombres de las columnas de la hoja Plantilla.'],
      ['2) Fase y equipos aceptan ID o nombre exacto.'],
      ['3) Solo se permiten fases de grupos en esta pantalla.'],
      ['4) Usa formato de fecha YYYY-MM-DD y hora HH:mm.'],
      ['5) Puedes repetir TorneoId en todas las filas o dejarlo vacio para usar el torneo actual.']
    ]);
    const groupPhases = phases.filter((phase) => phase.isGroup);
    const phaseSheet = XLSX.utils.json_to_sheet(
      groupPhases.map((phase) => ({
        FaseId: phase.id,
        Fase: phase.name
      }))
    );
    const teamSheet = XLSX.utils.json_to_sheet(
      teams.map((team) => ({
        EquipoId: team.id,
        Equipo: team.name,
        Division: team.division
      }))
    );

    XLSX.utils.book_append_sheet(workbook, templateSheet, 'Plantilla');
    XLSX.utils.book_append_sheet(workbook, instructionsSheet, 'Instrucciones');
    XLSX.utils.book_append_sheet(workbook, phaseSheet, 'Fases_grupos');
    XLSX.utils.book_append_sheet(workbook, teamSheet, 'Equipos');

    XLSX.writeFile(workbook, `plantilla_juegos_torneo_${tournamentId}.xlsx`);
    setBulkError('');
    setBulkMessage('Plantilla descargada. Completa la hoja "Plantilla" y luego importa el archivo.');
  };

  const handleOpenImportDialog = () => {
    if (fileInputRef.current) fileInputRef.current.click();
  };

  const handleImportFromExcel = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!tournamentId) {
      setBulkError('No se encontro el ID del torneo para importar juegos.');
      setBulkMessage('');
      return;
    }
    if (savingGame || importingGames) return;

    try {
      setImportingGames(true);
      setBulkError('');
      setBulkMessage('');
      setError('');

      const fileBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(fileBuffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      if (!worksheet) {
        throw new Error('No se encontro una hoja valida en el archivo.');
      }

      const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: false });
      if (!Array.isArray(rows) || rows.length === 0) {
        throw new Error('La hoja esta vacia. Agrega al menos una fila con datos.');
      }

      const phasesById = new Map(phases.map((phase) => [String(phase.id), phase]));
      const phasesByName = new Map(phases.map((phase) => [normalizeLookupText(phase.name), phase]));
      const teamsById = new Map(teams.map((team) => [String(team.id), team]));
      const teamsByName = new Map(teams.map((team) => [normalizeLookupText(team.name), team]));
      const targetTournamentId = String(tournamentId);

      const createdGames = [];
      const rowErrors = [];

      for (let index = 0; index < rows.length; index += 1) {
        const rowNumber = index + 2;
        const row = rows[index];

        const rowTournamentIdRaw = getRowValue(row, ['torneoid', 'torneoid', 'idtorneo']);
        const rowTournamentId = String(rowTournamentIdRaw || '').trim();
        if (rowTournamentId && rowTournamentId !== targetTournamentId) {
          rowErrors.push(`Fila ${rowNumber}: TorneoId ${rowTournamentId} no coincide con el torneo actual (${targetTournamentId}).`);
          continue;
        }

        const dateValue = normalizeDateInput(getRowValue(row, ['fecha']));
        const timeValue = normalizeTimeInput(getRowValue(row, ['hora']));
        const placeValue = String(getRowValue(row, ['lugar']) || '').trim();
        const phaseRaw = String(getRowValue(row, ['fase']) || '').trim();
        const divisionValue = String(getRowValue(row, ['division']) || '').trim();
        const homeRaw = String(getRowValue(row, ['equipolocal', 'local']) || '').trim();
        const awayRaw = String(getRowValue(row, ['equipovisitante', 'visitante']) || '').trim();

        if (!dateValue || !timeValue || !placeValue || !phaseRaw || !divisionValue || !homeRaw || !awayRaw) {
          rowErrors.push(`Fila ${rowNumber}: faltan campos obligatorios (Fecha, Hora, Lugar, Fase, Division, Equipo local, Equipo visitante).`);
          continue;
        }

        const selectedPhase =
          phasesById.get(phaseRaw) ||
          phasesByName.get(normalizeLookupText(phaseRaw));

        if (!selectedPhase) {
          rowErrors.push(`Fila ${rowNumber}: la fase "${phaseRaw}" no existe.`);
          continue;
        }
        if (!selectedPhase.isGroup) {
          rowErrors.push(`Fila ${rowNumber}: la fase "${selectedPhase.name}" no es de grupos.`);
          continue;
        }

        const homeTeam = teamsById.get(homeRaw) || teamsByName.get(normalizeLookupText(homeRaw));
        const awayTeam = teamsById.get(awayRaw) || teamsByName.get(normalizeLookupText(awayRaw));

        if (!homeTeam || !awayTeam) {
          rowErrors.push(`Fila ${rowNumber}: no se encontro alguno de los equipos.`);
          continue;
        }
        if (homeTeam.id === awayTeam.id) {
          rowErrors.push(`Fila ${rowNumber}: equipo local y visitante no pueden ser el mismo.`);
          continue;
        }
        if (homeTeam.division !== divisionValue || awayTeam.division !== divisionValue) {
          rowErrors.push(`Fila ${rowNumber}: la division no coincide con los equipos seleccionados.`);
          continue;
        }

        try {
          const response = await configService.createGame(tournamentId, {
            game_date: dateValue,
            game_time: timeValue,
            game_location: placeValue,
            phas_id: Number(selectedPhase.id),
            ...(selectedPhase.phase_num != null ? { phas_num: selectedPhase.phase_num } : {}),
            visitor: Number(awayTeam.id),
            local: Number(homeTeam.id),
            division: divisionValue
          });

          if (!response?.success || !response?.data?.game) {
            throw new Error(response?.message || 'Respuesta invalida del servidor.');
          }
          createdGames.push(mapDbGameToUi(response.data.game));
        } catch (requestError) {
          const requestMessage = getCalendarApiErrorMessage(requestError, 'No se pudo crear el juego.');
          rowErrors.push(`Fila ${rowNumber}: ${requestMessage}`);
        }
      }

      if (createdGames.length > 0) {
        setGames((prev) =>
          [...prev, ...createdGames].sort((a, b) => {
            const aValue = `${a.date}T${a.time}`;
            const bValue = `${b.date}T${b.time}`;
            return aValue.localeCompare(bValue);
          })
        );
      }

      if (createdGames.length > 0 && rowErrors.length === 0) {
        setBulkMessage(`Importacion completada: ${createdGames.length} juego(s) creado(s).`);
        return;
      }

      if (createdGames.length > 0 && rowErrors.length > 0) {
        setBulkMessage(`Importacion parcial: ${createdGames.length} juego(s) creado(s).`);
        setBulkError(rowErrors.slice(0, 6).join(' | '));
        return;
      }

      setBulkError(rowErrors.length > 0 ? rowErrors.slice(0, 6).join(' | ') : 'No se pudo importar ningun juego.');
    } catch (importError) {
      const importMessage = getCalendarApiErrorMessage(importError, 'No se pudo importar el archivo Excel.');
      setBulkError(importMessage);
      setBulkMessage('');
    } finally {
      setImportingGames(false);
    }
  };

  const groupedGames = useMemo(() => {
    return games.reduce((acc, game) => {
      const key = game.date;
      if (!acc[key]) acc[key] = [];
      acc[key].push(game);
      return acc;
    }, {});
  }, [games]);

  const orderedDates = useMemo(
    () => Object.keys(groupedGames).sort((a, b) => a.localeCompare(b)),
    [groupedGames]
  );
  const gameNumberById = useMemo(() => {
    const sortedGames = [...games].sort((a, b) => {
      const aValue = `${a.date}T${a.time}`;
      const bValue = `${b.date}T${b.time}`;
      return aValue.localeCompare(bValue);
    });

    return sortedGames.reduce((acc, game, index) => {
      acc[game.id] = index + 1;
      return acc;
    }, {});
  }, [games]);
  const editingGameNumber = useMemo(() => {
    if (!editingGameId) return null;
    const targetGame = games.find((game) => game.id === editingGameId);
    if (!targetGame) return gameNumberById[editingGameId] || null;
    return targetGame.gameNum ?? gameNumberById[targetGame.id] ?? null;
  }, [editingGameId, games, gameNumberById]);
  const selectedHomeTeam = useMemo(
    () => filteredTeams.find((team) => team.id === formData.homeTeamId) || null,
    [filteredTeams, formData.homeTeamId]
  );
  const selectedAwayTeam = useMemo(
    () => filteredTeams.find((team) => team.id === formData.awayTeamId) || null,
    [filteredTeams, formData.awayTeamId]
  );

  return (
    <div className="calendar-config-page">
      <div className="calendar-config-topbar">
        <Navbar tournamentId={tournamentId} />
      </div>

      <main className="calendar-config-content">
        <header className="calendar-config-header">
          <h1>Calendario de Torneo</h1>
          <p>Registra fecha, hora y lugar para cada partido.</p>
        </header>

        <section className="calendar-config-tournament-card">
          {loadingTournament ? (
            <p className="calendar-config-hint">Cargando torneo...</p>
          ) : tournamentError ? (
            <p className="calendar-config-error">{tournamentError}</p>
          ) : tournament ? (
            <div className="calendar-config-tournament-content">
              {tournament.image_url ? (
                <img src={tournament.image_url} alt={tournament.name} loading="lazy" decoding="async" />
              ) : (
                <div className="calendar-config-tournament-placeholder">Sin imagen</div>
              )}
              <div className="calendar-config-tournament-meta">
                <h2>{tournament.name}</h2>
                <p><strong>Año:</strong> {tournament.year}</p>
                {tournament.country ? <p><strong>Pais:</strong> {tournament.country}</p> : null}
              </div>
            </div>
          ) : null}
        </section>

        <section className="calendar-config-bulk-card">
          <h2>Carga masiva por Excel</h2>
          <div className="calendar-config-bulk-panel">
            <details>
              <summary>Mostrar opciones de plantilla e importacion</summary>
              <p className="calendar-config-bulk-subtitle">
                Descarga la plantilla, llena los datos y luego carga el archivo.
              </p>
              <div className="calendar-config-bulk-actions">
                <button
                  type="button"
                  className="calendar-config-bulk-btn"
                  onClick={handleDownloadTemplate}
                  disabled={savingGame || importingGames || loadingPhases || loadingTeams}
                >
                  Descargar plantilla
                </button>
                <button
                  type="button"
                  className="calendar-config-bulk-btn calendar-config-bulk-import-btn"
                  onClick={handleOpenImportDialog}
                  disabled={savingGame || importingGames || loadingPhases || loadingTeams}
                >
                  {importingGames ? 'Importando...' : 'Importar archivo'}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="calendar-config-hidden-input"
                  onChange={handleImportFromExcel}
                />
              </div>
              {bulkMessage ? <p className="calendar-config-hint">{bulkMessage}</p> : null}
              {bulkError ? <p className="calendar-config-error">{bulkError}</p> : null}
            </details>
          </div>
        </section>

        <section className="calendar-config-form-card" ref={formCardRef}>
          <h2>{editingGameId ? `Editar Juego ${editingGameNumber ?? editingGameId}` : 'Nuevo Juego'}</h2>
          <form className="calendar-config-form" onSubmit={handleAddGame}>
            <label>
              Fecha
              <input type="date" value={formData.date} onChange={handleChange('date')} />
            </label>
            <label>
              Hora
              <input type="time" value={formData.time} onChange={handleChange('time')} />
            </label>
            <label>
              Lugar
              <input type="text" placeholder="Ej: UCSD Triton Soccer Stadium" value={formData.place} onChange={handleChange('place')} />
            </label>
            <label>
              Fase
              <select value={formData.phaseId} onChange={handleChange('phaseId')} disabled={savingGame || loadingPhases || !!phasesError}>
                <option value="">Selecciona una fase</option>
                {phases.map((phaseOption) => (
                  <option key={phaseOption.id} value={phaseOption.id} disabled={!phaseOption.isGroup}>
                    {phaseOption.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Division
              <select value={formData.division} onChange={handleDivisionChange} disabled={savingGame || loadingTeams || !!teamsError}>
                <option value="">Selecciona una division</option>
                {divisionOptions.map((divisionOption) => (
                  <option key={divisionOption} value={divisionOption}>
                    {divisionOption}
                  </option>
                ))}
              </select>
            </label>
            <div className="calendar-config-spacer" aria-hidden="true" />
            <label>
              Equipo Local
              <select value={formData.homeTeamId} onChange={handleChange('homeTeamId')} disabled={savingGame || loadingTeams || !!teamsError || !formData.division}>
                <option value="">Selecciona un equipo</option>
                {filteredTeams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Equipo Visitante
              <select value={formData.awayTeamId} onChange={handleChange('awayTeamId')} disabled={savingGame || loadingTeams || !!teamsError || !formData.division}>
                <option value="">Selecciona un equipo</option>
                {filteredTeams.map((team) => (
                  <option key={team.id} value={team.id} disabled={team.id === formData.homeTeamId}>
                    {team.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="calendar-config-form-actions">
              <button type="submit" disabled={savingGame}>
                {savingGame ? 'Guardando...' : editingGameId ? 'Guardar cambios' : 'Registrar Juego'}
              </button>
              {editingGameId ? (
                <button type="button" className="calendar-config-cancel-btn" onClick={handleCancelEdit} disabled={savingGame}>
                  Cancelar
                </button>
              ) : null}
            </div>
          </form>
          <div className="calendar-config-team-previews">
            <div className="calendar-config-team-preview">
              <span>Local</span>
              {selectedHomeTeam ? (
                <div className="calendar-team-chip">
                  <img
                    src={selectedHomeTeam.url_imagen || TEAM_FALLBACK_IMAGE}
                    alt={selectedHomeTeam.name}
                    loading="lazy"
                    decoding="async"
                    onError={(event) => {
                      if (!event.currentTarget.src.includes(TEAM_FALLBACK_IMAGE)) {
                        event.currentTarget.src = TEAM_FALLBACK_IMAGE;
                      }
                    }}
                  />
                  <strong>{selectedHomeTeam.name}</strong>
                </div>
              ) : (
                <p>Sin seleccionar</p>
              )}
            </div>
            <div className="calendar-config-team-preview">
              <span>Visitante</span>
              {selectedAwayTeam ? (
                <div className="calendar-team-chip">
                  <img
                    src={selectedAwayTeam.url_imagen || TEAM_FALLBACK_IMAGE}
                    alt={selectedAwayTeam.name}
                    loading="lazy"
                    decoding="async"
                    onError={(event) => {
                      if (!event.currentTarget.src.includes(TEAM_FALLBACK_IMAGE)) {
                        event.currentTarget.src = TEAM_FALLBACK_IMAGE;
                      }
                    }}
                  />
                  <strong>{selectedAwayTeam.name}</strong>
                </div>
              ) : (
                <p>Sin seleccionar</p>
              )}
            </div>
          </div>
          {loadingTeams ? <p className="calendar-config-hint">Cargando equipos...</p> : null}
          {loadingPhases ? <p className="calendar-config-hint">Cargando fases...</p> : null}
          {loadingGames ? <p className="calendar-config-hint">Cargando juegos...</p> : null}
          {teamsError ? <p className="calendar-config-error">{teamsError}</p> : null}
          {phasesError ? <p className="calendar-config-error">{phasesError}</p> : null}
          {gamesError ? <p className="calendar-config-error">{gamesError}</p> : null}
          {error ? <p className="calendar-config-error">{error}</p> : null}
        </section>

        <section className="calendar-config-list">
          {loadingGames ? (
            <div className="calendar-config-empty">Cargando juegos...</div>
          ) : orderedDates.length === 0 ? (
            <div className="calendar-config-empty">Aun no hay juegos registrados.</div>
          ) : (
            orderedDates.map((dateKey) => (
              <div key={dateKey} className="calendar-day-block">
                <h3>{formatDateHeader(dateKey)}</h3>
                <div className="calendar-game-list">
                  {groupedGames[dateKey].map((game) => (
                    <article key={game.id} className="calendar-game-card">
                      <div className="calendar-game-top">
                        <div className="calendar-game-actions">
                          <span>{`Juego ${game.gameNum ?? gameNumberById[game.id] ?? 1}`}</span>
                        </div>
                        <p>{formatGameDateTime(game.date, game.time)}</p>
                      </div>

                      <div className="calendar-game-place">{game.place}</div>
                      {game.phaseName ? <div className="calendar-game-place">Fase: {game.phaseName}</div> : null}

                      <div className="calendar-game-team-row">
                        <span className="calendar-game-team-name">
                          <img
                            src={game.homeTeamImage || TEAM_FALLBACK_IMAGE}
                            alt={game.homeTeamName || game.homeTeam || 'Equipo local'}
                            loading="lazy"
                            decoding="async"
                            onError={(event) => {
                              if (!event.currentTarget.src.includes(TEAM_FALLBACK_IMAGE)) {
                                event.currentTarget.src = TEAM_FALLBACK_IMAGE;
                              }
                            }}
                          />
                          {game.homeTeamName || game.homeTeam}
                        </span>
                        <strong>0</strong>
                      </div>
                      <div className="calendar-game-team-row">
                        <span className="calendar-game-team-name">
                          <img
                            src={game.awayTeamImage || TEAM_FALLBACK_IMAGE}
                            alt={game.awayTeamName || game.awayTeam || 'Equipo visitante'}
                            loading="lazy"
                            decoding="async"
                            onError={(event) => {
                              if (!event.currentTarget.src.includes(TEAM_FALLBACK_IMAGE)) {
                                event.currentTarget.src = TEAM_FALLBACK_IMAGE;
                              }
                            }}
                          />
                          {game.awayTeamName || game.awayTeam}
                        </span>
                        <strong>0</strong>
                      </div>

                      <div className="calendar-game-footer">
                        <div className="calendar-game-buttons">
                          <button type="button" className="calendar-game-action-btn calendar-game-edit" onClick={() => handleEditGame(game)} disabled={savingGame}>
                            Editar
                          </button>
                          <button type="button" className="calendar-game-action-btn calendar-game-delete" onClick={() => handleDeleteGame(game.id)} disabled={savingGame}>
                            Eliminar
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ))
          )}
        </section>
      </main>
    </div>
  );
}

export default CalendarConfigPage;
