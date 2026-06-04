module.exports = async () => {
  try {
    const pool = require('./src/config/database');
    await pool.end();
  } catch (_) {
    /* ignore */
  }
};
