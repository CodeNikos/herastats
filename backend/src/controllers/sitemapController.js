const TournamentConfig = require('../models/TournamentConfig');

function getSiteBaseUrl() {
  const raw = process.env.SITE_URL || process.env.FRONTEND_BASE_URL || '';
  return String(raw).replace(/\/+$/, '');
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function urlEntry(base, locPath, lastmod) {
  const loc = `${base}${locPath.startsWith('/') ? locPath : `/${locPath}`}`;
  const lastmodTag = lastmod
    ? `\n    <lastmod>${escapeXml(lastmod.slice(0, 10))}</lastmod>`
    : '';
  return `  <url>\n    <loc>${escapeXml(loc)}</loc>${lastmodTag}\n  </url>`;
}

async function getSitemap(req, res) {
  try {
    const base = getSiteBaseUrl();
    if (!base) {
      return res.status(503).type('text/plain').send('SITE_URL no configurada');
    }

    const tournaments = await TournamentConfig.findAll();
    const today = new Date().toISOString();

    const urls = [
      urlEntry(base, '/home', today),
      urlEntry(base, '/calendar', today)
    ];

    for (const tournament of tournaments) {
      const id = tournament.torneo_id;
      const lastmod = tournament.first_game_date || tournament.created_at || today;
      const lastmodStr = lastmod instanceof Date ? lastmod.toISOString() : String(lastmod);

      urls.push(urlEntry(base, `/tourn_home/${id}`, lastmodStr));
      urls.push(urlEntry(base, `/stats?tournamentId=${id}`, lastmodStr));
      urls.push(urlEntry(base, `/calendar?tournamentId=${id}`, lastmodStr));
      urls.push(urlEntry(base, `/poolbrackets?tournamentId=${id}&view=all`, lastmodStr));
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`;

    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=3600');
    return res.send(xml);
  } catch (err) {
    console.error('sitemap:', err);
    return res.status(500).type('text/plain').send('Error generando sitemap');
  }
}

module.exports = { getSitemap };
