const jwt = require('jsonwebtoken');
const { sendPasswordSetupEmail } = require('./mailService');
const { JWT_SECRET, getJwtExpiresIn } = require('../config/jwt');

const PASSWORD_SETUP_EXPIRY = process.env.PASSWORD_SETUP_EXPIRES_IN || '24h';

function generatePasswordSetupToken(userId) {
  return jwt.sign(
    { userId, type: 'password_setup' },
    JWT_SECRET,
    { expiresIn: PASSWORD_SETUP_EXPIRY }
  );
}

function verifyPasswordSetupToken(token) {
  const payload = jwt.verify(token, JWT_SECRET);
  if (!payload || payload.type !== 'password_setup') {
    throw new Error('Token inválido');
  }
  return payload;
}

async function sendPasswordSetupRequest(email, userId) {
  const token = generatePasswordSetupToken(userId);
  return sendPasswordSetupEmail({
    to: email,
    plainToken: token
  });
}

module.exports = {
  generatePasswordSetupToken,
  verifyPasswordSetupToken,
  sendPasswordSetupRequest,
  getJwtExpiresIn
};
