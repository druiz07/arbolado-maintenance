import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDependabotAlert } from '../src/normalize.ts';
import { SignalSchema, generateSignalHash } from '../src/signal-schema.ts';
import type { DependabotAlert } from '../src/dependabot.ts';

function fixtureDevDirect(): DependabotAlert {
  return {
    number: 1,
    state: 'open',
    dependency: {
      package: { ecosystem: 'npm', name: 'eslint' },
      manifest_path: 'package.json',
      scope: 'development',
    },
    security_advisory: {
      ghsa_id: 'GHSA-xxxx-xxxx-xxxx',
      severity: 'high',
      summary: 'eslint vuln',
      vulnerabilities: [],
    },
    security_vulnerability: {
      package: { ecosystem: 'npm', name: 'eslint' },
      vulnerable_version_range: '< 8.56.0',
      first_patched_version: { identifier: '8.56.0' },
      severity: 'high',
    },
    created_at: '2026-05-04T00:00:00Z',
    updated_at: '2026-05-04T00:00:00Z',
    fixed_at: null,
    dismissed_at: null,
  };
}

function fixtureTransitiveLockfile(): DependabotAlert {
  return {
    ...fixtureDevDirect(),
    dependency: {
      package: { ecosystem: 'npm', name: 'lodash' },
      manifest_path: 'package-lock.json',
      scope: null,
    },
    security_advisory: {
      ghsa_id: 'GHSA-yyyy-yyyy-yyyy',
      severity: 'medium',
      summary: 'lodash transitive',
      vulnerabilities: [],
    },
    security_vulnerability: {
      package: { ecosystem: 'npm', name: 'lodash' },
      vulnerable_version_range: '<4.17.21',
      first_patched_version: { identifier: '4.17.21' },
      severity: 'medium',
    },
  };
}

function fixtureNoPatch(): DependabotAlert {
  return {
    ...fixtureDevDirect(),
    dependency: {
      package: { ecosystem: 'npm', name: 'minimist' },
      manifest_path: 'package.json',
      scope: 'development',
    },
    security_advisory: {
      ghsa_id: 'GHSA-zzzz-zzzz-zzzz',
      severity: 'high',
      summary: 'no patch',
      vulnerabilities: [],
    },
    security_vulnerability: {
      package: { ecosystem: 'npm', name: 'minimist' },
      vulnerable_version_range: '< 1.2.8',
      first_patched_version: null,
      severity: 'high',
    },
  };
}

describe('normalizeDependabotAlert', () => {
  it('emits a schema-valid signal for a direct dev dep', () => {
    const signal = normalizeDependabotAlert(fixtureDevDirect());
    SignalSchema.parse(signal); // throws if invalid
    assert.equal(signal.dependency, 'eslint');
    assert.equal(signal.dependency_type, 'dev');
    assert.equal(signal.is_transitive, false);
    assert.equal(signal.severity, 'high');
    assert.equal(signal.patched_versions, '>=8.56.0');
    assert.equal(signal.context.fix_available, true);
  });

  it('marks alerts on package-lock.json as transitive (defaults to dev)', () => {
    const signal = normalizeDependabotAlert(fixtureTransitiveLockfile());
    SignalSchema.parse(signal);
    assert.equal(signal.is_transitive, true);
    assert.equal(signal.dependency_type, 'dev');
    assert.equal(signal.context.direct_dependency, false);
  });

  it('translates "medium" severity to "moderate"', () => {
    const signal = normalizeDependabotAlert(fixtureTransitiveLockfile());
    assert.equal(signal.severity, 'moderate');
  });

  it('represents missing patches as patched_versions null + fix_available false', () => {
    const signal = normalizeDependabotAlert(fixtureNoPatch());
    SignalSchema.parse(signal);
    assert.equal(signal.patched_versions, null);
    assert.equal(signal.context.fix_available, false);
  });
});

describe('generateSignalHash', () => {
  it('is deterministic across runs (same content → same hash)', async () => {
    const a = normalizeDependabotAlert(fixtureDevDirect());
    const b = normalizeDependabotAlert(fixtureDevDirect());
    // detected_at difiere — confirma que NO está en el hash
    a.detected_at = '2026-05-04T00:00:00Z';
    b.detected_at = '2026-05-09T00:00:00Z';
    const ha = await generateSignalHash(a);
    const hb = await generateSignalHash(b);
    assert.equal(ha, hb);
    assert.equal(ha.length, 64);
  });

  it('produces different hash for different advisory_id', async () => {
    const a = normalizeDependabotAlert(fixtureDevDirect());
    const b = normalizeDependabotAlert(fixtureNoPatch());
    const ha = await generateSignalHash(a);
    const hb = await generateSignalHash(b);
    assert.notEqual(ha, hb);
  });
});
