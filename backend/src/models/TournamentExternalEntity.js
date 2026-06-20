const crypto = require('crypto');
const pool = require('../config/database');

class TournamentExternalEntity {
  static async createTable() {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tournament_external_entities (
        id SERIAL PRIMARY KEY,
        torneo_id INTEGER NOT NULL REFERENCES torneo(torneo_id) ON DELETE CASCADE,
        entity_type VARCHAR(32) NOT NULL,
        external_id VARCHAR(255) NOT NULL,
        internal_id INTEGER NOT NULL,
        payload_hash VARCHAR(64),
        events_synced BOOLEAN NOT NULL DEFAULT FALSE,
        events_synced_at TIMESTAMP,
        last_synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (torneo_id, entity_type, external_id)
      )
    `);
    await pool.query(
      'CREATE INDEX IF NOT EXISTS idx_tournament_external_entities_lookup ON tournament_external_entities(torneo_id, entity_type, external_id)'
    );
    await pool.query(
      'CREATE INDEX IF NOT EXISTS idx_tournament_external_entities_internal ON tournament_external_entities(torneo_id, entity_type, internal_id)'
    );
    await pool.query(
      'ALTER TABLE tournament_external_entities ADD COLUMN IF NOT EXISTS payload_hash VARCHAR(64)'
    );
    await pool.query(
      'ALTER TABLE tournament_external_entities ADD COLUMN IF NOT EXISTS events_synced BOOLEAN NOT NULL DEFAULT FALSE'
    );
    await pool.query(
      'ALTER TABLE tournament_external_entities ADD COLUMN IF NOT EXISTS events_synced_at TIMESTAMP'
    );
    await pool.query(
      'ALTER TABLE tournament_external_entities ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
    );
    await pool.query(
      'ALTER TABLE tournament_external_entities ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
    );
    await pool.query(
      'ALTER TABLE tournament_external_entities ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
    );

    await pool.query(`
      CREATE TABLE IF NOT EXISTS tournament_external_sync_log (
        id SERIAL PRIMARY KEY,
        run_id VARCHAR(64) NOT NULL,
        torneo_id INTEGER NOT NULL REFERENCES torneo(torneo_id) ON DELETE CASCADE,
        step VARCHAR(32) NOT NULL,
        entity_type VARCHAR(32),
        external_id VARCHAR(255),
        internal_id INTEGER,
        action VARCHAR(16) NOT NULL,
        message TEXT,
        error_detail TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(
      'CREATE INDEX IF NOT EXISTS idx_tournament_external_sync_log_run ON tournament_external_sync_log(run_id, torneo_id)'
    );
  }

  static stableStringify(value) {
    if (value === null || value === undefined) return String(value);
    if (typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stableStringify(item)).join(',')}]`;
    }
    const keys = Object.keys(value).sort();
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${this.stableStringify(value[key])}`)
      .join(',')}}`;
  }

  static hashPayload(payload) {
    if (payload === undefined) return null;
    const raw = this.stableStringify(payload);
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  static async findMapping({ torneoId, entityType, externalId }) {
    const result = await pool.query(
      `SELECT id, torneo_id, entity_type, external_id, internal_id, payload_hash,
              events_synced, events_synced_at, last_synced_at, created_at, updated_at
       FROM tournament_external_entities
       WHERE torneo_id = $1 AND entity_type = $2 AND external_id = $3
       LIMIT 1`,
      [torneoId, entityType, externalId]
    );
    return result.rows[0] || null;
  }

  static async findMappingByInternalId({ torneoId, entityType, internalId }) {
    const result = await pool.query(
      `SELECT id, torneo_id, entity_type, external_id, internal_id, payload_hash,
              events_synced, events_synced_at, last_synced_at, created_at, updated_at
       FROM tournament_external_entities
       WHERE torneo_id = $1 AND entity_type = $2 AND internal_id = $3
       LIMIT 1`,
      [torneoId, entityType, internalId]
    );
    return result.rows[0] || null;
  }

  static async upsertMapping({
    torneoId,
    entityType,
    externalId,
    internalId,
    payload,
    keepEventsSynced = false
  }) {
    const payloadHash = this.hashPayload(payload);
    const result = await pool.query(
      `INSERT INTO tournament_external_entities
         (torneo_id, entity_type, external_id, internal_id, payload_hash, events_synced, events_synced_at, last_synced_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, FALSE, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (torneo_id, entity_type, external_id)
       DO UPDATE
       SET internal_id = EXCLUDED.internal_id,
           payload_hash = EXCLUDED.payload_hash,
           events_synced = CASE
             WHEN $6 THEN tournament_external_entities.events_synced
             ELSE FALSE
           END,
           events_synced_at = CASE
             WHEN $6 THEN tournament_external_entities.events_synced_at
             ELSE NULL
           END,
           last_synced_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       RETURNING id, torneo_id, entity_type, external_id, internal_id, payload_hash,
                 events_synced, events_synced_at, last_synced_at, created_at, updated_at`,
      [torneoId, entityType, externalId, internalId, payloadHash, keepEventsSynced]
    );
    return result.rows[0];
  }

  static async markEventsSynced({ torneoId, gameExternalId }) {
    await pool.query(
      `UPDATE tournament_external_entities
       SET events_synced = TRUE,
           events_synced_at = CURRENT_TIMESTAMP,
           last_synced_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE torneo_id = $1 AND entity_type = 'game' AND external_id = $2`,
      [torneoId, gameExternalId]
    );
  }

  static async logSync(entry) {
    const {
      runId,
      torneoId,
      step,
      entityType = null,
      externalId = null,
      internalId = null,
      action,
      message = null,
      errorDetail = null
    } = entry;
    await pool.query(
      `INSERT INTO tournament_external_sync_log
       (run_id, torneo_id, step, entity_type, external_id, internal_id, action, message, error_detail)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [runId, torneoId, step, entityType, externalId, internalId, action, message, errorDetail]
    );
  }
}

module.exports = TournamentExternalEntity;
