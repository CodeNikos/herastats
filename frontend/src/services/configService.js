import { api } from './authHttp';

const goalTotalsInflight = new Map();

export const configService = {
  /**
   * Crear una nueva configuración de torneo
   * @param {Object} tournamentData - Datos del torneo
   * @param {string} tournamentData.torn_name - Nombre del torneo
   * @param {number} tournamentData.torn_year - Año del torneo
   * @param {string} tournamentData.pais - País
   */
  async createTournament(tournamentData) {
    try {
      const response = await api.post('/config/tournament', tournamentData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Obtener torneos. El backend decide según el token (si va en Authorization):
 * - Sin token: todos (catálogo público).
   * - superuser: todos.
   * - admin / anotador: torneos asignados (created_by o tournament_members).
   */
  async getTournaments() {
    try {
      const response = await api.get('/config/tournament');
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Obtener una configuración de torneo por ID
   * @param {number} id - ID del torneo
   */
  async getTournamentById(id) {
    try {
      const response = await api.get(`/config/tournament/${id}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Actualizar una configuración de torneo
   * @param {number} id - ID del torneo
   * @param {Object} tournamentData - Datos actualizados del torneo
   */
  async updateTournament(id, tournamentData) {
    try {
      const response = await api.put(`/config/tournament/${id}`, tournamentData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Guardar fases de un torneo
   * @param {number} tournamentId - ID del torneo
   * @param {Array} phases - Array de { stage, phase_num, duracion, limite_goal, phas_id? } — stage: Groups|Playoffs|Semifinals|Final; phase_num 1-4
   */
  async savePhases(tournamentId, phases) {
    try {
      const response = await api.post(`/config/tournament/${tournamentId}/phases`, { phases });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Obtener fases de un torneo
   * @param {number} tournamentId - ID del torneo
   */
  async getPhases(tournamentId) {
    try {
      const response = await api.get(`/config/tournament/${tournamentId}/phases`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Obtener equipos de un torneo
   * @param {number|string} tournamentId - ID del torneo
   */
  async getTeams(tournamentId) {
    try {
      const response = await api.get(`/config/tournament/${tournamentId}/teams`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Crear equipo en un torneo
   * @param {number|string} tournamentId - ID del torneo
   * @param {Object} teamData - { name, division, url_imagen }
   */
  async createTeam(tournamentId, teamData) {
    try {
      const response = await api.post(`/config/tournament/${tournamentId}/teams`, teamData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Actualizar equipo en un torneo
   * @param {number|string} tournamentId - ID del torneo
   * @param {number|string} teamId - ID del equipo
   * @param {Object} teamData - { name, division, group, url_imagen }
   */
  async updateTeam(tournamentId, teamId, teamData) {
    try {
      const response = await api.put(`/config/tournament/${tournamentId}/teams/${teamId}`, teamData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Estadísticas agregadas de encuestas de espíritu (dueño del torneo).
   * @param {number|string} tournamentId
   */
  async getTournamentSpiritStats(tournamentId, options = {}) {
    try {
      const params = {};
      if (options.division != null && String(options.division).trim() !== '') {
        params.division = String(options.division).trim();
      }
      const response = await api.get(`/config/tournament/${tournamentId}/spirit-stats`, { params });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Eliminar equipo de un torneo
   * @param {number|string} tournamentId - ID del torneo
   * @param {number|string} teamId - ID del equipo
   */
  async deleteTeam(tournamentId, teamId) {
    try {
      const response = await api.delete(`/config/tournament/${tournamentId}/teams/${teamId}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Guardar grupos de equipos en un torneo
   * @param {number|string} tournamentId - ID del torneo
   * @param {Array<{ teamId: string|number, group: string }>} items - Asignaciones a guardar
   */
  async saveTeamGroups(tournamentId, items) {
    try {
      const response = await api.put(`/config/tournament/${tournamentId}/team-groups`, {
        assignments: items
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Obtener juegos de un torneo
   * @param {number|string} tournamentId - ID del torneo
   */
  async getGames(tournamentId) {
    try {
      const response = await api.get(`/config/tournament/${tournamentId}/games`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Propaga ganador (W#) y perdedor (L#) desde partidos Finished a huecos `stats_slot_*` de la siguiente fase.
   * Requiere sesión (organizador). Idempotente.
   */
  async syncPlayoffBracketAdvances(tournamentId) {
    try {
      const response = await api.post(`/config/tournament/${tournamentId}/bracket/sync-playoff-advances`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Crear juego en un torneo
   * @param {number|string} tournamentId - ID del torneo
   * @param {Object} gameData - { game_date, game_time, game_location, phas_id, phas_num?, visitor, local }
   */
  async createGame(tournamentId, gameData) {
    try {
      const response = await api.post(`/config/tournament/${tournamentId}/games`, gameData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Actualizar juego en un torneo
   * @param {number|string} tournamentId - ID del torneo
   * @param {number|string} gameId - ID del juego
   * @param {Object} gameData - { game_date, game_time, game_location, phas_id, visitor, local }
   */
  async updateGame(tournamentId, gameId, gameData) {
    try {
      const response = await api.put(`/config/tournament/${tournamentId}/games/${gameId}`, gameData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Actualizar solo el estado del partido (p. ej. Ongoing)
   * @param {{ mix_ratio_first?: string, finish_event_time?: string, finish_elapsed_seconds?: number }} [options]
   *    finish_event_time: reloj de juego HH:MM:SS al pulsar FIN (solo si estado Finished)
   *    finish_elapsed_seconds: tiempo transcurrido en segundos (LIVE END) para congelar reloj en servidor
   */
  async patchLiveClockElapsed(tournamentId, gameId, elapsedSeconds) {
    try {
      const response = await api.patch(`/config/tournament/${tournamentId}/games/${gameId}/live-clock`, {
        elapsed_seconds: Math.max(0, Math.floor(Number(elapsedSeconds) || 0))
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /** Congela `live_clock_elapsed_sec` (pausa/FIN) sin restricción de heartbeat. */
  async freezeLiveClockElapsed(tournamentId, gameId, elapsedSeconds) {
    try {
      const response = await api.patch(`/config/tournament/${tournamentId}/games/${gameId}/live-clock`, {
        elapsed_seconds: Math.max(0, Math.floor(Number(elapsedSeconds) || 0)),
        freeze: true
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Ejecuta `ps_game_upd(tourn_id, ga_num, phase_num)` — estadísticas de grupo y lienzos Principal/Ranked.
   * Idempotente en servidor (no duplica si ya se aplicó al finalizar el partido).
   */
  async runPsGameUpd(tournamentId, gameId) {
    try {
      const response = await api.post(
        `/config/tournament/${tournamentId}/games/${gameId}/ps-game-upd`
      );
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  async patchGameEstado(tournamentId, gameId, estado, options) {
    try {
      const body = { estado };
      if (options && options.mix_ratio_first != null) {
        body.mix_ratio_first = options.mix_ratio_first;
      }
      if (
        options?.finish_elapsed_seconds != null &&
        options.finish_elapsed_seconds !== '' &&
        Number.isFinite(Number(options.finish_elapsed_seconds))
      ) {
        body.finish_elapsed_seconds = Math.max(
          0,
          Math.floor(Number(options.finish_elapsed_seconds))
        );
      }
      if (options?.finish_event_time != null && String(options.finish_event_time).trim() !== '') {
        body.finish_event_time = String(options.finish_event_time).trim();
      }
      const response = await api.patch(`/config/tournament/${tournamentId}/games/${gameId}/estado`, body);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Eliminar juego en un torneo
   * @param {number|string} tournamentId - ID del torneo
   * @param {number|string} gameId - ID del juego
   */
  async deleteGame(tournamentId, gameId) {
    try {
      const response = await api.delete(`/config/tournament/${tournamentId}/games/${gameId}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Registrar evento de partido en game_events
   * @param {number|string} tournamentId
   * @param {number|string} gameId
   * @param {Object} payload - GOAL/AST: { event_time, player_id, goals, assists, event_type }
   *   START: { event_time, event_type: 'START', team_id }
   *   HALF / BREAK / pausa / reanudación: { event_time, event_type, goals: 0, assists: 0, player_id: null }
   */
  async createGameEvent(tournamentId, gameId, payload) {
    try {
      const response = await api.post(`/config/tournament/${tournamentId}/games/${gameId}/events`, payload);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  async updateGameEvent(tournamentId, gameId, eventId, payload) {
    try {
      const response = await api.patch(
        `/config/tournament/${tournamentId}/games/${gameId}/events/${eventId}`,
        payload
      );
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  async deleteGameEvent(tournamentId, gameId, eventId) {
    try {
      const response = await api.delete(
        `/config/tournament/${tournamentId}/games/${gameId}/events/${eventId}`
      );
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Forfeit: equipo que abandona; rival 15–0 sin goles/asistencias; finaliza el partido.
   * @param {number|string} tournamentId
   * @param {number|string} gameId
   * @param {{ forfeit_team_id: number, event_time?: string, finish_elapsed_seconds?: number }} body
   */
  async postGameForfeit(tournamentId, gameId, body) {
    try {
      const response = await api.post(`/config/tournament/${tournamentId}/games/${gameId}/forfeit`, body);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Listar eventos del partido (timeline / resumen)
   * @param {number|string} tournamentId
   * @param {number|string} gameId
   */
  async getGameEvents(tournamentId, gameId) {
    try {
      const response = await api.get(`/config/tournament/${tournamentId}/games/${gameId}/events`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Suma de goles por equipo (eventos GOAL en BD) para el marcador en vivo.
   */
  async getGameGoalTotals(tournamentId, gameId) {
    const key = `${String(tournamentId)}:${String(gameId)}`;
    if (goalTotalsInflight.has(key)) {
      return goalTotalsInflight.get(key);
    }
    const request = api
      .get(`/config/tournament/${tournamentId}/games/${gameId}/goal-totals`)
      .then((response) => response.data)
      .finally(() => {
        goalTotalsInflight.delete(key);
      });
    goalTotalsInflight.set(key, request);
    try {
      return await request;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Marcadores en lote (brackets / calendario): una petición por hasta 100 partidos.
   */
  async getBatchGameGoalTotals(tournamentId, gameIds) {
    const uniqueIds = [
      ...new Set(
        (gameIds || [])
          .map((id) => String(id).trim())
          .filter((id) => id !== '' && Number.isFinite(Number(id)) && Number(id) > 0)
      )
    ];
    if (uniqueIds.length === 0) {
      return { success: true, data: { totals: {} } };
    }
    if (uniqueIds.length === 1) {
      const single = await this.getGameGoalTotals(tournamentId, uniqueIds[0]);
      if (!single?.success || !single.data) return single;
      return {
        success: true,
        data: {
          totals: {
            [uniqueIds[0]]: {
              local_goals: single.data.local_goals,
              visitor_goals: single.data.visitor_goals
            }
          }
        }
      };
    }

    const totals = {};
    const chunkSize = 80;
    for (let i = 0; i < uniqueIds.length; i += chunkSize) {
      const chunk = uniqueIds.slice(i, i + chunkSize);
      const response = await api.get(`/config/tournament/${tournamentId}/goal-totals`, {
        params: { gameIds: chunk.join(',') }
      });
      const batch = response.data?.data?.totals || {};
      Object.assign(totals, batch);
    }
    return { success: true, data: { totals } };
  },

  /**
   * TIMEOUTs por equipo en el partido (máx. 2 por equipo).
   * @returns {Promise<{ success: boolean, data?: { by_team: Array<{ team_id: number, cantidad_to: number }>, max_per_team: number } }>}
   */
  async getGameTimeoutCounts(tournamentId, gameId) {
    try {
      const response = await api.get(
        `/config/tournament/${tournamentId}/games/${gameId}/timeout-counts`
      );
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Posiciones finales por categoría (tabla placements).
   */
  async getTournamentPlacements(tournamentId) {
    try {
      const response = await api.get(`/config/tournament/${tournamentId}/placements`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Descarga la plantilla Excel para registrar eventos del partido (dispara descarga en el navegador).
   */
  async downloadGameEventsTemplate(tournamentId, gameId) {
    const response = await api.get(
      `/config/tournament/${tournamentId}/games/${gameId}/events/template`,
      { responseType: 'blob' }
    );
    const blob = response.data;
    const ct = (response.headers['content-type'] || '').toLowerCase();
    if (ct.includes('application/json')) {
      const text = await blob.text();
      const j = JSON.parse(text);
      throw new Error(j.message || 'No se pudo descargar la plantilla');
    }
    const filename = `plantilla_eventos_partido_${gameId}.xlsx`;
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },

  /**
   * Importa eventos desde un archivo Excel (.xlsx). Campo multipart: file
   */
  async importGameEventsFromExcel(tournamentId, gameId, file) {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post(
      `/config/tournament/${tournamentId}/games/${gameId}/events/import`,
      formData
    );
    return response.data;
  },

  /**
   * Estadísticas por jugador del partido (vista Game_Rank_V)
   */
  async getGamePlayerRank(tournamentId, gameId) {
    try {
      const response = await api.get(`/config/tournament/${tournamentId}/games/${gameId}/player-rank`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /** Puntuaciones de espíritu recibidas por cada equipo en el partido (público, sin token). */
  async getGameSpiritScores(tournamentId, gameId) {
    try {
      const response = await api.get(`/config/tournament/${tournamentId}/games/${gameId}/spirit-scores`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Registrar encuesta de espíritu a mano (organizador), misma escala que el enlace por correo.
   * @param {string|number} tournamentId
   * @param {string|number} gameId
   * @param {{ responding_team_id: number, s_rules: number, s_fouls: number, s_fairmind: number, s_attitude: number, s_communication: number, comments?: string }} body
   */
  async submitSpiritSurveyManual(tournamentId, gameId, body) {
    /** Ruta corta junto a `/spirit-survey/invite`; evita 404 si un proxy sólo espíritu público ignoraba rutas deep en /config. */
    const response = await api.post('/spirit-survey/register-manual', {
      ...body,
      torneo_id: Number(tournamentId),
      game_id: Number(gameId)
    });
    return response.data;
  },

  /**
   * Estadísticas por jugador agregadas desde game_events (torneo).
   * @param {string|number} tournamentId
   * @param {{ top?: boolean, division?: string, scope?: 'all'|'groups' }} [opts]
   *   scope 'groups': solo partidos en fases de clasificación por grupos (stage con grupo/group)
   */
  async getTournamentPlayerEventStats(tournamentId, opts = {}) {
    try {
      const params = new URLSearchParams();
      if (opts.top === true) params.set('top', '1');
      else if (opts.division != null && String(opts.division).trim() !== '') {
        params.set('division', String(opts.division).trim());
      }
      const scope =
        opts.scope != null && String(opts.scope).trim() !== ''
          ? String(opts.scope).trim().toLowerCase()
          : 'all';
      if (scope === 'groups' && opts.top !== true) {
        params.set('scope', 'groups');
      }
      const q = params.toString();
      const path = `/config/tournament/${tournamentId}/stats/player-events${q ? `?${q}` : ''}`;
      const response = await api.get(path);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Obtener configuración de bracket basada en juegos
   * @param {number|string} tournamentId
   * @param {string} [division]
   * @param {'Main'|'Ranked'} [canvasBracket] — filtra juegos por lienzo (principal vs posicionamiento)
   */
  async getBracket(tournamentId, division, canvasBracket) {
    try {
      const params = new URLSearchParams();
      if (division != null && String(division).trim() !== '') {
        params.set('division', String(division).trim());
      }
      if (canvasBracket != null && String(canvasBracket).trim() !== '') {
        params.set('canvas_bracket', String(canvasBracket).trim());
      }
      const q = params.toString() ? `?${params.toString()}` : '';
      const response = await api.get(`/config/tournament/${tournamentId}/bracket${q}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Guardar enlaces del bracket
   * @param {number|string} tournamentId
   * @param {Array<{from_game_id:number,to_game_id:number,to_slot:'local'|'visitor',rule?:string}>} links
   * @param {string} [division]
   */
  async saveBracketLinks(tournamentId, links, division) {
    try {
      const divisionQuery = division ? `?division=${encodeURIComponent(division)}` : '';
      const response = await api.put(`/config/tournament/${tournamentId}/bracket/links${divisionQuery}`, { links });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Obtener lienzos ranked persistidos
   * @param {number|string} tournamentId
   * @param {string} [division]
   */
  async getRankedCanvases(tournamentId, division) {
    try {
      const divisionQuery = division ? `?division=${encodeURIComponent(division)}` : '';
      const response = await api.get(`/config/tournament/${tournamentId}/bracket/ranked-canvases${divisionQuery}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Guardar lienzos ranked persistidos
   * @param {number|string} tournamentId
   * @param {Array<{id:string,name:string,rounds:Array,manualLinks:Array}>} canvases
   * @param {string} [division]
   */
  async saveRankedCanvases(tournamentId, canvases, division) {
    try {
      const divisionQuery = division ? `?division=${encodeURIComponent(division)}` : '';
      const response = await api.put(`/config/tournament/${tournamentId}/bracket/ranked-canvases${divisionQuery}`, { canvases });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Crear juego de bracket
   * @param {number|string} tournamentId
   * @param {Object} gameData
   */
  async createBracketGame(tournamentId, gameData) {
    try {
      const response = await api.post(`/config/tournament/${tournamentId}/bracket/games`, gameData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Actualizar juego de bracket
   * @param {number|string} tournamentId
   * @param {number|string} gameId
   * @param {Object} gameData
   */
  async updateBracketGame(tournamentId, gameId, gameData) {
    try {
      const response = await api.put(`/config/tournament/${tournamentId}/bracket/games/${gameId}`, gameData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Eliminar juego de bracket
   * @param {number|string} tournamentId
   * @param {number|string} gameId
   */
  async deleteBracketGame(tournamentId, gameId) {
    try {
      const response = await api.delete(`/config/tournament/${tournamentId}/bracket/games/${gameId}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Obtener jugadores de un torneo
   * @param {number|string} tournamentId - ID del torneo
   */
  async getPlayers(tournamentId) {
    try {
      const response = await api.get(`/config/tournament/${tournamentId}/players`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Crear jugador en un torneo
   * @param {number|string} tournamentId - ID del torneo
   * @param {Object} playerData - { torneo_id, team_id, player_number, player_name, nickname, category }
   */
  async createPlayer(tournamentId, playerData) {
    try {
      const response = await api.post(`/config/tournament/${tournamentId}/players`, playerData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Importar jugadores por lote en un torneo
   * @param {number|string} tournamentId - ID del torneo
   * @param {Array} players - [{ torneo_id, team_id, player_number, player_name, nickname, category }]
   */
  async createPlayersBulk(tournamentId, players) {
    try {
      const response = await api.post(`/config/tournament/${tournamentId}/players/bulk`, { players });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Eliminar una configuración de torneo
   * @param {number} id - ID del torneo
   */
  async deleteTournament(id) {
    try {
      const response = await api.delete(`/config/tournament/${id}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Restablecer torneo: borra datos operativos y deja configuración base en blanco.
   * Solo superuser.
   */
  async resetTournament(id) {
    try {
      const response = await api.delete(`/config/tournament/${id}/reset`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Subir una imagen a Cloudinary
   * @param {File} imageFile - Archivo de imagen a subir
   * @param {string} folder - Carpeta destino (tournaments|teams)
   */
  async uploadImage(imageFile, folder = 'tournaments') {
    try {
      const formData = new FormData();
      formData.append('image', imageFile);
      formData.append('folder', folder);

      console.log('Subiendo imagen:', {
        name: imageFile.name,
        type: imageFile.type,
        size: imageFile.size,
        folder
      });

      // Usar la instancia api normal, el interceptor ahora maneja FormData correctamente
      const response = await api.post('/config/upload-image', formData);
      return response.data;
    } catch (error) {
      console.error('Error en uploadImage:', error);
      console.error('Error response:', error.response?.data);
      throw error;
    }
  },
};

