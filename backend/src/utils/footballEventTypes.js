const FOOTBALL_SPORT_ID = 2;

const FOOTBALL_EVENT_ALIASES = {
  GOL: 'GOAL',
  GOAL: 'GOAL',
  AUTOGOL: 'OWN_GOAL',
  OWN_GOAL: 'OWN_GOAL',
  OG: 'OWN_GOAL',
  'YELLOW CARD': 'YELLOW_CARD',
  YELLOW_CARD: 'YELLOW_CARD',
  YC: 'YELLOW_CARD',
  TARJETAAMARILLA: 'YELLOW_CARD',
  'RED CARD': 'RED_CARD',
  RED_CARD: 'RED_CARD',
  RC: 'RED_CARD',
  TARJETAROJA: 'RED_CARD',
  PENAL: 'PENALTY',
  PENALTY: 'PENALTY',
  P: 'PENALTY'
};

const FOOTBALL_SCORING_EVENT_TYPES = new Set(['GOAL', 'OWN_GOAL', 'PENALTY']);

const FOOTBALL_POST_MATCH_EVENT_TYPES = new Set([
  'GOAL',
  'OWN_GOAL',
  'YELLOW_CARD',
  'RED_CARD',
  'PENALTY'
]);

function normalizeFootballEventTypeInput(raw) {
  const text = String(raw ?? '').trim().toUpperCase();
  if (!text) return '';
  const compact = text.replace(/[\s_-]+/g, '');
  return FOOTBALL_EVENT_ALIASES[text] || FOOTBALL_EVENT_ALIASES[compact] || text;
}

function isAdminOrSuperuserRole(role) {
  const r = String(role ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  return r === 'admin' || r === 'superuser';
}

/**
 * @param {number|string} minuteRaw
 * @returns {string}
 */
function normalizeFootballMinuteToEventTime(minuteRaw) {
  const text = String(minuteRaw ?? '').trim();
  if (!text) return '';
  const addedMatch = text.match(/^(\d{1,3})\+(\d{1,2})$/);
  if (addedMatch) {
    const base = parseInt(addedMatch[1], 10);
    const add = parseInt(addedMatch[2], 10);
    if (
      Number.isFinite(base) &&
      base >= 0 &&
      base <= 200 &&
      Number.isFinite(add) &&
      add >= 0 &&
      add <= 30
    ) {
      return `${base}+${add}`;
    }
    return text;
  }
  if (/^\d{1,3}:\d{2}(:\d{2})?$/.test(text)) {
    const parts = text.split(':').map((p) => parseInt(p, 10));
    const m = parts[0] ?? 0;
    const s = parts[1] ?? 0;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:00`;
  }
  const minute = parseInt(text, 10);
  if (!Number.isFinite(minute) || minute < 0 || minute > 200) return text;
  return `${String(minute).padStart(2, '0')}:00:00`;
}

module.exports = {
  FOOTBALL_SPORT_ID,
  FOOTBALL_SCORING_EVENT_TYPES,
  FOOTBALL_POST_MATCH_EVENT_TYPES,
  normalizeFootballEventTypeInput,
  isAdminOrSuperuserRole,
  normalizeFootballMinuteToEventTime
};
