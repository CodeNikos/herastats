const path = require('path');
const dotenv = require('dotenv');

function loadEnv() {
  const envFile = process.env.ENV_FILE;
  if (envFile) {
    dotenv.config({ path: path.resolve(__dirname, '..', envFile) });
    return;
  }
  dotenv.config();
}

function parseArgs(argv) {
  const out = {
    dryRun: false,
    step: '',
    gameExternalId: '',
    forceSeed: false
  };
  for (const arg of argv) {
    if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--force-seed') out.forceSeed = true;
    else if (arg.startsWith('--step=')) out.step = arg.slice('--step='.length).trim();
    else if (arg.startsWith('--game-external-id=')) {
      out.gameExternalId = arg.slice('--game-external-id='.length).trim();
    }
  }
  return out;
}

function printSummary(summary) {
  console.log('Sync torneo 2 finalizada');
  console.log(`run_id: ${summary.runId}`);
  console.log(`tournament_id: ${summary.tournamentId}`);
  console.log(`dry_run: ${summary.dryRun ? 'true' : 'false'}`);
  console.log(`steps: ${summary.steps.join(', ')}`);
  for (const [step, stats] of Object.entries(summary.byStep)) {
    console.log(
      `- ${step}: created=${stats.created} updated=${stats.updated} skipped=${stats.skipped} errors=${stats.errors}`
    );
  }
  console.log(
    `totals: created=${summary.totals.created} updated=${summary.totals.updated} skipped=${summary.totals.skipped} errors=${summary.totals.errors}`
  );
}

async function main() {
  loadEnv();
  const pool = require('../src/config/database');
  const { syncTournament2 } = require('../src/services/tournament2Sync/tournament2SyncService');
  const options = parseArgs(process.argv.slice(2));
  try {
    const summary = await syncTournament2(options);
    printSummary(summary);
    process.exitCode = summary.totals.errors > 0 ? 2 : 0;
  } catch (error) {
    console.error('Error ejecutando sync:tournament-2:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end().catch(() => {});
  }
}

main();
