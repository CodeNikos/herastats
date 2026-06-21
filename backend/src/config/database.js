const { Pool } = require('pg');
const { getPoolConfig, getPoolRuntimeOptions } = require('./dbConfig');

const pool = new Pool(getPoolConfig());
const poolLimits = getPoolRuntimeOptions();

pool.on('error', (err) => {
  console.error('[Herastats DB] error inesperado en el pool:', err.message || err);
});

if (process.env.NODE_ENV !== 'test') {
  console.log(
    `[Herastats DB] pool max=${poolLimits.max} idleTimeoutMs=${poolLimits.idleTimeoutMillis}`
  );
}

// Verificar conexión al arranque (omitido en tests para no dejar handles abiertos)
if (process.env.NODE_ENV !== 'test') {
  pool.connect((err, client, release) => {
    if (err) {
      console.error('Error conectando a la base de datos:', err.stack);
    } else {
      console.log('Conexión a PostgreSQL exitosa');
      release();
    }
  });
}

module.exports = pool;
