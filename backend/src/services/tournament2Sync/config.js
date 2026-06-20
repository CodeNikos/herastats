const { DEFAULT_TARGET_TOURNAMENT_ID } = require('./constants');

function parseBool(raw, fallback = false) {
  if (raw == null) return fallback;
  const s = String(raw).trim().toLowerCase();
  if (!s) return fallback;
  return s === '1' || s === 'true' || s === 'yes';
}

function parseIntSafe(raw, fallback) {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

function mustEnv(name, { allowEmpty = false } = {}) {
  const value = process.env[name];
  if (allowEmpty) return value || '';
  if (value == null || String(value).trim() === '') {
    throw new Error(`Variable requerida no definida: ${name}`);
  }
  return String(value).trim();
}

function getTournament2SyncConfig() {
  const enabled = parseBool(process.env.TOURNAMENT_2_SYNC_ENABLED, false);
  const baseUrl = process.env.TOURNAMENT_2_EXTERNAL_API_BASE_URL
    ? String(process.env.TOURNAMENT_2_EXTERNAL_API_BASE_URL).trim()
    : 'https://api.football-data.org/v4';
  const actorUserId = parseIntSafe(process.env.TOURNAMENT_2_SYNC_ACTOR_USER_ID, NaN);
  const targetTournamentId = parseIntSafe(
    process.env.TOURNAMENT_2_SYNC_TARGET_TOURNAMENT_ID,
    DEFAULT_TARGET_TOURNAMENT_ID
  );

  return {
    targetTournamentId,
    enabled,
    baseUrl,
    apiKey: process.env.TOURNAMENT_2_EXTERNAL_API_KEY
      ? String(process.env.TOURNAMENT_2_EXTERNAL_API_KEY).trim()
      : '',
    apiKeyHeader: process.env.TOURNAMENT_2_EXTERNAL_API_KEY_HEADER
      ? String(process.env.TOURNAMENT_2_EXTERNAL_API_KEY_HEADER).trim()
      : 'X-Auth-Token',
    apiKeyPrefix: process.env.TOURNAMENT_2_EXTERNAL_API_KEY_PREFIX
      ? String(process.env.TOURNAMENT_2_EXTERNAL_API_KEY_PREFIX).trim()
      : '',
    timeoutMs: parseIntSafe(process.env.TOURNAMENT_2_EXTERNAL_TIMEOUT_MS, 15000),
    retryCount: parseIntSafe(process.env.TOURNAMENT_2_EXTERNAL_RETRY_COUNT, 1),
    teamsPath: process.env.TOURNAMENT_2_EXTERNAL_TEAMS_PATH || '/competitions/WC/teams',
    schedulePath: process.env.TOURNAMENT_2_EXTERNAL_SCHEDULE_PATH || '/competitions/WC/matches',
    scoresPath: process.env.TOURNAMENT_2_EXTERNAL_SCORES_PATH || '/competitions/WC/matches',
    gameEventsPathTemplate:
      process.env.TOURNAMENT_2_EXTERNAL_GAME_EVENTS_PATH_TEMPLATE || '',
    actorUserId,
    cronMinutes: parseIntSafe(process.env.TOURNAMENT_2_CRON_MINUTES, 30),
    initialSeedOnBoot: parseBool(process.env.TOURNAMENT_2_INITIAL_SEED_ON_BOOT, true)
  };
}

function validateTournament2SyncConfig(cfg) {
  if (!cfg.enabled) {
    throw new Error('TOURNAMENT_2_SYNC_ENABLED no está activo');
  }
  if (!Number.isFinite(cfg.actorUserId) || cfg.actorUserId <= 0) {
    throw new Error('TOURNAMENT_2_SYNC_ACTOR_USER_ID es obligatorio y debe ser numérico');
  }
  if (!cfg.apiKey) {
    mustEnv('TOURNAMENT_2_EXTERNAL_API_KEY');
  }
  if (!Number.isFinite(cfg.targetTournamentId) || cfg.targetTournamentId <= 0) {
    throw new Error('TOURNAMENT_2_SYNC_TARGET_TOURNAMENT_ID debe ser un entero positivo');
  }
  if (!Number.isFinite(cfg.cronMinutes) || cfg.cronMinutes <= 0) {
    throw new Error('TOURNAMENT_2_CRON_MINUTES debe ser un entero positivo');
  }
}

module.exports = {
  getTournament2SyncConfig,
  validateTournament2SyncConfig
};
