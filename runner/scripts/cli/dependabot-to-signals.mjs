#!/usr/bin/env node
// Uso: node scripts/cli/dependabot-to-signals.mjs <snapshot.json> [--keep-unpatchable]
//
// Lee un snapshot de Dependabot alerts (gh api repos/<owner>/<repo>/dependabot/alerts)
// y emite a stdout un JSON con { signals: [...], skipped: [...] }.
//
// Diseñado para Sesión F del plan G.5 Sem 4 — validación batch del invoker con
// dataset real. NO se usa en el loop de producción (allí el Worker normaliza
// y entrega signals directamente vía signal-loader/KV).

import { readFile } from 'node:fs/promises';
import { normalizeSnapshot } from '../../dependabot/normalize.js';

const args = process.argv.slice(2);
const keepUnpatchable = args.includes('--keep-unpatchable');
const positional = args.filter((a) => !a.startsWith('--'));
const [snapshotPath] = positional;

if (!snapshotPath) {
  console.error('Usage: dependabot-to-signals.mjs <snapshot.json> [--keep-unpatchable]');
  process.exit(2);
}

const raw = await readFile(snapshotPath, 'utf8');
const alerts = JSON.parse(raw);
if (!Array.isArray(alerts)) {
  console.error('Expected JSON array of Dependabot alerts');
  process.exit(2);
}

const { signals, skipped } = normalizeSnapshot(alerts, {
  skipUnpatchable: !keepUnpatchable,
});

process.stdout.write(JSON.stringify({ signals, skipped }, null, 2));
process.stderr.write(
  `\n[dependabot-to-signals] in=${alerts.length} signals=${signals.length} skipped=${skipped.length}\n`,
);
