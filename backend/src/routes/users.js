const express = require('express');
const {
  listUsers,
  createUser,
  updateUserRole,
  assignTournamentToken,
  listUserTournamentTokens,
  updateTournamentToken,
  revokeTournamentToken,
  deleteUser
} = require('../controllers/userController');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

router.post('/', createUser);

router.get('/', requireRole('superuser'), listUsers);
router.get('/:id/tournament-tokens', requireRole('superuser'), listUserTournamentTokens);
router.post('/:id/tournament-tokens', requireRole('superuser'), assignTournamentToken);
router.put('/:id/tournament-tokens/:tokenId', requireRole('superuser'), updateTournamentToken);
router.delete('/:id/tournament-tokens/:tokenId', requireRole('superuser'), revokeTournamentToken);
router.put('/:id', requireRole('superuser'), updateUserRole);
router.delete('/:id', requireRole('superuser'), deleteUser);

module.exports = router;
