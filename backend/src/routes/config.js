const express = require('express');
const multer = require('multer');
const {
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
} = require('../controllers/configController');
const {
  getTournamentSpiritStats,
  getGameSpiritScores,
  postSpiritSurveyManual
} = require('../controllers/spiritSurveyController');
const { uploadImage } = require('../controllers/uploadController');
const { authenticate, optionalAuthenticate, requireRole } = require('../middleware/auth');
const { requireTournamentAdmin, requireScorer } = require('../middleware/tournamentRbac');
const { requireTournamentEditAccess } = require('../middleware/tournamentAccess');
const {
  listTournamentMembers,
  addTournamentMember,
  removeTournamentMember
} = require('../controllers/tournamentMemberController');
const { imageFileFilter, excelFileFilter } = require('../middleware/uploadFilters');

const router = express.Router();

const storage = multer.memoryStorage();
const uploadImageMulter = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: imageFileFilter
});
const uploadExcelMulter = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: excelFileFilter
});

// Rutas de configuración de torneos
// IMPORTANTE: Las rutas más específicas deben ir ANTES que las genéricas
// Crear, actualizar y eliminar requieren autenticación
router.post('/tournament', authenticate, requireTournamentAdmin, createTournament);
// Rutas de fases (más específicas, deben ir antes de /tournament/:id)
router.get('/tournament/:id/members', authenticate, requireTournamentEditAccess, listTournamentMembers);
router.post('/tournament/:id/members', authenticate, requireTournamentEditAccess, addTournamentMember);
router.delete('/tournament/:id/members/:userId', authenticate, requireTournamentEditAccess, removeTournamentMember);
router.get('/tournament/:id/phases', getPhases);
router.post('/tournament/:id/phases', authenticate, requireTournamentAdmin, requireTournamentEditAccess, savePhases);
// Rutas de equipos
router.get('/tournament/:id/teams', getTeams);
router.put('/tournament/:id/team-groups', authenticate, requireTournamentAdmin, requireTournamentEditAccess, saveTeamGroups);
router.post('/tournament/:id/teams', authenticate, requireTournamentAdmin, requireTournamentEditAccess, createTeam);
router.put('/tournament/:id/teams/:teamId', authenticate, requireTournamentAdmin, requireTournamentEditAccess, updateTeam);
router.delete('/tournament/:id/teams/:teamId', authenticate, requireTournamentAdmin, requireTournamentEditAccess, deleteTeam);
// Rutas de juegos
router.get('/tournament/:id/games', getGames);
router.get('/tournament/:id/goal-totals', getTournamentGoalTotalsBatch);
router.get('/tournament/:id/placements', getTournamentPlacements);
router.get('/tournament/:id/games/:gameId/goal-totals', getGameGoalTotals);
router.get('/tournament/:id/games/:gameId/timeout-counts', getGameTimeoutCounts);
router.get('/tournament/:id/games/:gameId/events', getGameEvents);
router.get('/tournament/:id/games/:gameId/events/template', authenticate, requireScorer, requireTournamentEditAccess, downloadGameEventsTemplate);
router.post('/tournament/:id/games/:gameId/events/import', authenticate, requireScorer, requireTournamentEditAccess, uploadExcelMulter.single('file'), bulkImportGameEvents);
router.get('/tournament/:id/games/:gameId/player-rank', getGamePlayerRank);
router.get('/tournament/:id/games/:gameId/spirit-scores', getGameSpiritScores);
router.post('/tournament/:id/games/:gameId/spirit-survey/manual', authenticate, requireTournamentEditAccess, postSpiritSurveyManual);
router.get('/tournament/:id/stats/player-events', getTournamentPlayerEventStats);
router.get('/tournament/:id/spirit-stats', authenticate, requireTournamentEditAccess, getTournamentSpiritStats);
router.post('/tournament/:id/games/:gameId/events', authenticate, requireScorer, requireTournamentEditAccess, createGameEvent);
router.patch('/tournament/:id/games/:gameId/events/:eventId', authenticate, requireScorer, requireTournamentEditAccess, updateGameEvent);
router.delete('/tournament/:id/games/:gameId/events/:eventId', authenticate, requireScorer, requireTournamentEditAccess, deleteGameEvent);
router.post('/tournament/:id/games/:gameId/forfeit', authenticate, requireScorer, requireTournamentEditAccess, postGameForfeit);
router.post('/tournament/:id/games', authenticate, requireTournamentAdmin, requireTournamentEditAccess, createGame);
router.patch('/tournament/:id/games/:gameId/estado', authenticate, requireScorer, requireTournamentEditAccess, patchGameEstado);
router.patch('/tournament/:id/games/:gameId/live-clock', authenticate, requireScorer, requireTournamentEditAccess, patchLiveClock);
router.post('/tournament/:id/games/:gameId/ps-game-upd', authenticate, requireScorer, requireTournamentEditAccess, runPsGameUpd);
router.put('/tournament/:id/games/:gameId', authenticate, requireTournamentAdmin, requireTournamentEditAccess, updateGame);
router.delete('/tournament/:id/games/:gameId', authenticate, requireTournamentAdmin, requireTournamentEditAccess, deleteGame);
// Rutas de bracket basadas en juegos
router.get('/tournament/:id/bracket', getBracket);
router.put('/tournament/:id/bracket/links', authenticate, requireTournamentAdmin, requireTournamentEditAccess, saveBracketLinks);
router.get('/tournament/:id/bracket/ranked-canvases', getRankedCanvases);
router.put('/tournament/:id/bracket/ranked-canvases', authenticate, requireTournamentAdmin, requireTournamentEditAccess, saveRankedCanvases);
router.post('/tournament/:id/bracket/games', authenticate, requireTournamentAdmin, requireTournamentEditAccess, createBracketGame);
router.put('/tournament/:id/bracket/games/:gameId', authenticate, requireTournamentAdmin, requireTournamentEditAccess, updateBracketGame);
router.delete('/tournament/:id/bracket/games/:gameId', authenticate, requireTournamentAdmin, requireTournamentEditAccess, deleteBracketGame);
router.post('/tournament/:id/bracket/sync-playoff-advances', authenticate, requireTournamentAdmin, requireTournamentEditAccess, syncPlayoffBracketAdvances);
router.post('/tournament/:id/playoff/sync-advances', authenticate, requireTournamentAdmin, requireTournamentEditAccess, syncPlayoffBracketAdvances);
// Rutas de jugadores
router.get('/tournament/:id/players', getPlayers);
router.post('/tournament/:id/players', authenticate, requireTournamentAdmin, requireTournamentEditAccess, createPlayer);
router.post('/tournament/:id/players/bulk', authenticate, requireTournamentAdmin, requireTournamentEditAccess, createPlayersBulk);
router.put('/tournament/:id', authenticate, requireTournamentAdmin, requireTournamentEditAccess, updateTournament);
router.delete('/tournament/:id', authenticate, requireTournamentAdmin, requireTournamentEditAccess, deleteTournament);
router.delete('/tournament/:id/reset', authenticate, requireRole('superuser'), requireTournamentEditAccess, resetTournament);
router.get('/tournament/:id', getTournamentById);
// GET torneos: sin login = catálogo completo; con login, admin/superuser = todos; resto = solo los suyos (created_by)
router.get('/tournament', optionalAuthenticate, getTournaments);

// Ruta para subir imágenes
router.post('/upload-image', authenticate, requireTournamentAdmin, uploadImageMulter.single('image'), (req, res, next) => {
  console.log('Ruta /upload-image llamada');
  console.log('Headers:', req.headers['content-type']);
  console.log('Body keys:', Object.keys(req.body || {}));
  console.log('File recibido:', req.file ? 'Sí' : 'No');
  
  if (!req.file) {
    console.log('Error: No se recibió ningún archivo');
    console.log('Request body:', req.body);
    return res.status(400).json({
      success: false,
      message: 'No se recibió ningún archivo. Asegúrate de enviar el archivo con el campo "image".'
    });
  }
  
  console.log('Detalles del archivo:', {
    originalname: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.size,
    fieldname: req.file.fieldname
  });
  
  uploadImage(req, res, next);
});

module.exports = router;

