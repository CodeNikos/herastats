const app = require('./app');
const User = require('./models/User');
const {
  ensureDefaultSuperuserIfNeeded
} = require('./services/defaultSuperuserSeed');
const TournamentConfig = require('./models/TournamentConfig');
const Phase = require('./models/Phase');
const Team = require('./models/Team');
const Player = require('./models/Player');
const Game = require('./models/Game');
const GameEvent = require('./models/GameEvent');
const GameBracketLink = require('./models/GameBracketLink');
const RankedCanvas = require('./models/RankedCanvas');
const SpiritSurveyInvite = require('./models/SpiritSurveyInvite');
const SpiritSurveyResponse = require('./models/SpiritSurveyResponse');
const TournamentMember = require('./models/TournamentMember');
const Sport = require('./models/Sport');
const TournamentCreationToken = require('./models/TournamentCreationToken');
const TournamentExternalEntity = require('./models/TournamentExternalEntity');
const PageVisit = require('./models/PageVisit');
const { startTournament2Worker } = require('./services/tournament2Sync/worker');
const { initGeoReader } = require('./services/geoipService');

const PORT = process.env.PORT || 5000;

const initializeTables = async () => {
  try {
    await User.createTable();
    console.log('Tabla de usuarios inicializada');
    await ensureDefaultSuperuserIfNeeded();

    await Sport.createTable();
    console.log('Tabla sports inicializada');

    await TournamentConfig.createTable();
    console.log('Tabla de torneos inicializada');

    await TournamentMember.createTable();
    console.log('Tabla tournament_members inicializada');

    await Phase.createTable();
    console.log('Tabla de fases inicializada');

    await Team.createTable();
    console.log('Tabla de equipos inicializada');

    await Player.createTable();
    console.log('Tabla de jugadores inicializada');

    await Game.createTable();
    console.log('Tabla de juegos inicializada');

    await GameEvent.createTable();
    console.log('Tabla game_events inicializada');

    await GameBracketLink.createTable();
    console.log('Tabla de enlaces de bracket inicializada');

    await RankedCanvas.createTable();
    console.log('Tabla de lienzos ranked inicializada');

    await SpiritSurveyInvite.createTable();
    console.log('Tabla spirit_survey_invite inicializada');

    await SpiritSurveyResponse.createTable();
    console.log('Tabla spirit_survey_response inicializada');

    await TournamentCreationToken.createTable();
    console.log('Tabla tournament_creation_tokens inicializada');

    await TournamentExternalEntity.createTable();
    console.log('Tablas de sincronización externa inicializadas');

    await PageVisit.createTable();
    console.log('Tabla page_visits inicializada');

    await initGeoReader();

    const retentionDays = Number(process.env.ANALYTICS_RETENTION_DAYS) || 90;
    try {
      const purged = await PageVisit.purgeOlderThan(retentionDays);
      if (purged > 0) {
        console.log(`Analytics: ${purged} registros antiguos eliminados`);
      }
    } catch (purgeErr) {
      console.warn('Analytics: no se pudo purgar registros antiguos:', purgeErr.message);
    }

    try {
      await startTournament2Worker();
    } catch (workerError) {
      console.error('Error inicializando worker torneo 2:', workerError.message || workerError);
    }
  } catch (err) {
    console.error('Error inicializando tablas:', err);
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  }
};

initializeTables();

console.log('Rutas registradas:');
console.log('  - POST /api/config/tournament');
console.log('  - POST /api/config/tournament/:id/bracket/sync-playoff-advances');
console.log('  - PATCH /api/config/tournament/:id/games/:gameId/live-clock');
console.log('  - POST /api/config/tournament/:id/games/:gameId/ps-game-upd');
console.log('  - POST /api/config/upload-image');
console.log('  - POST /api/spirit-survey/register-manual');

const server = app.listen(PORT, (err) => {
  if (err) {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `No se pudo iniciar: el puerto ${PORT} ya está en uso. ` +
          'Cierra el otro proceso o cambia PORT en tu .env.'
      );
    } else {
      console.error('Error al iniciar el servidor HTTP:', err.message || err);
    }
    process.exit(1);
    return;
  }
  console.log(`Servidor corriendo en puerto ${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `No se pudo enlazar el puerto ${PORT} (ya en uso). Detén el proceso que lo ocupa e inténtalo de nuevo.`
    );
  } else {
    console.error('Error del servidor HTTP:', err.message || err);
  }
  process.exit(1);
});
