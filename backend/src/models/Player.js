const pool = require('../config/database');

class Player {
  static async getColumnSet() {
    const result = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'player'
    `);
    return new Set(result.rows.map((row) => row.column_name));
  }

  static pickFirstColumn(columns, options) {
    return options.find((name) => columns.has(name)) || null;
  }

  static getInsertDefinition(columns) {
    const insertColumns = [];
    const valueAccessors = [];

    if (columns.has('torneo_id')) {
      insertColumns.push('torneo_id');
      valueAccessors.push((playerData) => Number(playerData.torneo_id));
    }
    if (columns.has('team_id')) {
      insertColumns.push('team_id');
      valueAccessors.push((playerData) => Number(playerData.team_id));
    }

    const numberColumn = Player.pickFirstColumn(columns, ['player_number', 'number', 'num_player']);
    if (!numberColumn) {
      throw new Error('La tabla player no tiene columna de número de jugador compatible');
    }
    insertColumns.push(numberColumn);
    valueAccessors.push((playerData) => Number(playerData.player_number));

    if (columns.has('player_name')) {
      insertColumns.push('player_name');
      valueAccessors.push((playerData) => String(playerData.player_name).trim());
    }
    if (columns.has('name')) {
      insertColumns.push('name');
      valueAccessors.push((playerData) => String(playerData.player_name).trim());
    }
    if (!columns.has('player_name') && !columns.has('name')) {
      throw new Error('La tabla player no tiene columna de nombre compatible');
    }

    if (columns.has('nickname')) {
      insertColumns.push('nickname');
      valueAccessors.push((playerData) => {
        const normalized = String(playerData.nickname || '').trim();
        return normalized || null;
      });
    }

    return { insertColumns, valueAccessors };
  }

  static mapRowToApiPlayer(row) {
    return {
      player_id: row.player_id ?? row.id ?? null,
      team_id: row.team_id ?? null,
      torneo_id: row.torneo_id ?? null,
      player_number: row.player_number ?? row.number ?? row.num_player ?? null,
      player_name: row.player_name ?? row.name ?? null,
      nickname: row.nickname ?? null,
      created_at: row.created_at ?? null
    };
  }

  static async createTable() {
    const query = `
      CREATE TABLE IF NOT EXISTS player (
        player_id SERIAL PRIMARY KEY,
        team_id INTEGER NOT NULL REFERENCES team(team_id) ON DELETE CASCADE,
        player_number INTEGER NOT NULL,
        player_name VARCHAR(255) NOT NULL,
        nickname VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    await pool.query(query);

    // Compatibilidad con posibles esquemas previos.
    await pool.query('ALTER TABLE player ADD COLUMN IF NOT EXISTS player_id SERIAL');
    await pool.query('ALTER TABLE player ADD COLUMN IF NOT EXISTS team_id INTEGER');
    await pool.query('ALTER TABLE player ADD COLUMN IF NOT EXISTS player_number INTEGER');
    await pool.query('ALTER TABLE player ADD COLUMN IF NOT EXISTS player_name VARCHAR(255)');
    await pool.query('ALTER TABLE player ADD COLUMN IF NOT EXISTS nickname VARCHAR(255)');
    await pool.query('ALTER TABLE player ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP');

    await pool.query(`
      ALTER TABLE player
      ADD COLUMN IF NOT EXISTS torneo_id INTEGER REFERENCES torneo(torneo_id) ON DELETE CASCADE
    `).catch(() => {
      return pool.query('ALTER TABLE player ADD COLUMN IF NOT EXISTS torneo_id INTEGER');
    });

    try {
      await pool.query(`
        UPDATE player p
        SET torneo_id = t.torneo_id
        FROM team t
        WHERE p.team_id = t.team_id AND p.torneo_id IS NULL
      `);
    } catch (e) {
      console.warn('Player.createTable torneo_id backfill:', e.message);
    }

    const columns = await Player.getColumnSet();
    if (columns.has('name') && columns.has('player_name')) {
      await pool.query(`
        UPDATE player
        SET player_name = name
        WHERE player_name IS NULL AND name IS NOT NULL
      `);
      await pool.query(`
        UPDATE player
        SET name = player_name
        WHERE name IS NULL AND player_name IS NOT NULL
      `);
    }

    const numberColumn = Player.pickFirstColumn(columns, ['player_number', 'number', 'num_player']);
    if (numberColumn) {
      const duplicates = await pool.query(`
        SELECT team_id, ${numberColumn} AS player_number, COUNT(*) AS total
        FROM player
        GROUP BY team_id, ${numberColumn}
        HAVING COUNT(*) > 1
        LIMIT 1
      `);

      if (duplicates.rows.length === 0) {
        await pool.query(`
          CREATE UNIQUE INDEX IF NOT EXISTS player_team_number_unique_idx
          ON player (team_id, ${numberColumn})
        `);
      }
    }
  }

  static async findByTorneoId(torneoId) {
    const columns = await Player.getColumnSet();
    const playerNumberExpr = Player.pickFirstColumn(columns, ['player_number', 'number', 'num_player']);
    const playerNameExpr = columns.has('player_name')
      ? 'p.player_name'
      : columns.has('name')
        ? 'p.name'
        : 'NULL';
    const nicknameExpr = columns.has('nickname') ? 'p.nickname' : 'NULL';

    if (!playerNumberExpr || playerNameExpr === 'NULL') {
      throw new Error('La tabla player no tiene columnas compatibles para listar jugadores');
    }

    const query = `
      SELECT
        p.player_id,
        p.team_id,
        p.${playerNumberExpr} AS player_number,
        ${playerNameExpr} AS player_name,
        ${nicknameExpr} AS nickname,
        p.created_at,
        t.name AS team_name,
        t.division AS category
      FROM player p
      INNER JOIN team t ON t.team_id = p.team_id
      WHERE t.torneo_id = $1
      ORDER BY p.created_at DESC, p.player_id DESC
    `;
    const result = await pool.query(query, [torneoId]);
    return result.rows;
  }

  static async create(playerData) {
    const torneoId = Number(playerData.torneo_id);
    const teamId = Number(playerData.team_id);
    if (!torneoId || torneoId <= 0) {
      throw new Error('torneo_id es obligatorio para crear jugador');
    }
    if (!teamId || teamId <= 0) {
      throw new Error('team_id es obligatorio para crear jugador');
    }

    const columns = await Player.getColumnSet();
    const { insertColumns, valueAccessors } = Player.getInsertDefinition(columns);
    const values = valueAccessors.map((getValue) => getValue(playerData));
    const placeholders = insertColumns.map((_, index) => `$${index + 1}`).join(', ');
    const query = `
      INSERT INTO player (${insertColumns.join(', ')})
      VALUES (${placeholders})
      RETURNING *
    `;
    const result = await pool.query(query, values);
    return Player.mapRowToApiPlayer(result.rows[0]);
  }

  static async createMany(players) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const createdPlayers = [];
      const columns = await Player.getColumnSet();
      const { insertColumns, valueAccessors } = Player.getInsertDefinition(columns);
      const placeholders = insertColumns.map((_, index) => `$${index + 1}`).join(', ');
      const insertQuery = `
        INSERT INTO player (${insertColumns.join(', ')})
        VALUES (${placeholders})
        RETURNING *
      `;

      for (const player of players) {
        const torneoId = Number(player.torneo_id);
        const teamId = Number(player.team_id);
        if (!torneoId || torneoId <= 0) {
          throw new Error(`torneo_id inválido en fila ${player.index || 'desconocida'}`);
        }
        if (!teamId || teamId <= 0) {
          throw new Error(`team_id inválido en fila ${player.index || 'desconocida'}`);
        }

        const values = valueAccessors.map((getValue) => getValue(player));
        const result = await client.query(insertQuery, values);
        createdPlayers.push(Player.mapRowToApiPlayer(result.rows[0]));
      }

      await client.query('COMMIT');
      return createdPlayers;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async existsTeamInTournament(teamId, torneoId) {
    const query = `
      SELECT team_id
      FROM team
      WHERE team_id = $1 AND torneo_id = $2
      LIMIT 1
    `;
    const result = await pool.query(query, [teamId, torneoId]);
    return Boolean(result.rows[0]);
  }

  static async existsTeamInTournamentWithCategory(teamId, torneoId, category) {
    const query = `
      SELECT team_id
      FROM team
      WHERE team_id = $1
        AND torneo_id = $2
        AND LOWER(TRIM(COALESCE(division, ''))) = LOWER(TRIM($3))
      LIMIT 1
    `;
    const result = await pool.query(query, [teamId, torneoId, category]);
    return Boolean(result.rows[0]);
  }

  static async existsPlayerNumberInTeam(teamId, playerNumber) {
    const columns = await Player.getColumnSet();
    const numberColumn = Player.pickFirstColumn(columns, ['player_number', 'number', 'num_player']);
    if (!numberColumn) {
      throw new Error('La tabla player no tiene columna de número de jugador compatible');
    }

    const query = `
      SELECT 1
      FROM player
      WHERE team_id = $1 AND ${numberColumn} = $2
      LIMIT 1
    `;
    const result = await pool.query(query, [teamId, playerNumber]);
    return Boolean(result.rows[0]);
  }

  /**
   * Elimina todos los jugadores del equipo (misma transacción si se pasa client).
   */
  static async deleteByTeamId(teamId, client = null) {
    const executor = client || pool;
    await executor.query('DELETE FROM player WHERE team_id = $1', [teamId]);
  }
}

module.exports = Player;
