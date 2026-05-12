#!/usr/bin/env node
// Uso desde loop.yml:
//   env GEMINI_API_KEY=... node scripts/cli/classify-signal.mjs <signal.json> <playbooks-dir>
// Imprime a stdout JSON con la decisión del classifier.
// Exit 0 incluso si decision.ok=false (failure_stage='classifier' lo recoge el report).

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { load as parseYaml } from 'js-yaml';
import { classifySignal } from '../../classifier/index.js';

// Args posicionales: <signal.json> <playbooks-dir>. Flag opcional: --model <id>.
// El router (Sem 4) pasa --model gemini-2.5-pro cuando escala el classifier;
// por defecto es gemini-2.5-flash (compat con Sem 3).
const args = process.argv.slice(2);
let model;
const modelIdx = args.indexOf('--model');
if (modelIdx !== -1) {
  model = args[modelIdx + 1];
  args.splice(modelIdx, 2);
}
const [signalPath, playbooksDir] = args;
if (!signalPath || !playbooksDir) {
  console.error('Usage: classify-signal.mjs [--model <id>] <signal.json> <playbooks-dir>');
  process.exit(2);
}
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('Missing GEMINI_API_KEY');
  process.exit(2);
}

const signal = JSON.parse(await readFile(signalPath, 'utf8'));

const playbookFiles = (await readdir(playbooksDir)).filter((f) => f.endsWith('.yaml'));
const playbooks = await Promise.all(
  playbookFiles.map(async (f) => {
    const yaml = parseYaml(await readFile(path.join(playbooksDir, f), 'utf8'));
    return {
      id: yaml.id,
      description: (yaml.description || '').replace(/\s+/g, ' ').trim(),
      classifierRules: (yaml.classifier?.prompt || '').replace(/\s+/g, ' ').trim().slice(0, 800),
      classifyConfidenceMin: yaml.constraints?.classify_confidence_min ?? 0.7,
      marginThreshold: yaml.classifier?.margin_threshold ?? 0.15,
    };
  }),
);

const decision = await classifySignal({ signal, playbooks, apiKey, model });
const out = decision.ok
  ? { ok: true, playbookId: decision.playbookId, margin: decision.margin, confidence: decision.confidence, top1: decision.top1, top2: decision.top2, rankings: decision.rankings, usage: decision.usage }
  : { ok: false, reason: decision.reason, playbookHint: decision.playbookHint, top1: decision.top1, top2: decision.top2, margin: decision.margin, rankings: decision.rankings, usage: decision.usage };
process.stdout.write(JSON.stringify(out) + '\n');
