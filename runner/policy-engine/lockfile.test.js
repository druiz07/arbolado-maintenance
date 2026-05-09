import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateLockfileChange } from './lockfile.js';

describe('validateLockfileChange', () => {
  it('rejects lockfile change without package.json change', () => {
    const res = validateLockfileChange(false, true);
    assert.equal(res.valid, false);
    assert.equal(res.reason, 'lockfile_changed_without_pkg');
  });

  it('accepts lockfile change when package.json also changed', () => {
    assert.deepEqual(validateLockfileChange(true, true), { valid: true });
  });

  it('accepts when neither changed', () => {
    assert.deepEqual(validateLockfileChange(false, false), { valid: true });
  });

  it('accepts package.json change without lockfile change', () => {
    assert.deepEqual(validateLockfileChange(true, false), { valid: true });
  });
});
