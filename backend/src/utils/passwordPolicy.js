/**
 * Política de contraseñas centralizada.
 */
function getMinPasswordLength() {
  const fromEnv = parseInt(process.env.MIN_PASSWORD_LENGTH, 10);
  if (Number.isFinite(fromEnv) && fromEnv >= 6) {
    return fromEnv;
  }
  return process.env.NODE_ENV === 'production' ? 10 : 8;
}

function validatePassword(password) {
  const pwd = String(password ?? '');
  const min = getMinPasswordLength();
  if (pwd.length < min) {
    return {
      ok: false,
      message: `La contraseña debe tener al menos ${min} caracteres`
    };
  }
  return { ok: true };
}

module.exports = {
  getMinPasswordLength,
  validatePassword
};
