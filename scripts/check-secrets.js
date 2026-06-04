#!/usr/bin/env node
/**
 * Escaneo básico de secretos en archivos versionables (CI local).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'build',
  'dist',
  'coverage',
  '.cursor'
]);
const SCAN_EXT = new Set(['.js', '.jsx', '.ts', '.tsx', '.json', '.md', '.html', '.env.example', '.example']);

const PATTERNS = [
  { name: 'cloudinary_secret', re: /CLOUDINARY_API_SECRET=[^\s#]+/i },
  { name: 'jwt_literal', re: /JWT_SECRET=(?!cambiar|tu_|changeme)[A-Za-z0-9+/=_-]{20,}/i },
  { name: 'google_api_key', re: /AIza[0-9A-Za-z_-]{20,}/ },
  { name: 'hardcoded_password_seed', re: /ultimate16\*\*|hera123/ }
];

function walk(dir, files = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(ent.name)) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, files);
    else {
      const ext = path.extname(ent.name);
      const base = ent.name;
      if (SCAN_EXT.has(ext) || base.includes('.env.example') || base.endsWith('.example')) {
        files.push(full);
      }
    }
  }
  return files;
}

const hits = [];
for (const file of walk(ROOT)) {
  const rel = path.relative(ROOT, file);
  if (rel.includes('check-secrets.js')) continue;
  const text = fs.readFileSync(file, 'utf8');
  for (const { name, re } of PATTERNS) {
    if (re.test(text)) {
      hits.push({ file: rel, pattern: name });
    }
  }
}

if (hits.length) {
  console.error('[check-secrets] Posibles secretos detectados:');
  for (const h of hits) {
    console.error(`  - ${h.file} (${h.pattern})`);
  }
  process.exit(1);
}
console.log('[check-secrets] OK: sin patrones de secreto obvios en archivos escaneados.');
