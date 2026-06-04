const express = require('express');
const { getSpiritInvite, postSpiritRespond, postSpiritSurveyManual } = require('../controllers/spiritSurveyController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.get('/invite', getSpiritInvite);
router.post('/respond', postSpiritRespond);
/** Misma lógica que POST /api/config/tournament/:id/games/:gameId/spirit-survey/manual (IDs también en JSON). */
router.post('/register-manual', authenticate, postSpiritSurveyManual);

module.exports = router;
