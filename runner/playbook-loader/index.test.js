import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { loadPlaybook, PlaybookValidationError } from './index.js';

function tmpYaml(content) {
  const dir = mkdtempSync(join(tmpdir(), 'pb-test-'));
  const file = join(dir, 'pb.yaml');
  writeFileSync(file, content, 'utf8');
  return file;
}

const VALID_YAML = `
id: sample
version: 1
description: sample playbook
trigger:
  type: dependabot_alert
  signal_schema:
    type: object
    required: [source]
classifier:
  model: gemini-2.5-flash
  prompt: classify
constraints:
  allowed_paths:
    - package.json
  forbidden_paths:
    - electron-app/src/main/**
  allowed_operations:
    - bump_version
  forbidden_operations:
    - remove_dependency
  max_diff_lines: 80
  required_checks:
    - npm test
  retry_limit: 2
  cooldown_minutes: 15
  classify_confidence_min: 0.85
  critical: false
execution:
  model_strategy:
    primary: groq/kimi-k2
    fallback: google/gemini-2.5-flash
    backup: openrouter/free
  aider:
    args:
      - --no-stream
      - --yes
    temperature: 0.1
    prompt: do x
`;

describe('loadPlaybook — happy path', () => {
  it('carga + normaliza un YAML válido', async () => {
    const file = tmpYaml(VALID_YAML);
    const pb = await loadPlaybook(file);
    assert.equal(pb.meta.id, 'sample');
    assert.equal(pb.meta.critical, false);
    assert.deepEqual(pb.constraints.allowed_paths, ['package.json']);
    assert.equal(pb.execution.aider.temperature, 0.1);
    assert.ok(pb.raw);
  });
});

describe('loadPlaybook — shape normalizado', () => {
  it('expone exactamente las claves documentadas', async () => {
    const file = tmpYaml(VALID_YAML);
    const pb = await loadPlaybook(file);
    const expectedKeys = [
      'meta', 'trigger', 'classifier', 'constraints', 'execution',
      'postconditions', 'edge_cases', 'raw',
    ].sort();
    assert.deepEqual(Object.keys(pb).sort(), expectedKeys);
  });

  it('constraints tiene exactamente las sub-claves documentadas', async () => {
    const file = tmpYaml(VALID_YAML);
    const pb = await loadPlaybook(file);
    const constraintKeys = [
      'allowed_paths', 'forbidden_paths', 'allowed_operations', 'forbidden_operations',
      'version_rules', 'max_diff_lines', 'required_checks', 'retry_limit',
      'cooldown_minutes', 'max_rollbacks_per_24h', 'classify_confidence_min',
      'require_dev_dependency',
    ].sort();
    assert.deepEqual(Object.keys(pb.constraints).sort(), constraintKeys);
  });
});

describe('loadPlaybook — playbooks reales del repo runner', () => {
  // Paths relativos al cwd del runner (tests se corren desde runner/).
  const PLAYBOOKS = [
    '../docs/auto-maintenance/playbooks/bump-devdep-cve.yaml',
    '../docs/auto-maintenance/playbooks/fix-tests-minor-version-bump.yaml',
    '../docs/auto-maintenance/playbooks/rollback-on-build-failure.yaml',
    '../docs/auto-maintenance/playbooks/lint-prettier-autofix.yaml',
  ];

  for (const path of PLAYBOOKS) {
    it(`carga sin error: ${path.split('/').pop()}`, async () => {
      const pb = await loadPlaybook(resolve(path));
      assert.ok(pb.meta.id, 'meta.id should be present');
      assert.ok(pb.constraints, 'constraints should be present');
      assert.ok(pb.execution.model_strategy, 'execution.model_strategy should be present');
    });
  }
});

describe('loadPlaybook — errores', () => {
  it('YAML inválido (campo faltante) → PlaybookValidationError', async () => {
    const file = tmpYaml('id: only-id\n');
    await assert.rejects(
      () => loadPlaybook(file),
      err => err instanceof PlaybookValidationError && err.errors.length > 0,
    );
  });
});
