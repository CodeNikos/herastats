const User = require('../models/User');
const TournamentMember = require('../models/TournamentMember');
const { assertTournamentInviteAccess } = require('../services/tournamentAccess');
const { normalizeRole } = require('../utils/userRoles');

const listTournamentMembers = async (req, res) => {
  try {
    const tournamentId = Number(req.params.id);
    const access = await assertTournamentInviteAccess(req, tournamentId);
    if (!access.ok) {
      return res.status(access.status).json({ success: false, message: access.message });
    }

    const members = await TournamentMember.findByTournamentId(tournamentId);
    return res.json({
      success: true,
      data: {
        members: members.map((m) => ({
          id: m.id,
          user_id: m.user_id,
          torneo_id: m.torneo_id,
          email: m.email,
          role: normalizeRole(m.role) || m.role,
          name: m.name,
          lname: m.lname,
          invited_by: m.invited_by,
          created_at: m.created_at
        }))
      }
    });
  } catch (error) {
    console.error('Error en listTournamentMembers:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al listar miembros del torneo'
    });
  }
};

const addTournamentMember = async (req, res) => {
  try {
    const tournamentId = Number(req.params.id);
    const access = await assertTournamentInviteAccess(req, tournamentId);
    if (!access.ok) {
      return res.status(access.status).json({ success: false, message: access.message });
    }

    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email es obligatorio'
      });
    }

    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado. Invítalo primero con correo de activación.'
      });
    }

    if (normalizeRole(user.role) === 'superuser') {
      return res.status(400).json({
        success: false,
        message: 'No se puede asignar un superuser a un torneo'
      });
    }

    const membership = await TournamentMember.add({
      userId: user.id,
      torneoId: tournamentId,
      invitedBy: req.user.id
    });

    if (!membership) {
      return res.status(400).json({
        success: false,
        message: 'El usuario ya tiene acceso a este torneo'
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Usuario asignado al torneo',
      data: { membership }
    });
  } catch (error) {
    console.error('Error en addTournamentMember:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al asignar usuario al torneo'
    });
  }
};

const removeTournamentMember = async (req, res) => {
  try {
    const tournamentId = Number(req.params.id);
    const targetUserId = Number(req.params.userId);
    const access = await assertTournamentInviteAccess(req, tournamentId);
    if (!access.ok) {
      return res.status(access.status).json({ success: false, message: access.message });
    }

    if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'ID de usuario inválido'
      });
    }

    const tournament = access.tournament;
    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    const isOwner =
      String(tournament.created_by || '').toLowerCase() ===
      String(targetUser.email || '').toLowerCase();
    if (isOwner) {
      return res.status(400).json({
        success: false,
        message: 'No se puede quitar al dueño del torneo'
      });
    }

    const removed = await TournamentMember.remove(targetUserId, tournamentId);
    if (!removed) {
      return res.status(404).json({
        success: false,
        message: 'El usuario no está asignado a este torneo'
      });
    }

    return res.json({
      success: true,
      message: 'Acceso al torneo eliminado'
    });
  } catch (error) {
    console.error('Error en removeTournamentMember:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al quitar acceso al torneo'
    });
  }
};

module.exports = {
  listTournamentMembers,
  addTournamentMember,
  removeTournamentMember
};
