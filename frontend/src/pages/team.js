import { useEffect, useMemo, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import Navbar from '../components/navbar';
import { configService } from '../services/configService';
import './team.css';

const DIVISION_OPTIONS = ['Open', 'Femenino', 'Mixto', 'Open Jr', 'Fem Jr', 'Mixto Jr'];

function normalizeDivision(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return DIVISION_OPTIONS[0];
  const found = DIVISION_OPTIONS.find(
    (option) => option.toLowerCase() === trimmed.toLowerCase()
  );
  return found || trimmed;
}

function Team() {
  const { id: routeTournamentId } = useParams();
  const location = useLocation();
  const queryTournamentId = new URLSearchParams(location.search).get('tournamentId');
  const tournamentId = routeTournamentId || queryTournamentId;

  const [teams, setTeams] = useState([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingTeamId, setEditingTeamId] = useState(null);
  const [newTeam, setNewTeam] = useState({
    name: '',
    division: normalizeDivision(DIVISION_OPTIONS[0]),
    representative_name: '',
    representative_email: ''
  });
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [removeCurrentImage, setRemoveCurrentImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [teamsError, setTeamsError] = useState('');

  const totalDivisions = useMemo(
    () => new Set(teams.map((team) => normalizeDivision(team.division))).size,
    [teams]
  );

  const teamsByDivision = useMemo(() => {
    const grouped = teams.reduce((acc, team) => {
      const divisionKey = normalizeDivision(team.division);
      if (!acc[divisionKey]) {
        acc[divisionKey] = [];
      }
      acc[divisionKey].push(team);
      return acc;
    }, {});

    const orderedDivisions = [
      ...DIVISION_OPTIONS.filter((division) => grouped[division]?.length),
      ...Object.keys(grouped).filter((division) => !DIVISION_OPTIONS.includes(division))
    ];

    return orderedDivisions.map((division) => ({
      division,
      teams: grouped[division]
    }));
  }, [teams]);

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
          id: team.team_id,
          name: team.name,
          division: normalizeDivision(team.division),
          image_url: team.url_imagen || null,
          representative_name: team.representative_name || '',
          representative_email: team.representative_email || ''
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

  const handleChange = (event) => {
    const { name, value } = event.target;
    setNewTeam((prev) => ({ ...prev, [name]: value }));
  };

  const handleOpenAddModal = () => {
    if (!tournamentId) {
      setTeamsError('No se encontró el ID del torneo para agregar equipos.');
      return;
    }
    setEditingTeamId(null);
    setNewTeam({
      name: '',
      division: normalizeDivision(DIVISION_OPTIONS[0]),
      representative_name: '',
      representative_email: ''
    });
    setSelectedImage(null);
    setImagePreview(null);
    setRemoveCurrentImage(false);
    setMessage({ type: '', text: '' });
    setIsAddOpen(true);
  };

  const handleOpenEditModal = (team) => {
    setEditingTeamId(team.id);
    setNewTeam({
      name: team.name || '',
      division: normalizeDivision(team.division),
      representative_name: team.representative_name || '',
      representative_email: team.representative_email || ''
    });
    setSelectedImage(null);
    setImagePreview(team.image_url || null);
    setRemoveCurrentImage(false);
    setMessage({ type: '', text: '' });
    setIsAddOpen(true);
  };

  const handleCloseAddModal = () => {
    setEditingTeamId(null);
    setNewTeam({
      name: '',
      division: normalizeDivision(DIVISION_OPTIONS[0]),
      representative_name: '',
      representative_email: ''
    });
    setSelectedImage(null);
    setImagePreview(null);
    setRemoveCurrentImage(false);
    setMessage({ type: '', text: '' });
    setIsAddOpen(false);
  };

  const handleImageChange = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setMessage({ type: 'error', text: 'Selecciona un archivo de imagen válido.' });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setMessage({ type: 'error', text: 'La imagen no debe superar los 5MB.' });
      return;
    }

    setSelectedImage(file);
    setRemoveCurrentImage(false);
    setMessage({ type: '', text: '' });

    const reader = new FileReader();
    reader.onloadend = () => setImagePreview(reader.result);
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    setRemoveCurrentImage(true);
    const input = document.getElementById('team_image');
    if (input) input.value = '';
  };

  const handleAddTeam = async (event) => {
    event.preventDefault();
    if (!newTeam.name.trim()) return;

    setSaving(true);
    setMessage({ type: '', text: '' });

    const currentTeam = teams.find((team) => team.id === editingTeamId);
    let imageUrl = currentTeam?.image_url || null;

    if (removeCurrentImage) {
      imageUrl = null;
    }

    if (selectedImage) {
      try {
        const uploadResult = await configService.uploadImage(selectedImage, 'teams');
        if (!uploadResult.success) {
          throw new Error(uploadResult.message || 'No se pudo subir la imagen del equipo.');
        }
        imageUrl = uploadResult.data?.url || null;
      } catch (error) {
        const errorMessage = error.response?.data?.message || error.message || 'Error al subir la imagen.';
        setMessage({ type: 'error', text: errorMessage });
        setSaving(false);
        return;
      }
    }

    try {
      if (editingTeamId) {
        const updateResponse = await configService.updateTeam(tournamentId, editingTeamId, {
          name: newTeam.name.trim(),
          division: normalizeDivision(newTeam.division),
          url_imagen: imageUrl,
          representative_name: newTeam.representative_name.trim() || null,
          representative_email: newTeam.representative_email.trim() || null
        });

        if (!updateResponse.success || !updateResponse.data?.team) {
          throw new Error(updateResponse.message || 'No se pudo actualizar el equipo.');
        }

        const updatedTeam = updateResponse.data.team;
        const mappedTeam = {
          id: updatedTeam.team_id,
          name: updatedTeam.name,
          division: normalizeDivision(updatedTeam.division),
          image_url: updatedTeam.url_imagen || null,
          representative_name: updatedTeam.representative_name || '',
          representative_email: updatedTeam.representative_email || ''
        };

        setTeams((prev) => prev.map((team) => (team.id === editingTeamId ? mappedTeam : team)));
      } else {
        const createResponse = await configService.createTeam(tournamentId, {
          name: newTeam.name.trim(),
          division: normalizeDivision(newTeam.division),
          url_imagen: imageUrl,
          representative_name: newTeam.representative_name.trim() || null,
          representative_email: newTeam.representative_email.trim() || null
        });

        if (!createResponse.success || !createResponse.data?.team) {
          throw new Error(createResponse.message || 'No se pudo crear el equipo.');
        }

        const createdTeam = createResponse.data.team;
        setTeams((prev) => [{
          id: createdTeam.team_id,
          name: createdTeam.name,
          division: normalizeDivision(createdTeam.division),
          image_url: createdTeam.url_imagen || null,
          representative_name: createdTeam.representative_name || '',
          representative_email: createdTeam.representative_email || ''
        }, ...prev]);
      }
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'Error al guardar el equipo.';
      setMessage({ type: 'error', text: errorMessage });
      setSaving(false);
      return;
    }

    setNewTeam({
      name: '',
      division: normalizeDivision(DIVISION_OPTIONS[0]),
      representative_name: '',
      representative_email: ''
    });
    setEditingTeamId(null);
    setSelectedImage(null);
    setImagePreview(null);
    setRemoveCurrentImage(false);
    setMessage({ type: '', text: '' });
    setSaving(false);
    setDeleteConfirmOpen(false);
    setIsAddOpen(false);
  };

  const handleOpenDeleteConfirm = () => {
    if (!editingTeamId || saving || deleting) return;
    setDeleteConfirmOpen(true);
  };

  const handleCancelDeleteConfirm = () => {
    if (deleting) return;
    setDeleteConfirmOpen(false);
  };

  const handleConfirmDeleteTeam = async () => {
    if (!editingTeamId || !tournamentId) return;

    setDeleting(true);
    setMessage({ type: '', text: '' });

    try {
      const deleteResponse = await configService.deleteTeam(tournamentId, editingTeamId);
      if (!deleteResponse.success) {
        throw new Error(deleteResponse.message || 'No se pudo eliminar el equipo.');
      }
      setTeams((prev) => prev.filter((team) => team.id !== editingTeamId));
      setDeleteConfirmOpen(false);
      handleCloseAddModal();
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'Error al eliminar el equipo.';
      setMessage({ type: 'error', text: errorMessage });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="team_page">
      <div className="team_topbar">
        <Navbar tournamentId={tournamentId} />
      </div>

      <div className="team_content">
        <div className="team_header">
          <div>
            <h1 className="team_title">Equipos del torneo</h1>
            <p className="team_subtitle">
              Administra tus equipos y visualiza sus datos principales. <br />
              El correo del representante se usa para enviar la encuesta de espíritu de juego tras finalizar un partido.
            </p>
          </div>

          <div className="team_actions">
            <button
              type="button"
              className="team_btn team_btn_primary_header"
              onClick={handleOpenAddModal}
            >
              Agregar equipo
            </button>
          </div>
        </div>

        <div className="team_stats">
          <div className="team_stat_card">
            <span className="team_stat_label">Total equipos</span>
            <strong className="team_stat_value">{teams.length}</strong>
          </div>
          <div className="team_stat_card">
            <span className="team_stat_label">Divisiones activas</span>
            <strong className="team_stat_value">{totalDivisions}</strong>
          </div>
        </div>

        {loadingTeams ? (
          <div className="team_empty">
            <p>Cargando equipos...</p>
          </div>
        ) : teamsError ? (
          <div className="team_empty">
            <p>{teamsError}</p>
          </div>
        ) : teams.length === 0 ? (
          <div className="team_empty">
            <p>No hay equipos cargados.</p>
          </div>
        ) : (
          <div className="team_divisions">
            {teamsByDivision.map((divisionGroup) => (
              <section key={divisionGroup.division} className="team_division_section">
                <h2 className="team_division_title">{divisionGroup.division}</h2>
                <div className="team_grid">
                  {divisionGroup.teams.map((team) => (
                    <article
                      key={team.id}
                      className={`team_card ${team.division === 'Femenino' ? 'team_card_femenino' : ''} ${team.division === 'Mixto' ? 'team_card_mixto' : ''}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleOpenEditModal(team)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          handleOpenEditModal(team);
                        }
                      }}
                    >
                      <div className="team_color_mark" />
                      <div className="team_card_body">
                        {team.image_url ? (
                          <img src={team.image_url} alt={team.name} className="team_card_image" />
                        ) : null}
                        <h3 className="team_card_title">{team.name}</h3>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {isAddOpen && (
        <div className="team_modal_overlay" role="presentation" onClick={handleCloseAddModal}>
          <div className="team_modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <h2 className="team_modal_title">{editingTeamId ? 'Editar equipo' : 'Agregar equipo'}</h2>
            <form onSubmit={handleAddTeam} className="team_form">
              <label className="team_field">
                <span>Nombre del equipo</span>
                <input
                  type="text"
                  name="name"
                  value={newTeam.name}
                  onChange={handleChange}
                  placeholder="Ej: Panteras"
                  required
                />
              </label>
              <label className="team_field">
                <span>División</span>
                <select
                  name="division"
                  value={newTeam.division}
                  onChange={handleChange}
                >
                  {DIVISION_OPTIONS.map((division) => (
                    <option key={division} value={division}>
                      {division}
                    </option>
                  ))}
                </select>
              </label>
              <label className="team_field">
                <span>Representante (nombre)</span>
                <input
                  type="text"
                  name="representative_name"
                  value={newTeam.representative_name}
                  onChange={handleChange}
                  placeholder="Opcional"
                  autoComplete="name"
                />
              </label>
              <label className="team_field">
                <span>Representante (correo)</span>
                <input
                  type="email"
                  name="representative_email"
                  value={newTeam.representative_email}
                  onChange={handleChange}
                  placeholder="Correo para encuesta de espíritu"
                  autoComplete="email"
                />
              </label>
              <label className="team_field">
                <span>Imagen del equipo</span>
                <input
                  type="file"
                  id="team_image"
                  accept="image/*"
                  onChange={handleImageChange}
                />
              </label>
              {imagePreview ? (
                <div className="team_image_preview_container">
                  <img src={imagePreview} alt="Preview equipo" className="team_image_preview" />
                  <button type="button" className="team_btn team_btn_secondary" onClick={handleRemoveImage}>
                    Quitar imagen
                  </button>
                </div>
              ) : null}

              {message.text ? (
                <div className={`team_message ${message.type === 'error' ? 'team_message_error' : 'team_message_success'}`}>
                  {message.text}
                </div>
              ) : null}

              <div className="team_modal_actions_row">
                {editingTeamId ? (
                  <button
                    type="button"
                    className="team_btn team_btn_danger"
                    onClick={handleOpenDeleteConfirm}
                    disabled={saving || deleting}
                  >
                    Eliminar
                  </button>
                ) : null}
                <button
                  type="button"
                  className="team_btn team_btn_secondary"
                  onClick={handleCloseAddModal}
                  disabled={saving || deleting}
                >
                  Cancelar
                </button>
                <button type="submit" className="team_btn team_btn_primary" disabled={saving || deleting}>
                  {saving ? 'Guardando...' : editingTeamId ? 'Guardar' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteConfirmOpen && (
        <div
          className="team_confirm_overlay"
          role="presentation"
          onClick={handleCancelDeleteConfirm}
        >
          <div
            className="team_confirm_dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="team_delete_confirm_title"
            onClick={(event) => event.stopPropagation()}
          >
            <p id="team_delete_confirm_title" className="team_confirm_message">
              Al eliminar el equipo eliminarás los jugadores registrados.
            </p>
            <div className="team_confirm_actions">
              <button
                type="button"
                className="team_btn team_btn_secondary"
                onClick={handleCancelDeleteConfirm}
                disabled={deleting}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="team_btn team_btn_danger"
                onClick={handleConfirmDeleteTeam}
                disabled={deleting}
              >
                {deleting ? 'Eliminando...' : 'Eliminar equipo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Team;
