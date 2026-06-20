const express = require('express');
const { listSports, createSport } = require('../controllers/sportController');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, requireRole('admin', 'superuser'), listSports);
router.post('/', authenticate, requireRole('superuser'), createSport);

module.exports = router;
