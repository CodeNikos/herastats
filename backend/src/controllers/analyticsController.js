const PageVisit = require('../models/PageVisit');
const { resolveCountry, isBotUserAgent, getClientIp } = require('../services/geoipService');

const EXCLUDED_PATH_PREFIXES = [
  '/login',
  '/set-password',
  '/users',
  '/analytics',
  '/config',
  '/team',
  '/players',
  '/groupsconfig',
  '/calendarconfig',
  '/brackets',
  '/anotacion',
  '/game_events',
  '/football_events',
  '/live',
  '/sports'
];

function normalizePath(rawPath) {
  const path = String(rawPath || '/').trim();
  if (!path.startsWith('/')) return `/${path}`;
  return path.slice(0, 512);
}

function parseTournamentIdFromQuery(queryString) {
  if (!queryString) return null;
  const params = new URLSearchParams(String(queryString));
  const raw = params.get('tournamentId');
  if (raw == null) return null;
  const n = Number(String(raw).trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

function shouldTrackPath(path) {
  return !EXCLUDED_PATH_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`)
  );
}

async function collectVisit(req, res) {
  try {
    const { path: rawPath, query, referrer, sessionKey } = req.body || {};
    const path = normalizePath(rawPath);

    if (!shouldTrackPath(path)) {
      return res.status(204).end();
    }

    const userAgent = String(req.headers['user-agent'] || '').slice(0, 512);
    const isBot = isBotUserAgent(userAgent);
    const ip = getClientIp(req);
    const dateKey = new Date().toISOString().slice(0, 10);
    const visitorKey = PageVisit.buildVisitorKey(ip, userAgent, dateKey);
    const geo = resolveCountry(req);
    const queryString = query != null ? String(query).slice(0, 1024) : null;

    await PageVisit.insert({
      path,
      query_string: queryString,
      tournament_id: parseTournamentIdFromQuery(queryString),
      referrer: referrer != null ? String(referrer).slice(0, 1024) : null,
      user_agent: userAgent,
      country_code: geo.country_code,
      country_name: geo.country_name,
      visitor_key: visitorKey,
      session_key: sessionKey != null ? String(sessionKey).slice(0, 64) : null,
      is_bot: isBot
    });

    return res.status(204).end();
  } catch (err) {
    console.error('analytics collect:', err.message || err);
    return res.status(204).end();
  }
}

async function getSummary(req, res) {
  try {
    const { from, to } = req.query;
    const data = await PageVisit.getSummary({ from, to });
    return res.json({ success: true, data });
  } catch (err) {
    console.error('analytics summary:', err);
    return res.status(500).json({ success: false, message: 'No se pudo cargar el resumen' });
  }
}

async function getVisits(req, res) {
  try {
    const { from, to, country, path, page, limit } = req.query;
    const data = await PageVisit.listVisits({ from, to, country, path, page, limit });
    return res.json({ success: true, data });
  } catch (err) {
    console.error('analytics visits:', err);
    return res.status(500).json({ success: false, message: 'No se pudo cargar las visitas' });
  }
}

async function getTimeseries(req, res) {
  try {
    const { from, to, days } = req.query;
    const rows = await PageVisit.getTimeseries({ from, to, days });
    return res.json({
      success: true,
      data: {
        rows,
        from: rows[0]?.date || null,
        to: rows[rows.length - 1]?.date || null
      }
    });
  } catch (err) {
    console.error('analytics timeseries:', err);
    return res.status(500).json({ success: false, message: 'No se pudo cargar la serie temporal' });
  }
}

async function getCountries(req, res) {
  try {
    const { from, to, limit } = req.query;
    const rows = await PageVisit.getCountryStats({ from, to, limit });
    return res.json({ success: true, data: { rows } });
  } catch (err) {
    console.error('analytics countries:', err);
    return res.status(500).json({ success: false, message: 'No se pudo cargar el desglose por países' });
  }
}

module.exports = {
  collectVisit,
  getSummary,
  getVisits,
  getTimeseries,
  getCountries
};
