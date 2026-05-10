import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildClassifierPrompt } from './prompt.js';

const SIGNAL_FIXTURE = {
  source: 'worker',
  dependency: 'eslint',
  current_version: '^8.54.0',
  patched_versions: '>=8.56.0',
  severity: 'high',
  is_transitive: false,
  dependency_type: 'dev',
  advisory_id: 'GHSA-fixture',
};

const PLAYBOOKS_FIXTURE = [
  {
    id: 'bump-devdep-cve',
    description: 'Aplica parche automático a CVEs detectados en devDependencies',
    classifierRules: 'Usa este playbook SOLO si dependency_type == "dev" y existe patched_versions.',
  },
  {
    id: 'rollback-on-build-failure',
    description: 'Rollback automático si CI falla post-release',
    classifierRules: 'Usa este playbook SOLO si signal.source == "ci_failure" post-release.',
  },
];

test('buildClassifierPrompt incluye el signal completo en el bloque INPUT', () => {
  const prompt = buildClassifierPrompt(SIGNAL_FIXTURE, PLAYBOOKS_FIXTURE);
  assert.match(prompt, /INPUT SIGNAL/);
  assert.match(prompt, /"dependency": "eslint"/);
  assert.match(prompt, /"dependency_type": "dev"/);
});

test('buildClassifierPrompt lista todos los playbooks con id + description + reglas', () => {
  const prompt = buildClassifierPrompt(SIGNAL_FIXTURE, PLAYBOOKS_FIXTURE);
  for (const pb of PLAYBOOKS_FIXTURE) {
    assert.match(prompt, new RegExp(`PLAYBOOK: ${pb.id}`));
    assert.match(prompt, new RegExp(escapeRegex(pb.description)));
    assert.match(prompt, new RegExp(escapeRegex(pb.classifierRules)));
  }
});

test('buildClassifierPrompt es determinista — misma entrada → misma salida byte a byte', () => {
  const a = buildClassifierPrompt(SIGNAL_FIXTURE, PLAYBOOKS_FIXTURE);
  const b = buildClassifierPrompt(SIGNAL_FIXTURE, PLAYBOOKS_FIXTURE);
  assert.equal(a, b);
});

test('buildClassifierPrompt instruye output JSON con rankings[]', () => {
  const prompt = buildClassifierPrompt(SIGNAL_FIXTURE, PLAYBOOKS_FIXTURE);
  assert.match(prompt, /rankings/);
  assert.match(prompt, /playbook_id/);
  assert.match(prompt, /confidence/);
});

test('buildClassifierPrompt rechaza lista de playbooks vacía', () => {
  assert.throws(
    () => buildClassifierPrompt(SIGNAL_FIXTURE, []),
    /at least one playbook/,
  );
});

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
