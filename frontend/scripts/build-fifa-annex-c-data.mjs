/**
 * Genera src/utils/fifaAnnexCRows.data.js desde thirdPlaceAssignments.mjs (FIFA Anexo C).
 * Ejecutar: node scripts/build-fifa-annex-c-data.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, '../src/utils/fifaAnnexCRows.data.js');

const res = await fetch('https://raw.githubusercontent.com/manganite/wm2026/main/thirdPlaceAssignments.mjs');
const text = await res.text();
const winnersMatch = text.match(/export const ANNEX_C_WINNERS = (\[[^\]]+\]);/);
const rowsMatch = text.match(/export const ANNEX_C_ROWS = \[([\s\S]*?)\];/);
if (!winnersMatch || !rowsMatch) {
  throw new Error('No se pudo parsear thirdPlaceAssignments.mjs');
}

const winners = eval(winnersMatch[1]);
const rowsBody = rowsMatch[1].replace(/\/\/.*$/gm, '');
const rows = eval(`[${rowsBody}]`);

const content = `/**
 * Datos FIFA WC26 — Anexo C (495 combinaciones de mejores terceros).
 * Fuente: FIFA FWC2026 Regulations, Annex C.
 * Regenerar: node scripts/build-fifa-annex-c-data.mjs
 */
export const FIFA_R32_WINNER_GROUPS = Object.freeze(${JSON.stringify(winners)});
export const ANNEX_C_ROWS = Object.freeze(${JSON.stringify(rows)});
`;

fs.writeFileSync(outPath, content, 'utf8');
console.log(`Escrito ${outPath} (${rows.length} filas)`);
