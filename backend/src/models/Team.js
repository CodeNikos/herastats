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
    const sets = [];
    const values = [teamId, torneoId];
    let paramIndex = 3;

    if (Object.prototype.hasOwnProperty.call(teamData, 'name')) {
      sets.push(`name = $${paramIndex++}`);
      values.push(
        teamData.name != null && String(teamData.name).trim() !== ''
          ? String(teamData.name).trim()
          : null
      );
    }
    if (Object.prototype.hasOwnProperty.call(teamData, 'division')) {
      sets.push(`division = $${paramIndex++}`);
      values.push(
        teamData.division != null && String(teamData.division).trim() !== ''
          ? String(teamData.division).trim()
          : null
      );
    }
    if (Object.prototype.hasOwnProperty.call(teamData, 'group')) {
      sets.push(`"group" = $${paramIndex++}`);
      values.push(
        teamData.group != null && String(teamData.group).trim() !== ''
          ? String(teamData.group).trim()
          : null
      );
    }
    if (Object.prototype.hasOwnProperty.call(teamData, 'url_imagen')) {
      sets.push(`url_imagen = $${paramIndex++}`);
      values.push(teamData.url_imagen || null);
    }
    if (Object.prototype.hasOwnProperty.call(teamData, 'representative_email')) {
      sets.push(`representative_email = $${paramIndex++}`);
      values.push(
        teamData.representative_email != null && String(teamData.representative_email).trim() !== ''
          ? String(teamData.representative_email).trim()
          : null
      );
    }
    if (Object.prototype.hasOwnProperty.call(teamData, 'representative_name')) {
      sets.push(`representative_name = $${paramIndex++}`);
      values.push(
        teamData.representative_name != null && String(teamData.representative_name).trim() !== ''
          ? String(teamData.representative_name).trim()
          : null
      );
    }

    if (sets.length === 0) {
      return this.findByIdAndTorneo(teamId, torneoId);
    }

    const query = `
      UPDATE team
      SET ${sets.join(', ')}
      WHERE team_id = $1 AND torneo_id = $2
      RETURNING team_id, torneo_id, name, division, "group", url_imagen,
                representative_email, representative_name, created_at
    `;
    const result = await pool.query(query, values);
    return result.rows[0] || null;
  }

  /**
   * Actualiza solo el campo "group" de varios equipos del torneo en una transacción.
   * @param {number|string} torneoId
   * @param {Array<{ teamId: number|string, group: string|null|undefined }>} assignments
   */
  static async bulkUpdateGroups(torneoId, assignments) {
    if (!Array.isArray(assignments) || assignments.length === 0) {
      return [];
    }

    const client = await pool.connect();
    const updated = [];
    try {
      await client.query('BEGIN');
      for (const item of assignments) {
        const teamId = Number(item.teamId);
        if (!Number.isFinite(teamId) || teamId <= 0) {
          throw new Error(`teamId inválido: ${item.teamId}`);
        }
        const groupValue =
          item.group != null && String(item.group).trim() !== ''
            ? String(item.group).trim()
            : null;
        const result = await client.query(
          `
            UPDATE team
            SET "group" = $3
            WHERE team_id = $1 AND torneo_id = $2
            RETURNING team_id, torneo_id, name, division, "group", url_imagen,
                      representative_email, representative_name, created_at
          `,
          [teamId, torneoId, groupValue]
        );
        if (!result.rows[0]) {
          throw new Error(`Equipo ${teamId} no encontrado en el torneo ${torneoId}`);
        }
        updated.push(result.rows[0]);
      }
      await client.query('COMMIT');
      return updated;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
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
