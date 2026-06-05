/**
 * Extrae procedimientos/funciones de PostgreSQL y los guarda en sql/procedures/.
 *
 * Uso:
 *   node scripts/extract-procedures.js
 *   node scripts/extract-procedures.js create_ranked_view ps_game_upd
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { getPoolConfig } = require('../src/config/dbConfig');

const DEFAULT_NAMES = ['create_ranked_view', 'ps_game_upd'];
const OUTPUT_DIR = path.resolve(__dirname, '..', 'sql', 'procedures');

const ORDER_INDEX = {
  create_ranked_view: '001',
  ps_game_upd: '002'
};

async function main() {
  const names = process.argv.slice(2);
  const targets = names.length > 0 ? names : DEFAULT_NAMES;

  const client = new Client(getPoolConfig());
  await client.connect();

  const result = await client.query(
    `
    SELECT p.proname,
           pg_catalog.pg_get_function_identity_arguments(p.oid) AS args,
           CASE p.prokind
             WHEN 'p' THEN 'procedure'
             WHEN 'f' THEN 'function'
             ELSE p.prokind::text
           END AS kind,
           pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = ANY($1::text[])
      AND n.nspname = 'public'
    ORDER BY p.proname, p.oid
    `,
    [targets]
  );

  if (result.rows.length === 0) {
    console.error(`No se encontraron objetos en public: ${targets.join(', ')}`);
    process.exit(1);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  for (const row of result.rows) {
    const prefix = ORDER_INDEX[row.proname] || '999';
    const fileName = `${prefix}_${row.proname}.sql`;
    const header = [
      `-- ${row.kind}: ${row.proname}(${row.args})`,
      `-- Extraído automáticamente. Aplicar con: npm run db:procedures`,
      ''
    ].join('\n');
    const body = `${row.def.trim()}\n`;
    const fullPath = path.join(OUTPUT_DIR, fileName);
    fs.writeFileSync(fullPath, header + body, 'utf8');
    console.log(`Escrito: sql/procedures/${fileName}`);
  }

  await client.end();
  console.log('Extracción completada.');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
