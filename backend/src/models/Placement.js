const pool = require('../config/database');

class Placement {
  /**
   * Posiciones finales por categoría (tabla `placements`).
   * @returns {Promise<Array<{ placement_number: number, team_name: string, division: string, team_id: number|null, team_image: string|null }>>}
   */
  static async findByTorneoId(torneoId) {
    const tid = Number(torneoId);
    if (!Number.isFinite(tid) || tid <= 0) return [];

    const q = `
      SELECT
        p.placement_number,
        p.team_name,
        p.division,
        MAX(t.team_id)::int AS team_id,
        MAX(t.url_imagen) AS team_image
      FROM placements p
      LEFT JOIN team t
        ON t.torneo_id = p.torneo_id
       AND LOWER(TRIM(t.name)) = LOWER(TRIM(p.team_name))
       AND (
         LOWER(TRIM(COALESCE(t.division, ''))) = LOWER(TRIM(COALESCE(p.division, '')))
         OR TRIM(COALESCE(p.division, '')) = ''
       )
      WHERE p.torneo_id = $1
      GROUP BY p.placement_number, p.team_name, p.division
      ORDER BY p.placement_number ASC, p.division ASC
    `;
    const result = await pool.query(q, [tid]);
    return result.rows.map((row) => ({
      placement_number: Number(row.placement_number),
      team_name: String(row.team_name ?? '').trim(),
      division: String(row.division ?? '').trim(),
      team_id: row.team_id != null ? Number(row.team_id) : null,
      team_image: row.team_image != null ? String(row.team_image).trim() : null
    }));
  }
}

module.exports = Placement;
