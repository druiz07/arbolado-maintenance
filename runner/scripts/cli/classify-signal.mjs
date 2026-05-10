#!/usr/bin/env node
// Uso desde loop.yml:
//   env GEMINI_API_KEY=... node scripts/cli/classify-signal.mjs <signal.json> <playbooks-dir>
// Imprime a stdout JSON con la decisión del classifier.
// Exit 0 incluso si decision.ok=false (failure_stage='classifier' lo recoge el report).

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { load as parseYaml } from 'js-yaml';
import { classifySignal } from '../../classifier/index.js';

const [signalPath, playbooksDir] = process.argv.slice(2);
if (!signalPath || !playbooksDir) {
  console.error('Usage: classify-signal.mjs <signal.json> <playbooks-dir>');
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

const decision = await classifySignal({ signal, playbooks, apiKey });
const out = decision.ok
  ? { ok: true, playbookId: decision.playbookId, margin: decision.margin, confidence: decision.confidence, top1: decision.top1, top2: decision.top2, rankings: decision.rankings, usage: decision.usage }
  : { ok: false, reason: decision.reason, playbookHint: decision.playbookHint, top1: decision.top1, top2: decision.top2, margin: decision.margin, rankings: decision.rankings, usage: decision.usage };
process.stdout.write(JSON.stringify(out) + '\n');
