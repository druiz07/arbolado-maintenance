import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTargetVersion,
  manifestToPackageJsonPath,
  siblingLockPath,
  resolveInstalledVersions,
  toCaretRange,
} from './version.js';

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

// --- resolveInstalledVersions (guardia anti-downgrade, Fix 1) ---

test('resolveInstalledVersions: lockfile v3 packages — todas las instancias resueltas', () => {
  const lock = {
    lockfileVersion: 3,
    packages: {
      '': { name: 'app' },
      'node_modules/nth-check': { version: '2.1.1' },
      'node_modules/svgo/node_modules/nth-check': { version: '1.0.2' },
      'node_modules/other': { version: '9.9.9' },
    },
  };
  const got = resolveInstalledVersions(lock, 'nth-check').sort();
  assert.deepEqual(got, ['1.0.2', '2.1.1']);
});

test('resolveInstalledVersions: lockfile v1 dependencies anidadas', () => {
  const lock = {
    lockfileVersion: 1,
    dependencies: {
      svgo: {
        version: '1.3.2',
        dependencies: {
          'nth-check': { version: '1.0.2' },
        },
      },
      'nth-check': { version: '2.0.1' },
    },
  };
  const got = resolveInstalledVersions(lock, 'nth-check').sort();
  assert.deepEqual(got, ['1.0.2', '2.0.1']);
});

test('resolveInstalledVersions: paquete scoped @scope/name', () => {
  const lock = {
    lockfileVersion: 3,
    packages: { 'node_modules/@scope/pkg': { version: '3.2.1' } },
  };
  assert.deepEqual(resolveInstalledVersions(lock, '@scope/pkg'), ['3.2.1']);
});

test('resolveInstalledVersions: dep ausente → []', () => {
  assert.deepEqual(resolveInstalledVersions({ packages: {} }, 'nth-check'), []);
  assert.deepEqual(resolveInstalledVersions(null, 'nth-check'), []);
});

// --- TD-15: rango caret para overrides ---
// Un pin exacto ("0.2.6") se pudre: si un advisory posterior declara vulnerable
// esa versión, el override del propio robot mantiene la dep clavada en ella
// (caso real: tmp 0.2.6 puesto por PR #44 el 7-jun; advisory del 15-jun declaró
// vulnerable >=0.2.6 <0.2.7 → 4 semanas fijada en la versión vulnerable).

test('toCaretRange: "0.2.7" → "^0.2.7"', () => {
  assert.equal(toCaretRange('0.2.7'), '^0.2.7');
});

test('toCaretRange: normaliza prefijos ("v1.2.3" → "^1.2.3")', () => {
  assert.equal(toCaretRange('v1.2.3'), '^1.2.3');
});

test('toCaretRange: entrada no-versión → throws (incluye rangos: no doble-caret)', () => {
  assert.throws(() => toCaretRange('^1.2.3'), /invalid version/);
  assert.throws(() => toCaretRange('>=1.2.3'), /invalid version/);
  assert.throws(() => toCaretRange(''), /invalid version/);
  assert.throws(() => toCaretRange(null), /invalid version/);
});
