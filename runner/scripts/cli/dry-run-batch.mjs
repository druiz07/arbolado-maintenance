#!/usr/bin/env node
// Uso: node scripts/cli/dry-run-batch.mjs <signals.json> <package-json-fixture>
//
// Dry-run determinista: por cada signal corre el precondition contra el
// package.json fixture y reporta failure_stage. NO invoca classifier ni Aider
// real (esos cuestan tokens y, con dataset histórico, no aportan info nueva
// vs lo que ya cubren los 353 tests unitarios). Salida JSON con results[] +
// summary{} a stdout.

import { readFile } from 'node:fs/promises';
import { dryRunBatch } from '../../dependabot/dry-run-batch.js';

const [signalsArg, packageJsonArg] = process.argv.slice(2);
if (!signalsArg || !packageJsonArg) {
  console.error('Usage: dry-run-batch.mjs <signals.json> <package-json-fixture>');
  process.exit(2);
}

const signalsDoc = JSON.parse(await readFile(signalsArg, 'utf8'));
const signals = Array.isArray(signalsDoc) ? signalsDoc : signalsDoc.signals;
if (!Array.isArray(signals)) {
  console.error('signals.json must be an array or have a signals[] field');
  process.exit(2);
}

const packageJson = JSON.parse(await readFile(packageJsonArg, 'utf8'));

const out = dryRunBatch({ signals, packageJson });
process.stdout.write(JSON.stringify(out, null, 2));
process.stderr.write(
  `\n[dry-run-batch] total=${out.summary.total} would_invoke_aider=${out.summary.would_invoke_aider} ` +
    `unique=${out.summary.unique_advisories}\n`,
);
