import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTargetVersion, manifestToPackageJsonPath, siblingLockPath } from './version.js';

test('parseTargetVersion: ">=1.2.3" → "1.2.3"', () => {
  assert.equal(parseTargetVersion('>=1.2.3'), '1.2.3');
});

test('parseTargetVersion: versión exacta "2.0.1" → "2.0.1"', () => {
  assert.equal(parseTargetVersion('2.0.1'), '2.0.1');
});

test('parseTargetVersion: " >=4.5.6 " (con espacios) → "4.5.6"', () => {
  assert.equal(parseTargetVersion(' >=4.5.6 '), '4.5.6');
});

test('parseTargetVersion: rango compuesto ">=3.1.0 <4.0.0" → mínima "3.1.0"', () => {
  assert.equal(parseTargetVersion('>=3.1.0 <4.0.0'), '3.1.0');
});

test('parseTargetVersion: null/vacío → throws', () => {
  assert.throws(() => parseTargetVersion(null), /non-empty string/);
  assert.throws(() => parseTargetVersion(''), /non-empty string/);
  assert.throws(() => parseTargetVersion('   '), /non-empty string/);
});

test('parseTargetVersion: basura no parseable → throws', () => {
  assert.throws(() => parseTargetVersion('not-a-version'), /cannot derive a concrete version/);
});

test('manifestToPackageJsonPath: lock anidado → package.json hermano', () => {
  assert.equal(
    manifestToPackageJsonPath('electron-app/package-lock.json'),
    'electron-app/package.json',
  );
});

test('manifestToPackageJsonPath: lock en raíz → package.json raíz', () => {
  assert.equal(manifestToPackageJsonPath('package-lock.json'), 'package.json');
});

test('manifestToPackageJsonPath: ya es package.json → idéntico', () => {
  assert.equal(manifestToPackageJsonPath('electron-app/package.json'), 'electron-app/package.json');
  assert.equal(manifestToPackageJsonPath('package.json'), 'package.json');
});

test('manifestToPackageJsonPath: separadores Windows normalizados a /', () => {
  assert.equal(
    manifestToPackageJsonPath('electron-app\\package-lock.json'),
    'electron-app/package.json',
  );
});

test('manifestToPackageJsonPath: vacío → throws', () => {
  assert.throws(() => manifestToPackageJsonPath(''), /non-empty string/);
  assert.throws(() => manifestToPackageJsonPath(null), /non-empty string/);
});

test('siblingLockPath: deriva el lock hermano', () => {
  assert.equal(siblingLockPath('electron-app/package.json'), 'electron-app/package-lock.json');
  assert.equal(siblingLockPath('package.json'), 'package-lock.json');
});

test('siblingLockPath: path que no termina en package.json → throws', () => {
  assert.throws(() => siblingLockPath('electron-app/'), /must end with package.json/);
  assert.throws(() => siblingLockPath(''), /non-empty string/);
});
