const express = require('express');
const {
  collectVisit,
  getSummary,
  getVisits,
  getTimeseries,
  getCountries
} = require('../controllers/analyticsController');
const { authenticate, requireRole } = require('../middleware/auth');
const { analyticsCollectRateLimiter } = require('../middleware/security');

const router = express.Router();

router.post('/collect', analyticsCollectRateLimiter, collectVisit);

router.use(authenticate);
router.get('/summary', requireRole('superuser'), getSummary);
router.get('/visits', requireRole('superuser'), getVisits);
router.get('/timeseries', requireRole('superuser'), getTimeseries);
router.get('/countries', requireRole('superuser'), getCountries);

module.exports = router;
