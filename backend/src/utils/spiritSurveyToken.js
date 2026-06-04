const crypto = require('crypto');

function hashSpiritSurveyToken(plainToken) {
  return crypto.createHash('sha256').update(String(plainToken).trim(), 'utf8').digest('hex');
}

module.exports = { hashSpiritSurveyToken };
