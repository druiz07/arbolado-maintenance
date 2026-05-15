import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditClean } from './audit.js';

test('auditClean: vulnerabilities vacío → clean', () => {
  const r = auditClean({ auditJson: { vulnerabilities: {} }, dependency: 'nth-check' });
  assert.equal(r.clean, true);
});

test('auditClean: sin bloque vulnerabilities → clean', () => {
  const r = auditClean({ auditJson: { metadata: {} }, dependency: 'nth-check' });
  assert.equal(r.clean, true);
  assert.equal(r.reason, 'no_vulnerabilities_block');
});

test('auditClean: dependency ausente del audit → clean', () => {
  const audit = { vulnerabilities: { 'other-pkg': { name: 'other-pkg', severity: 'low', via: [] } } };
  const r = auditClean({ auditJson: audit, dependency: 'nth-check' });
  assert.equal(r.clean, true);
  assert.equal(r.reason, 'dependency_absent_from_audit');
});

test('auditClean: dependency presente, sin advisoryId → not clean', () => {
  const audit = { vulnerabilities: { 'nth-check': { name: 'nth-check', severity: 'high', via: [] } } };
  const r = auditClean({ auditJson: audit, dependency: 'nth-check' });
  assert.equal(r.clean, false);
  assert.equal(r.reason, 'dependency_still_vulnerable');
});

test('auditClean: advisory concreta resuelta pero otra persiste → clean', () => {
  const audit = {
    vulnerabilities: {
      'nth-check': {
        name: 'nth-check',
        severity: 'moderate',
        via: [
          { source: 999, name: 'nth-check', url: 'https://github.com/advisories/GHSA-other-9999' },
        ],
      },
    },
  };
  const r = auditClean({ auditJson: audit, dependency: 'nth-check', advisoryId: 'GHSA-abcd-1234' });
  assert.equal(r.clean, true);
  assert.equal(r.reason, 'target_advisory_resolved_other_remains');
});

test('auditClean: advisory objetivo aún presente (por url) → not clean', () => {
  const audit = {
    vulnerabilities: {
      'nth-check': {
        name: 'nth-check',
        severity: 'high',
        via: [{ source: 1, name: 'nth-check', url: 'https://github.com/advisories/GHSA-abcd-1234' }],
      },
    },
  };
  const r = auditClean({ auditJson: audit, dependency: 'nth-check', advisoryId: 'GHSA-abcd-1234' });
  assert.equal(r.clean, false);
  assert.equal(r.reason, 'target_advisory_still_present');
});

test('auditClean: advisory objetivo presente por source numérico → not clean', () => {
  const audit = {
    vulnerabilities: {
      'nth-check': { name: 'nth-check', severity: 'high', via: [{ source: 1234, name: 'nth-check' }] },
    },
  };
  const r = auditClean({ auditJson: audit, dependency: 'nth-check', advisoryId: '1234' });
  assert.equal(r.clean, false);
});

test('auditClean: validación de argumentos', () => {
  assert.throws(() => auditClean({ auditJson: null, dependency: 'x' }), /plain object/);
  assert.throws(() => auditClean({ auditJson: [], dependency: 'x' }), /plain object/);
  assert.throws(() => auditClean({ auditJson: {}, dependency: '' }), /non-empty string/);
});
