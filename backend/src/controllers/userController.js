const User = require('../models/User');
const TournamentMember = require('../models/TournamentMember');
const TournamentCreationToken = require('../models/TournamentCreationToken');
const crypto = require('crypto');
const { sendPasswordSetupRequest } = require('../services/passwordSetupService');
const { normalizeRole } = require('../utils/userRoles');
const { assertTournamentInviteAccess } = require('../services/tournamentAccess');

const MANAGEABLE_ROLES = new Set(['admin', 'anotador']);

function validateTournamentTokenInput(tokenRaw) {
  const token = TournamentCreationToken.normalizeTokenValue(tokenRaw);
  if (!token) {
    return { ok: false, message: 'El token no puede estar vacío' };
  }
  if (token.length < 4 || token.length > 64) {
    return { ok: false, message: 'El token debe tener entre 4 y 64 caracteres' };
  }
  if (!/^[A-Za-z0-9_-]+$/.test(token)) {
    return {
      ok: false,
      message: 'El token solo puede contener letras, números, guiones y guiones bajos'
    };
  }
  return { ok: true, token };
}

async function attachTokenDetails(users) {
  const ids = users.map((u) => u.id);
  const counts = await TournamentCreationToken.countAvailableByUserIds(ids);
  const allTokens = await TournamentCreationToken.listByUserIds(ids);
  const tokensByUser = new Map();
  for (const tokenRow of allTokens) {
    const list = tokensByUser.get(tokenRow.user_id) || [];
    list.push(tokenRow);
    tokensByUser.set(tokenRow.user_id, list);
  }
  return users.map((u) => ({
    ...u,
    tournament_tokens_available: counts.get(u.id) || 0,
    tournament_tokens: tokensByUser.get(u.id) || []
  }));
}

const listUsers = async (_req, res) => {
  try {
    const users = await User.listAll();
    const usersWithNormalizedRoles = users.map((u) => ({
      ...u,
      role: normalizeRole(u.role) || u.role
    }));
    const enriched = await attachTokenDetails(usersWithNormalizedRoles);
    return res.json({
      success: true,
      data: { users: enriched }
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

    const { email, role, torneo_id: torneoIdRaw, tournament_token: tournamentTokenRaw } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const normalizedRole = role ? String(role).trim().toLowerCase() : 'anotador';
    const torneoIdProvided =
      torneoIdRaw !== undefined && torneoIdRaw !== null && String(torneoIdRaw).trim() !== '';
    const torneoId = torneoIdProvided ? Number(torneoIdRaw) : null;
    const hasTorneoId = Number.isInteger(torneoId) && torneoId > 0;

    if (!normalizedEmail) {
      return res.status(400).json({
        success: false,
        message: 'Email es obligatorio'
      });
    }

    if (!MANAGEABLE_ROLES.has(normalizedRole)) {
      return res.status(400).json({
        success: false,
        message: 'El rol debe ser admin o anotador'
      });
    }

    if (normalizedRole === 'anotador' && !hasTorneoId) {
      return res.status(400).json({
        success: false,
        message: 'torneo_id es obligatorio para usuarios con rol anotador'
      });
    }

    if (torneoIdProvided && !hasTorneoId) {
      return res.status(400).json({
        success: false,
        message: 'torneo_id debe ser un número válido'
      });
    }

    const tournamentTokenProvided =
      tournamentTokenRaw !== undefined &&
      tournamentTokenRaw !== null &&
      String(tournamentTokenRaw).trim() !== '';
    let tournamentToken = null;
    if (tournamentTokenProvided) {
      if (inviterRole !== 'superuser') {
        return res.status(403).json({
          success: false,
          message: 'Solo el superusuario puede asignar tokens de creación de torneo'
        });
      }
      if (normalizedRole !== 'admin') {
        return res.status(400).json({
          success: false,
          message: 'Los tokens de torneo solo aplican a usuarios con rol administrador'
        });
      }
      const tokenCheck = validateTournamentTokenInput(tournamentTokenRaw);
      if (!tokenCheck.ok) {
        return res.status(400).json({
          success: false,
          message: tokenCheck.message
        });
      }
      tournamentToken = tokenCheck.token;
      const existingToken = await TournamentCreationToken.findByToken(tournamentToken);
      if (existingToken) {
        return res.status(400).json({
          success: false,
          message: 'Ese token ya está asignado a otro usuario'
        });
      }
    }

    if (hasTorneoId) {
      const access = await assertTournamentInviteAccess(req, torneoId);
      if (!access.ok) {
        return res.status(access.status).json({
          success: false,
          message: access.message
        });
      }
    }

    const existingUser = await User.findByEmail(normalizedEmail);
    if (existingUser) {
      if (normalizeRole(existingUser.role) === 'superuser') {
        return res.status(400).json({
          success: false,
          message: 'No se puede asignar un superuser a un torneo'
        });
      }

      if (!hasTorneoId) {
        return res.status(400).json({
          success: false,
          message: 'El usuario ya existe'
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

    if (hasTorneoId) {
      await TournamentMember.add({
        userId: created.id,
        torneoId,
        invitedBy: req.user.id
      });
    }

    let assignedToken = null;
    if (tournamentToken) {
      assignedToken = await TournamentCreationToken.assign({
        userId: created.id,
        token: tournamentToken,
        assignedBy: req.user.id,
        source: 'manual'
      });
    }

    let mailResult = { skipped: true };
    try {
      mailResult = await sendPasswordSetupRequest(created.email, created.id);
    } catch (mailError) {
      console.error('Error enviando correo de configuración de contraseña:', mailError);
    }

    const assignedMsg = hasTorneoId ? ' y asignado al torneo' : '';
    const tokenMsg = assignedToken ? ' Token de torneo asignado.' : '';
    return res.status(201).json({
      success: true,
      message: mailResult?.skipped
        ? `Usuario creado${assignedMsg}.${tokenMsg} SMTP no configurado: no se pudo enviar el correo para definir contraseña.`
        : `Usuario creado${assignedMsg}${tokenMsg} y correo de activación enviado.`,
      data: {
        user: {
          ...created,
          tournament_tokens_available: assignedToken ? 1 : 0
        },
        torneo_id: hasTorneoId ? torneoId : null,
        tournament_token: assignedToken,
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

const assignTournamentToken = async (req, res) => {
  try {
    const userId = Number(req.params.id);
    const tokenCheck = validateTournamentTokenInput(req.body?.token);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'ID de usuario inválido'
      });
    }

    if (!tokenCheck.ok) {
      return res.status(400).json({
        success: false,
        message: tokenCheck.message
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    const userRole = normalizeRole(user.role);
    if (userRole === 'superuser') {
      return res.status(400).json({
        success: false,
        message: 'No se asignan tokens al superusuario'
      });
    }
    if (userRole !== 'admin') {
      return res.status(400).json({
        success: false,
        message: 'Los tokens de torneo solo aplican a administradores'
      });
    }

    const existingToken = await TournamentCreationToken.findByToken(tokenCheck.token);
    if (existingToken) {
      return res.status(400).json({
        success: false,
        message: 'Ese token ya está asignado'
      });
    }

    const assigned = await TournamentCreationToken.assign({
      userId,
      token: tokenCheck.token,
      assignedBy: req.user.id,
      source: 'manual'
    });

    const availableCount = (
      await TournamentCreationToken.countAvailableByUserIds([userId])
    ).get(userId) || 0;

    return res.status(201).json({
      success: true,
      message: 'Token de creación de torneo asignado',
      data: {
        token: assigned,
        user: {
          id: user.id,
          email: user.email,
          role: userRole,
          tournament_tokens_available: availableCount
        }
      }
    });
  } catch (error) {
    console.error('Error en assignTournamentToken:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al asignar token de torneo'
    });
  }
};

const listUserTournamentTokens = async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'ID de usuario inválido'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    const tokens = await TournamentCreationToken.listByUserId(userId);
    return res.json({
      success: true,
      data: { tokens }
    });
  } catch (error) {
    console.error('Error en listUserTournamentTokens:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener tokens del usuario'
    });
  }
};

const updateTournamentToken = async (req, res) => {
  try {
    const userId = Number(req.params.id);
    const tokenId = Number(req.params.tokenId);
    const tokenCheck = validateTournamentTokenInput(req.body?.token);

    if (!Number.isInteger(userId) || userId <= 0 || !Number.isInteger(tokenId) || tokenId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'ID de usuario o token inválido'
      });
    }

    if (!tokenCheck.ok) {
      return res.status(400).json({
        success: false,
        message: tokenCheck.message
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    const userRole = normalizeRole(user.role);
    if (userRole !== 'admin') {
      return res.status(400).json({
        success: false,
        message: 'Los tokens de torneo solo aplican a administradores'
      });
    }

    const existing = await TournamentCreationToken.findById(tokenId);
    if (!existing || existing.user_id !== userId) {
      return res.status(404).json({
        success: false,
        message: 'Token no encontrado para este usuario'
      });
    }

    if (existing.status !== 'available') {
      return res.status(400).json({
        success: false,
        message: 'Solo se pueden editar tokens disponibles (no usados)'
      });
    }

    const duplicate = await TournamentCreationToken.findByToken(tokenCheck.token);
    if (duplicate && duplicate.token_id !== tokenId) {
      return res.status(400).json({
        success: false,
        message: 'Ese token ya está asignado a otro usuario'
      });
    }

    const updated = await TournamentCreationToken.updateAvailableToken(
      tokenId,
      tokenCheck.token
    );
    if (!updated) {
      return res.status(400).json({
        success: false,
        message: 'No se pudo actualizar el token'
      });
    }

    return res.json({
      success: true,
      message: 'Token actualizado',
      data: { token: updated }
    });
  } catch (error) {
    console.error('Error en updateTournamentToken:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al actualizar token de torneo'
    });
  }
};

const revokeTournamentToken = async (req, res) => {
  try {
    const userId = Number(req.params.id);
    const tokenId = Number(req.params.tokenId);

    if (!Number.isInteger(userId) || userId <= 0 || !Number.isInteger(tokenId) || tokenId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'ID de usuario o token inválido'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    const existing = await TournamentCreationToken.findById(tokenId);
    if (!existing || existing.user_id !== userId) {
      return res.status(404).json({
        success: false,
        message: 'Token no encontrado para este usuario'
      });
    }

    if (existing.status !== 'available') {
      return res.status(400).json({
        success: false,
        message: 'No se puede quitar un token que ya fue utilizado'
      });
    }

    const revoked = await TournamentCreationToken.revokeAvailableToken(tokenId);
    if (!revoked) {
      return res.status(400).json({
        success: false,
        message: 'No se pudo quitar el token'
      });
    }

    return res.json({
      success: true,
      message: 'Token eliminado correctamente',
      data: { token: revoked }
    });
  } catch (error) {
    console.error('Error en revokeTournamentToken:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al quitar token de torneo'
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
  assignTournamentToken,
  listUserTournamentTokens,
  updateTournamentToken,
  revokeTournamentToken,
  deleteUser
};
