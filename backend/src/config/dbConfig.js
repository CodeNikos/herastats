/**
 * Configuración del pool PostgreSQL.
 * Prioridad: DATABASE_URL (inyectada por Seenode al vincular BD) > variables DB_*.
 */
function parseSslOption() {
  const raw = String(process.env.DB_SSL ?? '').trim().toLowerCase();
  if (raw === 'false' || raw === '0' || raw === 'disable') {
    return false;
  }
  if (raw === 'true' || raw === '1' || raw === 'require') {
    return { rejectUnauthorized: false };
  }
  if (process.env.NODE_ENV === 'production') {
    return { rejectUnauthorized: false };
  }
  return undefined;
}

function getPoolConfig() {
  const databaseUrl = String(process.env.DATABASE_URL || '').trim();

  if (databaseUrl) {
    const config = { connectionString: databaseUrl };
    const ssl = parseSslOption();
    if (ssl !== undefined) {
      config.ssl = ssl;
    }
    return config;
  }

  const host = process.env.DB_HOST;
  const database = process.env.DB_NAME;
  const user = process.env.DB_USER;

  if (!host || !database || !user) {
    console.warn(
      '[Herastats DB] Falta DATABASE_URL o el conjunto DB_HOST/DB_NAME/DB_USER. ' +
        'Revisa las variables de entorno del servicio.'
    );
  }

  const config = {
    host,
    port: Number(process.env.DB_PORT) || 5432,
    database,
    user,
    password: process.env.DB_PASSWORD
  };

  const ssl = parseSslOption();
  if (ssl !== undefined && ssl !== false) {
    config.ssl = ssl;
  }

  return config;
}

module.exports = {
  getPoolConfig,
  parseSslOption
};
