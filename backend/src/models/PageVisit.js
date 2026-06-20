const crypto = require('crypto');
const pool = require('../config/database');

class PageVisit {
  static async createTable() {
    const createQuery = `
      CREATE TABLE IF NOT EXISTS page_visits (
        id SERIAL PRIMARY KEY,
        visited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        path VARCHAR(512) NOT NULL,
        query_string VARCHAR(1024),
        tournament_id INTEGER,
        referrer VARCHAR(1024),
        user_agent VARCHAR(512),
        country_code VARCHAR(8),
        country_name VARCHAR(128),
        visitor_key VARCHAR(64) NOT NULL,
        session_key VARCHAR(64),
        is_bot BOOLEAN NOT NULL DEFAULT FALSE
      )
    `;
    await pool.query(createQuery);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_page_visits_visited_at ON page_visits (visited_at DESC)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_page_visits_country ON page_visits (country_code)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_page_visits_path ON page_visits (path)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_page_visits_visitor_key ON page_visits (visitor_key)
    `);
  }

  static async insert(row) {
    const query = `
      INSERT INTO page_visits (
        path, query_string, tournament_id, referrer, user_agent,
        country_code, country_name, visitor_key, session_key, is_bot
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id
    `;
    const result = await pool.query(query, [
      row.path,
      row.query_string || null,
      row.tournament_id ?? null,
      row.referrer || null,
      row.user_agent || null,
      row.country_code || null,
      row.country_name || null,
      row.visitor_key,
      row.session_key || null,
      Boolean(row.is_bot)
    ]);
    return result.rows[0];
  }

  static buildVisitorKey(ip, userAgent, dateKey) {
    const salt = process.env.ANALYTICS_IP_SALT || 'herastats-analytics';
    const raw = `${salt}|${ip || ''}|${userAgent || ''}|${dateKey || ''}`;
    return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
  }

  static humanOnlyClause(alias = 'page_visits') {
    return `${alias}.is_bot = FALSE`;
  }

  static async getSummary({ from, to } = {}) {
    const human = PageVisit.humanOnlyClause();
    const params = [];
    const rangeFilter = PageVisit._buildDateFilter(params, from, to, 'visited_at');
    const rangeWhere = rangeFilter ? `AND ${rangeFilter}` : '';

    const totals = (
      await pool.query(
        `
        SELECT
          COUNT(*) FILTER (WHERE visited_at >= CURRENT_DATE)::int AS today,
          COUNT(*) FILTER (WHERE visited_at >= CURRENT_DATE - INTERVAL '7 days')::int AS last_7d,
          COUNT(*) FILTER (WHERE visited_at >= CURRENT_DATE - INTERVAL '30 days')::int AS last_30d,
          COUNT(*) FILTER (WHERE ${human} ${rangeWhere})::int AS filtered_total,
          COUNT(DISTINCT visitor_key) FILTER (WHERE ${human} ${rangeWhere})::int AS unique_visitors,
          COUNT(DISTINCT country_code) FILTER (WHERE country_code IS NOT NULL AND ${human} ${rangeWhere})::int AS countries
        FROM page_visits
        WHERE TRUE
        `,
        params
      )
    ).rows[0];

    const topCountries = (
      await pool.query(
        `
        SELECT country_code, COALESCE(MAX(country_name), country_code) AS country_name, COUNT(*)::int AS visits
        FROM page_visits
        WHERE country_code IS NOT NULL AND ${human} ${rangeWhere}
        GROUP BY country_code
        ORDER BY visits DESC
        LIMIT 10
        `,
        [...params]
      )
    ).rows;

    const topPaths = (
      await pool.query(
        `
        SELECT path, COUNT(*)::int AS visits
        FROM page_visits
        WHERE ${human} ${rangeWhere}
        GROUP BY path
        ORDER BY visits DESC
        LIMIT 10
        `,
        [...params]
      )
    ).rows;

    return { totals, topCountries, topPaths };
  }

  static async listVisits({ from, to, country, path, page = 1, limit = 50 } = {}) {
    const params = [];
    const conditions = [PageVisit.humanOnlyClause()];
    const dateFilter = PageVisit._buildDateFilter(params, from, to, 'visited_at');
    if (dateFilter) conditions.push(dateFilter);
    if (country) {
      params.push(String(country).toUpperCase());
      conditions.push(`country_code = $${params.length}`);
    }
    if (path) {
      params.push(`%${String(path).trim()}%`);
      conditions.push(`path ILIKE $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const safePage = Math.max(Number(page) || 1, 1);
    const offset = (safePage - 1) * safeLimit;

    params.push(safeLimit);
    const limitIdx = params.length;
    params.push(offset);
    const offsetIdx = params.length;

    const rows = (
      await pool.query(
        `
        SELECT id, visited_at, path, query_string, tournament_id, referrer,
               country_code, country_name, session_key
        FROM page_visits
        ${where}
        ORDER BY visited_at DESC
        LIMIT $${limitIdx} OFFSET $${offsetIdx}
        `,
        params
      )
    ).rows;

    const countParams = params.slice(0, params.length - 2);
    const total = (
      await pool.query(`SELECT COUNT(*)::int AS total FROM page_visits ${where}`, countParams)
    ).rows[0]?.total || 0;

    return { rows, total, page: safePage, limit: safeLimit };
  }

  static async getTimeseries({ from, to, days = 30 } = {}) {
    const params = [];
    let dateFilter = PageVisit._buildDateFilter(params, from, to, 'visited_at');
    if (!dateFilter) {
      params.push(Math.min(Math.max(Number(days) || 30, 1), 365));
      dateFilter = `visited_at >= CURRENT_DATE - ($${params.length}::int * INTERVAL '1 day')`;
    }

    const rows = (
      await pool.query(
        `
        SELECT DATE(visited_at AT TIME ZONE 'UTC') AS day, COUNT(*)::int AS visits,
               COUNT(DISTINCT visitor_key)::int AS unique_visitors
        FROM page_visits
        WHERE ${dateFilter} AND ${PageVisit.humanOnlyClause()}
        GROUP BY day
        ORDER BY day ASC
        `,
        params
      )
    ).rows;

    return rows;
  }

  static async purgeOlderThan(days) {
    const retention = Math.max(Number(days) || 90, 7);
    const result = await pool.query(
      `DELETE FROM page_visits WHERE visited_at < NOW() - ($1::int * INTERVAL '1 day')`,
      [retention]
    );
    return result.rowCount || 0;
  }

  static _buildDateFilter(params, from, to, column) {
    const parts = [];
    if (from) {
      params.push(from);
      parts.push(`${column} >= $${params.length}::timestamptz`);
    }
    if (to) {
      params.push(to);
      parts.push(`${column} <= $${params.length}::timestamptz`);
    }
    return parts.join(' AND ');
  }
}

module.exports = PageVisit;
