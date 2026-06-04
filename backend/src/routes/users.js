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
router.use(requireRole('superuser'));

router.get('/', listUsers);
router.post('/', createUser);
router.put('/:id', updateUserRole);
router.delete('/:id', deleteUser);

module.exports = router;
