const { Pool } = require('pg');
const { getPoolConfig } = require('./dbConfig');

const pool = new Pool(getPoolConfig());

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
