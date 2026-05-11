#!/usr/bin/env node
// Uso desde pr-merged-listener.yml:
//   node scripts/cli/update-session-report-on-merge.mjs <signal-hash> <merged:true|false>
// Localiza el report por signal-hash, sobreescribe pr_merged, exit 0 si OK, 1 si no encuentra report.

import { findReportBySignalHash, updateReportPrMerged } from '../../update-merge/index.js';

const [signalHash, mergedStr] = process.argv.slice(2);
if (!signalHash || (mergedStr !== 'true' && mergedStr !== 'false')) {
  console.error('Usage: update-session-report-on-merge.mjs <signal-hash> <true|false>');
  process.exit(2);
}
const merged = mergedStr === 'true';

const found = await findReportBySignalHash('..', signalHash);
if (!found) {
  console.error(`No session report found for signal_hash=${signalHash}`);
  process.exit(1);
}
await updateReportPrMerged(found.path, merged);
console.log(`Updated ${found.path} → pr_merged=${merged}`);
