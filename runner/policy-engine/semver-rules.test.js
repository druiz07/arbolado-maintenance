import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateSemverChange, getRangeType, extractVersion } from './semver-rules.js';

const standardRules = {
  allowed_range_changes: ['patch', 'minor'],
  forbid_major_bumps: true,
  forbid_range_widening: true,
};

describe('validateSemverChange', () => {
  it('allows patch bump under standard rules (^1.2.3 → ^1.2.4)', () => {
    assert.deepEqual(validateSemverChange('^1.2.3', '^1.2.4', standardRules), { valid: true });
  });

  it('allows minor bump under standard rules (^1.2.3 → ^1.3.0)', () => {
    assert.deepEqual(validateSemverChange('^1.2.3', '^1.3.0', standardRules), { valid: true });
  });

  it('blocks major bump (^1.2.3 → ^2.0.0)', () => {
    const res = validateSemverChange('^1.2.3', '^2.0.0', standardRules);
    assert.equal(res.valid, false);
    assert.equal(res.reason, 'major_bump_forbidden');
  });

  it('blocks wildcard widening (^1.2.3 → *)', () => {
    const res = validateSemverChange('^1.2.3', '*', standardRules);
    assert.equal(res.valid, false);
    assert.equal(res.reason, 'range_widening_to_wildcard');
  });

  it('blocks tilde→caret widening (~1.2.3 → ^1.2.3)', () => {
    const res = validateSemverChange('~1.2.3', '^1.2.3', standardRules);
    assert.equal(res.valid, false);
    assert.equal(res.reason, 'range_widening_tilde_to_caret');
  });

  it('handles exact-pinned versions (1.2.3 → 1.2.4 patch OK)', () => {
    assert.deepEqual(validateSemverChange('1.2.3', '1.2.4', standardRules), { valid: true });
  });

  it('blocks patch when patch not in allowed_range_changes', () => {
    const rulesNoPatch = { ...standardRules, allowed_range_changes: ['minor'] };
    const res = validateSemverChange('^1.2.3', '^1.2.4', rulesNoPatch);
    assert.equal(res.valid, false);
    assert.equal(res.reason, 'patch_bump_not_allowed');
  });

  it('blocks minor when minor not in allowed_range_changes', () => {
    const rulesNoMinor = { ...standardRules, allowed_range_changes: ['patch'] };
    const res = validateSemverChange('^1.2.3', '^1.3.0', rulesNoMinor);
    assert.equal(res.valid, false);
    assert.equal(res.reason, 'minor_bump_not_allowed');
  });

  it('returns valid when oldRange is null (added dep, no semver to compare)', () => {
    assert.deepEqual(validateSemverChange(null, '^1.0.0', standardRules), { valid: true });
  });

  it('returns valid when newRange is null (removed dep)', () => {
    assert.deepEqual(validateSemverChange('^1.0.0', null, standardRules), { valid: true });
  });

  it('blocks unparseable semver instead of degrading to regex', () => {
    const res = validateSemverChange('garbage', 'also-garbage', standardRules);
    assert.equal(res.valid, false);
    assert.equal(res.reason, 'invalid_semver_parse');
  });

  it('allows major bump only when forbid_major_bumps is false', () => {
    const permissive = { ...standardRules, forbid_major_bumps: false };
    assert.deepEqual(validateSemverChange('^1.2.3', '^2.0.0', permissive), { valid: true });
  });
});

describe('getRangeType / extractVersion', () => {
  it('classifies range types correctly', () => {
    assert.equal(getRangeType('^1.0.0'), 'caret');
    assert.equal(getRangeType('~1.0.0'), 'tilde');
    assert.equal(getRangeType('1.0.0'), 'exact_or_other');
    assert.equal(getRangeType('*'), 'wildcard');
    assert.equal(getRangeType('latest'), 'wildcard');
    assert.equal(getRangeType(null), 'none');
    assert.equal(getRangeType(''), 'none');
  });

  it('extracts minimum satisfying version', () => {
    assert.equal(extractVersion('^1.2.3'), '1.2.3');
    assert.equal(extractVersion('~1.2.3'), '1.2.3');
    assert.equal(extractVersion('1.2.3'), '1.2.3');
  });

  it('returns null for unparseable input', () => {
    assert.equal(extractVersion('not-a-version'), null);
  });
});
