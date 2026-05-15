#!/usr/bin/env node
// Uso:
//   node scripts/cli/apply-override.mjs <signal.json> <repoDir> <workspaceRoot>
//
// Capa de IO REAL del playbook bump-transitive-via-overrides (TD-12). El
// orquestador runOverridePlaybook es agnóstico de IO (lo inyecta); este
// wrapper le pasa fs real + child_process para npm, igual patrón que el resto
// de CLIs de loop.yml (override-dry-run.mjs es la versión simulada offline).
//
// Tras ejecutar, traduce el resultado a los mismos intermedios/outcomes que el
// flujo Aider, de modo que build-and-write-report.mjs compone el report SIN
// modificarse (failure_stage unificado). Ver overrides/report-bridge.js.
//
// stdout: { status, stage, issue } JSON una línea. Exit 0 siempre (el report
// es la respuesta; el step de loop.yml decide success/failure por .status).

import { readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve, join, dirname } from 'node:path';
import { runOverridePlaybook } from '../../overrides/index.js';
import { mapOverrideResult } from '../../overrides/report-bridge.js';

const [signalArg, repoDirArg, workspaceRootArg] = process.argv.slice(2);
if (!signalArg || !repoDirArg || !workspaceRootArg) {
  console.error('Usage: apply-override.mjs <signal.json> <repoDir> <workspaceRoot>');
  process.exit(2);
}

const repoDir = resolve(repoDirArg);
const wsRoot = resolve(workspaceRootArg);
const interDir = join(wsRoot, 'workspace/intermediate');
const stateDir = join(wsRoot, 'workspace/state');

const signal = JSON.parse(await readFile(signalArg, 'utf8'));

// Comandos npm permitidos — literales fijos del orquestador (sin interpolación
// de datos de la señal → sin superficie de inyección). spawn con argv explícito
// y shell:false; npm hereda env del runner (incluye PATH del setup-node).
const ALLOWED = new Set(['npm install', 'npm audit --json', 'npm test', 'npm run build']);

function runCmd(cmd, { cwd }) {
  if (!ALLOWED.has(cmd)) {
    return Promise.resolve({ code: 1, stdout: '', stderr: `disallowed command: ${cmd}` });
  }
  const [bin, ...args] = cmd.split(' ');
  return new Promise((resolveP) => {
    const child = spawn(bin, args, { cwd, shell: false, env: process.env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', (e) => resolveP({ code: 1, stdout, stderr: stderr + String(e.message || e) }));
    child.on('close', (code) => resolveP({ code: code ?? 1, stdout, stderr }));
  });
}

const io = {
  readFile: (abs) => readFile(abs, 'utf8'),
  writeFile: (abs, text) => writeFile(abs, text),
  run: runCmd,
  rm: (abs) => rm(abs, { force: true }),
};

let result;
try {
  result = await runOverridePlaybook({ signal, repoDir, io });
} catch (e) {
  result = { status: 'error', stage: 'exception', detail: String(e?.message || e) };
}

const mapped = mapOverrideResult(result);

await mkdir(interDir, { recursive: true });
await mkdir(stateDir, { recursive: true });
await writeFile(join(interDir, 'invoker.json'), JSON.stringify(mapped.invoker));
await writeFile(join(interDir, 'policy.json'), JSON.stringify(mapped.policy));
if (mapped.ciTests !== null) {
  await writeFile(join(stateDir, 'ci-tests.outcome'), mapped.ciTests ? 'success' : 'failure');
}
if (mapped.ciBuild !== null) {
  await writeFile(join(stateDir, 'ci-build.outcome'), mapped.ciBuild ? 'success' : 'failure');
}
if (mapped.issue) {
  await writeFile(join(interDir, 'override-issue.json'), JSON.stringify(mapped.issue));
}

process.stdout.write(JSON.stringify({
  status: result.status,
  stage: result.stage ?? null,
  targetVersion: result.targetVersion ?? null,
  prEligible: mapped.prEligible,
  issue: mapped.issue ? true : false,
}));
process.stderr.write(
  `\n[apply-override] status=${result.status} stage=${result.stage ?? '-'} ` +
    `prEligible=${mapped.prEligible} issue=${mapped.issue ? 'yes' : 'no'}\n`,
);
