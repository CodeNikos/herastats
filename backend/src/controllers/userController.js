const User = require('../models/User');
const TournamentMember = require('../models/TournamentMember');
const crypto = require('crypto');
const { sendPasswordSetupRequest } = require('../services/passwordSetupService');
const { normalizeRole } = require('../utils/userRoles');
const { assertTournamentInviteAccess } = require('../services/tournamentAccess');

const MANAGEABLE_ROLES = new Set(['admin', 'anotador']);

const listUsers = async (_req, res) => {
  try {
    const users = await User.listAll();
    const usersWithNormalizedRoles = users.map((u) => ({
      ...u,
      role: normalizeRole(u.role) || u.role
    }));
    return res.json({
      success: true,
      data: { users: usersWithNormalizedRoles }
    });
  } catch (error) {
    console.error('Error en listUsers:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener usuarios'
    });
  }
};

const createUser = async (req, res) => {
  try {
    const inviterRole = normalizeRole(req.user?.role);
    if (inviterRole !== 'superuser' && inviterRole !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para invitar usuarios'
      });
    }

    const { email, role, torneo_id: torneoIdRaw } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const normalizedRole = role ? String(role).trim().toLowerCase() : 'anotador';
    const torneoId = Number(torneoIdRaw);

    if (!normalizedEmail) {
      return res.status(400).json({
        success: false,
        message: 'Email es obligatorio'
      });
    }

    if (!Number.isInteger(torneoId) || torneoId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'torneo_id es obligatorio y debe ser un número válido'
      });
    }

    if (!MANAGEABLE_ROLES.has(normalizedRole)) {
      return res.status(400).json({
        success: false,
        message: 'El rol debe ser admin o anotador'
      });
    }

    const access = await assertTournamentInviteAccess(req, torneoId);
    if (!access.ok) {
      return res.status(access.status).json({
        success: false,
        message: access.message
      });
    }

    const existingUser = await User.findByEmail(normalizedEmail);
    if (existingUser) {
      if (normalizeRole(existingUser.role) === 'superuser') {
        return res.status(400).json({
          success: false,
          message: 'No se puede asignar un superuser a un torneo'
        });
      }

      const membership = await TournamentMember.add({
        userId: existingUser.id,
        torneoId,
        invitedBy: req.user.id
      });

      if (!membership) {
        return res.status(400).json({
          success: false,
          message: 'El usuario ya existe y ya tiene acceso a este torneo'
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Usuario existente asignado al torneo',
        data: {
          user: {
            id: existingUser.id,
            email: existingUser.email,
            role: normalizeRole(existingUser.role) || existingUser.role,
            name: existingUser.name,
            lname: existingUser.lname,
            created_at: existingUser.created_at
          },
          membership,
          password_setup_email_sent: false
        }
      });
    }

    const temporaryPassword = crypto.randomBytes(24).toString('hex');
    const created = await User.create({
      email: normalizedEmail,
      password: temporaryPassword,
      role: normalizedRole
    });

    await TournamentMember.add({
      userId: created.id,
      torneoId,
      invitedBy: req.user.id
    });

    let mailResult = { skipped: true };
    try {
      mailResult = await sendPasswordSetupRequest(created.email, created.id);
    } catch (mailError) {
      console.error('Error enviando correo de configuración de contraseña:', mailError);
    }

    return res.status(201).json({
      success: true,
      message: mailResult?.skipped
        ? 'Usuario creado y asignado al torneo. SMTP no configurado: no se pudo enviar el correo para definir contraseña.'
        : 'Usuario creado, asignado al torneo y correo de activación enviado.',
      data: {
        user: created,
        torneo_id: torneoId,
        password_setup_email_sent: !mailResult?.skipped
      }
    });
  } catch (error) {
    console.error('Error en createUser:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al crear usuario'
    });
  }
};

const updateUserRole = async (req, res) => {
  try {
    const userId = Number(req.params.id);
    const role = String(req.body?.role || '').trim().toLowerCase();

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'ID de usuario inválido'
      });
    }

    if (!MANAGEABLE_ROLES.has(role)) {
      return res.status(400).json({
        success: false,
        message: 'El rol debe ser admin o anotador'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    if (normalizeRole(user.role) === 'superuser') {
      return res.status(400).json({
        success: false,
        message: 'No se puede modificar el rol de un superuser'
      });
    }

    const updated = await User.updateRole(userId, role);
    return res.json({
      success: true,
      message: 'Rol actualizado exitosamente',
      data: { user: updated }
    });
  } catch (error) {
    console.error('Error en updateUserRole:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al actualizar rol de usuario'
    });
  }
};

const deleteUser = async (req, res) => {
  try {
    const userId = Number(req.params.id);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'ID de usuario inválido'
      });
    }

    if (req.user?.id === userId) {
      return res.status(400).json({
        success: false,
        message: 'No puedes eliminar tu propio usuario'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    if (normalizeRole(user.role) === 'superuser') {
      return res.status(400).json({
        success: false,
        message: 'No se puede eliminar un superuser'
      });
    }

    await User.deleteById(userId);
    return res.json({
      success: true,
      message: 'Usuario eliminado exitosamente'
    });
  } catch (error) {
    console.error('Error en deleteUser:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al eliminar usuario'
    });
  }
};

module.exports = {
  listUsers,
  createUser,
  updateUserRole,
  deleteUser
};
