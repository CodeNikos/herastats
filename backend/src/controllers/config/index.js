/**
 * Punto de extensión para dividir configController por dominio.
 * Por ahora reexporta módulos ya extraídos; el resto sigue en configController.js.
 */
const { finalizeGameScoresAndStandingsHooks } = require('./finalizeHooks');

module.exports = {
  finalizeGameScoresAndStandingsHooks
};
