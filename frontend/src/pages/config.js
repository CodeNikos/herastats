import './config.css';
import Navbar from '../components/navbar';
import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { configService } from '../services/configService';
import { useAuth } from '../hooks/useAuth';
import { isSuperuser } from '../utils/userRoles';

/** Opciones base de fase en configuración → phase_num en BD */
const BASE_PHASE_STAGE_OPTIONS = [
    { value: 'Groups', label: 'Groups', phase_num: 1 },
    { value: 'Playoffs', label: 'Playoffs', phase_num: 2 },
    { value: 'Semifinals', label: 'Semifinals', phase_num: 5 },
    { value: 'Final', label: 'Final', phase_num: 6 }
];

const FOOTBALL_EXTRA_STAGE_OPTIONS = [
    { value: 'Dieciseisavos', label: 'Dieciseisavos', phase_num: 2 },
    { value: 'Octavos', label: 'Octavos', phase_num: 3 },
    { value: 'Cuartos', label: 'Cuartos', phase_num: 4 }
];

function isFootballSportName(sportName) {
    const text = String(sportName || '').trim().toLowerCase();
    return text.includes('futbol') || text.includes('fútbol') || text.includes('football') || text.includes('soccer');
}

function getPhaseOptionsBySportName(sportName) {
    if (isFootballSportName(sportName)) {
        return [
            BASE_PHASE_STAGE_OPTIONS[0],
            ...FOOTBALL_EXTRA_STAGE_OPTIONS,
            BASE_PHASE_STAGE_OPTIONS[2],
            BASE_PHASE_STAGE_OPTIONS[3]
        ];
    }
    return BASE_PHASE_STAGE_OPTIONS;
}

function normalizePhaseStageFromApi(phase, stageByPhaseNum, phaseNumByStage) {
    const text = String(phase?.stage || '').trim();
    if (phaseNumByStage[text]) return text;
    const byNum = stageByPhaseNum[Number(phase?.phase_num)];
    if (byNum) return byNum;
    const lower = text.toLowerCase();
    if (lower.includes('grupo') || lower.includes('group') || lower === 'groups') return 'Groups';
    if (lower.includes('dieciseis') || lower.includes('16avos') || lower.includes('round of 32')) return 'Dieciseisavos';
    if (lower.includes('octav') || lower.includes('round of 16')) return 'Octavos';
    if (lower.includes('cuart') || lower.includes('quarter')) return 'Cuartos';
    if (lower.includes('semi')) return 'Semifinals';
    if (lower === 'final' || (lower.includes('final') && !lower.includes('semi'))) return 'Final';
    if (lower.includes('playoff')) return 'Playoffs';
    return '';
}

function emptyPhaseRow(id) {
    return { id, phas_id: null, stage: '', phase_num: null, duracion: '', limite_goal: '' };
}

function mapPhaseRowFromApi(p, stageByPhaseNum, phaseNumByStage) {
    const stage = normalizePhaseStageFromApi(p, stageByPhaseNum, phaseNumByStage);
    return {
        id: p.phas_id,
        phas_id: p.phas_id,
        stage,
        phase_num: stage ? phaseNumByStage[stage] : (p.phase_num != null ? Number(p.phase_num) : null),
        duracion: p.duration != null ? String(p.duration) : '',
        limite_goal: p.goal_limit != null ? String(p.goal_limit) : ''
    };
}

function Config() {
    const { id: tournamentId } = useParams();
    const { user } = useAuth();
    const currentYear = new Date().getFullYear();
    const [rows, setRows] = useState([emptyPhaseRow(1)]);
    const [activeTab, setActiveTab] = useState('config');
    const [selectedYear, setSelectedYear] = useState(currentYear);
    const [loading, setLoading] = useState(false);
    const [resettingTournament, setResettingTournament] = useState(false);
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [loadingTournament, setLoadingTournament] = useState(!!tournamentId);
    const [message, setMessage] = useState({ type: '', text: '' });
    const [selectedImage, setSelectedImage] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);
    const [tournament, setTournament] = useState(null);
    const [formData, setFormData] = useState({
        torn_name: '',
        pais: '',
    });
    const userIsSuper = isSuperuser(user);
    const phaseStageOptions = useMemo(
        () => getPhaseOptionsBySportName(tournament?.sport_name),
        [tournament?.sport_name]
    );
    const phaseNumByStage = useMemo(
        () => Object.fromEntries(phaseStageOptions.map((o) => [o.value, o.phase_num])),
        [phaseStageOptions]
    );
    const stageByPhaseNum = useMemo(
        () => Object.fromEntries(phaseStageOptions.map((o) => [o.phase_num, o.value])),
        [phaseStageOptions]
    );

    useEffect(() => {
        if (!tournamentId) {
            setLoadingTournament(false);
            return;
        }
        const loadTournament = async () => {
            try {
                setLoadingTournament(true);
                let nextPhaseNumByStage = Object.fromEntries(BASE_PHASE_STAGE_OPTIONS.map((o) => [o.value, o.phase_num]));
                let nextStageByPhaseNum = Object.fromEntries(BASE_PHASE_STAGE_OPTIONS.map((o) => [o.phase_num, o.value]));
                const response = await configService.getTournamentById(tournamentId);
                if (response.success && response.data?.tournament) {
                    const t = response.data.tournament;
                    const options = getPhaseOptionsBySportName(t?.sport_name);
                    nextPhaseNumByStage = Object.fromEntries(options.map((o) => [o.value, o.phase_num]));
                    nextStageByPhaseNum = Object.fromEntries(options.map((o) => [o.phase_num, o.value]));
                    setTournament(t);
                    setFormData({
                        torn_name: t.name || '',
                        pais: t.country || '',
                    });
                    setSelectedYear(t.year || currentYear);
                    setImagePreview(t.image_url || null);
                }
                try {
                    const phasesRes = await configService.getPhases(tournamentId);
                    if (phasesRes.success && Array.isArray(phasesRes.data?.phases) && phasesRes.data.phases.length > 0) {
                        setRows(phasesRes.data.phases.map((p) => mapPhaseRowFromApi(p, nextStageByPhaseNum, nextPhaseNumByStage)));
                    }
                } catch (phasesErr) {
                    console.warn('No se pudieron cargar las fases:', phasesErr);
                }
            } catch (err) {
                console.error('Error al cargar torneo:', err);
                setMessage({ type: 'error', text: 'No se pudo cargar el torneo' });
            } finally {
                setLoadingTournament(false);
            }
        };
        loadTournament();
    }, [tournamentId]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMessage({ type: '', text: '' });

        try {
            let imageUrl = null;

            // Si hay una imagen seleccionada, subirla primero a Cloudinary
            if (selectedImage) {
                try {
                    const uploadResult = await configService.uploadImage(selectedImage);
                    if (uploadResult.success) {
                        imageUrl = uploadResult.data.url;
                    } else {
                        throw new Error(uploadResult.message || 'Error al subir la imagen');
                    }
                } catch (uploadError) {
                    console.error('Error al subir imagen:', uploadError);
                    console.error('Error response data:', uploadError.response?.data);
                    const errorMessage = uploadError.response?.data?.message || uploadError.message || 'Error al subir la imagen. Intenta nuevamente.';
                    setMessage({ type: 'error', text: errorMessage });
                    setLoading(false);
                    return;
                }
            }

            const tournamentData = {
                torn_name: formData.torn_name,
                torn_year: selectedYear,
                pais: formData.pais,
                image_url: imageUrl !== null && imageUrl !== undefined ? imageUrl : (tournament?.image_url || null)
            };

            let result;
            if (tournamentId) {
                result = await configService.updateTournament(tournamentId, tournamentData);
            } else {
                result = await configService.createTournament(tournamentData);
            }
            
            if (result.success) {
                setMessage({ type: 'success', text: tournamentId ? 'Torneo actualizado exitosamente' : 'Configuración guardada exitosamente' });
                if (!tournamentId) {
                    e.target.reset();
                    setSelectedYear(currentYear);
                    setFormData({ torn_name: '', pais: '' });
                } else {
                    setTournament(result.data?.tournament || { ...tournament, ...tournamentData });
                }
                setSelectedImage(null);
                setImagePreview(tournamentData.image_url || imagePreview);
            }
        } catch (error) {
            console.error('Error al guardar configuración:', error);
            const errorMessage = error.response?.data?.message || error.message || 'Error al guardar la configuración';
            setMessage({ type: 'error', text: errorMessage });
        } finally {
            setLoading(false);
        }
    }

    const handleYearChange = (event) => {
        setSelectedYear(parseInt(event.target.value));
      };
      const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

    const handleAddRow = () => {
        const newId = rows.length > 0 ? Math.max(...rows.map(r => r.id)) + 1 : 1;
        setRows([...rows, emptyPhaseRow(newId)]);
    };

    const handleDeleteRow = (id) => {
        setRows(rows.filter((row) => row.id !== id));
    };

    const handleCellChange = (id, field, value) => {
        setRows(rows.map((row) => {
            if (row.id !== id) return row;
            if (field === 'stage') {
                const phase_num = phaseNumByStage[value] ?? null;
                return { ...row, stage: value, phase_num };
            }
            return { ...row, [field]: value };
        }));
    };

    const [savingPhases, setSavingPhases] = useState(false);
    const [phasesMessage, setPhasesMessage] = useState({ type: '', text: '' });

    const handleSaveRows = async () => {
        if (!tournamentId) {
            setPhasesMessage({ type: 'error', text: 'Abre un torneo (Configuración → Torneo) para poder guardar las fases.' });
            return;
        }
        setSavingPhases(true);
        setPhasesMessage({ type: '', text: '' });
        try {
            const invalidStage = rows.some((r) => !r.stage || !phaseNumByStage[r.stage]);
            if (invalidStage) {
                const labels = phaseStageOptions.map((o) => o.label).join(', ');
                setPhasesMessage({ type: 'error', text: `Selecciona un tipo de fase válido (${labels}) en cada fila.` });
                setSavingPhases(false);
                return;
            }
            const phasesPayload = rows.map((r) => ({
                ...(r.phas_id != null && r.phas_id !== '' ? { phas_id: r.phas_id } : {}),
                stage: r.stage,
                phase_num: phaseNumByStage[r.stage],
                duracion: r.duracion,
                limite_goal: r.limite_goal
            }));
            const result = await configService.savePhases(tournamentId, phasesPayload);
            if (result.success) {
                setPhasesMessage({ type: 'success', text: 'Fases guardadas correctamente.' });
                if (Array.isArray(result.data?.phases)) {
                    if (result.data.phases.length > 0) {
                        setRows(result.data.phases.map((p) => mapPhaseRowFromApi(p, stageByPhaseNum, phaseNumByStage)));
                    } else {
                        setRows([]);
                    }
                }
            } else {
                setPhasesMessage({ type: 'error', text: result.message || 'Error al guardar las fases' });
            }
        } catch (error) {
            console.error('Error al guardar fases:', error);
            const errorMessage = error.response?.data?.message || error.message || 'Error al guardar las fases';
            setPhasesMessage({ type: 'error', text: errorMessage });
        } finally {
            setSavingPhases(false);
        }
    };

    const handleImageChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            // Validar tipo de archivo
            if (!file.type.startsWith('image/')) {
                setMessage({ type: 'error', text: 'Por favor, selecciona un archivo de imagen válido' });
                return;
            }
            
            // Validar tamaño (máximo 5MB)
            if (file.size > 5 * 1024 * 1024) {
                setMessage({ type: 'error', text: 'La imagen no debe superar los 5MB' });
                return;
            }

            setSelectedImage(file);
            
            // Crear preview
            const reader = new FileReader();
            reader.onloadend = () => {
                setImagePreview(reader.result);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleRemoveImage = () => {
        setSelectedImage(null);
        setImagePreview(null);
        // Resetear el input file
        const fileInput = document.getElementById('tournament_image');
        if (fileInput) {
            fileInput.value = '';
        }
    };

    const handleResetTournament = () => {
        if (!tournamentId) {
            setMessage({ type: 'error', text: 'Debes abrir un torneo existente para poder restablecerlo.' });
            return;
        }
        setShowResetConfirm(true);
    };

    const confirmResetTournament = async () => {
        setResettingTournament(true);
        setShowResetConfirm(false);
        setMessage({ type: '', text: '' });
        setPhasesMessage({ type: '', text: '' });
        try {
            const result = await configService.resetTournament(tournamentId);
            if (result.success) {
                const resetTournamentData = result.data?.tournament || null;
                setTournament(resetTournamentData);
                setFormData({
                    torn_name: resetTournamentData?.name || '',
                    pais: resetTournamentData?.country || '',
                });
                setSelectedYear(resetTournamentData?.year || currentYear);
                setRows([emptyPhaseRow(1)]);
                setSelectedImage(null);
                setImagePreview(null);
                const fileInput = document.getElementById('tournament_image');
                if (fileInput) {
                    fileInput.value = '';
                }
                setMessage({ type: 'success', text: 'El torneo fue restablecido y quedó en blanco.' });
            } else {
                setMessage({ type: 'error', text: result.message || 'No se pudo restablecer el torneo.' });
            }
        } catch (error) {
            console.error('Error al restablecer torneo:', error);
            const errorMessage = error.response?.data?.message || error.message || 'No se pudo restablecer el torneo';
            setMessage({ type: 'error', text: errorMessage });
        } finally {
            setResettingTournament(false);
        }
    };

    return (
        <div className='config_container'>
        <div className='topbar'>
        <Navbar tournamentId={tournamentId} />
        </div>

<div className='config_body_container'>

    <div className='setup_container'>

    <div className='rules_form'>
        <div className='tabs_container'>
            <div className='tabs_header'>
                <button 
                    type='button'
                    className={`tab_button ${activeTab === 'config' ? 'active' : ''}`}
                    onClick={() => setActiveTab('config')}
                >
                    Configuración
                </button>
                <button 
                    type='button'
                    className={`tab_button ${activeTab === 'rows' ? 'active' : ''}`}
                    onClick={() => setActiveTab('rows')}
                >
                    Fases del torneo
                </button>
            </div>

            <div className='tabs_content'>
                {activeTab === 'config' && (
                    loadingTournament ? (
                        <div className='message'>Cargando datos del torneo...</div>
                    ) : (
                    <form className='form' onSubmit={handleSubmit}>

                        <div className='form_group'>
                            <label htmlFor='torn_name'>Nombre del Torneo:</label>
                            <input 
                                type='text' 
                                id='torn_name' 
                                name='torn_name'
                                value={formData.torn_name}
                                onChange={(e) => setFormData(f => ({ ...f, torn_name: e.target.value }))}
                                className='form_input'
                            />
                        </div>

                        <div className='form_group'>
                            <label htmlFor='torn_year'>Año del Torneo:</label>
                            <select 
                                id="year-select" 
                                value={selectedYear} 
                                onChange={handleYearChange}
                                className='form_input'
                            >
                            {years.map((year) => (
                            <option key={year} value={year}>
                            {year}
                            </option>
                            ))}
                            </select>
                        </div>

                        <div className='form_group'>
                            <label htmlFor='pais'>País:</label>
                            <input 
                                type='text' 
                                id='pais' 
                                name='pais'
                                value={formData.pais}
                                onChange={(e) => setFormData(f => ({ ...f, pais: e.target.value }))}
                                className='form_input'
                            />
                        </div>
                        
                        <div className='form_group'>
                            <label htmlFor='tournament_image'>Imagen del Torneo:</label>
                            <input 
                                type='file' 
                                id='tournament_image' 
                                name='tournament_image'
                                accept='image/*'
                                onChange={handleImageChange}
                                className='form_input_file'
                            />
                            {imagePreview && (
                                <div className='image_preview_container'> 
                                    <img src={imagePreview} alt='Preview' className='image_preview' />
                                    <button 
                                        type='button' 
                                        onClick={handleRemoveImage}
                                        className='remove_image_button'
                                    >
                                        Eliminar imagen
                                    </button>
                                </div>
                            )}
                        </div>

                        {message.text && (
                            <div className={`message ${message.type === 'success' ? 'message_success' : 'message_error'}`}>
                                {message.text}
                            </div>
                        )}

                        <div className='form_group form_group_button'>
                            <button type='submit' className='form_button' disabled={loading}>
                                {loading ? 'Guardando...' : 'Guardar'}
                            </button>
                            {userIsSuper && tournamentId && (
                                    <button
                                        type='button'
                                        className='form_button form_button_danger'
                                        disabled={resettingTournament}
                                        onClick={handleResetTournament}
                                    >
                                        {resettingTournament ? 'Restableciendo...' : 'Reset del torneo'}
                                    </button>
                            )}
                        </div>
                    </form>
                    )
                )}

                {activeTab === 'rows' && (
                    <div className='form excel_form'>
                        <div className='excel_form_header'>
                            <h2 className='form_title'>Fases del torneo</h2>
                            <button type='button' className='form_button add_row_button_top' onClick={handleAddRow}>
                                Agregar
                            </button>
                        </div>
                        <div className='excel_table_container'>
                            <table className='excel_table'>
                                <thead>
                                    <tr>
                                        <th className='excel_header'>Fase</th>
                                        <th className='excel_header'>Duración</th>
                                        <th className='excel_header'>Límite Goal</th>
                                        <th className='excel_header excel_action_header'></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((row) => (
                                        <tr key={row.id} className='excel_row'>
                                            <td className='excel_cell'>
                                                <select
                                                    className='excel_input excel_select'
                                                    value={row.stage}
                                                    onChange={(e) => handleCellChange(row.id, 'stage', e.target.value)}
                                                    aria-label='Tipo de fase'
                                                >
                                                    <option value=''>Seleccionar fase…</option>
                                                    {phaseStageOptions.map((opt) => (
                                                        <option key={opt.value} value={opt.value}>
                                                            {opt.label}
                                                        </option>
                                                    ))}
                                                </select>
                                            </td>
                                            <td className='excel_cell'>
                                                <input
                                                    type='text'
                                                    className='excel_input'
                                                    value={row.duracion}
                                                    onChange={(e) => handleCellChange(row.id, 'duracion', e.target.value)}
                                                />
                                            </td>
                                            <td className='excel_cell'>
                                                <input
                                                    type='number'
                                                    className='excel_input'
                                                    step='1'
                                                    value={row.limite_goal}
                                                    onChange={(e) => handleCellChange(row.id, 'limite_goal', e.target.value)}
                                                />
                                            </td>
                                            <td className='excel_cell excel_action_cell'>
                                                <button
                                                    type='button'
                                                    className='excel_delete_button'
                                                    onClick={() => handleDeleteRow(row.id)}
                                                    aria-label='Eliminar fase'
                                                >
                                                    x
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {phasesMessage.text && (
                            <div className={`message ${phasesMessage.type === 'success' ? 'message_success' : 'message_error'}`} style={{ marginTop: 16 }}>
                                {phasesMessage.text}
                            </div>
                        )}
                        <div className='form_group form_group_button'>
                            <button type='button' className='form_button add_row_button' onClick={handleSaveRows} disabled={savingPhases}>
                                {savingPhases ? 'Guardando...' : 'Guardar'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    </div>

    </div> {/* setup_container */}
</div>   {/* config_body_container */}

        {showResetConfirm && (
            <div className='reset_confirm_overlay'>
                <div className='reset_confirm_modal'>
                    <h3>Confirmar reset del torneo</h3>
                    <p>
                        Esta acción borrará toda la información del torneo:
                        equipos, fases, juegos, eventos, brackets y encuestas.
                    </p>
                    <p className='reset_confirm_warning'>No se puede deshacer.</p>
                    <div className='reset_confirm_actions'>
                        <button
                            type='button'
                            className='form_button reset_confirm_cancel'
                            onClick={() => setShowResetConfirm(false)}
                        >
                            Cancelar
                        </button>
                        <button
                            type='button'
                            className='form_button form_button_danger'
                            onClick={confirmResetTournament}
                            disabled={resettingTournament}
                        >
                            {resettingTournament ? 'Restableciendo...' : 'Sí, restablecer'}
                        </button>
                    </div>
                </div>
            </div>
        )}

        </div> /* config_container */

    );
};

export default Config;