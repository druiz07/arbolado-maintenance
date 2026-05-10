#!/usr/bin/env node
// Uso: node enforce-max-diff.mjs <playbook-json> <git-stat-output>

import { readFile } from 'node:fs/promises';
import { enforceMaxDiff, parseDiffStat } from '../../policy-engine/index.js';

const [pbJsonPath, statPath] = process.argv.slice(2);
if (!pbJsonPath || !statPath) {
  console.error('usage: enforce-max-diff.mjs <playbook-json> <git-stat>');
  process.exit(2);
}

try {
  const pb = JSON.parse(await readFile(pbJsonPath, 'utf8'));
  const stat = await readFile(statPath, 'utf8');
  // parseDiffStat returns a number (or NaN), not { totalLines }
  const observed = parseDiffStat(stat);
  const result = enforceMaxDiff(observed, pb.constraints.max_diff_lines);
  process.stdout.write(JSON.stringify({ ...result, observed, max: pb.constraints.max_diff_lines }));
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
