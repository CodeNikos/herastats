/** Orden preferido de columnas (como en la referencia WFDF). */
export const PLACEMENT_DIVISION_ORDER = ['Open', "Women's", 'Mixed', 'Master Open', 'Master Mixed'];
export const MIN_PLACEMENT_ROWS = 10;

export function normalizeDivisionKey(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

export function sortPlacementDivisions(divisions) {
  const unique = [...new Set((divisions || []).map((d) => String(d).trim()).filter(Boolean))];
  const orderIndex = (name) => {
    const idx = PLACEMENT_DIVISION_ORDER.findIndex(
      (label) => normalizeDivisionKey(label) === normalizeDivisionKey(name)
    );
    return idx >= 0 ? idx : PLACEMENT_DIVISION_ORDER.length + unique.indexOf(name);
  };
  return unique.sort((a, b) => {
    const da = orderIndex(a);
    const db = orderIndex(b);
    if (da !== db) return da - db;
    return a.localeCompare(b, 'es', { sensitivity: 'base' });
  });
}

export function buildPlacementGrid(rows) {
  const divisions = sortPlacementDivisions((rows || []).map((r) => r.division));
  const byKey = new Map();
  for (const row of rows || []) {
    const placementNum = Number(row.placement_number);
    const division = String(row.division ?? '').trim();
    if (!Number.isFinite(placementNum) || placementNum <= 0 || !division) continue;
    byKey.set(`${placementNum}::${normalizeDivisionKey(division)}`, row);
  }
  const maxFromData = (rows || []).reduce((max, row) => {
    const n = Number(row.placement_number);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
  const rowCount = Math.max(MIN_PLACEMENT_ROWS, maxFromData);
  const tableRows = [];
  for (let placementNum = 1; placementNum <= rowCount; placementNum += 1) {
    const cells = divisions.map((division) => {
      const hit = byKey.get(`${placementNum}::${normalizeDivisionKey(division)}`);
      return hit || null;
    });
    tableRows.push({ placementNum, cells });
  }
  return { divisions, tableRows };
}

export function placementRowLabel(placementNum) {
  if (placementNum === 1) return { text: 'Gold', tone: 'gold', medal: true };
  if (placementNum === 2) return { text: 'Silver', tone: 'silver', medal: true };
  if (placementNum === 3) return { text: 'Bronze', tone: 'bronze', medal: true };
  return { text: String(placementNum), tone: 'plain', medal: false };
}
