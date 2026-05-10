// session-report — punto de entrada único.
// Spec: docs/auto-maintenance/arranque-plan.md §5.

export { buildReport } from './builder.js';
export { validateReport, REPORT_FIELDS, FAILURE_STAGES } from './schema.js';
export { writeReport, computeReportPath } from './writer.js';
export { generateSignalHash } from './signal-hash.js';

import { buildReport } from './builder.js';
import { writeReport } from './writer.js';

export async function buildAndWriteReport({ repoRoot, ...buildArgs }) {
  const report = buildReport(buildArgs);
  const result = await writeReport(repoRoot, report);
  return { report, ...result };
}
