import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validatePlaybook } from './schema.js';

const VALID_PB = {
  id: 'sample',
  version: 1,
  description: 'sample playbook',
  trigger: {
    type: 'dependabot_alert',
    signal_schema: { type: 'object', required: ['source'] },
  },
  classifier: { model: 'gemini-2.5-flash', prompt: 'classify' },
  constraints: {
    allowed_paths: ['package.json'],
    forbidden_paths: ['electron-app/src/main/**'],
    allowed_operations: ['bump_version'],
    forbidden_operations: ['remove_dependency'],
    max_diff_lines: 80,
    required_checks: ['npm test'],
    retry_limit: 2,
    cooldown_minutes: 15,
    classify_confidence_min: 0.85,
    critical: false,
  },
  execution: {
    model_strategy: { primary: 'groq/kimi-k2', fallback: 'google/gemini-2.5-flash', backup: 'openrouter/free' },
    aider: { args: ['--no-stream', '--yes'], temperature: 0.1, prompt: 'do x' },
  },
};

describe('validatePlaybook — happy path', () => {
  it('acepta playbook válido', () => {
    const r = validatePlaybook(VALID_PB);
    assert.equal(r.ok, true);
    assert.deepEqual(r.errors, []);
  });
});

describe('validatePlaybook — campos top-level obligatorios', () => {
  for (const field of ['id', 'version', 'trigger', 'classifier', 'constraints', 'execution']) {
    it(`rechaza si falta ${field}`, () => {
      const pb = structuredClone(VALID_PB);
      delete pb[field];
      const r = validatePlaybook(pb);
      assert.equal(r.ok, false);
      assert.ok(r.errors.some(e => e.path === field));
    });
  }
});

describe('validatePlaybook — trigger', () => {
  it('rechaza si trigger.type falta', () => {
    const pb = structuredClone(VALID_PB);
    delete pb.trigger.type;
    const r = validatePlaybook(pb);
    assert.equal(r.ok, false);
    assert.ok(r.errors.some(e => e.path === 'trigger.type'));
  });

  it('rechaza si trigger.signal_schema falta', () => {
    const pb = structuredClone(VALID_PB);
    delete pb.trigger.signal_schema;
    const r = validatePlaybook(pb);
    assert.equal(r.ok, false);
    assert.ok(r.errors.some(e => e.path === 'trigger.signal_schema'));
  });
});

describe('validatePlaybook — execution', () => {
  it('rechaza si execution.model_strategy falta', () => {
    const pb = structuredClone(VALID_PB);
    delete pb.execution.model_strategy;
    const r = validatePlaybook(pb);
    assert.equal(r.ok, false);
    assert.ok(r.errors.some(e => e.path === 'execution.model_strategy'));
  });
});

describe('validatePlaybook — constraints', () => {
  it('rechaza allowed/forbidden con intersección', () => {
    const pb = structuredClone(VALID_PB);
    pb.constraints.allowed_operations = ['bump_version', 'shared'];
    pb.constraints.forbidden_operations = ['remove_dependency', 'shared'];
    const r = validatePlaybook(pb);
    assert.equal(r.ok, false);
    assert.ok(r.errors.some(e => e.message.includes('disjoint')));
  });

  it('acepta allowed_paths vacío (caso rollback)', () => {
    const pb = structuredClone(VALID_PB);
    pb.constraints.allowed_paths = [];
    const r = validatePlaybook(pb);
    assert.equal(r.ok, true);
  });

  it('rechaza glob inválido en allowed_paths', () => {
    const pb = structuredClone(VALID_PB);
    pb.constraints.allowed_paths = ['../etc/passwd'];
    const r = validatePlaybook(pb);
    assert.equal(r.ok, false);
    assert.ok(r.errors.some(e => e.path.startsWith('constraints.allowed_paths')));
  });

  it('rechaza glob inválido en forbidden_paths', () => {
    const pb = structuredClone(VALID_PB);
    pb.constraints.forbidden_paths = ['file?.js'];
    const r = validatePlaybook(pb);
    assert.equal(r.ok, false);
    assert.ok(r.errors.some(e => e.path.startsWith('constraints.forbidden_paths')));
  });

  it('rechaza max_diff_lines no positivo', () => {
    const pb = structuredClone(VALID_PB);
    pb.constraints.max_diff_lines = 0;
    const r = validatePlaybook(pb);
    assert.equal(r.ok, false);
  });

  it('rechaza required_checks vacío', () => {
    const pb = structuredClone(VALID_PB);
    pb.constraints.required_checks = [];
    const r = validatePlaybook(pb);
    assert.equal(r.ok, false);
  });
});

describe('validatePlaybook — version_rules opcional', () => {
  it('acepta version_rules válido', () => {
    const pb = structuredClone(VALID_PB);
    pb.constraints.version_rules = {
      allowed_range_changes: ['patch', 'minor'],
      forbid_major_bumps: true,
      forbid_range_widening: true,
    };
    const r = validatePlaybook(pb);
    assert.equal(r.ok, true);
  });

  it('rechaza allowed_range_changes con valor fuera de patch/minor/major', () => {
    const pb = structuredClone(VALID_PB);
    pb.constraints.version_rules = {
      allowed_range_changes: ['patch', 'lolmajor'],
      forbid_major_bumps: true,
      forbid_range_widening: true,
    };
    const r = validatePlaybook(pb);
    assert.equal(r.ok, false);
  });
});

describe('validatePlaybook — critical exige cooldown ≥ 30', () => {
  it('critical:true sin cooldown_minutes → error', () => {
    const pb = structuredClone(VALID_PB);
    pb.constraints.critical = true;
    delete pb.constraints.cooldown_minutes;
    const r = validatePlaybook(pb);
    assert.equal(r.ok, false);
    assert.ok(r.errors.some(e => e.path === 'constraints.cooldown_minutes' && e.message.includes('30')));
  });

  it('critical:true con cooldown_minutes < 30 → error', () => {
    const pb = structuredClone(VALID_PB);
    pb.constraints.critical = true;
    pb.constraints.cooldown_minutes = 10;
    const r = validatePlaybook(pb);
    assert.equal(r.ok, false);
  });

  it('critical:true con cooldown_minutes ≥ 30 → ok', () => {
    const pb = structuredClone(VALID_PB);
    pb.constraints.critical = true;
    pb.constraints.cooldown_minutes = 60;
    const r = validatePlaybook(pb);
    assert.equal(r.ok, true);
  });
});

describe('validatePlaybook — sanity bounds', () => {
  it('classify_confidence_min fuera de [0,1] → error', () => {
    const pb = structuredClone(VALID_PB);
    pb.constraints.classify_confidence_min = 1.5;
    const r = validatePlaybook(pb);
    assert.equal(r.ok, false);
  });

  it('retry_limit > 5 → error', () => {
    const pb = structuredClone(VALID_PB);
    pb.constraints.retry_limit = 99;
    const r = validatePlaybook(pb);
    assert.equal(r.ok, false);
  });

  it('cooldown_minutes negativo → error', () => {
    const pb = structuredClone(VALID_PB);
    pb.constraints.cooldown_minutes = -5;
    const r = validatePlaybook(pb);
    assert.equal(r.ok, false);
  });
});
