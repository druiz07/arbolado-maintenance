#!/usr/bin/env node
// Uso:
//   node scripts/cli/override-dry-run.mjs <signals.json> <package-json-fixture> [--json]
//
// Smoke OFFLINE y determinista del playbook bump-transitive-via-overrides.
// Por cada signal corre el orquestador runOverridePlaybook con:
//   - un filesystem EN MEMORIA (clona el package.json fixture; nunca toca disco)
//   - npm SIMULADO (install/test/build ok, `npm audit --json` limpio)
//
// No invoca npm real, ni red, ni Aider, ni LLM, ni tokens. Valida el ROUTING
// determinista del flujo (transitive → applied/noop ; direct → skipped) y la
// mecánica de override/rollback, NO que npm resuelva realmente la transitiva
// (eso exige npm real y se prueba en el smoke con --real fuera de offline).
// La salida marca mode:"simulated" para no confundir el alcance.

import { readFile } from 'node:fs/promises';
import { runOverridePlaybook } from '../../overrides/index.js';

const [signalsArg, fixtureArg, ...flags] = process.argv.slice(2);
if (!signalsArg || !fixtureArg) {
  console.error('Usage: override-dry-run.mjs <signals.json> <package-json-fixture> [--json]');
  process.exit(2);
}
const asJson = flags.includes('--json');

const signalsDoc = JSON.parse(await readFile(signalsArg, 'utf8'));
const signals = Array.isArray(signalsDoc) ? signalsDoc : signalsDoc.signals;
if (!Array.isArray(signals)) {
  console.error('signals.json must be an array or have a signals[] field');
  process.exit(2);
}
const fixtureText = await readFile(fixtureArg, 'utf8');

function simulatedIo(fixtureBody) {
  const fs = new Map();
  return {
    fs,
    io: {
      async readFile(p) {
        if (fs.has(p)) return fs.get(p);
        if (p.endsWith('package.json')) return fixtureBody; // cualquier package.json → fixture
        throw new Error(`ENOENT ${p}`); // lockfile inexistente: snapshot lo tolera
      },
      async writeFile(p, t) { fs.set(p, t); },
      async run(cmd) {
        if (cmd === 'npm audit --json') return { code: 0, stdout: '{"vulnerabilities":{}}', stderr: '' };
        return { code: 0, stdout: '', stderr: '' };
      },
      async rm(p) { fs.delete(p); },
    },
  };
}

const results = [];
const summary = { total: 0, applied: 0, noop: 0, skipped: 0, blocked: 0, rolled_back: 0, by_stage: {} };

for (const signal of signals) {
  summary.total += 1;
  const { io } = simulatedIo(fixtureText);
  let r;
  try {
    r = await runOverridePlaybook({ signal, repoDir: '/sim', io });
  } catch (e) {
    r = { status: 'error', stage: 'exception', detail: String(e.message || e) };
  }
  summary[r.status] = (summary[r.status] ?? 0) + 1;
  const stageKey = `${r.status}:${r.stage ?? '-'}`;
  summary.by_stage[stageKey] = (summary.by_stage[stageKey] ?? 0) + 1;
  results.push({
    dependency: signal.dependency,
    is_transitive: signal.is_transitive,
    advisory_id: signal.advisory_id ?? null,
    status: r.status,
    stage: r.stage ?? null,
    targetVersion: r.targetVersion ?? null,
  });
}

const out = { mode: 'simulated', results, summary };
if (asJson) {
  process.stdout.write(JSON.stringify(out, null, 2));
} else {
  process.stdout.write(JSON.stringify(summary, null, 2));
}
process.stderr.write(
  `\n[override-dry-run] mode=simulated total=${summary.total} applied=${summary.applied} ` +
    `noop=${summary.noop} skipped=${summary.skipped} rolled_back=${summary.rolled_back} blocked=${summary.blocked}\n`,
);
