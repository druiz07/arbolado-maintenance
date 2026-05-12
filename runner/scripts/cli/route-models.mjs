#!/usr/bin/env node
// route-models — lee TODOS los session reports en docs/auto-maintenance/session-reports/,
// computa health metrics (ventana 14d), y decide model + promptVariant para
// classifier e invoker.
//
// Uso desde loop.yml:
//   node scripts/cli/route-models.mjs <playbook.yaml>
// Output stdout: JSON {classifier:{model,promptVariant,reason}, invoker:{...}, health:{...}}
//
// El input es la RUTA al YAML del playbook (no .json), porque route-models
// corre ANTES de load-playbook step (necesitamos el classifier_model antes
// de invocar al classifier). Para v1 (un único playbook activo) loop.yml
// pasa siempre bump-devdep-cve.yaml.

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { load as parseYaml } from 'js-yaml';
import { computeHealthMetrics } from '../../health-scorer/index.js';
import { routeClassifierModel, routeInvokerModel } from '../../router/index.js';
import { normalizePlaybook } from '../../playbook-loader/normalize.js';

const [playbookPath] = process.argv.slice(2);
if (!playbookPath) {
  console.error('Usage: route-models.mjs <playbook.yaml>');
  process.exit(2);
}

const playbookYaml = parseYaml(await readFile(playbookPath, 'utf8'));
const playbook = normalizePlaybook(playbookYaml);

// Cargar TODOS los reports (best-effort: ignorar JSONs malformados).
// Working-directory esperado: runner/. Ruta relativa por consistencia con
// otros CLIs del runner.
const REPORTS_BASE = '../docs/auto-maintenance/session-reports';
const reports = [];
let dateDirs;
try {
  dateDirs = await readdir(REPORTS_BASE);
} catch {
  dateDirs = [];
}
for (const d of dateDirs) {
  let files;
  try {
    files = await readdir(join(REPORTS_BASE, d));
  } catch {
    continue;
  }
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    try {
      reports.push(JSON.parse(await readFile(join(REPORTS_BASE, d, f), 'utf8')));
    } catch {
      // ignora reports corruptos — no bloquea el routing
    }
  }
}

const health = computeHealthMetrics(reports, { nowIso: new Date().toISOString() });
const classifier = routeClassifierModel({ healthMetrics: health, defaultModel: 'gemini-2.5-flash' });
const invoker = routeInvokerModel({ healthMetrics: health, playbook });

process.stdout.write(JSON.stringify({ classifier, invoker, health }) + '\n');
