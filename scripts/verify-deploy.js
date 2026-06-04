#!/usr/bin/env node
/**
 * Verificación post-deploy contra un backend desplegado.
 *
 * Uso:
 *   node scripts/verify-deploy.js https://tu-api.seenode.com
 *   DEPLOY_VERIFY_URL=https://tu-api.seenode.com node scripts/verify-deploy.js
 */
const base = (process.argv[2] || process.env.DEPLOY_VERIFY_URL || '').replace(/\/+$/, '');

if (!base) {
  console.error(
    '[verify-deploy] Indica la URL base del API.\n' +
      '  node scripts/verify-deploy.js https://tu-api.seenode.com'
  );
  process.exit(1);
}

const healthUrl = `${base}/api/health`;
const timeoutMs = Number(process.env.DEPLOY_VERIFY_TIMEOUT_MS) || 15000;

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const failures = [];

  console.log(`[verify-deploy] Comprobando ${healthUrl}`);

  try {
    const health = await fetchJson(healthUrl);
    if (health.status !== 200) {
      failures.push(`GET /api/health → HTTP ${health.status} (esperado 200)`);
    } else if (health.body.database !== 'ok') {
      failures.push(`GET /api/health → database=${health.body.database} (esperado ok)`);
    } else {
      console.log('[verify-deploy] OK: /api/health responde y la base de datos está disponible');
    }
  } catch (err) {
    failures.push(`GET /api/health → error: ${err.message}`);
  }

  try {
    const notFound = await fetchJson(`${base}/api/ruta-inexistente-verify`);
    if (notFound.status !== 404) {
      failures.push(`GET ruta inexistente → HTTP ${notFound.status} (esperado 404)`);
    } else {
      console.log('[verify-deploy] OK: rutas inexistentes devuelven 404');
    }
  } catch (err) {
    failures.push(`GET 404 smoke → error: ${err.message}`);
  }

  try {
    const register = await fetchJson(`${base}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Deploy Verify',
        email: 'verify-deploy@invalid.local',
        password: 'contraseña_segura_123'
      })
    });
    if (register.status === 403) {
      console.log('[verify-deploy] OK: registro público bloqueado en producción');
    } else if (register.status >= 500) {
      failures.push(`POST /api/auth/register → HTTP ${register.status} (error inesperado del servidor)`);
    } else {
      console.log('[verify-deploy] INFO: registro respondió HTTP', register.status);
    }
  } catch (err) {
    failures.push(`POST /api/auth/register → error: ${err.message}`);
  }

  if (failures.length) {
    console.error('\n[verify-deploy] FALLO — revisa la configuración en Seenode:\n');
    for (const msg of failures) {
      console.error(`  - ${msg}`);
    }
    process.exit(1);
  }

  console.log('\n[verify-deploy] Verificación básica completada.');
  console.log('Checklist manual pendiente: login, torneos, Cloudinary, correo SMTP.');
}

main();
