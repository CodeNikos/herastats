/** Opciones de puesto en la última fase (lienzo Principal y Ranked). */
export const BRACKET_PLACEMENT_OPTIONS = [
  { number: 0, label: 'Final' },
  { number: 1, label: '3ro - 4to' },
  { number: 2, label: '5to - 6to' },
  { number: 3, label: '7mo - 8vo' },
  { number: 4, label: '9no - 10mo' },
  { number: 5, label: '11vo - 12vo' },
  { number: 6, label: '13vo - 14vo' },
  { number: 7, label: '15vo - 16vo' },
  { number: 8, label: '17vo - 18vo' },
  { number: 9, label: '19vo - 20mo' },
  { number: 10, label: '21vo - 22vo' },
  { number: 11, label: '23vo - 24vo' },
  { number: 12, label: '25vo - 26vo' },
  { number: 13, label: '27vo - 28vo' },
  { number: 14, label: '29vo - 30mo' },
  { number: 15, label: '31vo - 32vo' }
];

const BY_NUMBER = Object.fromEntries(BRACKET_PLACEMENT_OPTIONS.map((o) => [o.number, o]));
const BY_LABEL = Object.fromEntries(
  BRACKET_PLACEMENT_OPTIONS.map((o) => [String(o.label).trim().toLowerCase(), o.number])
);

export function placementLabelFromNumber(num) {
  const n = Number(num);
  if (!Number.isInteger(n) || n < 0 || n > 15) return null;
  return BY_NUMBER[n]?.label ?? null;
}

export function placementNumberFromLabel(label) {
  if (label == null || String(label).trim() === '') return null;
  const key = String(label).trim().toLowerCase();
  const n = BY_LABEL[key];
  return Number.isInteger(n) ? n : null;
}

/** Valor del `<select>` (string vacío o índice 0–15). */
export function resolvePlacementSelectValue(match) {
  const rawNum = match?.placementNumber ?? match?.placement_number;
  const n = Number(rawNum);
  if (Number.isInteger(n) && n >= 0 && n <= 15) return String(n);
  const fromLabel = placementNumberFromLabel(match?.placement);
  return fromLabel != null ? String(fromLabel) : '';
}

export function parsePlacementSelectChange(rawValue) {
  if (rawValue === '' || rawValue == null) {
    return { label: null, number: null };
  }
  const num = Number(rawValue);
  const opt = BY_NUMBER[num];
  if (!opt) return { label: null, number: null };
  return { label: opt.label, number: opt.number };
}

export function displayPlacementLabel(match) {
  const label = match?.placement != null && String(match.placement).trim() !== '' ? String(match.placement).trim() : null;
  if (label) return label;
  return placementLabelFromNumber(match?.placementNumber ?? match?.placement_number) || '';
}
