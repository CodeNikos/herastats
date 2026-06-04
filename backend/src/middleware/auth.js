const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { normalizeRole } = require('../utils/userRoles');
const { JWT_SECRET } = require('../config/jwt');

const isProd = process.env.NODE_ENV === 'production';

const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Token no proporcionado. Debes estar autenticado para realizar esta acción.'
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

    req.user = {
      id: user.id,
      email: user.email,
      role: normalizeRole(user.role) || user.role
    };

    if (!isProd) {
      console.log('[auth] Usuario autenticado:', req.user.email, req.path);
    }
    next();
  } catch (error) {
    if (!isProd) {
      console.error('Error en autenticación:', error);
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Token inválido'
      });
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expirado. Por favor, inicia sesión nuevamente.'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error en la autenticación'
    });
  }
};

const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    const userRole = normalizeRole(req.user?.role);
    const allowed = new Set(allowedRoles.map((r) => normalizeRole(r)).filter(Boolean));
    if (!userRole || !allowed.has(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para realizar esta acción'
      });
    }
    next();
  };
};

const optionalAuthenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return next();

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (user) {
      req.user = {
        id: user.id,
        email: user.email,
        role: normalizeRole(user.role) || user.role
      };
    }
    return next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return next();
    }
    if (!isProd) {
      console.error('Error en autenticación opcional:', error);
    }
    return next();
  }
};

module.exports = {
  authenticate,
  optionalAuthenticate,
  requireRole
};
