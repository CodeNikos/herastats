const express = require('express');
const {
  register,
  login,
  verifyToken,
  setPassword,
  updateProfile
} = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { authRateLimiter } = require('../middleware/security');

const router = express.Router();

router.post('/register', authRateLimiter, register);
router.post('/login', authRateLimiter, login);
router.get('/verify', verifyToken);
router.post('/set-password', authRateLimiter, setPassword);
router.patch('/profile', authenticate, updateProfile);

module.exports = router;
