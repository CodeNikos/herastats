const pool = require('../config/database');
const TournamentConfig = require('../models/TournamentConfig');
const TournamentMember = require('../models/TournamentMember');
const Phase = require('../models/Phase');
const Team = require('../models/Team');
const Player = require('../models/Player');
const Game = require('../models/Game');
const GameEvent = require('../models/GameEvent');
const GameBracketLink = require('../models/GameBracketLink');
const RankedCanvas = require('../models/RankedCanvas');
const GameRankView = require('../models/GameRankView');
const Placement = require('../models/Placement');
const { deleteCloudinaryImageByUrl } = require('./uploadController');
const { maybeSendSpiritInvitesAfterGameFinished, isFinishedEstado } = require('../services/spiritSurveyService');
const { assertGameAcceptsEventType, resolveTournamentSportId } = require('../services/gameEventGuards');
const {
  FOOTBALL_POST_MATCH_EVENT_TYPES,
  FOOTBALL_SCORING_EVENT_TYPES,
  normalizeFootballEventTypeInput,
  normalizeFootballMinuteToEventTime,
  isAdminOrSuperuserRole
} = require('../utils/footballEventTypes');
const { finalizeGameScoresAndStandingsHooks, propagateFinishedGameStats } = require('./config/finalizeHooks');
const { isFinishedGameEstado, shouldRecordFinishedMarker: shouldRecordFinishedMarkerCanonical } = require('../utils/gameEstado');
const { canListAllTournaments, normalizeRole } = require('../utils/userRoles');
const TournamentCreationToken = require('../models/TournamentCreationToken');
const Sport = require('../models/Sport');

function triggerSpiritSurveyIfFinished(tournamentId, gameId, estadoValue) {
  if (!isFinishedEstado(estadoValue)) return;
  setImmediate(() => {
    maybeSendSpiritInvitesAfterGameFinished(Number(tournamentId), Number(gameId));
  });
}

/** Estado en BD marcado como cerrado para insertar `JUEGO FINALIZADO` si aplica */
const shouldRecordFinishedMarker = shouldRecordFinishedMarkerCanonical;

/** placement_number en game: entero 0–15 (índice de puesto en bracket) o null. */
function normalizeBracketPlacementNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 15) return null;
  return n;
}

/**
 * Tras persistir estado Finished (PATCH estado, PUT juego o PUT bracket): marca partido desde eventos,
 * propagación playoff W#/L#, y clasificación de equipos.
 * Seguro llamar más de una vez (standings idempotentes vía `team_standings_recorded`).
 *
 * @param {number|string} tournamentId
 * @param {number|string} gameId
 */
/** `HH:MM:SS` (horas hasta 999) desde el cliente, o null */
function normalizeFinishEventWallClock(raw) {
  const t = raw == null ? '' : String(raw).trim();
  if (!t) return null;
  const m = t.match(/^(\d{1,3}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  const h = Math.min(Number(m[1]), 999);
  const min = Number(m[2]);
  const sec = Number(m[3]);
  if (!Number.isFinite(min) || !Number.isFinite(sec) || min > 59 || sec > 59) return null;
  return `${String(h)}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function normalizeFinishElapsedSeconds(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const n = typeof raw === 'string' ? Number.parseInt(String(raw).trim(), 10) : Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(Math.min(n, 86400 * 2));
}

/** Segundos de cronómetro de juego → `HH:MM:SS` (misma convención que LIVE). */
function formatGameClockSecondsToHms(totalSec) {
  const s = Math.max(0, Math.floor(Number(totalSec) || 0));
  const h = Math.floor(s / 3600);
  const min = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h)}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

/**
 * Crear una nueva configuración de torneo
 * POST /api/config/tournament
 */
const createTournament = async (req, res) => {
  try {
    const { torn_name, torn_year, pais, sport_id: sportIdRaw } = req.body;
    
    // Obtener el email del usuario autenticado desde req.user (agregado por el middleware)
    const userEmail = req.user?.email;
    
    if (!userEmail) {
      return res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
    }
    
    console.log('Datos recibidos en el backend:', req.body); // Debug

    // Validaciones básicas
    if (!torn_name || !torn_name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'El nombre del torneo es obligatorio'
      });
    }

    if (!torn_year) {
      return res.status(400).json({
        success: false,
        message: 'El año del torneo es obligatorio'
      });
    }

    const sportId = Number(sportIdRaw);
    if (!Number.isInteger(sportId) || sportId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Debes seleccionar un deporte válido'
      });
    }

    const sport = await Sport.findById(sportId);
    if (!sport) {
      return res.status(400).json({
        success: false,
        message: 'El deporte seleccionado no existe'
      });
    }

    // Validar que el año sea un número válido
    const year = parseInt(torn_year);
    if (isNaN(year) || year < 1900 || year > 2100) {
      return res.status(400).json({
        success: false,
        message: 'El año debe ser un número válido entre 1900 y 2100'
      });
    }

    // Los administradores necesitan un token asignado por el superusuario.
    const userRole = normalizeRole(req.user?.role);
    if (userRole === 'admin') {
      const hasToken = await TournamentCreationToken.hasAvailableForUser(req.user.id);
      if (!hasToken) {
        return res.status(403).json({
          success: false,
          message:
            'No tienes un token de creación de torneo. Solicita uno al superusuario del sistema.'
        });
      }
    }

    // Preparar los datos para el modelo
    // Mapear los nombres del formulario a los nombres del modelo
    const configData = {
      name: torn_name.trim(),
      year: year,
      country: pais ? pais.trim() : null,
      location: pais ? pais.trim() : null, // Usar país como ubicación si no se proporciona
      image_url: req.body.image_url || null,
      created_by: userEmail,
      sport_id: sportId
    };

    // Crear la configuración del torneo
    const newTournament = await TournamentConfig.create(configData);

    if (req.user?.id) {
      await TournamentMember.add({
        userId: req.user.id,
        torneoId: newTournament.torneo_id,
        invitedBy: null
      });
    }

    if (userRole === 'admin') {
      const consumed = await TournamentCreationToken.consumeOldestAvailable({
        userId: req.user.id,
        torneoId: newTournament.torneo_id
      });
      if (!consumed) {
        console.error(
          '[createTournament] Torneo creado sin consumir token para admin',
          req.user.id,
          newTournament.torneo_id
        );
      }
    }

    res.status(201).json({
      success: true,
      message: 'Configuración del torneo guardada exitosamente',
      data: {
        tournament: {
          id: newTournament.torneo_id,
          name: newTournament.name,
          year: newTournament.year,
          country: newTournament.country,
          location: newTournament.location,
          image_url: newTournament.image_url,
          sport_id: newTournament.sport_id,
          sport_name: sport.name,
          created_by: newTournament.created_by,
          created_at: newTournament.created_at
        }
      }
    });

  } catch (error) {
    console.error('Error en createTournament:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      detail: error.detail,
      stack: error.stack
    });
    
    // Manejar errores específicos de PostgreSQL
    if (error.code === '23505') { // Violación de constraint único
      return res.status(400).json({
        success: false,
        message: 'Ya existe un torneo con estos datos'
      });
    }

    if (error.code === '42P01') { // Tabla no existe
      return res.status(500).json({
        success: false,
        message: 'Error: La tabla de torneos no existe. Por favor, contacta al administrador.'
      });
    }

    res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor al guardar la configuración',
      error: process.env.NODE_ENV === 'development' ? {
        message: error.message,
        code: error.code,
        detail: error.detail,
        stack: error.stack
      } : undefined
    });
  }
};

/**
 * Obtener torneos:
 * - Sin sesión: todos (vista pública).
 * - superuser: todos.
 * - admin / anotador: dueños (created_by) + torneos asignados en tournament_members.
 * GET /api/config/tournament
 */
const getTournaments = async (req, res) => {
  try {
    const userEmail = req.user?.email;
    const userId = req.user?.id;
    const role = req.user?.role;

    let tournaments;
    if (!userEmail) {
      tournaments = await TournamentConfig.findAll();
    } else if (canListAllTournaments(role)) {
      tournaments = await TournamentConfig.findAll();
    } else {
      tournaments = await TournamentConfig.findAccessibleByUser({
        userId,
        userEmail
      });
    }

    res.json({
      success: true,
      message: 'Torneos obtenidos exitosamente',
      data: {
        tournaments: tournaments
      }
    });
  } catch (error) {
    console.error('Error en getTournaments:', error);
    console.error('Stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor al obtener las configuraciones',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Obtener una configuración de torneo por ID
 * GET /api/config/tournament/:id
 */
const getTournamentById = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'ID del torneo es requerido'
      });
    }

    const tournament = await TournamentConfig.findById(id);
    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: 'Torneo no encontrado'
      });
    }

    res.json({
      success: true,
      message: 'Torneo obtenido exitosamente',
      data: { tournament }
    });
  } catch (error) {
    console.error('Error en getTournamentById:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor al obtener la configuración',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Actualizar una configuración de torneo
 * PUT /api/config/tournament/:id
 */
const updateTournament = async (req, res) => {
  try {
    const { id } = req.params;
    const { torn_name, torn_year, pais } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'ID del torneo es requerido'
      });
    }

    // Validaciones similares a createTournament
    if (torn_name && !torn_name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'El nombre del torneo no puede estar vacío'
      });
    }

    const year = torn_year ? parseInt(torn_year) : undefined;
    if (torn_year != null && (isNaN(year) || year < 1900 || year > 2100)) {
      return res.status(400).json({
        success: false,
        message: 'El año debe ser un número válido entre 1900 y 2100'
      });
    }

    const updateData = {
      name: torn_name ? torn_name.trim() : undefined,
      year: year,
      country: pais ? pais.trim() : null,
      location: pais ? pais.trim() : null,
      image_url: req.body.image_url || undefined
    };

    const updated = await TournamentConfig.update(id, updateData);
    if (!updated) {
      return res.status(404).json({
        success: false,
        message: 'Torneo no encontrado'
      });
    }

    res.json({
      success: true,
      message: 'Torneo actualizado exitosamente',
      data: { tournament: updated }
    });
  } catch (error) {
    console.error('Error en updateTournament:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor al actualizar la configuración',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Eliminar una configuración de torneo
 * DELETE /api/config/tournament/:id
 */
const deleteTournament = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'ID del torneo es requerido'
      });
    }

    // Si el modelo tiene un método delete, usarlo
    // Por ahora, retornamos un mensaje indicando que se debe implementar
    res.status(501).json({
      success: false,
      message: 'Funcionalidad de eliminar torneo no implementada aún'
    });
  } catch (error) {
    console.error('Error en deleteTournament:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor al eliminar la configuración',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Restablecer un torneo a estado inicial.
 * DELETE /api/config/tournament/:id/reset
 * Requiere superuser (aplicado en la ruta).
 */
const resetTournament = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'ID del torneo es requerido'
      });
    }

    const resetTournamentRow = await TournamentConfig.resetById(id);
    if (!resetTournamentRow) {
      return res.status(404).json({
        success: false,
        message: 'Torneo no encontrado'
      });
    }

    return res.json({
      success: true,
      message: 'Torneo restablecido exitosamente',
      data: {
        tournament: resetTournamentRow
      }
    });
  } catch (error) {
    console.error('Error en resetTournament:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor al restablecer el torneo',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Guardar fases de un torneo (actualiza por phas_id si viene; inserta nuevas; borra las que ya no están)
 * POST /api/config/tournament/:id/phases
 */
const savePhases = async (req, res) => {
  try {
    const { id } = req.params;
    const { phases } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'ID del torneo es requerido'
      });
    }

    const list = Array.isArray(phases) ? phases : [];
    const normalized = list.map((p) => ({
      phas_id: p.phas_id,
      stage: p.stage,
      duration: p.duracion,
      goal_limit: p.limite_goal,
      phase_num: p.phase_num
    }));

    const saved = await Phase.replaceByTorneoId(id, normalized);

    res.json({
      success: true,
      message: 'Fases guardadas exitosamente',
      data: { phases: saved }
    });
  } catch (error) {
    console.error('Error en savePhases:', error);
    res.status(500).json({
      success: false,
      message: 'Error al guardar las fases',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Obtener fases de un torneo
 * GET /api/config/tournament/:id/phases
 */
const getPhases = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'ID del torneo es requerido'
      });
    }

    const phases = await Phase.findByTorneoId(id);

    res.json({
      success: true,
      message: 'Fases obtenidas exitosamente',
      data: { phases }
    });
  } catch (error) {
    console.error('Error en getPhases:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener las fases',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Obtener equipos de un torneo
 * GET /api/config/tournament/:id/teams
 */
const getTeams = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'ID del torneo es requerido'
      });
    }

    const teams = await Team.findByTorneoId(id);
    return res.json({
      success: true,
      message: 'Equipos obtenidos exitosamente',
      data: { teams }
    });
  } catch (error) {
    console.error('Error en getTeams:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener los equipos',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Crear equipo de un torneo
 * POST /api/config/tournament/:id/teams
 */
const createTeam = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, division, group, url_imagen, representative_email, representative_name } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'ID del torneo es requerido'
      });
    }

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'El nombre del equipo es obligatorio'
      });
    }

    const created = await Team.create({
      torneo_id: id,
      name: name.trim(),
      division: division ? String(division).trim() : null,
      group: group ? String(group).trim() : null,
      url_imagen: url_imagen || null,
      representative_email: representative_email !== undefined ? representative_email : undefined,
      representative_name: representative_name !== undefined ? representative_name : undefined
    });

    return res.status(201).json({
      success: true,
      message: 'Equipo creado exitosamente',
      data: { team: created }
    });
  } catch (error) {
    console.error('Error en createTeam:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al crear el equipo',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Actualizar equipo de un torneo
 * PUT /api/config/tournament/:id/teams/:teamId
 */
const updateTeam = async (req, res) => {
  try {
    const { id, teamId } = req.params;
    const { name, division, group, url_imagen, representative_email, representative_name } = req.body;

    if (!id || !teamId) {
      return res.status(400).json({
        success: false,
        message: 'IDs requeridos'
      });
    }

    const payload = {};
    if (name !== undefined) {
      if (!String(name).trim()) {
        return res.status(400).json({
          success: false,
          message: 'El nombre del equipo no puede estar vacío'
        });
      }
      payload.name = String(name).trim();
    }
    if (division !== undefined) payload.division = String(division).trim();
    if (group !== undefined) payload.group = String(group).trim();
    if (url_imagen !== undefined) payload.url_imagen = url_imagen;
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'representative_email')) {
      const v = representative_email;
      payload.representative_email =
        v == null || String(v).trim() === '' ? null : String(v).trim();
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'representative_name')) {
      const v = representative_name;
      payload.representative_name =
        v == null || String(v).trim() === '' ? null : String(v).trim();
    }

    const updated = await Team.update(teamId, id, payload);

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: 'Equipo no encontrado'
      });
    }

    return res.json({
      success: true,
      message: 'Equipo actualizado exitosamente',
      data: { team: updated }
    });
  } catch (error) {
    console.error('Error en updateTeam:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al actualizar el equipo',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Guardar asignación de grupos (bulk) para equipos de un torneo
 * PUT /api/config/tournament/:id/team-groups
 */
const saveTeamGroups = async (req, res) => {
  try {
    const { id } = req.params;
    const items = req.body?.assignments ?? req.body?.items ?? req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'ID del torneo es requerido'
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere al menos una asignación de grupo'
      });
    }

    const normalized = items.map((item, index) => {
      const teamId = item?.teamId ?? item?.team_id ?? item?.id;
      const group = item?.group;
      if (teamId == null || String(teamId).trim() === '') {
        throw new Error(`Asignación ${index + 1}: teamId requerido`);
      }
      if (group == null || String(group).trim() === '') {
        throw new Error(`Asignación ${index + 1}: group requerido`);
      }
      return { teamId, group: String(group).trim() };
    });

    const teams = await Team.bulkUpdateGroups(id, normalized);

    return res.json({
      success: true,
      message: 'Grupos guardados exitosamente',
      data: { teams }
    });
  } catch (error) {
    console.error('Error en saveTeamGroups:', error);
    const isValidation = /requerido|inválido|no encontrado/i.test(String(error.message || ''));
    return res.status(isValidation ? 400 : 500).json({
      success: false,
      message: isValidation ? error.message : 'Error al guardar los grupos',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Eliminar equipo de un torneo
 * DELETE /api/config/tournament/:id/teams/:teamId
 */
const deleteTeam = async (req, res) => {
  try {
    const { id, teamId } = req.params;
    if (!id || !teamId) {
      return res.status(400).json({
        success: false,
        message: 'IDs requeridos'
      });
    }

    const team = await Team.findByIdAndTorneo(teamId, id);
    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Equipo no encontrado'
      });
    }

    const imageUrl = team.url_imagen || null;
    const removed = await Team.deleteByIdAndTorneo(teamId, id);
    if (!removed) {
      return res.status(404).json({
        success: false,
        message: 'Equipo no encontrado'
      });
    }

    if (imageUrl) {
      await deleteCloudinaryImageByUrl(imageUrl);
    }

    return res.json({
      success: true,
      message: 'Equipo eliminado exitosamente',
      data: { team_id: Number(teamId) }
    });
  } catch (error) {
    console.error('Error en deleteTeam:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al eliminar el equipo',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Obtener juegos de un torneo
 * GET /api/config/tournament/:id/games
 */
const getGames = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'ID del torneo es requerido'
      });
    }

    const games = await Game.findByTorneoId(id);
    return res.json({
      success: true,
      message: 'Juegos obtenidos exitosamente',
      data: { games }
    });
  } catch (error) {
    console.error('Error en getGames:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener los juegos',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

const isGroupStage = (stageValue, phaseNum) => {
  const n = phaseNum != null && phaseNum !== '' ? Number(phaseNum) : NaN;
  if (n === 1) return true;
  const text = String(stageValue || '').toLowerCase().trim();
  return text.includes('grupo') || text.includes('group') || text === 'groups';
};

/**
 * Obtener configuración de bracket basada en juegos
 * GET /api/config/tournament/:id/bracket?division=Open
 */
const getBracket = async (req, res) => {
  try {
    const { id } = req.params;
    const rawDivision = req.query?.division;
    const division = rawDivision != null && String(rawDivision).trim() !== ''
      ? String(rawDivision).trim()
      : null;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'ID del torneo es requerido'
      });
    }

    const [phases, games] = await Promise.all([
      Phase.findByTorneoId(id),
      Game.findByTorneoId(id)
    ]);

    const knockoutPhases = phases.filter((phase) => !isGroupStage(phase.stage, phase.phase_num));
    const knockoutPhaseIds = new Set(knockoutPhases.map((phase) => Number(phase.phas_id)));

    const rawCanvasBracket = req.query?.canvas_bracket;
    const canvasBracketFilter =
      rawCanvasBracket != null && String(rawCanvasBracket).trim() !== ''
        ? String(rawCanvasBracket).trim().toLowerCase()
        : null;

    let bracketGames = games
      .filter((game) => knockoutPhaseIds.has(Number(game.phas_id)))
      .filter((game) => (division ? String(game.division || '').trim() === division : true));

    // Main = todo lo que no sea explícitamente posicionamiento (legacy NULL / Main).
    // Ranked = solo filas marcadas ranked (query ?canvas_bracket=Main|Ranked).
    if (canvasBracketFilter === 'main') {
      bracketGames = bracketGames.filter(
        (game) => String(game.canvas_bracket || '').trim().toLowerCase() !== 'ranked'
      );
    } else if (canvasBracketFilter === 'ranked') {
      bracketGames = bracketGames.filter(
        (game) => String(game.canvas_bracket || '').trim().toLowerCase() === 'ranked'
      );
    }

    bracketGames = bracketGames
      .sort((a, b) => {
        const phaseOrderA = knockoutPhases.findIndex((phase) => Number(phase.phas_id) === Number(a.phas_id));
        const phaseOrderB = knockoutPhases.findIndex((phase) => Number(phase.phas_id) === Number(b.phas_id));
        if (phaseOrderA !== phaseOrderB) return phaseOrderA - phaseOrderB;
        const orderA = a.bracket_order ?? Number.MAX_SAFE_INTEGER;
        const orderB = b.bracket_order ?? Number.MAX_SAFE_INTEGER;
        if (orderA !== orderB) return orderA - orderB;
        return Number(a.game_id) - Number(b.game_id);
      });

    const links = await GameBracketLink.findByTorneoAndDivision(Number(id), division);

    return res.json({
      success: true,
      message: 'Bracket obtenido exitosamente',
      data: {
        phases: knockoutPhases,
        games: bracketGames,
        links
      }
    });
  } catch (error) {
    console.error('Error en getBracket:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener el bracket',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Guardar enlaces manuales del bracket
 * PUT /api/config/tournament/:id/bracket/links?division=Open
 */
const saveBracketLinks = async (req, res) => {
  try {
    const { id } = req.params;
    const rawDivision = req.query?.division;
    const division = rawDivision != null && String(rawDivision).trim() !== ''
      ? String(rawDivision).trim()
      : null;
    const links = Array.isArray(req.body?.links) ? req.body.links : [];

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'ID del torneo es requerido'
      });
    }

    for (const link of links) {
      if (!link || !Number.isInteger(Number(link.from_game_id)) || !Number.isInteger(Number(link.to_game_id))) {
        return res.status(400).json({
          success: false,
          message: 'Cada enlace debe incluir from_game_id y to_game_id válidos.'
        });
      }
      if (!['local', 'visitor'].includes(String(link.to_slot || ''))) {
        return res.status(400).json({
          success: false,
          message: 'to_slot debe ser "local" o "visitor".'
        });
      }
    }

    const tournamentGames = await Game.findByTorneoId(id);
    const validGameIds = new Set(tournamentGames.map((game) => Number(game.game_id)));
    const hasInvalidGame = links.some(
      (link) => !validGameIds.has(Number(link.from_game_id)) || !validGameIds.has(Number(link.to_game_id))
    );

    if (hasInvalidGame) {
      return res.status(400).json({
        success: false,
        message: 'Uno o más enlaces apuntan a juegos que no pertenecen al torneo.'
      });
    }

    const savedLinks = await GameBracketLink.replaceForTorneoAndDivision(Number(id), division, links);
    return res.json({
      success: true,
      message: 'Enlaces del bracket guardados exitosamente',
      data: { links: savedLinks }
    });
  } catch (error) {
    console.error('Error en saveBracketLinks:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al guardar los enlaces del bracket',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Obtener lienzos ranked persistidos
 * GET /api/config/tournament/:id/bracket/ranked-canvases?division=Open
 */
const getRankedCanvases = async (req, res) => {
  try {
    const { id } = req.params;
    const rawDivision = req.query?.division;
    const division = rawDivision != null && String(rawDivision).trim() !== ''
      ? String(rawDivision).trim()
      : null;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'ID del torneo es requerido'
      });
    }

    const canvases = await RankedCanvas.findByTorneoAndDivision(Number(id), division);
    return res.json({
      success: true,
      message: 'Lienzos ranked obtenidos exitosamente',
      data: { canvases }
    });
  } catch (error) {
    console.error('Error en getRankedCanvases:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener los lienzos ranked',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Guardar lienzos ranked persistidos
 * PUT /api/config/tournament/:id/bracket/ranked-canvases?division=Open
 */
const saveRankedCanvases = async (req, res) => {
  try {
    const { id } = req.params;
    const rawDivision = req.query?.division;
    const division = rawDivision != null && String(rawDivision).trim() !== ''
      ? String(rawDivision).trim()
      : null;
    const canvases = Array.isArray(req.body?.canvases) ? req.body.canvases : [];

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'ID del torneo es requerido'
      });
    }

    for (const canvas of canvases) {
      if (!canvas || String(canvas.id || '').trim() === '') {
        return res.status(400).json({
          success: false,
          message: 'Cada lienzo debe incluir un id válido.'
        });
      }
      if (!Array.isArray(canvas.rounds)) {
        return res.status(400).json({
          success: false,
          message: 'Cada lienzo debe incluir rounds como arreglo.'
        });
      }
      if (canvas.manualLinks != null && !Array.isArray(canvas.manualLinks)) {
        return res.status(400).json({
          success: false,
          message: 'manualLinks debe ser arreglo cuando se envía.'
        });
      }
    }

    const savedCanvases = await RankedCanvas.replaceForTorneoAndDivision(Number(id), division, canvases);
    return res.json({
      success: true,
      message: 'Lienzos ranked guardados exitosamente',
      data: { canvases: savedCanvases }
    });
  } catch (error) {
    console.error('Error en saveRankedCanvases:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al guardar los lienzos ranked',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Crear juego de bracket (registro en tabla game)
 * POST /api/config/tournament/:id/bracket/games
 */
const createBracketGame = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      phas_id,
      visitor,
      local,
      division,
      bracket_order,
      game_date,
      game_time,
      game_location,
      canvas_bracket: canvasBracketBody,
      placement: placementBody,
      placement_number: placementNumberBody,
      stats_slot_local: statsSlotLocalBody,
      stats_slot_visitor: statsSlotVisitorBody,
      visitor_score: visitorScoreBody,
      local_score: localScoreBody,
      estado: estadoBody
    } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'ID del torneo es requerido'
      });
    }

    if (phas_id == null) {
      return res.status(400).json({
        success: false,
        message: 'phas_id es obligatorio para crear el juego.'
      });
    }

    const hasVisitor = visitor !== undefined && visitor !== null && String(visitor).trim() !== '';
    const hasLocal = local !== undefined && local !== null && String(local).trim() !== '';
    if (hasVisitor !== hasLocal) {
      return res.status(400).json({
        success: false,
        message: 'visitor y local deben enviarse juntos o ambos vacíos.'
      });
    }

    const phaseError = await validatePhaseBelongsToTournament(id, phas_id);
    if (phaseError) {
      return res.status(400).json({
        success: false,
        message: phaseError
      });
    }

    if (hasVisitor && hasLocal) {
      const referenceError = await validateGameReferences(id, { phas_id, visitor, local });
      if (referenceError) {
        return res.status(400).json({
          success: false,
          message: referenceError
        });
      }
    }

    const fallbackDate = new Date().toISOString().slice(0, 10);
    const rawCb =
      canvasBracketBody != null && String(canvasBracketBody).trim() !== ''
        ? String(canvasBracketBody).trim()
        : 'Main';
    const resolvedCanvasBracket = ['Main', 'Ranked'].includes(rawCb) ? rawCb : 'Main';
    const resolvedPlacement =
      placementBody != null && String(placementBody).trim() !== ''
        ? String(placementBody)
        : null;
    const resolvedPlacementNumber = normalizeBracketPlacementNumber(placementNumberBody);
    const normStatsSlotIn = (v) => {
      if (v === undefined || v === null) return null;
      const s = String(v).trim();
      if (s === '') return null;
      return s.length > 64 ? s.slice(0, 64) : s;
    };
    const resolvedStatsLocal = normStatsSlotIn(statsSlotLocalBody);
    const resolvedStatsVisitor = normStatsSlotIn(statsSlotVisitorBody);
    const created = await Game.create({
      torneo_id: Number(id),
      game_date: game_date || fallbackDate,
      game_time: game_time || '00:00:00',
      game_location: game_location !== undefined ? String(game_location).trim() : 'Por definir',
      division: division !== undefined ? String(division).trim() : null,
      phas_id: Number(phas_id),
      visitor: hasVisitor ? Number(visitor) : null,
      local: hasLocal ? Number(local) : null,
      bracket_order: bracket_order != null && bracket_order !== '' ? Number(bracket_order) : null,
      canvas_bracket: resolvedCanvasBracket,
      placement: resolvedPlacement,
      placement_number: resolvedPlacementNumber,
      stats_slot_local: resolvedStatsLocal,
      stats_slot_visitor: resolvedStatsVisitor,
      visitor_score: visitorScoreBody,
      local_score: localScoreBody,
      estado: estadoBody
    });
    const gameWithSequence = await Game.findById(Number(created.game_id));

    triggerSpiritSurveyIfFinished(id, gameWithSequence?.game_id ?? created.game_id, estadoBody);

    return res.status(201).json({
      success: true,
      message: 'Juego de bracket creado exitosamente',
      data: { game: gameWithSequence || created }
    });
  } catch (error) {
    console.error('Error en createBracketGame:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al crear el juego de bracket',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Actualizar juego de bracket
 * PUT /api/config/tournament/:id/bracket/games/:gameId
 */
const updateBracketGame = async (req, res) => {
  try {
    const { id, gameId } = req.params;
    const {
      game_date,
      game_time,
      game_location,
      division,
      phas_id,
      visitor,
      local,
      bracket_order,
      canvas_bracket: canvasBracketBody,
      placement: placementBody,
      placement_number: placementNumberBody,
      stats_slot_local: statsSlotLocalBody,
      stats_slot_visitor: statsSlotVisitorBody,
      visitor_score: visitorScoreBody,
      local_score: localScoreBody,
      estado: estadoBody
    } = req.body;

    if (!id || !gameId) {
      return res.status(400).json({
        success: false,
        message: 'IDs requeridos'
      });
    }

    const existing = await Game.findById(Number(gameId));
    if (!existing || Number(existing.torneo_id) !== Number(id)) {
      return res.status(404).json({
        success: false,
        message: 'Juego no encontrado'
      });
    }

    const hasVisitorField = Object.prototype.hasOwnProperty.call(req.body || {}, 'visitor');
    const hasLocalField = Object.prototype.hasOwnProperty.call(req.body || {}, 'local');
    const hasCanvasBracketField = Object.prototype.hasOwnProperty.call(req.body || {}, 'canvas_bracket');
    const hasPlacementField = Object.prototype.hasOwnProperty.call(req.body || {}, 'placement');
    const hasPlacementNumberField = Object.prototype.hasOwnProperty.call(req.body || {}, 'placement_number');
    const hasStatsSlotLocalField = Object.prototype.hasOwnProperty.call(req.body || {}, 'stats_slot_local');
    const hasStatsSlotVisitorField = Object.prototype.hasOwnProperty.call(req.body || {}, 'stats_slot_visitor');
    const hasVisitorScoreField = Object.prototype.hasOwnProperty.call(req.body || {}, 'visitor_score');
    const hasLocalScoreField = Object.prototype.hasOwnProperty.call(req.body || {}, 'local_score');
    const hasEstadoField = Object.prototype.hasOwnProperty.call(req.body || {}, 'estado');
    if (hasVisitorField !== hasLocalField) {
      return res.status(400).json({
        success: false,
        message: 'visitor y local deben actualizarse juntos o ambos vacíos.'
      });
    }

    const normalizedVisitor = hasVisitorField && visitor !== null && String(visitor).trim() !== '' ? Number(visitor) : null;
    const normalizedLocal = hasLocalField && local !== null && String(local).trim() !== '' ? Number(local) : null;
    const resolvedPhaseId = phas_id != null ? Number(phas_id) : Number(existing.phas_id);

    const phaseError = await validatePhaseBelongsToTournament(id, resolvedPhaseId);
    if (phaseError) {
      return res.status(400).json({
        success: false,
        message: phaseError
      });
    }

    if (normalizedVisitor != null || normalizedLocal != null) {
      const referenceError = await validateGameReferences(id, {
        phas_id: resolvedPhaseId,
        visitor: normalizedVisitor,
        local: normalizedLocal
      });
      if (referenceError) {
        return res.status(400).json({
          success: false,
          message: referenceError
        });
      }
    }

    const rawCbUpdate =
      hasCanvasBracketField && canvasBracketBody != null && String(canvasBracketBody).trim() !== ''
        ? String(canvasBracketBody).trim()
        : null;
    const resolvedCanvasBracketUpdate =
      rawCbUpdate != null && ['Main', 'Ranked'].includes(rawCbUpdate) ? rawCbUpdate : null;

    const normalizedPlacement =
      hasPlacementField && placementBody != null && String(placementBody).trim() !== ''
        ? String(placementBody)
        : hasPlacementField
          ? null
          : undefined;

    const normalizedPlacementNumber = hasPlacementNumberField
      ? normalizeBracketPlacementNumber(placementNumberBody)
      : undefined;

    const normStatsSlotUpdate = (v) => {
      if (v === undefined || v === null) return null;
      const s = String(v).trim();
      if (s === '') return null;
      return s.length > 64 ? s.slice(0, 64) : s;
    };
    const normalizedStatsLocal =
      hasStatsSlotLocalField && statsSlotLocalBody != null && String(statsSlotLocalBody).trim() !== ''
        ? normStatsSlotUpdate(statsSlotLocalBody)
        : hasStatsSlotLocalField
          ? null
          : undefined;
    const normalizedStatsVisitor =
      hasStatsSlotVisitorField && statsSlotVisitorBody != null && String(statsSlotVisitorBody).trim() !== ''
        ? normStatsSlotUpdate(statsSlotVisitorBody)
        : hasStatsSlotVisitorField
          ? null
          : undefined;

    const updated = await Game.update(Number(gameId), {
      torneo_id: Number(id),
      game_date,
      game_time,
      game_location: game_location !== undefined ? String(game_location).trim() : undefined,
      division: division !== undefined ? String(division).trim() : undefined,
      phas_id: phas_id != null ? Number(phas_id) : undefined,
      ...(hasVisitorField ? { visitor: normalizedVisitor } : {}),
      ...(hasLocalField ? { local: normalizedLocal } : {}),
      bracket_order: bracket_order != null && bracket_order !== '' ? Number(bracket_order) : undefined,
      ...(hasCanvasBracketField && resolvedCanvasBracketUpdate != null
        ? { canvas_bracket: resolvedCanvasBracketUpdate }
        : {}),
      ...(hasPlacementField ? { placement: normalizedPlacement } : {}),
      ...(hasPlacementNumberField ? { placement_number: normalizedPlacementNumber } : {}),
      ...(hasStatsSlotLocalField ? { stats_slot_local: normalizedStatsLocal } : {}),
      ...(hasStatsSlotVisitorField ? { stats_slot_visitor: normalizedStatsVisitor } : {}),
      ...(hasVisitorScoreField ? { visitor_score: visitorScoreBody } : {}),
      ...(hasLocalScoreField ? { local_score: localScoreBody } : {}),
      ...(hasEstadoField ? { estado: estadoBody } : {})
    });

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: 'Juego no encontrado'
      });
    }
    const updatedWithSequence = await Game.findById(Number(gameId));

    if (hasEstadoField) {
      triggerSpiritSurveyIfFinished(id, gameId, estadoBody);
    }

    let payloadBracketGame = updatedWithSequence || updated;
    const estadoTrimUpd = hasEstadoField ? String(estadoBody ?? '').trim() : '';
    if (hasEstadoField && shouldRecordFinishedMarker(estadoTrimUpd)) {
      await finalizeGameScoresAndStandingsHooks(id, gameId);
      payloadBracketGame = (await Game.findById(Number(gameId))) || payloadBracketGame;
    } else if (
      (hasLocalScoreField || hasVisitorScoreField) &&
      isFinishedGameEstado(payloadBracketGame?.estado)
    ) {
      await propagateFinishedGameStats(id, gameId, existing, payloadBracketGame);
    }

    return res.json({
      success: true,
      message: 'Juego de bracket actualizado exitosamente',
      data: { game: payloadBracketGame }
    });
  } catch (error) {
    console.error('Error en updateBracketGame:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al actualizar el juego de bracket',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Eliminar juego de bracket
 * DELETE /api/config/tournament/:id/bracket/games/:gameId
 */
const deleteBracketGame = async (req, res) => {
  try {
    const { id, gameId } = req.params;
    if (!id || !gameId) {
      return res.status(400).json({
        success: false,
        message: 'IDs requeridos'
      });
    }

    const deleted = await Game.remove(Number(gameId), Number(id));
    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Juego no encontrado'
      });
    }

    return res.json({
      success: true,
      message: 'Juego de bracket eliminado exitosamente'
    });
  } catch (error) {
    console.error('Error en deleteBracketGame:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al eliminar el juego de bracket',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

const validateGameReferences = async (tournamentId, gamePayload) => {
  const phaseId = Number(gamePayload.phas_id);
  const visitorId = Number(gamePayload.visitor);
  const localId = Number(gamePayload.local);

  if (!Number.isInteger(phaseId) || !Number.isInteger(visitorId) || !Number.isInteger(localId)) {
    return 'Fase y equipos deben ser IDs numericos validos.';
  }

  if (visitorId === localId) {
    return 'El equipo local y visitante no pueden ser el mismo.';
  }

  const phases = await Phase.findByTorneoId(tournamentId);
  if (!phases.some((phase) => Number(phase.phas_id) === phaseId)) {
    return 'La fase seleccionada no pertenece al torneo.';
  }

  const teams = await Team.findByTorneoId(tournamentId);
  const teamIds = new Set(teams.map((team) => Number(team.team_id)));
  if (!teamIds.has(visitorId) || !teamIds.has(localId)) {
    return 'Los equipos seleccionados no pertenecen al torneo.';
  }

  return null;
};

const validatePhaseBelongsToTournament = async (tournamentId, phaseIdValue) => {
  const phaseId = Number(phaseIdValue);
  if (!Number.isInteger(phaseId)) {
    return 'La fase seleccionada no es válida.';
  }
  const phases = await Phase.findByTorneoId(tournamentId);
  if (!phases.some((phase) => Number(phase.phas_id) === phaseId)) {
    return 'La fase seleccionada no pertenece al torneo.';
  }
  return null;
};

const validateGroupStagePhase = async (tournamentId, phaseIdValue) => {
  const phaseId = Number(phaseIdValue);
  if (!Number.isInteger(phaseId)) {
    return 'La fase seleccionada no es válida.';
  }

  const phases = await Phase.findByTorneoId(tournamentId);
  const selectedPhase = phases.find((phase) => Number(phase.phas_id) === phaseId);

  if (!selectedPhase) {
    return 'La fase seleccionada no pertenece al torneo.';
  }

  if (!isGroupStage(selectedPhase.stage, selectedPhase.phase_num)) {
    return 'Solo se pueden registrar juegos de fase de grupos desde esta pantalla.';
  }

  return null;
};

/**
 * Crear juego en un torneo
 * POST /api/config/tournament/:id/games
 */
const createGame = async (req, res) => {
  try {
    const { id } = req.params;
    const { game_date, game_time, game_location, division, phas_id, visitor, local, estado } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'ID del torneo es requerido'
      });
    }

    if (!game_date || !game_time || !game_location || phas_id == null || visitor == null || local == null) {
      return res.status(400).json({
        success: false,
        message: 'game_date, game_time, game_location, phas_id, visitor y local son obligatorios'
      });
    }

    const groupStageError = await validateGroupStagePhase(id, phas_id);
    if (groupStageError) {
      return res.status(400).json({
        success: false,
        message: groupStageError
      });
    }

    const referenceError = await validateGameReferences(id, { phas_id, visitor, local });
    if (referenceError) {
      return res.status(400).json({
        success: false,
        message: referenceError
      });
    }

    const created = await Game.create({
      torneo_id: Number(id),
      game_date,
      game_time,
      game_location: String(game_location).trim(),
      division: division !== undefined ? String(division).trim() : null,
      phas_id: Number(phas_id),
      visitor: Number(visitor),
      local: Number(local),
      estado
    });
    const gameWithSequence = await Game.findById(Number(created.game_id));

    triggerSpiritSurveyIfFinished(id, gameWithSequence?.game_id ?? created.game_id, estado);

    return res.status(201).json({
      success: true,
      message: 'Juego creado exitosamente',
      data: { game: gameWithSequence || created }
    });
  } catch (error) {
    console.error('Error en createGame:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al crear el juego',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Actualizar juego de un torneo
 * PUT /api/config/tournament/:id/games/:gameId
 */
const updateGame = async (req, res) => {
  try {
    const { id, gameId } = req.params;
    const { game_date, game_time, game_location, division, phas_id, visitor, local, estado } = req.body;

    if (!id || !gameId) {
      return res.status(400).json({
        success: false,
        message: 'IDs requeridos'
      });
    }

    if (!game_date || !game_time || !game_location || phas_id == null || visitor == null || local == null) {
      return res.status(400).json({
        success: false,
        message: 'game_date, game_time, game_location, phas_id, visitor y local son obligatorios'
      });
    }

    const groupStageError = await validateGroupStagePhase(id, phas_id);
    if (groupStageError) {
      return res.status(400).json({
        success: false,
        message: groupStageError
      });
    }

    const referenceError = await validateGameReferences(id, { phas_id, visitor, local });
    if (referenceError) {
      return res.status(400).json({
        success: false,
        message: referenceError
      });
    }

    const updatePayload = {
      torneo_id: Number(id),
      game_date,
      game_time,
      game_location: String(game_location).trim(),
      division: division !== undefined ? String(division).trim() : null,
      phas_id: Number(phas_id),
      visitor: Number(visitor),
      local: Number(local)
    };
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'estado')) {
      updatePayload.estado = estado;
    }

    const updated = await Game.update(gameId, updatePayload);

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: 'Juego no encontrado'
      });
    }
    const updatedWithSequence = await Game.findById(Number(gameId));

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'estado')) {
      triggerSpiritSurveyIfFinished(id, gameId, estado);
    }

    const estadoTrimUpd = Object.prototype.hasOwnProperty.call(req.body || {}, 'estado')
      ? String(estado ?? '').trim()
      : '';
    let payloadGame = updatedWithSequence || updated;
    if (estadoTrimUpd !== '' && shouldRecordFinishedMarker(estadoTrimUpd)) {
      await finalizeGameScoresAndStandingsHooks(id, gameId);
      payloadGame = (await Game.findById(Number(gameId))) || payloadGame;
    }

    return res.json({
      success: true,
      message: 'Juego actualizado exitosamente',
      data: { game: payloadGame }
    });
  } catch (error) {
    console.error('Error en updateGame:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al actualizar el juego',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

const MIX_RATIO_ALLOWED = new Set(['3H4M', '4H3M']);

const isGameDivisionMixto = (game) => {
  const d = String(game?.division || '').toLowerCase();
  return d.includes('mixto');
};

/**
 * Heartbeat del reloj en vivo (solo partido Ongoing) o congelado explícito (`freeze: true`).
 * PATCH /api/config/tournament/:id/games/:gameId/live-clock
 * Body: { elapsed_seconds: number, freeze?: boolean }
 */
const patchLiveClock = async (req, res) => {
  try {
    const tournamentId = parseInt(req.params.id, 10);
    const gameId = parseInt(req.params.gameId, 10);
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Usuario no autenticado' });
    }
    if (!Number.isFinite(tournamentId) || tournamentId <= 0 || !Number.isFinite(gameId) || gameId <= 0) {
      return res.status(400).json({ success: false, message: 'Identificadores inválidos' });
    }

    const elapsed = normalizeFinishElapsedSeconds(req.body?.elapsed_seconds);
    if (elapsed === null) {
      return res.status(400).json({ success: false, message: 'elapsed_seconds es obligatorio' });
    }

    const game = await Game.findById(gameId);
    if (!game || Number(game.torneo_id) !== tournamentId) {
      return res.status(404).json({ success: false, message: 'Partido no encontrado en este torneo' });
    }

    const freeze = req.body?.freeze === true;
    if (freeze) {
      const updated = await Game.setLiveClockElapsedSec(gameId, tournamentId, elapsed);
      if (!updated) {
        return res.status(404).json({ success: false, message: 'No se pudo congelar el reloj del partido' });
      }
      return res.json({
        success: true,
        message: 'Reloj congelado',
        data: { elapsed_seconds: elapsed, game: updated }
      });
    }

    const result = await Game.syncLiveClockElapsedDuringPlay(gameId, tournamentId, elapsed);
    if (!result.ok) {
      return res.status(400).json({
        success: false,
        message: 'No se pudo sincronizar el reloj en vivo',
        data: result
      });
    }

    return res.json({
      success: true,
      message: 'Reloj sincronizado',
      data: result
    });
  } catch (error) {
    console.error('Error en patchLiveClock:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al sincronizar el reloj',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Forfeit en vivo: equipo que abandona, rival gana 15–0 sin GOAL/AST; finaliza el partido.
 * POST /api/config/tournament/:id/games/:gameId/forfeit
 * Body: { forfeit_team_id, event_time?, finish_elapsed_seconds? }
 */
const postGameForfeit = async (req, res) => {
  try {
    const tournamentId = parseInt(req.params.id, 10);
    const gameId = parseInt(req.params.gameId, 10);
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Usuario no autenticado' });
    }
    if (!Number.isFinite(tournamentId) || tournamentId <= 0 || !Number.isFinite(gameId) || gameId <= 0) {
      return res.status(400).json({ success: false, message: 'Identificadores de torneo o partido inválidos' });
    }

    const { forfeit_team_id: forfeitTeamIdBody, event_time: eventTimeBody } = req.body || {};
    const forfeitTeamId = Number(forfeitTeamIdBody);
    if (!Number.isFinite(forfeitTeamId) || forfeitTeamId <= 0) {
      return res.status(400).json({ success: false, message: 'forfeit_team_id es obligatorio' });
    }

    let eventTimeWall = normalizeFinishEventWallClock(eventTimeBody);
    if (!eventTimeWall) {
      const finishElapsed = normalizeFinishElapsedSeconds(req.body?.finish_elapsed_seconds);
      if (finishElapsed != null && Number.isFinite(finishElapsed)) {
        eventTimeWall = formatGameClockSecondsToHms(finishElapsed);
      }
    }
    if (!eventTimeWall) {
      eventTimeWall = '00:00:00';
    }

    let forfeitResult;
    try {
      forfeitResult = await Game.applyForfeit({
        gameId,
        torneoId: tournamentId,
        forfeitTeamId,
        userId,
        eventTimeWall
      });
    } catch (e) {
      const msg = e?.message || 'No se pudo registrar el forfeit';
      const status = msg.includes('no encontrado') ? 404 : 400;
      return res.status(status).json({ success: false, message: msg });
    }

    const finishElapsed = normalizeFinishElapsedSeconds(req.body?.finish_elapsed_seconds);
    if (finishElapsed != null && Number.isFinite(finishElapsed)) {
      try {
        await Game.setLiveClockElapsedAtFinish(gameId, tournamentId, finishElapsed);
      } catch (eLc) {
        console.warn('[game-clock] live_clock tras forfeit:', eLc.message);
      }
    }

    const updated = await Game.updateEstado(gameId, tournamentId, 'Finished');
    if (!updated) {
      return res.status(500).json({ success: false, message: 'Forfeit registrado pero no se pudo finalizar el partido' });
    }

    triggerSpiritSurveyIfFinished(tournamentId, gameId, 'Finished');

    const finalizeMeta = await finalizeGameScoresAndStandingsHooks(tournamentId, gameId);

    try {
      const already = await GameEvent.hasGameFinishedMarker(gameId);
      if (!already) {
        await Game.recordFinishedTimelineMarker(gameId, tournamentId, eventTimeWall, userId, {
          elapsedSeconds: finishElapsed
        });
      }
    } catch (eFin) {
      console.error('[game-event] JUEGO FINALIZADO tras forfeit:', eFin.message);
    }

    const gameOut = await Game.findById(gameId);

    return res.json({
      success: true,
      message: 'Forfeit registrado; partido finalizado 15–0',
      data: {
        game: gameOut,
        forfeit: forfeitResult,
        ...(finalizeMeta ? { ps_game_upd_ok: finalizeMeta.ps_game_upd_ok, ps_game_upd: finalizeMeta.ps_game_upd } : {})
      }
    });
  } catch (error) {
    console.error('Error en postGameForfeit:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al registrar el forfeit',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Actualizar solo el estado del partido (p. ej. Ongoing)
 * PATCH /api/config/tournament/:id/games/:gameId/estado
 * Body opcional:
 *  - mix_ratio_first ('3H4M' | '4H3M') obligatorio si division mixta y estado Ongoing
 *  - finish_event_time (`HH:MM:SS`) opcional cuando estado es Finished: marca evento «Juego finalizado» en la línea de tiempo
 *  - finish_elapsed_seconds (entero opcional): segundos de reloj de fase mostrados al pulsar FIN; persiste game.live_clock_elapsed_sec y congela el cronómetro en todas las vistas
 */
const patchGameEstado = async (req, res) => {
  try {
    const tournamentId = parseInt(req.params.id, 10);
    const gameId = parseInt(req.params.gameId, 10);
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
    }

    if (!Number.isFinite(tournamentId) || tournamentId <= 0 || !Number.isFinite(gameId) || gameId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Identificadores de torneo o partido inválidos'
      });
    }

    const { estado, mix_ratio_first: mixRaw } = req.body;
    if (estado === undefined || estado === null || String(estado).trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'estado es obligatorio'
      });
    }

    const game = await Game.findById(gameId);
    if (!game || Number(game.torneo_id) !== tournamentId) {
      return res.status(404).json({
        success: false,
        message: 'Partido no encontrado en este torneo'
      });
    }

    const estadoTrim = String(estado).trim();
    const mixto = isGameDivisionMixto(game);
    const hasMixField = Object.prototype.hasOwnProperty.call(req.body || {}, 'mix_ratio_first');
    const mixNorm =
      mixRaw == null || String(mixRaw).trim() === ''
        ? null
        : String(mixRaw).trim().toUpperCase();

    if (mixto && hasMixField && mixNorm != null && !MIX_RATIO_ALLOWED.has(mixNorm)) {
      return res.status(400).json({
        success: false,
        message: 'mix_ratio_first debe ser 3H4M o 4H3M'
      });
    }

    const ongoingNorm = 'ongoing';
    const isOngoing = estadoTrim.toLowerCase() === ongoingNorm;
    if (mixto && isOngoing) {
      if (!hasMixField || mixNorm == null || !MIX_RATIO_ALLOWED.has(mixNorm)) {
        return res.status(400).json({
          success: false,
          message: 'En categoría mixta, mix_ratio_first (3H4M o 4H3M) es obligatorio al pasar a Ongoing'
        });
      }
    }

    let updated;
    if (mixto && isOngoing && hasMixField && mixNorm != null && MIX_RATIO_ALLOWED.has(mixNorm)) {
      updated = await Game.updateEstadoAndMixRatioFirst(
        gameId,
        tournamentId,
        estadoTrim,
        mixNorm
      );
    } else {
      updated = await Game.updateEstado(gameId, tournamentId, estadoTrim);
    }

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: 'No se pudo actualizar el partido'
      });
    }

    const finishElapsed = normalizeFinishElapsedSeconds(req.body?.finish_elapsed_seconds);
    let secToFreeze = finishElapsed;
    if (shouldRecordFinishedMarker(estadoTrim)) {
      try {
        if (secToFreeze === null) {
          const fromWall = normalizeFinishEventWallClock(req.body?.finish_event_time);
          if (fromWall) {
            secToFreeze = Game.parseGameClockHmsToSeconds(fromWall);
          }
        }
        if (secToFreeze !== null && Number.isFinite(secToFreeze)) {
          await Game.setLiveClockElapsedAtFinish(gameId, tournamentId, secToFreeze);
        }
      } catch (eLc) {
        console.warn('[game-clock] live_clock_elapsed_sec:', eLc.message);
      }
    }

    triggerSpiritSurveyIfFinished(tournamentId, gameId, estadoTrim);

    let finalizeMeta = null;
    if (shouldRecordFinishedMarker(estadoTrim)) {
      finalizeMeta = await finalizeGameScoresAndStandingsHooks(tournamentId, gameId);

      try {
        const already = await GameEvent.hasGameFinishedMarker(gameId);
        if (!already) {
          let eventTimeWall = normalizeFinishEventWallClock(req.body?.finish_event_time);
          if (!eventTimeWall) {
            const lastEt = await pool.query(
              `SELECT event_time FROM game_events WHERE game_id = $1 ORDER BY event_id DESC LIMIT 1`,
              [gameId]
            );
            const fb = lastEt.rows[0]?.event_time != null ? String(lastEt.rows[0].event_time).trim() : '';
            eventTimeWall = fb || '00:00:00';
          }
          await Game.recordFinishedTimelineMarker(gameId, tournamentId, eventTimeWall, userId, {
            elapsedSeconds: secToFreeze
          });
        }
      } catch (e) {
        console.error('[game-event] no se insertó JUEGO FINALIZADO tras PATCH estado:', e.message);
      }
    }

    const gameOut = await Game.findById(gameId);

    return res.json({
      success: true,
      message: 'Estado actualizado',
      data: {
        game: gameOut || updated,
        ...(finalizeMeta ? { ps_game_upd_ok: finalizeMeta.ps_game_upd_ok, ps_game_upd: finalizeMeta.ps_game_upd } : {})
      }
    });
  } catch (error) {
    console.error('Error en patchGameEstado:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al actualizar el estado del partido',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Eliminar juego de un torneo
 * DELETE /api/config/tournament/:id/games/:gameId
 */
const deleteGame = async (req, res) => {
  try {
    const { id, gameId } = req.params;
    if (!id || !gameId) {
      return res.status(400).json({
        success: false,
        message: 'IDs requeridos'
      });
    }

    const deleted = await Game.remove(gameId, Number(id));
    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Juego no encontrado'
      });
    }

    return res.json({
      success: true,
      message: 'Juego eliminado exitosamente'
    });
  } catch (error) {
    console.error('Error en deleteGame:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al eliminar el juego',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Obtener jugadores de un torneo
 * GET /api/config/tournament/:id/players
 */
const getPlayers = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'ID del torneo es requerido'
      });
    }

    const players = await Player.findByTorneoId(id);
    return res.json({
      success: true,
      message: 'Jugadores obtenidos exitosamente',
      data: { players }
    });
  } catch (error) {
    console.error('Error en getPlayers:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener jugadores',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Crear jugador en un torneo
 * POST /api/config/tournament/:id/players
 */
const createPlayer = async (req, res) => {
  try {
    const { id } = req.params;
    const { team_id, player_number, player_name, nickname, category, torneo_id: bodyTorneoId } = req.body;
    const torneoId = Number(id);
    if (bodyTorneoId != null && bodyTorneoId !== '' && Number(bodyTorneoId) !== torneoId) {
      return res.status(400).json({
        success: false,
        message: 'torneo_id del cuerpo no coincide con el torneo de la URL'
      });
    }
    const teamId = Number(team_id);
    const playerNumber = Number(player_number);
    const normalizedCategory = String(category || '').trim();

    if (!torneoId || torneoId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'torneo_id es obligatorio y debe ser un número válido'
      });
    }

    if (!teamId || teamId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'team_id es obligatorio y debe ser un número válido'
      });
    }

    if (!playerNumber || playerNumber <= 0 || !player_name || !String(player_name).trim()) {
      return res.status(400).json({
        success: false,
        message: 'player_number y player_name son obligatorios'
      });
    }
    if (!normalizedCategory) {
      return res.status(400).json({
        success: false,
        message: 'category es obligatoria'
      });
    }

    const teamBelongsToTournament = await Player.existsTeamInTournament(teamId, torneoId);
    if (!teamBelongsToTournament) {
      return res.status(400).json({
        success: false,
        message: 'El team_id no pertenece al torneo indicado'
      });
    }
    const teamMatchesCategory = await Player.existsTeamInTournamentWithCategory(teamId, torneoId, normalizedCategory);
    if (!teamMatchesCategory) {
      return res.status(400).json({
        success: false,
        message: 'La categoría no coincide con el equipo seleccionado'
      });
    }

    const duplicatedPlayerNumber = await Player.existsPlayerNumberInTeam(teamId, playerNumber);
    if (duplicatedPlayerNumber) {
      return res.status(400).json({
        success: false,
        message: `Ya existe un jugador con número ${playerNumber} en el team_id ${teamId}`
      });
    }

    const created = await Player.create({
      torneo_id: torneoId,
      team_id: teamId,
      player_number: playerNumber,
      player_name: String(player_name).trim(),
      nickname: nickname ? String(nickname).trim() : null
    });

    return res.status(201).json({
      success: true,
      message: 'Jugador creado exitosamente',
      data: { player: created }
    });
  } catch (error) {
    console.error('Error en createPlayer:', error);
    if (error.code === '23505') {
      return res.status(400).json({
        success: false,
        message: 'No se puede repetir player_number dentro del mismo team_id'
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Error al crear jugador',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Crear jugadores por lote en un torneo
 * POST /api/config/tournament/:id/players/bulk
 */
const createPlayersBulk = async (req, res) => {
  try {
    const { id } = req.params;
    const { players } = req.body;
    const torneoId = Number(id);

    if (!torneoId || torneoId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'torneo_id es obligatorio y debe ser un número válido'
      });
    }

    if (!Array.isArray(players) || players.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere un arreglo de jugadores para importar'
      });
    }

    const normalizedPlayers = players.map((player, index) => ({
      index: index + 1,
      torneo_id: torneoId,
      team_id: Number(player.team_id),
      player_number: Number(player.player_number),
      player_name: String(player.player_name || '').trim(),
      nickname: String(player.nickname || '').trim(),
      category: String(player.category || '').trim()
    }));

    const invalid = normalizedPlayers.find((player) => (
      !player.torneo_id
      || player.torneo_id <= 0
      || !player.team_id
      || !player.player_number
      || player.player_number <= 0
      || !player.player_name
      || !player.category
    ));

    if (invalid) {
      return res.status(400).json({
        success: false,
        message: `Fila ${invalid.index} inválida. Verifica team_id, player_number, player_name y category.`
      });
    }

    const duplicatedInPayload = new Set();
    for (const player of normalizedPlayers) {
      const key = `${player.team_id}-${player.player_number}`;
      if (duplicatedInPayload.has(key)) {
        return res.status(400).json({
          success: false,
          message: `Hay números de jugador repetidos en la carga para el team_id ${player.team_id}`
        });
      }
      duplicatedInPayload.add(key);
    }

    for (const player of normalizedPlayers) {
      const teamBelongsToTournament = await Player.existsTeamInTournament(player.team_id, torneoId);
      if (!teamBelongsToTournament) {
        return res.status(400).json({
          success: false,
          message: `El team_id ${player.team_id} no pertenece al torneo indicado`
        });
      }
      const teamMatchesCategory = await Player.existsTeamInTournamentWithCategory(
        player.team_id,
        torneoId,
        player.category
      );
      if (!teamMatchesCategory) {
        return res.status(400).json({
          success: false,
          message: `La categoría de la fila ${player.index} no coincide con el equipo seleccionado`
        });
      }

      const duplicatedPlayerNumber = await Player.existsPlayerNumberInTeam(
        player.team_id,
        player.player_number
      );
      if (duplicatedPlayerNumber) {
        return res.status(400).json({
          success: false,
          message: `La fila ${player.index} está duplicada: ya existe player_number ${player.player_number} en el team_id ${player.team_id}`
        });
      }
    }

    const createdPlayers = await Player.createMany(normalizedPlayers);

    return res.status(201).json({
      success: true,
      message: 'Jugadores importados exitosamente',
      data: {
        players: createdPlayers,
        total: createdPlayers.length
      }
    });
  } catch (error) {
    console.error('Error en createPlayersBulk:', error);
    if (error.code === '23505') {
      return res.status(400).json({
        success: false,
        message: 'No se puede repetir player_number dentro del mismo team_id'
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Error al importar jugadores',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Listar eventos del partido (timeline)
 * GET /api/config/tournament/:id/games/:gameId/events
 */
const getGameEvents = async (req, res) => {
  try {
    const tournamentId = parseInt(req.params.id, 10);
    const gameId = parseInt(req.params.gameId, 10);

    if (!Number.isFinite(tournamentId) || tournamentId <= 0 || !Number.isFinite(gameId) || gameId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Identificadores de torneo o partido inválidos'
      });
    }

    const game = await Game.findById(gameId);
    if (!game || Number(game.torneo_id) !== tournamentId) {
      return res.status(404).json({
        success: false,
        message: 'Partido no encontrado en este torneo'
      });
    }

    const events = await GameEvent.findByGameId(gameId);

    return res.json({
      success: true,
      data: {
        events,
        game: {
          local: game.local,
          visitor: game.visitor,
          local_name: game.local_name,
          visitor_name: game.visitor_name
        }
      }
    });
  } catch (error) {
    console.error('Error en getGameEvents:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener eventos del partido',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * TIMEOUTs consumidos por equipo en el partido (máx. 2 por equipo).
 * GET /api/config/tournament/:id/games/:gameId/timeout-counts
 */
const getGameTimeoutCounts = async (req, res) => {
  try {
    const tournamentId = parseInt(req.params.id, 10);
    const gameId = parseInt(req.params.gameId, 10);

    if (!Number.isFinite(tournamentId) || tournamentId <= 0 || !Number.isFinite(gameId) || gameId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Identificadores de torneo o partido inválidos'
      });
    }

    const game = await Game.findById(gameId);
    if (!game || Number(game.torneo_id) !== tournamentId) {
      return res.status(404).json({
        success: false,
        message: 'Partido no encontrado en este torneo'
      });
    }

    const by_team = await GameEvent.countTimeoutsByTeam(tournamentId, gameId);

    return res.json({
      success: true,
      data: { by_team, max_per_team: 2 }
    });
  } catch (error) {
    console.error('Error en getGameTimeoutCounts:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener timeouts del partido',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Posiciones finales del torneo (tabla placements).
 * GET /api/config/tournament/:id/placements
 */
const getTournamentPlacements = async (req, res) => {
  try {
    const tournamentId = parseInt(req.params.id, 10);
    if (!Number.isFinite(tournamentId) || tournamentId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Identificador de torneo inválido'
      });
    }

    const tournament = await TournamentConfig.findById(tournamentId);
    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: 'Torneo no encontrado'
      });
    }

    const rows = await Placement.findByTorneoId(tournamentId);

    return res.json({
      success: true,
      data: { placements: rows }
    });
  } catch (error) {
    console.error('Error en getTournamentPlacements:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener posiciones finales',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Marcador en vivo: suma de goles por equipo (eventos GOAL) para el partido.
 * GET /api/config/tournament/:id/games/:gameId/goal-totals
 */
const getGameGoalTotals = async (req, res) => {
  try {
    const tournamentId = parseInt(req.params.id, 10);
    const gameId = parseInt(req.params.gameId, 10);

    if (!Number.isFinite(tournamentId) || tournamentId <= 0 || !Number.isFinite(gameId) || gameId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Identificadores de torneo o partido inválidos'
      });
    }

    const game = await Game.findById(gameId);
    if (!game || Number(game.torneo_id) !== tournamentId) {
      return res.status(404).json({
        success: false,
        message: 'Partido no encontrado en este torneo'
      });
    }

    const totals = await Game.computeGoalTotalsFromEvents(gameId);
    const merged = Game.resolveGoalTotalsForDisplay(game, totals);

    return res.json({
      success: true,
      data: {
        local_goals: merged.local_goals,
        visitor_goals: merged.visitor_goals
      }
    });
  } catch (error) {
    console.error('Error en getGameGoalTotals:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener el marcador del partido',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Marcadores en lote (brackets / calendario público).
 * GET /api/config/tournament/:id/goal-totals?gameIds=1,2,3
 */
const getTournamentGoalTotalsBatch = async (req, res) => {
  try {
    const tournamentId = parseInt(req.params.id, 10);
    const raw = String(req.query.gameIds || '').trim();

    if (!Number.isFinite(tournamentId) || tournamentId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'ID de torneo inválido'
      });
    }

    if (!raw) {
      return res.status(400).json({
        success: false,
        message: 'Parámetro gameIds requerido'
      });
    }

    const gameIds = [
      ...new Set(
        raw
          .split(/[,;\s]+/)
          .map((part) => parseInt(String(part).trim(), 10))
          .filter((id) => Number.isFinite(id) && id > 0)
      )
    ];

    if (gameIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Ningún gameId válido en gameIds'
      });
    }

    if (gameIds.length > 100) {
      return res.status(400).json({
        success: false,
        message: 'Máximo 100 partidos por solicitud'
      });
    }

    const totals = await Game.computeGoalTotalsBatchForTournament(tournamentId, gameIds);

    return res.json({
      success: true,
      data: { totals }
    });
  } catch (error) {
    console.error('Error en getTournamentGoalTotalsBatch:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener marcadores del torneo',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const httpGameEventError = (statusCode, message) => {
  const e = new Error(message);
  e.statusCode = statusCode;
  return e;
};

/**
 * Valida START/TIMEOUT: el equipo debe existir en el torneo del partido
 * (`game.local`/`visitor` pueden estar desfasados vs calendario o slots playoff).
 *
 * @param {*} teamIdRaw
 * @param {number} tournamentIdRaw
 * @returns {Promise<number>} team id numérico positivo
 */
const assertTeamBelongsToTournament = async (teamIdRaw, tournamentIdRaw) => {
  const tid = Number(tournamentIdRaw);
  const teamIdNum =
    typeof teamIdRaw === 'number' ? teamIdRaw : parseInt(String(teamIdRaw), 10);
  if (!Number.isFinite(teamIdNum) || teamIdNum <= 0 || !Number.isFinite(tid) || tid <= 0) {
    throw httpGameEventError(400, 'team_id es obligatorio y debe ser válido');
  }
  const r = await pool.query(
    'SELECT 1 FROM team WHERE team_id = $1 AND torneo_id = $2 LIMIT 1',
    [teamIdNum, tid]
  );
  if (r.rows.length === 0) {
    throw httpGameEventError(
      400,
      'El equipo no está registrado en este torneo (revisa equipos local/visitante del partido)'
    );
  }
  return teamIdNum;
};

/**
 * Campos derivados para eventos de fútbol post-partido (gol, tarjetas, etc.).
 */
function resolveFootballPostMatchEventFields(game, normalizedType, playerTeamId) {
  let goalsVal = 0;
  let yellowcard = 0;
  let redcard = 0;
  let teamIdForEvent = null;

  if (normalizedType === 'YELLOW_CARD') {
    yellowcard = 1;
  } else if (normalizedType === 'RED_CARD') {
    redcard = 1;
  } else if (normalizedType === 'GOAL' || normalizedType === 'PENALTY') {
    goalsVal = 1;
    teamIdForEvent = playerTeamId;
  } else if (normalizedType === 'OWN_GOAL') {
    goalsVal = 1;
    const localId = game.local != null ? Number(game.local) : null;
    const visitorId = game.visitor != null ? Number(game.visitor) : null;
    if (localId != null && playerTeamId === localId && visitorId != null) {
      teamIdForEvent = visitorId;
    } else if (visitorId != null && playerTeamId === visitorId && localId != null) {
      teamIdForEvent = localId;
    } else {
      teamIdForEvent = playerTeamId;
    }
  }

  return { goalsVal, yellowcard, redcard, teamIdForEvent };
}

async function syncFootballScoresAfterEventChange(tournamentId, gameId) {
  const gameBefore = await Game.findById(gameId);
  await Game.refreshScoresFromGoalEvents(gameId);
  const gameAfter = await Game.findById(gameId);
  await propagateFinishedGameStats(tournamentId, gameId, gameBefore, gameAfter);
}

/**
 * Crear un evento (POST o fila importada). Lanza Error con statusCode.
 */
const createGameEventCore = async (tournamentId, gameId, userId, body, options = {}) => {
  const deferScoreSync = options.deferScoreSync === true;
  const userRole = options.userRole ?? null;
  const { event_time, player_id, goals, assists, event_type, team_id } = body;

  if (event_time == null || String(event_time).trim() === '') {
    throw httpGameEventError(400, 'event_time es obligatorio');
  }

  let normalizedType = normalizeFootballEventTypeInput(event_type);
  if (!normalizedType) normalizedType = String(event_type || '').trim().toUpperCase();
  const typeCompact = normalizedType.replace(/[\s-]+/g, '');
  if (typeCompact === 'TIMEOUT') normalizedType = 'TIMEOUT';

  const allowedEventTypes = new Set([
    'GOAL',
    'AST',
    'START',
    'HALF',
    'BREAK',
    'JUEGO EN PAUSA',
    'JUEGO REANUDADO',
    'TIMEOUT',
    'JUEGO FINALIZADO',
    'OWN_GOAL',
    'YELLOW_CARD',
    'RED_CARD',
    'PENALTY'
  ]);
  if (!allowedEventTypes.has(normalizedType)) {
    throw httpGameEventError(
      400,
      'event_type no reconocido. Valores permitidos: START, GOAL, AST, OWN_GOAL, YELLOW_CARD, RED_CARD, PENALTY, HALF, BREAK, Juego en pausa, Juego reanudado, TIMEOUT y Juego finalizado.'
    );
  }

  const game = await Game.findById(gameId);
  if (!game || Number(game.torneo_id) !== tournamentId) {
    throw httpGameEventError(404, 'Partido no encontrado en este torneo');
  }

  const tournamentSportId = await resolveTournamentSportId(tournamentId);
  await assertGameAcceptsEventType(gameId, game, normalizedType, { userRole, tournamentSportId });

  if (normalizedType === 'TIMEOUT') {
    const teamIdNum = await assertTeamBelongsToTournament(team_id, tournamentId);
    const timeoutCount = await GameEvent.countTimeoutsForTeam(tournamentId, gameId, teamIdNum);
    if (timeoutCount >= 2) {
      throw httpGameEventError(409, 'TIMEOUT agotados');
    }
    return Game.recordTimeoutTimelineMarker({
      gameId,
      torneoId: tournamentId,
      eventTimeWall: String(event_time).trim(),
      teamId: teamIdNum,
      userId: userId
    });
  }

  if (normalizedType === 'JUEGO FINALIZADO') {
    if (await GameEvent.hasGameFinishedMarker(gameId)) {
      throw httpGameEventError(409, 'Este partido ya tiene un evento Juego Finalizado registrado');
    }
    const created = await Game.recordFinishedTimelineMarker(
      gameId,
      tournamentId,
      String(event_time).trim(),
      userId,
      { elapsedSeconds: body?.elapsed_seconds }
    );
    return created;
  }

  if (normalizedType === 'START') {
    const teamIdNum = await assertTeamBelongsToTournament(team_id, tournamentId);

    const dup = await GameEvent.hasStartEvent(gameId);
    if (dup) {
      throw httpGameEventError(409, 'Este partido ya tiene un evento de inicio registrado');
    }

    const created = await GameEvent.create({
      game_id: gameId,
      tourn_id: tournamentId,
      event_time: String(event_time).trim(),
      player_id: null,
      goals: 0,
      assists: 0,
      event_type: 'START',
      user_id: userId,
      team_id: teamIdNum
    });

    try {
      const startSec = Game.parseGameClockHmsToSeconds(String(event_time).trim());
      await Game.setLiveClockElapsedSec(
        gameId,
        tournamentId,
        startSec != null && Number.isFinite(startSec) ? startSec : 0
      );
    } catch (eLc) {
      console.warn('[game-clock] live_clock tras START:', eLc.message);
    }

    return created;
  }

  if (
    normalizedType === 'HALF' ||
    normalizedType === 'BREAK' ||
    normalizedType === 'JUEGO EN PAUSA' ||
    normalizedType === 'JUEGO REANUDADO'
  ) {
    let eventTimeWall = String(event_time).trim();
    let pauseSec = null;
    if (normalizedType === 'JUEGO EN PAUSA') {
      const elapsedBody = body?.elapsed_seconds;
      if (elapsedBody != null && elapsedBody !== '' && Number.isFinite(Number(elapsedBody))) {
        pauseSec = Math.floor(Number(elapsedBody));
      } else {
        pauseSec = Game.parseGameClockHmsToSeconds(eventTimeWall);
      }
      if (pauseSec != null && Number.isFinite(pauseSec) && pauseSec >= 0) {
        eventTimeWall = formatGameClockSecondsToHms(pauseSec);
      }
    }

    const created = await GameEvent.create({
      game_id: gameId,
      tourn_id: tournamentId,
      event_time: eventTimeWall,
      player_id: null,
      goals: 0,
      assists: 0,
      event_type: normalizedType,
      user_id: userId,
      team_id: null
    });

    if (normalizedType === 'JUEGO EN PAUSA' && pauseSec != null && Number.isFinite(pauseSec) && pauseSec >= 0) {
      try {
        await Game.setLiveClockElapsedSec(gameId, tournamentId, pauseSec);
      } catch (eLc) {
        console.warn('[game-clock] live_clock tras pausa:', eLc.message);
      }
    }

    return created;
  }

  if (player_id == null || player_id === '') {
    throw httpGameEventError(400, 'player_id es obligatorio');
  }

  const playerIdNum = parseInt(player_id, 10);
  if (!Number.isFinite(playerIdNum) || playerIdNum <= 0) {
    throw httpGameEventError(400, 'player_id inválido');
  }

  const checkPlayer = await pool.query(
    `SELECT p.player_id, p.team_id
     FROM player p
     INNER JOIN team t ON t.team_id = p.team_id
     WHERE p.player_id = $1 AND t.torneo_id = $2`,
    [playerIdNum, tournamentId]
  );

  if (checkPlayer.rows.length === 0) {
    throw httpGameEventError(400, 'El jugador no pertenece a este torneo');
  }

  const playerTeamIdRaw = checkPlayer.rows[0].team_id;
  const playerTeamId =
    playerTeamIdRaw != null && Number.isFinite(Number(playerTeamIdRaw))
      ? Number(playerTeamIdRaw)
      : NaN;
  if (!Number.isFinite(playerTeamId) || playerTeamId <= 0) {
    throw httpGameEventError(400, 'El jugador no tiene equipo asignado válido en el torneo');
  }

  if (FOOTBALL_POST_MATCH_EVENT_TYPES.has(normalizedType) && tournamentSportId === 2) {
    const eventTimeStored =
      tournamentSportId === 2
        ? normalizeFootballMinuteToEventTime(event_time)
        : String(event_time).trim();

    const { goalsVal, yellowcard, redcard, teamIdForEvent } = resolveFootballPostMatchEventFields(
      game,
      normalizedType,
      playerTeamId
    );

    const createdFootball = await GameEvent.create({
      game_id: gameId,
      tourn_id: tournamentId,
      event_time: eventTimeStored,
      player_id: playerIdNum,
      goals: goalsVal,
      assists: 0,
      event_type: normalizedType,
      user_id: userId,
      team_id: teamIdForEvent,
      yellowcard,
      redcard
    });

    if (FOOTBALL_SCORING_EVENT_TYPES.has(normalizedType) && !deferScoreSync) {
      await syncFootballScoresAfterEventChange(tournamentId, gameId);
    }

    return createdFootball;
  }

  let goalsVal = goals !== undefined && goals !== null ? parseInt(goals, 10) : NaN;
  let assistsVal = assists !== undefined && assists !== null ? parseInt(assists, 10) : NaN;
  if (!Number.isFinite(goalsVal)) goalsVal = normalizedType === 'GOAL' ? 1 : 0;
  if (!Number.isFinite(assistsVal)) assistsVal = normalizedType === 'AST' ? 1 : 0;

  const created = await GameEvent.create({
    game_id: gameId,
    tourn_id: tournamentId,
    event_time: String(event_time).trim(),
    player_id: playerIdNum,
    goals: goalsVal,
    assists: assistsVal,
    event_type: normalizedType,
    user_id: userId,
    /** GOAL: fija equipo anotador en BD (marcador incluso si local/visitor del partido faltan o difieren del roster). */
    team_id: normalizedType === 'GOAL' ? playerTeamId : null
  });

  if (normalizedType === 'GOAL' && !deferScoreSync) {
    const gameBefore = await Game.findById(gameId);
    await Game.refreshScoresFromGoalEvents(gameId);
    const gameAfter = await Game.findById(gameId);
    await propagateFinishedGameStats(tournamentId, gameId, gameBefore, gameAfter);
  }

  return created;
};

/**
 * Descargar plantilla Excel para importar eventos del partido.
 * GET /api/config/tournament/:id/games/:gameId/events/template
 */
const downloadGameEventsTemplate = async (req, res) => {
  try {
    const tournamentId = parseInt(req.params.id, 10);
    const gameId = parseInt(req.params.gameId, 10);

    if (!Number.isFinite(tournamentId) || tournamentId <= 0 || !Number.isFinite(gameId) || gameId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Identificadores de torneo o partido inválidos'
      });
    }

    const game = await Game.findById(gameId);
    if (!game || Number(game.torneo_id) !== tournamentId) {
      return res.status(404).json({
        success: false,
        message: 'Partido no encontrado en este torneo'
      });
    }

    const buf = GameEvent.generateTemplateBuffer(gameId, tournamentId);
    const filename = `plantilla_eventos_partido_${gameId}.xlsx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(buf);
  } catch (error) {
    console.error('Error en downloadGameEventsTemplate:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al generar la plantilla'
    });
  }
};

/**
 * Importar eventos desde Excel (.xlsx).
 * POST /api/config/tournament/:id/games/:gameId/events/import
 * multipart field: file
 */
const bulkImportGameEvents = async (req, res) => {
  try {
    const tournamentId = parseInt(req.params.id, 10);
    const gameId = parseInt(req.params.gameId, 10);
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
    }

    if (!Number.isFinite(tournamentId) || tournamentId <= 0 || !Number.isFinite(gameId) || gameId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Identificadores de torneo o partido inválidos'
      });
    }

    if (!req.file || !req.file.buffer) {
      return res.status(400).json({
        success: false,
        message: 'Archivo requerido: envía el Excel en el campo "file"'
      });
    }

    const game = await Game.findById(gameId);
    if (!game || Number(game.torneo_id) !== tournamentId) {
      return res.status(404).json({
        success: false,
        message: 'Partido no encontrado en este torneo'
      });
    }

    let rows;
    try {
      rows = GameEvent.parseImportBuffer(req.file.buffer);
    } catch (parseErr) {
      console.error('Error parseando Excel:', parseErr);
      return res.status(400).json({
        success: false,
        message: 'No se pudo leer el archivo Excel'
      });
    }

    if (rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'La planilla no tiene filas de datos válidas'
      });
    }

    const results = [];
    let imported = 0;

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const excelRow = i + 2;
      try {
        const gid = parseInt(row.game_id, 10);
        const tid = parseInt(row.tourn_id, 10);
        if (!Number.isFinite(gid) || gid !== gameId) {
          throw httpGameEventError(400, 'game_id debe coincidir con el partido seleccionado');
        }
        if (!Number.isFinite(tid) || tid !== tournamentId) {
          throw httpGameEventError(400, 'tourn_id debe coincidir con el torneo del partido');
        }

        const evType = String(row.event_type || '').trim().toUpperCase();
        if (i === 0 && evType === 'START') {
          const tTeam = parseInt(row.team_id, 10);
          if (!Number.isFinite(tTeam) || tTeam <= 0) {
            throw httpGameEventError(
              400,
              'En la primera fila de datos, team_id es obligatorio cuando event_type es START'
            );
          }
        }

        const body = {
          event_time: row.event_time,
          player_id: row.player_id,
          goals: row.goals,
          assists: row.assists,
          event_type: row.event_type,
          team_id: row.team_id
        };

        const created = await createGameEventCore(tournamentId, gameId, userId, body, {
          deferScoreSync: true
        });
        results.push({ row: excelRow, success: true, event_id: created.event_id });
        imported += 1;
      } catch (err) {
        const code = err.statusCode || 500;
        const msg = err.message || 'Error desconocido';
        results.push({ row: excelRow, success: false, message: msg, code });
      }
    }

    const failed = results.filter((r) => !r.success);
    if (imported > 0) {
      try {
        const gameAfter = await Game.findById(gameId);
        await Game.refreshScoresFromGoalEvents(gameId);
        const gameRefreshed = await Game.findById(gameId);
        await propagateFinishedGameStats(tournamentId, gameId, gameAfter, gameRefreshed);
      } catch (syncErr) {
        console.error('Error sincronizando marcador tras importar eventos:', syncErr);
      }
    }
    return res.json({
      success: failed.length === 0,
      message:
        failed.length === 0
          ? `Se importaron ${imported} evento(s)`
          : `Importados ${imported} de ${rows.length}; ${failed.length} fila(s) con error`,
      data: {
        imported,
        total: rows.length,
        failed: failed.length,
        results
      }
    });
  } catch (error) {
    console.error('Error en bulkImportGameEvents:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al importar eventos',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Actualizar evento de fútbol post-partido.
 * PATCH /api/config/tournament/:id/games/:gameId/events/:eventId
 */
const updateGameEvent = async (req, res) => {
  try {
    const tournamentId = parseInt(req.params.id, 10);
    const gameId = parseInt(req.params.gameId, 10);
    const eventId = parseInt(req.params.eventId, 10);
    const userId = req.user?.id;
    const userRole = req.user?.role;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Usuario no autenticado' });
    }
    if (
      !Number.isFinite(tournamentId) ||
      tournamentId <= 0 ||
      !Number.isFinite(gameId) ||
      gameId <= 0 ||
      !Number.isFinite(eventId) ||
      eventId <= 0
    ) {
      return res.status(400).json({ success: false, message: 'Identificadores inválidos' });
    }
    if (!isAdminOrSuperuserRole(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Solo administradores y superusuarios pueden editar eventos de fútbol'
      });
    }

    const tournamentSportId = await resolveTournamentSportId(tournamentId);
    if (tournamentSportId !== 2) {
      return res.status(400).json({ success: false, message: 'Edición no disponible para este deporte' });
    }

    const existing = await GameEvent.findByIdForGame(eventId, gameId, tournamentId);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Evento no encontrado' });
    }

    const existingType = String(existing.event_type || '').trim().toUpperCase();
    if (!FOOTBALL_POST_MATCH_EVENT_TYPES.has(existingType)) {
      return res.status(400).json({ success: false, message: 'Solo se pueden editar eventos de fútbol post-partido' });
    }

    const { event_time, player_id, event_type } = req.body || {};
    if (event_time == null || String(event_time).trim() === '') {
      return res.status(400).json({ success: false, message: 'event_time es obligatorio' });
    }

    let normalizedType = normalizeFootballEventTypeInput(event_type);
    if (!normalizedType) normalizedType = String(event_type || existing.event_type || '').trim().toUpperCase();
    if (!FOOTBALL_POST_MATCH_EVENT_TYPES.has(normalizedType)) {
      return res.status(400).json({ success: false, message: 'event_type no válido para fútbol' });
    }

    const game = await Game.findById(gameId);
    if (!game || Number(game.torneo_id) !== tournamentId) {
      return res.status(404).json({ success: false, message: 'Partido no encontrado en este torneo' });
    }

    await assertGameAcceptsEventType(gameId, game, normalizedType, { userRole, tournamentSportId });

    if (player_id == null || player_id === '') {
      return res.status(400).json({ success: false, message: 'player_id es obligatorio' });
    }
    const playerIdNum = parseInt(player_id, 10);
    if (!Number.isFinite(playerIdNum) || playerIdNum <= 0) {
      return res.status(400).json({ success: false, message: 'player_id inválido' });
    }

    const checkPlayer = await pool.query(
      `SELECT p.player_id, p.team_id
       FROM player p
       INNER JOIN team t ON t.team_id = p.team_id
       WHERE p.player_id = $1 AND t.torneo_id = $2`,
      [playerIdNum, tournamentId]
    );
    if (checkPlayer.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'El jugador no pertenece a este torneo' });
    }

    const playerTeamId = Number(checkPlayer.rows[0].team_id);
    if (!Number.isFinite(playerTeamId) || playerTeamId <= 0) {
      return res.status(400).json({ success: false, message: 'El jugador no tiene equipo asignado válido' });
    }

    const eventTimeStored = normalizeFootballMinuteToEventTime(event_time);
    const { goalsVal, yellowcard, redcard, teamIdForEvent } = resolveFootballPostMatchEventFields(
      game,
      normalizedType,
      playerTeamId
    );

    const wasScoring = FOOTBALL_SCORING_EVENT_TYPES.has(existingType);
    const isScoring = FOOTBALL_SCORING_EVENT_TYPES.has(normalizedType);

    const updated = await GameEvent.updateById(eventId, {
      event_time: eventTimeStored,
      player_id: playerIdNum,
      goals: goalsVal,
      assists: 0,
      event_type: normalizedType,
      team_id: teamIdForEvent,
      yellowcard,
      redcard
    });

    if (wasScoring || isScoring) {
      await syncFootballScoresAfterEventChange(tournamentId, gameId);
    }

    return res.json({
      success: true,
      message: 'Evento actualizado',
      data: { event: updated }
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    console.error('Error en updateGameEvent:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al actualizar el evento',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Eliminar evento de fútbol post-partido.
 * DELETE /api/config/tournament/:id/games/:gameId/events/:eventId
 */
const deleteGameEvent = async (req, res) => {
  try {
    const tournamentId = parseInt(req.params.id, 10);
    const gameId = parseInt(req.params.gameId, 10);
    const eventId = parseInt(req.params.eventId, 10);
    const userRole = req.user?.role;

    if (!req.user?.id) {
      return res.status(401).json({ success: false, message: 'Usuario no autenticado' });
    }
    if (
      !Number.isFinite(tournamentId) ||
      tournamentId <= 0 ||
      !Number.isFinite(gameId) ||
      gameId <= 0 ||
      !Number.isFinite(eventId) ||
      eventId <= 0
    ) {
      return res.status(400).json({ success: false, message: 'Identificadores inválidos' });
    }
    if (!isAdminOrSuperuserRole(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Solo administradores y superusuarios pueden eliminar eventos de fútbol'
      });
    }

    const tournamentSportId = await resolveTournamentSportId(tournamentId);
    if (tournamentSportId !== 2) {
      return res.status(400).json({ success: false, message: 'Eliminación no disponible para este deporte' });
    }

    const existing = await GameEvent.findByIdForGame(eventId, gameId, tournamentId);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Evento no encontrado' });
    }

    const existingType = String(existing.event_type || '').trim().toUpperCase();
    if (!FOOTBALL_POST_MATCH_EVENT_TYPES.has(existingType)) {
      return res.status(400).json({ success: false, message: 'Solo se pueden eliminar eventos de fútbol post-partido' });
    }

    const wasScoring = FOOTBALL_SCORING_EVENT_TYPES.has(existingType);
    const deleted = await GameEvent.deleteById(eventId);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Evento no encontrado' });
    }

    if (wasScoring) {
      await syncFootballScoresAfterEventChange(tournamentId, gameId);
    }

    return res.json({ success: true, message: 'Evento eliminado' });
  } catch (error) {
    console.error('Error en deleteGameEvent:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al eliminar el evento',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Registrar evento de partido en game_events
 * (START, GOAL, AST, HALF, BREAK, Juego en Pausa, Juego reanudado)
 * POST /api/config/tournament/:id/games/:gameId/events
 */
const createGameEvent = async (req, res) => {
  try {
    const tournamentId = parseInt(req.params.id, 10);
    const gameId = parseInt(req.params.gameId, 10);
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
    }

    if (!Number.isFinite(tournamentId) || tournamentId <= 0 || !Number.isFinite(gameId) || gameId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Identificadores de torneo o partido inválidos'
      });
    }

    const row = await createGameEventCore(tournamentId, gameId, userId, req.body, {
      userRole: req.user?.role
    });

    return res.status(201).json({
      success: true,
      message: 'Evento registrado',
      data: { event: row }
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    console.error('Error en createGameEvent:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al registrar el evento',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Estadísticas por jugador del partido (vista Game_Rank_V)
 * GET /api/config/tournament/:id/games/:gameId/player-rank
 */
const getGamePlayerRank = async (req, res) => {
  try {
    const tournamentId = parseInt(req.params.id, 10);
    const gameId = parseInt(req.params.gameId, 10);

    if (!Number.isFinite(tournamentId) || tournamentId <= 0 || !Number.isFinite(gameId) || gameId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Identificadores de torneo o partido inválidos'
      });
    }

    const game = await Game.findById(gameId);
    if (!game || Number(game.torneo_id) !== tournamentId) {
      return res.status(404).json({
        success: false,
        message: 'Partido no encontrado en este torneo'
      });
    }

    const rows = await GameRankView.findByGameId(gameId);

    return res.json({
      success: true,
      data: { rows }
    });
  } catch (error) {
    console.error('Error en getGamePlayerRank:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al cargar estadísticas del partido (Game_Rank_V)',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

  /**
   * Estadísticas agregadas por jugador desde game_events (goles, asistencias, partidos, callahans).
   * GET /api/config/tournament/:id/stats/player-events?top=1|division=Nombre|scope=groups|all
   * scope=groups: solo eventos en partidos cuya fase (nombre) incluye grupo/group; omitir o scope=all = todo el torneo.
   */
const getTournamentPlayerEventStats = async (req, res) => {
  try {
    const tournamentId = parseInt(req.params.id, 10);
    if (!Number.isFinite(tournamentId) || tournamentId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'ID de torneo inválido'
      });
    }

    const top = req.query.top === '1' || req.query.top === 'true';
    const divisionRaw = req.query.division;
    const division =
      divisionRaw != null && String(divisionRaw).trim() !== '' ? String(divisionRaw).trim() : null;
    const scopeRaw = req.query.scope != null ? String(req.query.scope).trim().toLowerCase() : '';
    const groupPhaseOnly = scopeRaw === 'groups' || scopeRaw === 'group' || scopeRaw === 'group_phase';

    const divisions = await Game.listDistinctDivisions(tournamentId);
    const sportId = await resolveTournamentSportId(tournamentId);
    const rows =
      sportId === 2
        ? await GameEvent.aggregateFootballPlayerStatsByTournament(tournamentId, {
            topOnly: top,
            division: top ? null : division,
            groupPhaseOnly: top ? false : groupPhaseOnly
          })
        : await GameEvent.aggregatePlayerStatsByTournament(tournamentId, {
            topOnly: top,
            division: top ? null : division,
            groupPhaseOnly: top ? false : groupPhaseOnly
          });

    return res.json({
      success: true,
      data: {
        divisions,
        players: rows
      }
    });
  } catch (error) {
    console.error('Error en getTournamentPlayerEventStats:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error al obtener estadísticas por jugador',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Ejecuta `ps_game_upd(tourn_id, ga_num, phase_num)` para un partido (idempotente).
 * POST /api/config/tournament/:id/games/:gameId/ps-game-upd
 */
const runPsGameUpd = async (req, res) => {
  try {
    const tournamentId = parseInt(req.params.id, 10);
    const gameId = parseInt(req.params.gameId, 10);
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Usuario no autenticado' });
    }
    if (!Number.isFinite(tournamentId) || tournamentId <= 0 || !Number.isFinite(gameId) || gameId <= 0) {
      return res.status(400).json({ success: false, message: 'Identificadores inválidos' });
    }

    const game = await Game.findById(gameId);
    if (!game || Number(game.torneo_id) !== tournamentId) {
      return res.status(404).json({ success: false, message: 'Partido no encontrado en este torneo' });
    }

    const result = await Game.runPsGameUpd(tournamentId, gameId);
    if (!result.ok) {
      return res.status(400).json({
        success: false,
        message: 'No se pudo ejecutar ps_game_upd',
        data: result
      });
    }

    return res.json({
      success: true,
      message: result.skipped
        ? 'Estadísticas ya actualizadas para este partido'
        : 'Estadísticas y posiciones actualizadas',
      data: result
    });
  } catch (error) {
    console.error('Error en runPsGameUpd:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al ejecutar ps_game_upd',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Sincronizar cruces playoff: desde cada partido Finished, ganador → W#, perdedor → L# en partidos siguientes (`stats_slot_*`).
 * POST /api/config/tournament/:id/bracket/sync-playoff-advances
 * Alias: POST /api/config/tournament/:id/playoff/sync-advances
 */
const syncPlayoffBracketAdvances = async (req, res) => {
  try {
    const tournamentId = parseInt(req.params.id, 10);
    if (!Number.isFinite(tournamentId) || tournamentId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'ID de torneo inválido'
      });
    }

    const result = await Game.syncPlayoffAdvancesFromFinishedGames(tournamentId);

    return res.json({
      success: true,
      message:
        result.updatedGames > 0
          ? `Cruces actualizados: ${result.updatedGames} partido(s) con equipo(s) nuevos desde W#/L#.`
          : 'Sin cambios en cruces (no hay cerrados aplicables o los huecos ya estaban cubiertos).',
      data: {
        updatedGames: result.updatedGames,
        updatedGameIds: result.updatedGameIds
      }
    });
  } catch (error) {
    console.error('Error en syncPlayoffBracketAdvances:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al sincronizar avances del bracket',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  createTournament,
  getTournaments,
  getTournamentById,
  updateTournament,
  deleteTournament,
  resetTournament,
  savePhases,
  getPhases,
  getTeams,
  createTeam,
  updateTeam,
  saveTeamGroups,
  deleteTeam,
  getGames,
  getBracket,
  createGame,
  updateGame,
  patchGameEstado,
  postGameForfeit,
  patchLiveClock,
  runPsGameUpd,
  deleteGame,
  saveBracketLinks,
  getRankedCanvases,
  saveRankedCanvases,
  createBracketGame,
  updateBracketGame,
  deleteBracketGame,
  getPlayers,
  createPlayer,
  createPlayersBulk,
  createGameEvent,
  updateGameEvent,
  deleteGameEvent,
  getGameEvents,
  getGameTimeoutCounts,
  getTournamentPlacements,
  getGameGoalTotals,
  getTournamentGoalTotalsBatch,
  getGamePlayerRank,
  getTournamentPlayerEventStats,
  downloadGameEventsTemplate,
  bulkImportGameEvents,
  syncPlayoffBracketAdvances
};
