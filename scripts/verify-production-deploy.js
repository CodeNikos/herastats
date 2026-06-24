#!/usr/bin/env node
/**
 * Verificación post-deploy contra producción.
 * Uso:
 *   node scripts/verify-production-deploy.js
 *   node scripts/verify-production-deploy.js https://api-backend.seenode.com https://www.herastats.com
 */
const backendBase = (process.argv[2] || process.env.HERASTATS_BACKEND_URL || '').replace(/\/+$/, '');
const frontendBase = (process.argv[3] || process.env.HERASTATS_FRONTEND_URL || 'https://www.herastats.com').replace(/\/+$/, '');

if (!backendBase) {
  console.error('Indica la URL del backend:');
  console.error('  node scripts/verify-production-deploy.js https://TU-BACKEND.seenode.com https://www.herastats.com');
  process.exit(1);
}

async function check(name, fn) {
  try {
    await fn();
    console.log(`OK  ${name}`);
    return true;
  } catch (err) {
    console.error(`FAIL ${name}: ${err.message || err}`);
    return false;
  }
}

async function main() {
  let ok = 0;
  let total = 0;

  const run = async (name, fn) => {
    total += 1;
    if (await check(name, fn)) ok += 1;
  };

  await run('GET /api/health', async () => {
    const res = await fetch(`${backendBase}/api/health`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    if (body.database !== 'ok') throw new Error(JSON.stringify(body));
  });

  await run('GET /sitemap.xml', async () => {
    const res = await fetch(`${backendBase}/sitemap.xml`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (!text.includes('<urlset')) throw new Error('respuesta no es XML sitemap');
    if (!text.includes('/home')) throw new Error('falta URL /home en sitemap');
  });

  await run('POST /api/analytics/collect', async () => {
    const res = await fetch(`${backendBase}/api/analytics/collect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: '/home', query: '', referrer: '', sessionKey: 'deploy-check' })
    });
    if (res.status !== 204) throw new Error(`HTTP ${res.status}`);
  });

  await run(`GET ${frontendBase}/robots.txt`, async () => {
    const res = await fetch(`${frontendBase}/robots.txt`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (!text.includes('Sitemap:')) throw new Error('falta línea Sitemap');
  });

  await run(`GET ${frontendBase}/home`, async () => {
    const res = await fetch(`${frontendBase}/home`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (!text.includes('root')) throw new Error('no parece SPA index');
  });

  await run('GET /api/config/app-settings (fifaWcTournamentId)', async () => {
    const res = await fetch(`${backendBase}/api/config/app-settings`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    const id = Number(body?.data?.fifaWcTournamentId);
    if (!Number.isInteger(id) || id <= 0) {
      throw new Error(`fifaWcTournamentId inválido: ${JSON.stringify(body?.data)}`);
    }
  });

  await run(`GET ${frontendBase}/ build-info.json`, async () => {
    const res = await fetch(`${frontendBase}/build-info.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status} (¿redeploy frontend con postbuild?)`);
    const body = await res.json();
    if (!body.gitSha) throw new Error('falta gitSha en build-info.json');
    console.log(`     → frontend gitSha=${body.gitSha} fifaWc=${body.fifaWcTournamentId}`);
  });

  await run(`GET ${frontendBase}/ index.html bundle`, async () => {
    const res = await fetch(`${frontendBase}/`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const m = html.match(/main\.([a-f0-9]+)\.js/);
    if (!m) throw new Error('no se encontró main.*.js en index.html');
    const jsRes = await fetch(`${frontendBase}/static/js/main.${m[1]}.js`);
    if (!jsRes.ok) throw new Error(`bundle main.${m[1]}.js HTTP ${jsRes.status}`);
    const js = await jsRes.text();
    if (!js.includes('/config/app-settings')) {
      throw new Error(`bundle main.${m[1]}.js sin integración app-settings (deploy antiguo)`);
    }
    console.log(`     → bundle main.${m[1]}.js`);
  });

  console.log(`\n${ok}/${total} comprobaciones OK`);
  process.exit(ok === total ? 0 : 1);
}

main();
