/**
 * Aplica procedimientos almacenados versionados en backend/sql/procedures/.
 *
 * Uso:
 *   node scripts/apply-procedures.js
 *   DATABASE_URL="postgresql://..." node scripts/apply-procedures.js
 *
 * Los archivos se ejecutan en orden alfabético (prefijo numérico recomendado).
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { getPoolConfig, resolveDbHost } = require('../src/config/dbConfig');

const envFile = process.env.ENV_FILE;
if (envFile) {
  require('dotenv').config({ path: path.resolve(__dirname, '..', envFile) });
} else {
  require('dotenv').config();
}

const PROCEDURES_DIR = path.resolve(__dirname, '..', 'sql', 'procedures');

async function main() {
  if (!fs.existsSync(PROCEDURES_DIR)) {
    console.error(`No existe el directorio: ${PROCEDURES_DIR}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(PROCEDURES_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.error('No hay archivos .sql en sql/procedures/');
    process.exit(1);
  }

  const poolConfig = getPoolConfig();
  const targetHost = resolveDbHost() || poolConfig.host || '(DATABASE_URL)';
  console.log(`[apply-procedures] Conectando a host: ${targetHost}`);

  const client = new Client(poolConfig);
  await client.connect();

  const dbName = (await client.query('SELECT current_database() AS db')).rows[0]?.db;
  console.log(`[apply-procedures] Base de datos: ${dbName}`);

  for (const file of files) {
    const fullPath = path.join(PROCEDURES_DIR, file);
    const sql = fs.readFileSync(fullPath, 'utf8').trim();
    if (!sql) {
      console.warn(`[apply-procedures] Omitido (vacío): ${file}`);
      continue;
    }
    console.log(`[apply-procedures] Aplicando ${file}...`);
    await client.query(sql);
    console.log(`[apply-procedures] OK ${file}`);
  }

  await client.end();
  console.log('[apply-procedures] Procedimientos aplicados correctamente.');
}

main().catch((err) => {
  console.error('[apply-procedures] Error:', err.message || err);
  process.exit(1);
});
