import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import * as XLSX from 'xlsx';
import Navbar from '../components/navbar';
import { configService } from '../services/configService';
import { useResolvedTournamentId, useTournamentPageReset } from '../hooks/useResolvedTournamentId';
import './players.css';

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_');
}

function getRowValue(row, keys) {
  const normalizedEntries = Object.entries(row).reduce((acc, [key, value]) => {
    acc[normalizeText(key)] = value;
    return acc;
  }, {});

  const matchKey = keys.find((key) => normalizedEntries[key] !== undefined);
  if (!matchKey) return '';
  return normalizedEntries[matchKey];
}

function Players() {
  const tournamentId = useResolvedTournamentId();

  const [teams, setTeams] = useState([]);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [teamsError, setTeamsError] = useState('');

  const [players, setPlayers] = useState([]);
  const [loadingPlayers, setLoadingPlayers] = useState(true);
  const [playersError, setPlayersError] = useState('');
  const [message, setMessage] = useState({ type: '', text: '' });

  const resetPlayersState = useCallback(() => {
    setTeams([]);
    setPlayers([]);
    setTeamsError('');
    setPlayersError('');
    setLoadingTeams(true);
    setLoadingPlayers(true);
    setMessage({ type: '', text: '' });
  }, []);

  useTournamentPageReset(tournamentId, resetPlayersState);

  const [manualPlayer, setManualPlayer] = useState({
    playerNumber: '',
    name: '',
    nickname: '',
    category: '',
    teamId: ''
  });

  const [bulkConfig, setBulkConfig] = useState({
    category: '',
    teamId: ''
  });
  const [bulkPreviewPlayers, setBulkPreviewPlayers] = useState([]);
  const [excelFileName, setExcelFileName] = useState('');

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

        const mappedTeams = (response.data?.teams || []).map((team) => ({
          id: String(team.team_id),
          name: team.name,
          division: team.division || 'Sin categoría'
        }));

        setTeams(mappedTeams);
      } catch (error) {
        const errorMessage = error.response?.data?.message || error.message || 'Error al cargar equipos.';
        setTeamsError(errorMessage);
      } finally {
        setLoadingTeams(false);
      }
    };

    loadTeams();
  }, [tournamentId]);

  useEffect(() => {
    const loadPlayers = async () => {
      if (!tournamentId) {
        setPlayers([]);
        setPlayersError('No se encontró el ID del torneo para cargar jugadores.');
        setLoadingPlayers(false);
        return;
      }

      try {
        setLoadingPlayers(true);
        setPlayersError('');
        const response = await configService.getPlayers(tournamentId);
        if (!response.success) {
          throw new Error(response.message || 'No se pudieron cargar los jugadores.');
        }

        const mappedPlayers = (response.data?.players || []).map((player) => ({
          id: player.player_id,
          player_number: player.player_number,
          name: player.player_name,
          nickname: player.nickname || '',
          category: player.category || 'Sin categoría',
          team_id: Number(player.team_id),
          team_name: player.team_name || 'Sin equipo'
        }));
        setPlayers(mappedPlayers);
      } catch (error) {
        const errorMessage = error.response?.data?.message || error.message || 'Error al cargar jugadores.';
        setPlayersError(errorMessage);
      } finally {
        setLoadingPlayers(false);
      }
    };

    loadPlayers();
  }, [tournamentId]);

  const categories = useMemo(() => {
    return [...new Set(teams.map((team) => team.division).filter(Boolean))];
  }, [teams]);

  const manualTeamsByCategory = useMemo(() => {
    if (!manualPlayer.category) return [];
    return teams.filter((team) => team.division === manualPlayer.category);
  }, [manualPlayer.category, teams]);

  const bulkTeamsByCategory = useMemo(() => {
    if (!bulkConfig.category) return [];
    return teams.filter((team) => team.division === bulkConfig.category);
  }, [bulkConfig.category, teams]);

  const selectedBulkTeam = useMemo(() => {
    return teams.find((team) => team.id === bulkConfig.teamId) || null;
  }, [teams, bulkConfig.teamId]);

  const playersCountByTeam = useMemo(() => {
    return players.reduce((acc, player) => {
      const key = String(player.team_id);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  }, [players]);

  const manualSelectedTeamCount = manualPlayer.teamId
    ? (playersCountByTeam[manualPlayer.teamId] || 0)
    : 0;

  const bulkSelectedTeamCount = bulkConfig.teamId
    ? (playersCountByTeam[bulkConfig.teamId] || 0)
    : 0;

  const handleManualChange = (event) => {
    const { name, value } = event.target;
    setManualPlayer((prev) => {
      if (name === 'category') {
        return { ...prev, category: value, teamId: '' };
      }
      return { ...prev, [name]: value };
    });
  };

  const handleBulkChange = (event) => {
    const { name, value } = event.target;
    setBulkConfig((prev) => {
      if (name === 'category') {
        return { ...prev, category: value, teamId: '' };
      }
      return { ...prev, [name]: value };
    });
  };

  const handleAddManualPlayer = async (event) => {
    event.preventDefault();

    const playerNumber = Number(manualPlayer.playerNumber);
    if (!playerNumber || playerNumber <= 0) {
      setMessage({ type: 'error', text: 'Ingresa un número de jugador válido.' });
      return;
    }
    if (!manualPlayer.name.trim()) {
      setMessage({ type: 'error', text: 'Ingresa el nombre del jugador.' });
      return;
    }
    if (!manualPlayer.category || !manualPlayer.teamId) {
      setMessage({ type: 'error', text: 'Selecciona categoría y equipo.' });
      return;
    }
    const duplicatedInTeam = players.some(
      (player) =>
        Number(player.team_id) === Number(manualPlayer.teamId)
        && Number(player.player_number) === playerNumber
    );
    if (duplicatedInTeam) {
      setMessage({
        type: 'error',
        text: `Ya existe el número ${playerNumber} en el equipo seleccionado.`
      });
      return;
    }

    try {
      const response = await configService.createPlayer(tournamentId, {
        torneo_id: Number(tournamentId),
        team_id: Number(manualPlayer.teamId),
        player_number: playerNumber,
        player_name: manualPlayer.name.trim(),
        nickname: manualPlayer.nickname.trim(),
        category: manualPlayer.category
      });

      if (!response.success || !response.data?.player) {
        throw new Error(response.message || 'No se pudo guardar el jugador.');
      }

      const savedPlayer = response.data.player;
      const selectedTeam = teams.find((team) => team.id === String(savedPlayer.team_id));

      setPlayers((prev) => [{
        id: savedPlayer.player_id,
        player_number: savedPlayer.player_number,
        name: savedPlayer.player_name,
        nickname: savedPlayer.nickname || '',
        category: selectedTeam?.division || manualPlayer.category,
        team_id: Number(savedPlayer.team_id),
        team_name: selectedTeam?.name || 'Sin equipo'
      }, ...prev]);

      setManualPlayer({ playerNumber: '', name: '', nickname: '', category: '', teamId: '' });
      setMessage({ type: 'success', text: 'Jugador guardado en base de datos.' });
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'Error al guardar jugador.';
      setMessage({ type: 'error', text: errorMessage });
    }
  };

  const handleDownloadTemplate = () => {
    if (!bulkConfig.teamId) {
      setMessage({ type: 'error', text: 'Para descargar plantilla debes seleccionar un equipo.' });
      return;
    }

    const templateData = [
      {
        team_id: Number(bulkConfig.teamId),
        player_number: '',
        player_name: '',
        nickname: ''
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Jugadores');
    XLSX.writeFile(workbook, `plantilla_jugadores_team_${bulkConfig.teamId}.xlsx`);
    setMessage({ type: 'success', text: 'Plantilla descargada con team_id incluido.' });
  };

  const handleExcelUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!bulkConfig.teamId) {
      setMessage({
        type: 'error',
        text: 'Antes de cargar la plantilla, selecciona categoría y equipo.'
      });
      event.target.value = '';
      return;
    }

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

      if (!rows.length) {
        setBulkPreviewPlayers([]);
        setExcelFileName(file.name);
        setMessage({ type: 'error', text: 'La plantilla está vacía.' });
        return;
      }

      const parsed = rows.map((row, index) => {
        const rowNumber = index + 2;
        const playerNumberRaw = getRowValue(row, ['player_number', 'numero_jugador', 'numero', 'number']);
        const playerNameRaw = getRowValue(row, ['player_name', 'nombre', 'name', 'jugador']);
        const nicknameRaw = getRowValue(row, ['nickname', 'apodo', 'alias']);
        const teamIdRaw = getRowValue(row, ['team_id', 'equipo_id', 'id_equipo']);

        return {
          rowNumber,
          player_number: Number(playerNumberRaw),
          name: String(playerNameRaw || '').trim(),
          nickname: String(nicknameRaw || '').trim(),
          category: String(bulkConfig.category || selectedBulkTeam?.division || '').trim(),
          team_id: Number(teamIdRaw || bulkConfig.teamId),
          team_name: selectedBulkTeam?.name || 'Sin equipo'
        };
      });

      const invalidRow = parsed.find(
        (item) =>
          !item.player_number ||
          item.player_number <= 0 ||
          !item.name ||
          !item.category ||
          !item.team_id ||
          item.team_id !== Number(bulkConfig.teamId)
      );

      if (invalidRow) {
        setMessage({
          type: 'error',
          text: `Fila ${invalidRow.rowNumber} inválida. Verifica team_id, player_number y player_name.`
        });
        setBulkPreviewPlayers([]);
        setExcelFileName(file.name);
        return;
      }

      const duplicatedInFile = new Set();
      const duplicatedRowInFile = parsed.find((item) => {
        const key = `${item.team_id}-${item.player_number}`;
        if (duplicatedInFile.has(key)) return true;
        duplicatedInFile.add(key);
        return false;
      });
      if (duplicatedRowInFile) {
        setMessage({
          type: 'error',
          text: `Fila ${duplicatedRowInFile.rowNumber} duplicada en el archivo: player_number repetido para el mismo team_id.`
        });
        setBulkPreviewPlayers([]);
        setExcelFileName(file.name);
        return;
      }

      const duplicatedAgainstDb = parsed.find((item) =>
        players.some(
          (player) =>
            Number(player.team_id) === Number(item.team_id)
            && Number(player.player_number) === Number(item.player_number)
        )
      );
      if (duplicatedAgainstDb) {
        setMessage({
          type: 'error',
          text: `Fila ${duplicatedAgainstDb.rowNumber} duplicada: el player_number ya existe en ese team_id.`
        });
        setBulkPreviewPlayers([]);
        setExcelFileName(file.name);
        return;
      }

      setBulkPreviewPlayers(parsed);
      setExcelFileName(file.name);
      setMessage({
        type: 'success',
        text: `Archivo ${file.name} cargado. ${parsed.length} jugadores listos para importar.`
      });
    } catch (error) {
      setBulkPreviewPlayers([]);
      setExcelFileName(file.name);
      setMessage({ type: 'error', text: 'No se pudo leer el archivo Excel.' });
    } finally {
      event.target.value = '';
    }
  };

  const handleConfirmBulkImport = async () => {
    if (!bulkPreviewPlayers.length) {
      setMessage({ type: 'error', text: 'No hay jugadores para importar.' });
      return;
    }

    try {
      const payload = bulkPreviewPlayers.map((player) => ({
        torneo_id: Number(tournamentId),
        team_id: Number(player.team_id),
        player_number: Number(player.player_number),
        player_name: String(player.name).trim(),
        nickname: String(player.nickname).trim(),
        category: String(player.category).trim()
      }));

      const response = await configService.createPlayersBulk(tournamentId, payload);
      if (!response.success) {
        throw new Error(response.message || 'No se pudo completar la importación.');
      }

      const savedPlayers = response.data?.players || [];
      const mappedPlayers = savedPlayers.map((player) => {
        const selectedTeam = teams.find((team) => team.id === String(player.team_id));
        return {
          id: player.player_id,
          player_number: player.player_number,
          name: player.player_name,
          nickname: player.nickname || '',
          category: selectedTeam?.division || bulkConfig.category || 'Sin categoría',
          team_id: Number(player.team_id),
          team_name: selectedTeam?.name || 'Sin equipo'
        };
      });

      setPlayers((prev) => [...mappedPlayers, ...prev]);
      setBulkPreviewPlayers([]);
      setExcelFileName('');
      setMessage({
        type: 'success',
        text: `Se importaron ${mappedPlayers.length} jugadores en base de datos.`
      });
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'Error al importar jugadores.';
      setMessage({ type: 'error', text: errorMessage });
    }
  };

  return (
    <div className="players_page">
      <div className="players_topbar">
        <Navbar tournamentId={tournamentId} />
      </div>

      <div className="players_content">
        <div className="players_header">
          <div>
            <h1 className="players_title">Jugadores</h1>
            <p className="players_subtitle">
              Agrega jugadores individualmente o por plantilla Excel.
            </p>
          </div>
        </div>

        {loadingTeams || loadingPlayers ? (
          <div className="players_empty">
            <p>Cargando información...</p>
          </div>
        ) : teamsError ? (
          <div className="players_empty">
            <p>{teamsError}</p>
          </div>
        ) : playersError ? (
          <div className="players_empty">
            <p>{playersError}</p>
          </div>
        ) : teams.length === 0 ? (
          <div className="players_empty">
            <p>No hay equipos registrados para este torneo.</p>
          </div>
        ) : (
          <>
            <div className="players_grid">
              <section className="players_card">
                <h2 className="players_card_title">Agregar jugador</h2>
                <form className="players_form" onSubmit={handleAddManualPlayer}>
                  <label className="players_field">
                    <span>Número de jugador</span>
                    <input
                      type="number"
                      name="playerNumber"
                      value={manualPlayer.playerNumber}
                      onChange={handleManualChange}
                      placeholder="Ej: 10"
                      min="1"
                      required
                    />
                  </label>
                  <label className="players_field">
                    <span>Nombre</span>
                    <input
                      type="text"
                      name="name"
                      value={manualPlayer.name}
                      onChange={handleManualChange}
                      placeholder="Ej: Juan Perez"
                      required
                    />
                  </label>
                  <label className="players_field">
                    <span className="players_field_label_with_hint">
                      Apodo
                      <span
                        className="players_field_hint"
                        title="Evitar apodos ofensivos y/o denigrantes para el jugador"
                        aria-label="Evitar apodos ofensivos y/o denigrantes para el jugador"
                      >
                        (?)
                      </span>
                    </span>
                    <input
                      type="text"
                      name="nickname"
                      value={manualPlayer.nickname}
                      onChange={handleManualChange}
                      placeholder="Ej: Batman"
                    />
                  </label>
                  <label className="players_field">
                    <span>Categoría</span>
                    <select
                      name="category"
                      value={manualPlayer.category}
                      onChange={handleManualChange}
                      required
                    >
                      <option value="">Selecciona categoría</option>
                      {categories.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="players_field">
                    <span>Equipo</span>
                    <select
                      name="teamId"
                      value={manualPlayer.teamId}
                      onChange={handleManualChange}
                      required
                      disabled={!manualPlayer.category}
                    >
                      <option value="">Selecciona equipo</option>
                      {manualTeamsByCategory.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {manualPlayer.teamId ? (
                    <p className="players_team_count">
                      Jugadores registrados en este equipo: <strong>{manualSelectedTeamCount}</strong>
                    </p>
                  ) : null}
                  <button type="submit" className="players_btn players_btn_primary">
                    + Agregar jugador
                  </button>
                </form>
              </section>

              <section className="players_card">
                <h2 className="players_card_title">Carga por plantilla Excel</h2>
                <div className="players_form">
                  <label className="players_field">
                    <span>Categoría</span>
                    <select
                      name="category"
                      value={bulkConfig.category}
                      onChange={handleBulkChange}
                      required
                    >
                      <option value="">Selecciona categoría</option>
                      {categories.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="players_field">
                    <span>Equipo (requerido para plantilla)</span>
                    <select
                      name="teamId"
                      value={bulkConfig.teamId}
                      onChange={handleBulkChange}
                      required
                      disabled={!bulkConfig.category}
                    >
                      <option value="">Selecciona equipo</option>
                      {bulkTeamsByCategory.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {bulkConfig.teamId ? (
                    <p className="players_team_count">
                      Jugadores registrados en este equipo: <strong>{bulkSelectedTeamCount}</strong>
                    </p>
                  ) : null}

                  <div className="players_actions_row">
                    <button
                      type="button"
                      className="players_btn players_btn_secondary"
                      onClick={handleDownloadTemplate}
                    >
                      Descargar plantilla Excel
                    </button>
                    <label className="players_btn players_btn_primary players_upload_btn">
                      Cargar Plantilla
                      <input
                        type="file"
                        accept=".xlsx,.xls"
                        onChange={handleExcelUpload}
                        hidden
                      />
                    </label>
                  </div>

                  {excelFileName ? (
                    <p className="players_file_info">Archivo cargado: {excelFileName}</p>
                  ) : null}
                </div>
              </section>
            </div>

            {message.text ? (
              <div className={`players_message ${message.type === 'error' ? 'players_message_error' : 'players_message_success'}`}>
                {message.text}
              </div>
            ) : null}

            {bulkPreviewPlayers.length > 0 ? (
              <section className="players_card players_preview_section">
                <div className="players_preview_header">
                  <h2 className="players_card_title">Vista previa de importación</h2>
                  <button
                    type="button"
                    className="players_btn players_btn_primary"
                    onClick={handleConfirmBulkImport}
                  >
                    Confirmar importación ({bulkPreviewPlayers.length})
                  </button>
                </div>
                <div className="players_table_wrap">
                  <table className="players_table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Número</th>
                        <th>Nombre</th>
                        <th>Apodo</th>
                        <th>Categoría</th>
                        <th>Team ID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bulkPreviewPlayers.map((player, index) => (
                        <tr key={`${player.rowNumber}-${index}`}>
                          <td>{index + 1}</td>
                          <td>{player.player_number}</td>
                          <td>{player.name}</td>
                          <td>{player.nickname}</td>
                          <td>{player.category}</td>
                          <td>{player.team_id}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}

          </>
        )}
      </div>
    </div>
  );
}

export default Players;
