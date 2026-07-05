const fs = require('fs');
const path = require('path');

let geoReader = null;
let geoReaderInitAttempted = false;
let geoipLite = null;

try {
  geoipLite = require('geoip-lite');
} catch {
  geoipLite = null;
}

const BOT_UA_PATTERN =
  /bot|crawl|spider|slurp|mediapartners|facebookexternalhit|whatsapp|preview|headless|lighthouse|pingdom|uptimerobot/i;

function isBotUserAgent(userAgent) {
  if (!userAgent || !String(userAgent).trim()) return false;
  return BOT_UA_PATTERN.test(String(userAgent));
}

function countryNameFromCode(code) {
  if (!code || code === 'XX' || code === 'T1') return null;
  try {
    const name = new Intl.DisplayNames(['es'], { type: 'region' }).of(code.toUpperCase());
    return name || code;
  } catch {
    return code;
  }
}

async function initGeoReader() {
  if (geoReaderInitAttempted) return geoReader;
  geoReaderInitAttempted = true;

  const dbPath = process.env.GEOIP_DB_PATH;
  if (!dbPath) return null;

  const resolved = path.isAbsolute(dbPath) ? dbPath : path.join(process.cwd(), dbPath);
  if (!fs.existsSync(resolved)) {
    console.warn(`GeoIP: archivo no encontrado en ${resolved}`);
    return null;
  }

  try {
    const maxmind = require('@maxmind/geoip2-node');
    geoReader = await maxmind.Reader.open(resolved);
    console.log('GeoIP: base MaxMind cargada');
  } catch (err) {
    console.warn('GeoIP: no se pudo cargar MaxMind:', err.message || err);
    geoReader = null;
  }

  return geoReader;
}

function normalizeIp(raw) {
  if (!raw) return '';
  let ip = String(raw).trim();
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  if (ip.includes('%')) ip = ip.split('%')[0];
  return ip;
}

function isPrivateOrLocalIp(ip) {
  if (!ip) return true;
  if (ip === '::1' || ip === '127.0.0.1' || ip === 'localhost') return true;
  if (/^10\./.test(ip)) return true;
  if (/^192\.168\./.test(ip)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) return true;
  if (/^fc00:|^fd[0-9a-f]{2}:/i.test(ip)) return true;
  return false;
}

function getClientIp(req) {
  const realIp = req.headers['x-real-ip'];
  if (realIp) {
    const ip = normalizeIp(String(realIp).split(',')[0]);
    if (ip) return ip;
  }
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ip = normalizeIp(String(forwarded).split(',')[0]);
    if (ip) return ip;
  }
  return normalizeIp(req.ip || req.socket?.remoteAddress || '');
}

function resolveCountryFromIp(ip) {
  if (!ip || isPrivateOrLocalIp(ip)) {
    return { country_code: null, country_name: null };
  }

  if (geoReader) {
    try {
      const record = geoReader.country(ip);
      const code = record?.country?.isoCode;
      if (code) {
        return {
          country_code: code,
          country_name: record.country?.names?.es || record.country?.names?.en || countryNameFromCode(code)
        };
      }
    } catch {
      // IP no resoluble en MaxMind
    }
  }

  if (geoipLite) {
    try {
      const lookup = geoipLite.lookup(ip);
      const code = lookup?.country;
      if (code) {
        return { country_code: code, country_name: countryNameFromCode(code) };
      }
    } catch {
      // geoip-lite sin datos para esta IP
    }
  }

  return { country_code: null, country_name: null };
}

function resolveCountry(req) {
  const cfCountry = req.headers['cf-ipcountry'];
  if (cfCountry && String(cfCountry).trim() && cfCountry !== 'XX') {
    const code = String(cfCountry).trim().toUpperCase();
    return { country_code: code, country_name: countryNameFromCode(code) };
  }

  return resolveCountryFromIp(getClientIp(req));
}

module.exports = {
  initGeoReader,
  resolveCountry,
  resolveCountryFromIp,
  isBotUserAgent,
  getClientIp,
  countryNameFromCode
};
