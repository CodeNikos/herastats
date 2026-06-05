const express = require('express');
const {
  listUsers,
  createUser,
  updateUserRole,
  deleteUser
} = require('../controllers/userController');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

router.post('/', createUser);

router.get('/', requireRole('superuser'), listUsers);
router.put('/:id', requireRole('superuser'), updateUserRole);
router.delete('/:id', requireRole('superuser'), deleteUser);

module.exports = router;
