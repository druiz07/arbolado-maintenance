import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSafeVersion, enforceMaxDiff, parseDiffStat } from './aider-helpers.js';

describe('resolveSafeVersion', () => {
  it('returns the minimum version satisfying patchedRange', async () => {
    const lister = async () => ['8.54.0', '8.55.0', '8.56.0', '8.57.0', '9.0.0'];
    const res = await resolveSafeVersion('eslint', '>=8.56.0', lister);
    assert.equal(res, '8.56.0');
  });

  it('returns null when no published version satisfies patchedRange', async () => {
    const lister = async () => ['8.54.0', '8.55.0'];
    const res = await resolveSafeVersion('eslint', '>=8.56.0', lister);
    assert.equal(res, null);
  });

  it('returns null when patchedRange is null/empty', async () => {
    const lister = async () => ['1.0.0'];
    assert.equal(await resolveSafeVersion('x', null, lister), null);
    assert.equal(await resolveSafeVersion('x', '', lister), null);
  });

  it('returns null when lister returns no versions', async () => {
    const lister = async () => [];
    const res = await resolveSafeVersion('x', '>=1.0.0', lister);
    assert.equal(res, null);
  });

  it('does not invent versions — only uses what lister returned', async () => {
    const lister = async () => ['8.54.0', '8.56.0'];
    const res = await resolveSafeVersion('eslint', '>=8.56.0', lister);
    assert.equal(res, '8.56.0');
    assert.notEqual(res, '8.55.0');
  });
});

describe('enforceMaxDiff', () => {
  it('passes when actual lines under max', () => {
    assert.deepEqual(enforceMaxDiff(50, 200), { valid: true });
  });

  it('passes when actual exactly equals max', () => {
    assert.deepEqual(enforceMaxDiff(200, 200), { valid: true });
  });

  it('blocks when actual exceeds max', () => {
    const res = enforceMaxDiff(201, 200);
    assert.equal(res.valid, false);
    assert.equal(res.reason, 'diff_size_exceeded');
    assert.equal(res.observed, 201);
    assert.equal(res.max, 200);
  });

  it('fails closed on unparseable input', () => {
    const res = enforceMaxDiff(NaN, 200);
    assert.equal(res.valid, false);
    assert.equal(res.reason, 'diff_size_unparseable');
  });
});

describe('parseDiffStat', () => {
  it('parses standard git diff --stat output', () => {
    const out = ' 2 files changed, 12 insertions(+), 5 deletions(-)';
    assert.equal(parseDiffStat(out), 17);
  });

  it('parses output with only insertions', () => {
    const out = ' 1 file changed, 3 insertions(+)';
    assert.equal(parseDiffStat(out), 3);
  });

  it('parses output with only deletions', () => {
    const out = ' 1 file changed, 3 deletions(-)';
    assert.equal(parseDiffStat(out), 3);
  });

  it('returns NaN on empty string', () => {
    assert.equal(Number.isNaN(parseDiffStat('')), true);
  });

  it('returns NaN when stdout is not a string', () => {
    assert.equal(Number.isNaN(parseDiffStat(null)), true);
    assert.equal(Number.isNaN(parseDiffStat(undefined)), true);
  });
});
