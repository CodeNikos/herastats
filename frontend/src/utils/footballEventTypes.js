export const FOOTBALL_SPORT_ID = 2;

export const FOOTBALL_EVENT_ABBREV = {
  GOAL: 'G',
  OWN_GOAL: 'OG',
  YELLOW_CARD: 'YC',
  RED_CARD: 'RC',
  PENALTY: 'P'
};

export const FOOTBALL_SCORING_TYPES = new Set(['GOAL', 'OWN_GOAL', 'PENALTY']);

/** @param {string} eventType */
export function footballEventAbbrev(eventType) {
  const ty = String(eventType || '').trim().toUpperCase();
  return FOOTBALL_EVENT_ABBREV[ty] || ty;
}

/** @param {string} eventTime */
export function formatFootballEventMinute(eventTime) {
  const text = String(eventTime || '').trim();
  if (!text) return '—';
  const plusIdx = text.indexOf('+');
  if (plusIdx >= 0) {
    const base = parseInt(text.slice(0, plusIdx), 10);
    const addPart = text.slice(plusIdx + 1).replace(/:\d{2}(:\d{2})?$/, '');
    const add = parseInt(addPart, 10);
    if (Number.isFinite(base) && Number.isFinite(add)) {
      return `${base}' + ${add}'`;
    }
  }
  const parts = text.split(':');
  const minute = parseInt(parts[0], 10);
  if (Number.isFinite(minute)) return `${minute}'`;
  return text;
}

export function buildFootballEventMinuteString(minuteRaw, addedMinuteRaw) {
  const minuteNum = parseInt(String(minuteRaw ?? '').trim(), 10);
  if (!Number.isFinite(minuteNum) || minuteNum < 0 || minuteNum > 200) return null;
  const addedTrim = String(addedMinuteRaw ?? '').trim();
  if (addedTrim === '') return String(minuteNum);
  const addedNum = parseInt(addedTrim, 10);
  if (!Number.isFinite(addedNum) || addedNum < 0 || addedNum > 30) return null;
  return `${minuteNum}+${addedNum}`;
}

/** Descompone event_time almacenado en minuto base y tiempo agregado. */
export function parseFootballEventMinuteParts(eventTime) {
  const text = String(eventTime || '').trim();
  if (!text) return { minute: '', addedMinute: '' };
  const plusIdx = text.indexOf('+');
  if (plusIdx >= 0) {
    const base = parseInt(text.slice(0, plusIdx).replace(/:.*/, ''), 10);
    const add = parseInt(text.slice(plusIdx + 1).replace(/:.*/, ''), 10);
    return {
      minute: Number.isFinite(base) ? String(base) : '',
      addedMinute: Number.isFinite(add) ? String(add) : ''
    };
  }
  const parts = text.split(':');
  const minute = parseInt(parts[0], 10);
  if (Number.isFinite(minute)) return { minute: String(minute), addedMinute: '' };
  const plain = parseInt(text, 10);
  if (Number.isFinite(plain)) return { minute: String(plain), addedMinute: '' };
  return { minute: '', addedMinute: '' };
}

/** Orden cronológico para listados (soporta 45+5 y HH:MM:SS). */
export function parseFootballMinuteSort(eventTime) {
  const text = String(eventTime ?? '').trim();
  const plusIdx = text.indexOf('+');
  if (plusIdx >= 0) {
    const base = parseInt(text.slice(0, plusIdx), 10);
    const add = parseInt(text.slice(plusIdx + 1), 10);
    if (Number.isFinite(base)) {
      return base * 1000 + (Number.isFinite(add) ? add : 0);
    }
  }
  const parts = text.split(':');
  const m = parseInt(parts[0], 10);
  const s = parts.length > 1 ? parseInt(parts[1], 10) : 0;
  if (!Number.isFinite(m)) return 0;
  return m * 1000 + (Number.isFinite(s) ? s : 0);
}
