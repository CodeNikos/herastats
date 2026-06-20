const User = require('../models/User');
const { getMinPasswordLength } = require('../utils/passwordPolicy');

const ALLOWED_BOOTSTRAP_ROLES = ['admin', 'superuser', 'anotador'];

/**
 * Superusuario bootstrap: desactivado en producción salvo opt-in explícito.
 * HERASTATS_SEED_DEFAULT_SUPERUSER=true en producción (no recomendado en servidores públicos).
 */
function shouldEnsureDefaultSuperuser() {
  if (process.env.NODE_ENV === 'production') {
    const flag = process.env.HERASTATS_SEED_DEFAULT_SUPERUSER;
    return /^(true|1)$/i.test(String(flag ?? '').trim());
  }
  const flag = process.env.HERASTATS_SEED_DEFAULT_SUPERUSER;
  if (/^(false|0)$/i.test(String(flag ?? '').trim())) {
    return false;
  }
  return true;
}

function resolveRoleFromEnv(envRoleRaw, fallbackRole) {
  const role =
    typeof envRoleRaw === 'string' ? envRoleRaw.trim().toLowerCase() : '';
  if (!ALLOWED_BOOTSTRAP_ROLES.includes(role)) {
    return fallbackRole;
  }
  return role;
}

async function ensureBootstrapUser({ email, password, role, label }) {
  if (!email) {
    return;
  }
  const minLen = getMinPasswordLength();
  if (!password || String(password).length < minLen) {
    console.warn(
      `[Herastats seed] Omitiendo ${label || email}: define SEED_DEFAULT_SUPERUSER_PASSWORD ` +
        `(mínimo ${minLen} caracteres) en el archivo .env`
    );
    return;
  }

  try {
    const existing = await User.findByEmail(email);
    if (existing) {
      return;
    }
    await User.create({
      email,
      password,
      role
    });
    console.log(
      `[Herastats seed] Usuario creado: ${email} (${role}). ` +
        'Cambia la contraseña tras el primer uso.'
    );
  } catch (err) {
    console.error(
      `[Herastats seed] No se pudo crear el usuario ${email}:`,
      err.message
    );
  }
}

async function ensureDefaultSuperuserIfNeeded() {
  if (!shouldEnsureDefaultSuperuser()) {
    return;
  }

  const superEmail = (
    process.env.SEED_DEFAULT_SUPERUSER_EMAIL ||
    process.env.TEST_DEFAULT_SUPERUSER_EMAIL ||
    'bootstrap@localhost'
  )
    .trim()
    .toLowerCase();
  const superPassword =
    process.env.SEED_DEFAULT_SUPERUSER_PASSWORD ||
    process.env.TEST_DEFAULT_SUPERUSER_PASSWORD;
  const superRole = resolveRoleFromEnv(
    process.env.SEED_DEFAULT_SUPERUSER_ROLE ||
      process.env.TEST_DEFAULT_SUPERUSER_ROLE,
    'superuser'
  );

  await ensureBootstrapUser({
    email: superEmail,
    password: superPassword,
    role: superRole,
    label: 'superusuario bootstrap'
  });
}

module.exports = {
  shouldEnsureDefaultSuperuser,
  ensureDefaultSuperuserIfNeeded
};
