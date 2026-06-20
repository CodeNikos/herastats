const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { normalizeRole } = require('../utils/userRoles');
const TournamentCreationToken = require('../models/TournamentCreationToken');
const bcrypt = require('bcryptjs');
const { verifyPasswordSetupToken } = require('../services/passwordSetupService');
const { JWT_SECRET, getJwtExpiresIn } = require('../config/jwt');
const { validatePassword } = require('../utils/passwordPolicy');

const userToJSON = (user) => {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    role: normalizeRole(user.role) || null,
    name: user.name ?? null,
    lname: user.lname ?? null
  };
};

const generateToken = (userId) => {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: getJwtExpiresIn() });
};

const register = async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    // Validaciones básicas
    if (!normalizedEmail || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email y contraseña son obligatorios' 
      });
    }

    const pwdCheck = validatePassword(password);
    if (!pwdCheck.ok) {
      return res.status(400).json({
        success: false,
        message: pwdCheck.message
      });
    }

    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({
        success: false,
        message:
          'El registro público está deshabilitado en producción. Contacta al administrador.'
      });
    }

    // Verificar si el usuario ya existe
    const existingUser = await User.findByEmail(normalizedEmail);
    if (existingUser) {
      return res.status(400).json({ 
        success: false, 
        message: 'El usuario ya existe' 
      });
    }

    // Solo permitir registro abierto para bootstrap del primer superusuario.
    const totalUsers = await User.countAll();
    if (totalUsers > 0) {
      return res.status(403).json({
        success: false,
        message: 'El registro público está deshabilitado. Solo un superusuario puede crear usuarios.'
      });
    }

    // Primer usuario del sistema: superuser.
    const newUser = await User.create({ email: normalizedEmail, password, role: 'superuser' });
    const token = generateToken(newUser.id);

    res.status(201).json({
      success: true,
      message: 'Usuario registrado exitosamente',
      data: {
        user: userToJSON(newUser),
        token
      }
    });

  } catch (error) {
    console.error('Error en registro:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    // Validaciones básicas
    if (!normalizedEmail || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email y contraseña son obligatorios' 
      });
    }

    // Buscar usuario
    const user = await User.findByEmail(normalizedEmail);
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Credenciales inválidas' 
      });
    }

    // Verificar contraseña
    const isValidPassword = await User.validatePassword(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ 
        success: false, 
        message: 'Credenciales inválidas' 
      });
    }

    // Generar token
    const token = generateToken(user.id);

    res.json({
      success: true,
      message: 'Login exitoso',
      data: {
        user: userToJSON(user),
        token
      }
    });

  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error interno del servidor' 
    });
  }
};

const verifyToken = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'Token no proporcionado' 
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Usuario no encontrado' 
      });
    }

    res.json({
      success: true,
      data: {
        user: userToJSON(user)
      }
    });

  } catch (error) {
    console.error('Error verificando token:', error);
    res.status(401).json({ 
      success: false, 
      message: 'Token inválido' 
    });
  }
};

const setPassword = async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({
        success: false,
        message: 'Token y contraseña son obligatorios'
      });
    }

    const pwdCheck = validatePassword(password);
    if (!pwdCheck.ok) {
      return res.status(400).json({
        success: false,
        message: pwdCheck.message
      });
    }

    let payload;
    try {
      payload = verifyPasswordSetupToken(String(token));
    } catch (_error) {
      return res.status(401).json({
        success: false,
        message: 'Token inválido o expirado'
      });
    }

    const user = await User.findById(payload.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await User.updatePassword(user.id, hashedPassword);

    return res.json({
      success: true,
      message: 'Contraseña actualizada exitosamente'
    });
  } catch (error) {
    console.error('Error en setPassword:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

const updateProfile = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'No autenticado'
      });
    }

    const existing = await User.findById(userId);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    let name = existing.name ?? null;
    let lname = existing.lname ?? null;
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'name')) {
      const raw = req.body.name;
      name = raw === undefined || raw === null ? null : String(raw).trim() || null;
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'lname')) {
      const raw = req.body.lname;
      lname = raw === undefined || raw === null ? null : String(raw).trim() || null;
    }

    const updated = await User.updateProfile(userId, { name, lname });
    return res.json({
      success: true,
      message: 'Perfil actualizado',
      data: { user: userToJSON(updated) }
    });
  } catch (error) {
    console.error('Error en updateProfile:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al actualizar el perfil'
    });
  }
};

const getTournamentCreationEligibility = async (req, res) => {
  try {
    const role = normalizeRole(req.user?.role);
    if (role === 'superuser') {
      return res.json({
        success: true,
        data: {
          can_create: true,
          tokens_available: null,
          role
        }
      });
    }

    if (role !== 'admin') {
      return res.json({
        success: true,
        data: {
          can_create: false,
          tokens_available: 0,
          role
        }
      });
    }

    const tokensAvailable = (
      await TournamentCreationToken.countAvailableByUserIds([req.user.id])
    ).get(req.user.id) || 0;

    return res.json({
      success: true,
      data: {
        can_create: tokensAvailable > 0,
        tokens_available: tokensAvailable,
        role
      }
    });
  } catch (error) {
    console.error('Error en getTournamentCreationEligibility:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al verificar elegibilidad de creación'
    });
  }
};

module.exports = {
  register,
  login,
  verifyToken,
  setPassword,
  updateProfile,
  getTournamentCreationEligibility
};
