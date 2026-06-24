/**
 * Escribe build/build-info.json tras npm run build (postbuild).
 * Sirve para verificar en producción qué commit está desplegado.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const buildDir = path.join(__dirname, '..', 'build');
const outPath = path.join(buildDir, 'build-info.json');

let gitSha = 'unknown';
try {
  gitSha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
} catch {
  /* fuera de git */
}

const info = {
  gitSha,
  builtAt: new Date().toISOString(),
  fifaWcTournamentId: Number(process.env.REACT_APP_FIFA_WC_TOURNAMENT_ID) || 2
};

if (!fs.existsSync(buildDir)) {
  console.warn('[Herastats] build/ no existe; omitiendo build-info.json');
  process.exit(0);
}

fs.writeFileSync(outPath, `${JSON.stringify(info, null, 2)}\n`);
console.log(`[Herastats] build-info.json → gitSha=${gitSha}`);
