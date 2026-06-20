const fs = require('fs');
const path = require('path');

let geoReader = null;
let geoReaderInitAttempted = false;

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

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const first = String(forwarded).split(',')[0].trim();
    if (first) return first;
  }
  return req.ip || req.socket?.remoteAddress || '';
}

function resolveCountry(req) {
  const cfCountry = req.headers['cf-ipcountry'];
  if (cfCountry && String(cfCountry).trim() && cfCountry !== 'XX') {
    const code = String(cfCountry).trim().toUpperCase();
    return { country_code: code, country_name: countryNameFromCode(code) };
  }

  if (geoReader) {
    try {
      const ip = getClientIp(req);
      if (ip && ip !== '::1' && ip !== '127.0.0.1') {
        const record = geoReader.country(ip);
        const code = record?.country?.isoCode;
        if (code) {
          return {
            country_code: code,
            country_name: record.country?.names?.es || record.country?.names?.en || countryNameFromCode(code)
          };
        }
      }
    } catch {
      // IP privada o no resoluble
    }
  }

  return { country_code: null, country_name: null };
}

module.exports = {
  initGeoReader,
  resolveCountry,
  isBotUserAgent,
  getClientIp,
  countryNameFromCode
};
