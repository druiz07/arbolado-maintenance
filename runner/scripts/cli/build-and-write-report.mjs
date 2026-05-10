#!/usr/bin/env node
// Uso: node build-and-write-report.mjs <repoRoot>
//
// Lee workspace/intermediate/{signal,playbook,classifier,invoker,policy}.json
// y workspace/state/*.outcome para componer los argumentos de buildAndWriteReport.
//
// Output stdout: {written, path, report.failure_stage} JSON una línea.
// Exit 0 incluso si el report indica fallo — el report es la respuesta.

import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { buildAndWriteReport } from '../../session-report/index.js';

const repoRootArg = process.argv[2];
if (!repoRootArg) {
  console.error('usage: build-and-write-report.mjs <repoRoot>');
  process.exit(2);
}

// El step invoca este CLI con working-directory: runner. Resolvemos repoRoot a
// ruta absoluta una sola vez para que (a) los reads de workspace/* encuentren
// los JSON intermedios y (b) el writer (que hace join(repoRoot, 'docs/...'))
// escriba dentro del repo y no en su parent.
const repoRoot = resolve(repoRootArg);
const ws = join(repoRoot, 'workspace/intermediate');

async function readJsonOr(path, fallback) {
  if (!existsSync(path)) return fallback;
  try {
    const raw = await readFile(path, 'utf8');
    return raw.trim().length === 0 ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

const signal = await readJsonOr(join(ws, 'signal.json'), null);
const playbook = await readJsonOr(join(ws, 'playbook.json'), null);
const classifier = await readJsonOr(join(ws, 'classifier.json'), null);
const invoker = await readJsonOr(join(ws, 'invoker.json'), null);
const policy = await readJsonOr(join(ws, 'policy.json'), null);
const maxDiff = await readJsonOr(join(ws, 'max-diff.json'), null);

if (!signal) {
  console.error('build-and-write-report: signal ausente — abortando (sin signal no hay path)');
  process.exit(1);
}
// playbook ausente OK: el builder produce un report con failure_stage='classifier' usando el classifier hint

// Si enforceMaxDiff falló, añadir su violation al policy.violations
let policyResult = policy;
if (maxDiff && maxDiff.valid === false) {
  policyResult = {
    valid: false,
    violations: [
      ...(policy?.violations ?? []),
      { type: 'diff_size_exceeded', observed: maxDiff.observed, max: maxDiff.max },
    ],
    ops: policy?.ops ?? { dependencyChanges: [], scriptChanges: [], enginesChanged: false, rawDiffLines: maxDiff.observed ?? 0 },
  };
}

// CI result derivado de los archivos de outcome
const stateDir = join(repoRoot, 'workspace/state');
async function readOutcome(name) {
  const p = join(stateDir, `${name}.outcome`);
  if (!existsSync(p)) return null;
  return (await readFile(p, 'utf8')).trim() === 'success';
}
const testsOk = await readOutcome('ci-tests');
const buildOk = await readOutcome('ci-build');
const ciResult = (testsOk === null && buildOk === null) ? null : { testsOk: !!testsOk, buildOk: !!buildOk };

const out = await buildAndWriteReport({
  repoRoot,
  playbook,
  signal,
  invokerResult: invoker,
  policyResult,
  ciResult,
  prResult: { merged: null }, // PR se actualiza en Sem 4
  retryCount: 0, // Sem 4 lo lee de un counter en KV
  classifierResult: classifier,
});

console.log(JSON.stringify({
  written: out.written,
  path: out.path,
  failure_stage: out.report.failure_stage,
}));
