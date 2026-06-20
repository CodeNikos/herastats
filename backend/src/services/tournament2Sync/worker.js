const { getTournament2SyncConfig, validateTournament2SyncConfig } = require('./config');
const {
  syncTournament2InitialSeed,
  syncTournament2MatchesTick
} = require('./tournament2SyncService');

function formatTotals(summary) {
  if (!summary || !summary.totals) return 'sin datos';
  const { created, updated, skipped, errors } = summary.totals;
  return `created=${created} updated=${updated} skipped=${skipped} errors=${errors}`;
}

async function startTournament2Worker() {
  const cfg = getTournament2SyncConfig();
  if (!cfg.enabled) {
    return null;
  }

  validateTournament2SyncConfig(cfg);
  let isRunning = false;

  const runTick = async () => {
    if (isRunning) {
      console.log('[tournament2-sync] tick omitido: ejecución previa en curso');
      return;
    }
    isRunning = true;
    try {
      const summary = await syncTournament2MatchesTick({ runSchedule: false });
      console.log('[tournament2-sync] tick scores-only completado', formatTotals(summary));
    } catch (error) {
      console.error('[tournament2-sync] error en tick 30m:', error.message);
    } finally {
      isRunning = false;
    }
  };

  if (cfg.initialSeedOnBoot) {
    try {
      const summary = await syncTournament2InitialSeed();
      console.log('[tournament2-sync] seed inicial completado', formatTotals(summary));
    } catch (error) {
      console.error('[tournament2-sync] error en seed inicial:', error.message);
    }
  }

  // Primer tick al arrancar: no esperar al intervalo de 30 min para schedule/scores.
  void runTick();

  const intervalMs = cfg.cronMinutes * 60 * 1000;
  const interval = setInterval(runTick, intervalMs);
  if (typeof interval.unref === 'function') interval.unref();

  console.log(`[tournament2-sync] worker activo cada ${cfg.cronMinutes} minutos`);
  return {
    stop() {
      clearInterval(interval);
    }
  };
}

module.exports = {
  startTournament2Worker
};
