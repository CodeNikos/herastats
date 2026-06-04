const pool = require('../config/database');
const Player = require('./Player');

class Team {
  static async createTable() {
    const query = `
      CREATE TABLE IF NOT EXISTS team (
        team_id SERIAL PRIMARY KEY,
        torneo_id INTEGER NOT NULL REFERENCES torneo(torneo_id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        division VARCHAR(100),
        "group" VARCHAR(100),
        url_imagen TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    await pool.query(query);

    // Compatibilidad con esquemas previos: asegura columnas requeridas.
    await pool.query('ALTER TABLE team ADD COLUMN IF NOT EXISTS team_id SERIAL');
    await pool.query('ALTER TABLE team ADD COLUMN IF NOT EXISTS torneo_id INTEGER');
    await pool.query('ALTER TABLE team ADD COLUMN IF NOT EXISTS name VARCHAR(255)');
    await pool.query('ALTER TABLE team ADD COLUMN IF NOT EXISTS division VARCHAR(100)');
    await pool.query('ALTER TABLE team ADD COLUMN IF NOT EXISTS "group" VARCHAR(100)');
    await pool.query('ALTER TABLE team ADD COLUMN IF NOT EXISTS url_imagen TEXT');
    await pool.query('ALTER TABLE team ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
    await pool.query('ALTER TABLE team ADD COLUMN IF NOT EXISTS representative_email VARCHAR(255)');
    await pool.query('ALTER TABLE team ADD COLUMN IF NOT EXISTS representative_name VARCHAR(255)');
    await pool.query(
      'ALTER TABLE team ADD COLUMN IF NOT EXISTS games INTEGER NOT NULL DEFAULT 0'
    );
    await pool.query(
      'ALTER TABLE team ADD COLUMN IF NOT EXISTS wins INTEGER NOT NULL DEFAULT 0'
    );
    await pool.query(
      'ALTER TABLE team ADD COLUMN IF NOT EXISTS losses INTEGER NOT NULL DEFAULT 0'
    );

    // Rellena team_id en registros antiguos que no lo tengan.
    await pool.query('UPDATE team SET team_id = DEFAULT WHERE team_id IS NULL');

    // Si la tabla no tenía PK, usa team_id como PK.
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conrelid = 'team'::regclass
            AND contype = 'p'
        ) THEN
          ALTER TABLE team ADD CONSTRAINT team_pkey PRIMARY KEY (team_id);
        END IF;
      END $$;
    `);
  }

  static async findByTorneoId(torneoId) {
    const query = `
      SELECT team_id, torneo_id, name, division, "group", url_imagen,
             representative_email, representative_name, created_at,
             COALESCE(games, 0)::int AS games,
             COALESCE(wins, 0)::int AS wins,
             COALESCE(losses, 0)::int AS losses
      FROM team
      WHERE torneo_id = $1
      ORDER BY created_at DESC, team_id DESC
    `;
    const result = await pool.query(query, [torneoId]);
    return result.rows;
  }

  static async create(teamData) {
    const { torneo_id, name, division, group, url_imagen, representative_email, representative_name } = teamData;
    const q = `
      INSERT INTO team (torneo_id, name, division, "group", url_imagen, representative_email, representative_name)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING team_id, torneo_id, name, division, "group", url_imagen,
                representative_email, representative_name, created_at
    `;
    const repEmail =
      representative_email != null && String(representative_email).trim() !== ''
        ? String(representative_email).trim()
        : null;
    const repName =
      representative_name != null && String(representative_name).trim() !== ''
        ? String(representative_name).trim()
        : null;
    const result = await pool.query(q, [
      torneo_id,
      name,
      division || null,
      group || null,
      url_imagen || null,
      repEmail,
      repName
    ]);
    return result.rows[0];
  }

  static async update(teamId, torneoId, teamData) {
    const { name, division, group, url_imagen, representative_email, representative_name } = teamData;
    const hasRepEmail = Object.prototype.hasOwnProperty.call(teamData, 'representative_email');
    const hasRepName = Object.prototype.hasOwnProperty.call(teamData, 'representative_name');
    const repEmailNorm =
      representative_email != null && String(representative_email).trim() !== ''
        ? String(representative_email).trim()
        : null;
    const repNameNorm =
      representative_name != null && String(representative_name).trim() !== ''
        ? String(representative_name).trim()
        : null;
    const query = `
      UPDATE team
      SET
        name = COALESCE($3, name),
        division = COALESCE($4, division),
        "group" = COALESCE($5, "group"),
        url_imagen = COALESCE($6, url_imagen),
        representative_email = CASE WHEN $7 THEN $8 ELSE representative_email END,
        representative_name = CASE WHEN $9 THEN $10 ELSE representative_name END
      WHERE team_id = $1 AND torneo_id = $2
      RETURNING team_id, torneo_id, name, division, "group", url_imagen,
                representative_email, representative_name, created_at
    `;
    const result = await pool.query(query, [
      teamId,
      torneoId,
      name,
      division,
      group,
      url_imagen,
      hasRepEmail,
      repEmailNorm,
      hasRepName,
      repNameNorm
    ]);
    return result.rows[0] || null;
  }

  static async findByIdAndTorneo(teamId, torneoId) {
    const query = `
      SELECT team_id, torneo_id, name, division, "group", url_imagen,
             representative_email, representative_name, created_at,
             COALESCE(games, 0)::int AS games,
             COALESCE(wins, 0)::int AS wins,
             COALESCE(losses, 0)::int AS losses
      FROM team
      WHERE team_id = $1 AND torneo_id = $2
    `;
    const result = await pool.query(query, [teamId, torneoId]);
    return result.rows[0] || null;
  }

  /**
   * Elimina equipo: quita referencias en partidos, borra jugadores del equipo y la fila del equipo.
   */
  static async deleteByIdAndTorneo(teamId, torneoId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE game SET visitor = NULL WHERE visitor = $1', [teamId]);
      await client.query('UPDATE game SET "local" = NULL WHERE "local" = $1', [teamId]);
      await Player.deleteByTeamId(teamId, client);
      const del = await client.query(
        'DELETE FROM team WHERE team_id = $1 AND torneo_id = $2 RETURNING team_id',
        [teamId, torneoId]
      );
      await client.query('COMMIT');
      return del.rows[0] || null;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = Team;
