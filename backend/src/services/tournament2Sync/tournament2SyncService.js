const crypto = require('crypto');
const pool = require('../../config/database');
const TournamentConfig = require('../../models/TournamentConfig');
const Team = require('../../models/Team');
const Player = require('../../models/Player');
const Phase = require('../../models/Phase');
const Game = require('../../models/Game');
const { propagateFinishedGameStats } = require('../../controllers/config/finalizeHooks');
const TournamentExternalEntity = require('../../models/TournamentExternalEntity');
const { createExternalApiClient } = require('./externalApiClient');
const { getTournament2SyncConfig, validateTournament2SyncConfig } = require('./config');
const {
  TARGET_TOURNAMENT_ID,
  STEP_ORDER
} = require('./constants');
const {
  mapTeamsPayload,
  mapPlayersPayload,
  mapSchedulePayload,
  mapScoresPayload
} = require('./mappers');

function nowIsoCompact() {
  return new Date().toISOString().replace(/[^\d]/g, '').slice(0, 14);
}

function createRunId() {
  return `t2_${nowIsoCompact()}_${crypto.randomBytes(4).toString('hex')}`;
}

function normalizeStepSelection(step) {
  if (!step) return [...STEP_ORDER];
  if (!STEP_ORDER.includes(step)) {
    throw new Error(`Paso inválido: ${step}. Pasos válidos: ${STEP_ORDER.join(', ')}`);
  }
  return [step];
}

function initStats() {
  return { created: 0, updated: 0, skipped: 0, errors: 0, details: [] };
}

function normalizeGameStatus(status) {
  const s = String(status || '').trim().toLowerCase();
  if (s === 'finished') return 'Finished';
  if (s === 'ongoing') return 'Ongoing';
  return 'Upcoming';
}

function normalizeScore(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return String(Math.floor(n));
}

async function ensureTournamentExists(tournamentId) {
  const tournament = await TournamentConfig.findById(tournamentId);
  if (!tournament) {
    throw new Error(`No existe el torneo ${tournamentId}`);
  }
  return tournament;
}

async function findUserById(userId) {
  const result = await pool.query('SELECT id FROM users WHERE id = $1 LIMIT 1', [userId]);
  return result.rows[0] || null;
}

async function getPlayerNumberColumn() {
  const columns = await Player.getColumnSet();
  const column = Player.pickFirstColumn(columns, ['player_number', 'number', 'num_player']);
  if (!column) {
    throw new Error('No se encontró columna de número de jugador en tabla player');
  }
  return { columns, numberColumn: column };
}

async function allocatePlayerNumber(teamId, suggestedNumber, numberColumn, cache) {
  const suggested = Number(suggestedNumber);
  if (Number.isFinite(suggested) && suggested > 0) return Math.floor(suggested);

  if (!cache.has(teamId)) {
    const result = await pool.query(
      `SELECT COALESCE(MAX(${numberColumn}), 0)::int AS max_number FROM player WHERE team_id = $1`,
      [teamId]
    );
    cache.set(teamId, Number(result.rows[0]?.max_number) || 0);
  }
  const next = (cache.get(teamId) || 0) + 1;
  cache.set(teamId, next);
  return next;
}

async function hasCompletedInitialSeed(tournamentId) {
  const result = await pool.query(
    `SELECT 1
     FROM tournament_external_sync_log
     WHERE torneo_id = $1
       AND step = 'initial_seed'
       AND action = 'completed'
     LIMIT 1`,
    [tournamentId]
  );
  return result.rows.length > 0;
}

async function upsertPhaseFromSchedule({
  tournamentId,
  phaseExternalId,
  phaseName,
  phaseNum,
  raw,
  dryRun
}) {
  const derivedExternalId =
    phaseExternalId || `phase:${String(phaseName || phaseNum || 'default').toLowerCase()}`;
  const existingMap = await TournamentExternalEntity.findMapping({
    torneoId: tournamentId,
    entityType: 'phase',
    externalId: derivedExternalId
  });
  if (existingMap) return Number(existingMap.internal_id);

  const phases = await Phase.findByTorneoId(tournamentId);
  const matched = phases.find((p) => {
    if (phaseNum != null && Number(p.phase_num) === Number(phaseNum)) return true;
    const pn = String(p.stage || '').trim().toLowerCase();
    const sn = String(phaseName || '').trim().toLowerCase();
    return Boolean(sn) && pn === sn;
  });
  if (matched) {
    if (!dryRun) {
      await TournamentExternalEntity.upsertMapping({
        torneoId: tournamentId,
        entityType: 'phase',
        externalId: derivedExternalId,
        internalId: Number(matched.phas_id),
        payload: raw
      });
    }
    return Number(matched.phas_id);
  }

  if (dryRun) return null;
  const created = await pool.query(
    `INSERT INTO phases (torneo_id, stage, duration, goal_limit, phase_num)
     VALUES ($1, $2, NULL, NULL, $3)
     RETURNING phas_id`,
    [tournamentId, phaseName || `Fase ${phaseNum || ''}`.trim(), phaseNum]
  );
  const phasId = Number(created.rows[0].phas_id);
  await TournamentExternalEntity.upsertMapping({
    torneoId: tournamentId,
    entityType: 'phase',
    externalId: derivedExternalId,
    internalId: phasId,
    payload: raw
  });
  return phasId;
}

async function upsertTeam({
  tournamentId,
  team,
  dryRun
}) {
  const mapped = await TournamentExternalEntity.findMapping({
    torneoId: tournamentId,
    entityType: 'team',
    externalId: team.external_id
  });

  if (mapped) {
    if (!dryRun) {
      await Team.update(Number(mapped.internal_id), tournamentId, {
        name: team.name,
        division: team.division || null,
        group: team.group || null,
        url_imagen: team.url_imagen || null
      });
      await TournamentExternalEntity.upsertMapping({
        torneoId: tournamentId,
        entityType: 'team',
        externalId: team.external_id,
        internalId: Number(mapped.internal_id),
        payload: team.raw
      });
    }
    return { action: 'updated', internalId: Number(mapped.internal_id) };
  }

  if (dryRun) return { action: 'created', internalId: null };
  const created = await Team.create({
    torneo_id: tournamentId,
    name: team.name,
    division: team.division || null,
    group: team.group || null,
    url_imagen: team.url_imagen || null
  });
  const internalId = Number(created.team_id);
  await TournamentExternalEntity.upsertMapping({
    torneoId: tournamentId,
    entityType: 'team',
    externalId: team.external_id,
    internalId,
    payload: team.raw
  });
  return { action: 'created', internalId };
}

async function upsertPlayer({
  tournamentId,
  player,
  dryRun,
  playerMeta
}) {
  const teamMap = await TournamentExternalEntity.findMapping({
    torneoId: tournamentId,
    entityType: 'team',
    externalId: player.team_external_id
  });
  if (!teamMap) {
    return { action: 'skipped', reason: `Equipo no mapeado: ${player.team_external_id}` };
  }

  const mapped = await TournamentExternalEntity.findMapping({
    torneoId: tournamentId,
    entityType: 'player',
    externalId: player.external_id
  });

  if (mapped) {
    if (!dryRun) {
      const current = await pool.query(
        `SELECT player_id, ${playerMeta.numberColumn} AS current_number
         FROM player
         WHERE player_id = $1
         LIMIT 1`,
        [Number(mapped.internal_id)]
      );
      const currentNumber = Number(current.rows[0]?.current_number);
      const resolvedNumber = Number.isFinite(Number(player.player_number)) && Number(player.player_number) > 0
        ? Math.floor(Number(player.player_number))
        : (Number.isFinite(currentNumber) && currentNumber > 0
            ? currentNumber
            : await allocatePlayerNumber(
              Number(teamMap.internal_id),
              null,
              playerMeta.numberColumn,
              playerMeta.numberCache
            ));

      const hasPositionColumn = playerMeta.columns.has('position');
      const positionSetSql = hasPositionColumn
        ? ',\n             position = $7'
        : '';
      const queryParams = hasPositionColumn
        ? [
            Number(teamMap.internal_id),
            tournamentId,
            resolvedNumber,
            player.player_name,
            player.nickname || null,
            Number(mapped.internal_id),
            player.position || null
          ]
        : [
            Number(teamMap.internal_id),
            tournamentId,
            resolvedNumber,
            player.player_name,
            player.nickname || null,
            Number(mapped.internal_id)
          ];

      await pool.query(
        `UPDATE player
         SET team_id = $1,
             torneo_id = $2,
             ${playerMeta.numberColumn} = $3,
             player_name = $4,
             nickname = $5${positionSetSql}
         WHERE player_id = $6`,
        queryParams
      );
      await TournamentExternalEntity.upsertMapping({
        torneoId: tournamentId,
        entityType: 'player',
        externalId: player.external_id,
        internalId: Number(mapped.internal_id),
        payload: player.raw
      });
    }
    return { action: 'updated', internalId: Number(mapped.internal_id) };
  }

  if (dryRun) return { action: 'created', internalId: null };
  const resolvedNumber = await allocatePlayerNumber(
    Number(teamMap.internal_id),
    player.player_number,
    playerMeta.numberColumn,
    playerMeta.numberCache
  );
  const created = await Player.create({
    torneo_id: tournamentId,
    team_id: Number(teamMap.internal_id),
    player_number: resolvedNumber,
    player_name: player.player_name,
    nickname: player.nickname || null,
    position: player.position || null
  });
  const internalId = Number(created.player_id);
  await TournamentExternalEntity.upsertMapping({
    torneoId: tournamentId,
    entityType: 'player',
    externalId: player.external_id,
    internalId,
    payload: player.raw
  });
  return { action: 'created', internalId };
}

async function upsertGameFromSchedule({
  tournamentId,
  game,
  dryRun,
  preserveDateTime = false
}) {
  const localTeamMap = await TournamentExternalEntity.findMapping({
    torneoId: tournamentId,
    entityType: 'team',
    externalId: game.local_team_external_id
  });
  const visitorTeamMap = await TournamentExternalEntity.findMapping({
    torneoId: tournamentId,
    entityType: 'team',
    externalId: game.visitor_team_external_id
  });
  if (!localTeamMap || !visitorTeamMap) {
    return {
      action: 'skipped',
      reason: `Equipos no mapeados (local=${game.local_team_external_id}, visitor=${game.visitor_team_external_id})`
    };
  }

  const phasId = await upsertPhaseFromSchedule({
    tournamentId,
    phaseExternalId: game.phase_external_id,
    phaseName: game.phase_name,
    phaseNum: game.phase_num,
    raw: game.raw,
    dryRun
  });
  if (!phasId) {
    return { action: 'skipped', reason: 'No se pudo resolver fase' };
  }

  const payload = {
    torneo_id: tournamentId,
    // El worker no debe sobrescribir game_num desde API externa.
    // En creación se deja null para que BD asigne la secuencia interna.
    game_num: null,
    game_date: preserveDateTime
      ? new Date().toISOString().slice(0, 10)
      : game.game_date || new Date().toISOString().slice(0, 10),
    game_time: preserveDateTime ? '12:00:00' : game.game_time || '00:00:00',
    game_location: game.game_location || 'Sin ubicación',
    division: game.division || null,
    phas_id: Number(phasId),
    local: Number(localTeamMap.internal_id),
    visitor: Number(visitorTeamMap.internal_id),
    estado: normalizeGameStatus(game.raw?.status)
  };

  const mapped = await TournamentExternalEntity.findMapping({
    torneoId: tournamentId,
    entityType: 'game',
    externalId: game.external_id
  });

  if (mapped) {
    if (!dryRun) {
      // Importante: en updates del worker NO tocar:
      // game_num, game_location, game_date ni game_time.
      await pool.query(
        `UPDATE game
         SET
           division = COALESCE($1, division),
           phas_id = COALESCE($2, phas_id),
           "local" = COALESCE($3, "local"),
           visitor = COALESCE($4, visitor),
           estado = COALESCE($5, estado)
         WHERE game_id = $6 AND torneo_id = $7`,
        [
          payload.division,
          payload.phas_id,
          payload.local,
          payload.visitor,
          payload.estado,
          Number(mapped.internal_id),
          tournamentId
        ]
      );
      await TournamentExternalEntity.upsertMapping({
        torneoId: tournamentId,
        entityType: 'game',
        externalId: game.external_id,
        internalId: Number(mapped.internal_id),
        payload: game.raw,
        keepEventsSynced: true
      });
    }
    return { action: 'updated', internalId: Number(mapped.internal_id) };
  }

  if (dryRun) return { action: 'created', internalId: null };
  const created = await Game.create(payload);
  const internalId = Number(created.game_id);
  await TournamentExternalEntity.upsertMapping({
    torneoId: tournamentId,
    entityType: 'game',
    externalId: game.external_id,
    internalId,
    payload: game.raw,
    keepEventsSynced: true
  });
  return { action: 'created', internalId };
}

async function applyScoreToGame({ tournamentId, score, dryRun }) {
  const gameMap = await TournamentExternalEntity.findMapping({
    torneoId: tournamentId,
    entityType: 'game',
    externalId: score.game_external_id
  });
  if (!gameMap) return { action: 'skipped', reason: `Partido no mapeado: ${score.game_external_id}` };
  if (dryRun) return { action: 'updated', internalId: Number(gameMap.internal_id) };

  const localScore = normalizeScore(score.local_score);
  const visitorScore = normalizeScore(score.visitor_score);
  const estado = normalizeGameStatus(score.status);
  const updatePayload = {
    torneo_id: tournamentId,
    estado
  };
  // Solo persistir marcador cuando el API entrega ambos goles; evita borrar scores en partidos sin resultado.
  if (localScore !== null && visitorScore !== null) {
    updatePayload.local_score = localScore;
    updatePayload.visitor_score = visitorScore;
  }

  const gameBefore = await Game.findById(Number(gameMap.internal_id));

  await Game.update(Number(gameMap.internal_id), updatePayload);
  const gameAfter = await Game.findById(Number(gameMap.internal_id));

  try {
    await propagateFinishedGameStats(
      tournamentId,
      Number(gameMap.internal_id),
      gameBefore,
      gameAfter
    );
  } catch (statsErr) {
    console.warn('[tournament2-sync] propagateFinishedGameStats:', statsErr.message);
  }

  await TournamentExternalEntity.upsertMapping({
    torneoId: tournamentId,
    entityType: 'game',
    externalId: score.game_external_id,
    internalId: Number(gameMap.internal_id),
    payload: score.raw,
    keepEventsSynced: true
  });
  return { action: 'updated', internalId: Number(gameMap.internal_id) };
}

async function runStep(stepName, items, handler, logContext) {
  const stats = initStats();
  for (const item of items) {
    const externalId = item.external_id || item.game_external_id || null;
    try {
      const result = await handler(item);
      const action = result?.action || 'skipped';
      if (action === 'created') stats.created += 1;
      else if (action === 'updated') stats.updated += 1;
      else stats.skipped += 1;
      if (result?.reason) stats.details.push(`${stepName}:${externalId} -> ${result.reason}`);
      if (!logContext.dryRun) {
        await TournamentExternalEntity.logSync({
          runId: logContext.runId,
          torneoId: logContext.tournamentId,
          step: stepName,
          entityType: stepName === 'scores' ? 'game' : stepName.slice(0, -1),
          externalId,
          internalId: result?.internalId || null,
          action,
          message: result?.reason || null
        });
      }
    } catch (error) {
      stats.errors += 1;
      stats.details.push(`${stepName}:${externalId} -> ${error.message}`);
      if (!logContext.dryRun) {
        await TournamentExternalEntity.logSync({
          runId: logContext.runId,
          torneoId: logContext.tournamentId,
          step: stepName,
          entityType: stepName === 'scores' ? 'game' : stepName.slice(0, -1),
          externalId,
          action: 'error',
          message: 'Fallo de sincronización',
          errorDetail: error.message
        });
      }
    }
  }
  return stats;
}

async function syncTournament2InitialSeed(options = {}) {
  const cfg = getTournament2SyncConfig();
  validateTournament2SyncConfig(cfg);
  const dryRun = options.dryRun === true;
  const runTeams = options.runTeams !== false;
  const runPlayers = options.runPlayers !== false;
  const forceSeed = options.forceSeed === true;
  const runId = options.runId || createRunId();
  const tournamentId = TARGET_TOURNAMENT_ID;
  const actorUserId = Number(cfg.actorUserId);
  const actor = await findUserById(actorUserId);
  if (!actor) {
    throw new Error(`TOURNAMENT_2_SYNC_ACTOR_USER_ID=${actorUserId} no existe en users`);
  }
  await ensureTournamentExists(tournamentId);
  if (!forceSeed && !dryRun && (await hasCompletedInitialSeed(tournamentId))) {
    return {
      runId,
      tournamentId,
      dryRun,
      step: 'initial_seed',
      skipped: true,
      byStep: {
        teams: { ...initStats(), skipped: runTeams ? 1 : 0 },
        players: { ...initStats(), skipped: runPlayers ? 1 : 0 }
      }
    };
  }

  const client = createExternalApiClient(cfg);
  const teamsPayload = await client.fetchTeams();
  const summary = {
    runId,
    tournamentId,
    dryRun,
    totals: { created: 0, updated: 0, skipped: 0, errors: 0 },
    byStep: {}
  };

  if (runTeams) {
    const teams = mapTeamsPayload(teamsPayload);
    const stats = await runStep(
      'teams',
      teams,
      (item) => upsertTeam({ tournamentId, team: item, dryRun }),
      { runId, tournamentId, dryRun }
    );
    summary.byStep.teams = stats;
  }

  if (runPlayers) {
    const playerColumnsMeta = await getPlayerNumberColumn();
    const playerMeta = {
      ...playerColumnsMeta,
      numberCache: new Map()
    };
    const players = mapPlayersPayload(teamsPayload);
    const stats = await runStep(
      'players',
      players,
      (item) => upsertPlayer({ tournamentId, player: item, dryRun, playerMeta }),
      { runId, tournamentId, dryRun }
    );
    summary.byStep.players = stats;
  }

  for (const stats of Object.values(summary.byStep)) {
    summary.totals.created += stats.created || 0;
    summary.totals.updated += stats.updated || 0;
    summary.totals.skipped += stats.skipped || 0;
    summary.totals.errors += stats.errors || 0;
  }

  if (!dryRun) {
    await TournamentExternalEntity.logSync({
      runId,
      torneoId: tournamentId,
      step: 'initial_seed',
      action: 'completed',
      message: `football-data seed: teams=${summary.byStep.teams?.created || 0}/${summary.byStep.teams?.updated || 0}, players=${summary.byStep.players?.created || 0}/${summary.byStep.players?.updated || 0}`
    });
  }

  return summary;
}

async function syncTournament2MatchesTick(options = {}) {
  const cfg = getTournament2SyncConfig();
  validateTournament2SyncConfig(cfg);
  const dryRun = options.dryRun === true;
  const runSchedule = options.runSchedule !== false;
  const runScores = options.runScores !== false;
  const gameExternalIdFilter = options.gameExternalId ? String(options.gameExternalId).trim() : '';
  const runId = options.runId || createRunId();
  const tournamentId = TARGET_TOURNAMENT_ID;
  await ensureTournamentExists(tournamentId);
  const client = createExternalApiClient(cfg);
  const matchesPayload = await client.fetchMatches();

  const summary = {
    runId,
    tournamentId,
    dryRun,
    totals: { created: 0, updated: 0, skipped: 0, errors: 0 },
    byStep: {}
  };

  if (runSchedule) {
    const games = mapSchedulePayload(matchesPayload);
    const stats = await runStep(
      'schedule',
      games,
      (item) =>
        upsertGameFromSchedule({
          tournamentId,
          game: item,
          dryRun,
          preserveDateTime: options.preserveDateTime === true
        }),
      { runId, tournamentId, dryRun }
    );
    summary.byStep.schedule = stats;
  }

  if (runScores) {
    const scoreRows = mapScoresPayload(matchesPayload);
    const rows = gameExternalIdFilter
      ? scoreRows.filter((row) => row.game_external_id === gameExternalIdFilter)
      : scoreRows;
    const stats = await runStep(
      'scores',
      rows,
      (item) => applyScoreToGame({ tournamentId, score: item, dryRun }),
      { runId, tournamentId, dryRun }
    );
    summary.byStep.scores = stats;
  }

  for (const stats of Object.values(summary.byStep)) {
    summary.totals.created += stats.created || 0;
    summary.totals.updated += stats.updated || 0;
    summary.totals.skipped += stats.skipped || 0;
    summary.totals.errors += stats.errors || 0;
  }

  if (!dryRun) {
    await TournamentExternalEntity.logSync({
      runId,
      torneoId: tournamentId,
      step: 'cron_tick',
      action: summary.totals.errors > 0 ? 'error' : 'updated',
      message: `football-data tick: created=${summary.totals.created}, updated=${summary.totals.updated}, skipped=${summary.totals.skipped}, errors=${summary.totals.errors}`
    });
  }

  return summary;
}

async function syncTournament2(options = {}) {
  const cfg = getTournament2SyncConfig();
  validateTournament2SyncConfig(cfg);
  if (cfg.targetTournamentId !== TARGET_TOURNAMENT_ID) {
    throw new Error(`Configuración inválida: targetTournamentId debe ser ${TARGET_TOURNAMENT_ID}`);
  }
  const selectedStep = options.step ? String(options.step).trim() : '';
  const steps = normalizeStepSelection(selectedStep);
  const runId = createRunId();

  const summary = {
    runId,
    tournamentId: TARGET_TOURNAMENT_ID,
    dryRun: options.dryRun === true,
    steps,
    totals: { created: 0, updated: 0, skipped: 0, errors: 0 },
    byStep: {}
  };

  if (steps.includes('teams') || steps.includes('players')) {
    const seedRes = await syncTournament2InitialSeed({
      runId,
      dryRun: options.dryRun === true,
      runTeams: steps.includes('teams'),
      runPlayers: steps.includes('players') || steps.includes('teams'),
      forceSeed: options.forceSeed === true
    });
    Object.assign(summary.byStep, seedRes.byStep || {});
  }

  if (steps.includes('schedule') || steps.includes('scores')) {
    const tickRes = await syncTournament2MatchesTick({
      runId,
      dryRun: options.dryRun === true,
      runSchedule: steps.includes('schedule'),
      runScores: steps.includes('scores'),
      gameExternalId: options.gameExternalId
    });
    Object.assign(summary.byStep, tickRes.byStep || {});
  }

  if (steps.includes('events')) {
    summary.byStep.events = {
      ...initStats(),
      skipped: 1,
      details: ['football-data WC/matches no expone timeline completo de eventos en este flujo']
    };
  }

  for (const stats of Object.values(summary.byStep)) {
    summary.totals.created += stats.created || 0;
    summary.totals.updated += stats.updated || 0;
    summary.totals.skipped += stats.skipped || 0;
    summary.totals.errors += stats.errors || 0;
  }

  return summary;
}

module.exports = {
  syncTournament2,
  syncTournament2InitialSeed,
  syncTournament2MatchesTick
};
