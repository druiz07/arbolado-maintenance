import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runOverridePlaybook } from './index.js';

// --- FS + run en memoria, inyectables ---
function makeIo({ files = {}, runImpl } = {}) {
  const fs = new Map(Object.entries(files));
  const writes = [];
  const calls = [];
  return {
    fs,
    writes,
    calls,
    io: {
      async readFile(p) {
        if (!fs.has(p)) throw new Error(`ENOENT ${p}`);
        return fs.get(p);
      },
      async writeFile(p, text) {
        fs.set(p, text);
        writes.push({ p, text });
      },
      async run(cmd, opts) {
        calls.push(cmd);
        return runImpl ? runImpl(cmd, opts) : { code: 0, stdout: '{}', stderr: '' };
      },
      async rm(p) {
        fs.delete(p);
      },
    },
  };
}

const okSignal = {
  source: 'dependabot-cli',
  dependency: 'nth-check',
  current_version: '<2.0.1',
  patched_versions: '>=2.0.1',
  severity: 'high',
  is_transitive: true,
  dependency_type: 'dev',
  path: 'electron-app/package-lock.json',
  advisory_id: 'GHSA-abcd-1234',
};

const cleanAudit = JSON.stringify({ vulnerabilities: {} });

test('runOverridePlaybook: happy path → applied + override escrito', async () => {
  const pkgAbs = '/repo/electron-app/package.json';
  const { io, fs } = makeIo({
    files: { [pkgAbs]: JSON.stringify({ name: 'app', devDependencies: { svgo: '^1' } }, null, 2) },
    runImpl: (cmd) => (cmd === 'npm audit --json'
      ? { code: 0, stdout: cleanAudit, stderr: '' }
      : { code: 0, stdout: '', stderr: '' }),
  });
  const r = await runOverridePlaybook({ signal: okSignal, repoDir: '/repo', io });
  assert.equal(r.status, 'applied');
  assert.equal(r.operation, 'add_override');
  assert.equal(r.targetVersion, '2.0.1');
  const written = JSON.parse(fs.get(pkgAbs));
  assert.equal(written.overrides['nth-check'], '2.0.1');
});

test('runOverridePlaybook: is_transitive=false → skipped (wrong playbook)', async () => {
  const { io } = makeIo();
  const r = await runOverridePlaybook({
    signal: { ...okSignal, is_transitive: false },
    repoDir: '/repo',
    io,
  });
  assert.equal(r.status, 'skipped');
  assert.equal(r.stage, 'not_transitive');
});

test('runOverridePlaybook: sin patched_versions → skipped', async () => {
  const { io } = makeIo();
  const r = await runOverridePlaybook({
    signal: { ...okSignal, patched_versions: null },
    repoDir: '/repo',
    io,
  });
  assert.equal(r.status, 'skipped');
  assert.equal(r.stage, 'no_patch_available');
});

test('runOverridePlaybook: override ya en versión objetivo → noop', async () => {
  const pkgAbs = '/repo/electron-app/package.json';
  const { io } = makeIo({
    files: { [pkgAbs]: JSON.stringify({ overrides: { 'nth-check': '2.0.1' } }, null, 2) },
  });
  const r = await runOverridePlaybook({ signal: okSignal, repoDir: '/repo', io });
  assert.equal(r.status, 'noop');
});

test('runOverridePlaybook: diff excede max → blocked, NO escribe', async () => {
  const pkgAbs = '/repo/electron-app/package.json';
  const { io, writes } = makeIo({
    files: { [pkgAbs]: JSON.stringify({ name: 'app' }, null, 2) },
  });
  const r = await runOverridePlaybook({ signal: okSignal, repoDir: '/repo', io, maxDiffLines: 1 });
  assert.equal(r.status, 'blocked');
  assert.equal(r.stage, 'diff_size');
  assert.equal(writes.length, 0, 'no debe escribir si bloquea por tamaño');
});

test('runOverridePlaybook: npm install falla → rolled_back + package.json restaurado', async () => {
  const pkgAbs = '/repo/electron-app/package.json';
  const original = JSON.stringify({ name: 'app', devDependencies: { svgo: '^1' } }, null, 2);
  const { io, fs } = makeIo({
    files: { [pkgAbs]: original },
    runImpl: (cmd) => (cmd === 'npm install'
      ? { code: 1, stdout: '', stderr: 'ERESOLVE' }
      : { code: 0, stdout: cleanAudit, stderr: '' }),
  });
  const r = await runOverridePlaybook({ signal: okSignal, repoDir: '/repo', io });
  assert.equal(r.status, 'rolled_back');
  assert.equal(r.stage, 'npm_install');
  assert.equal(fs.get(pkgAbs), original, 'package.json vuelve al estado original');
});

test('runOverridePlaybook: audit sigue vulnerable → rolled_back stage audit', async () => {
  const pkgAbs = '/repo/electron-app/package.json';
  const original = JSON.stringify({ name: 'app' }, null, 2);
  const dirtyAudit = JSON.stringify({
    vulnerabilities: {
      'nth-check': { name: 'nth-check', severity: 'high', via: [{ source: 1, name: 'nth-check', url: 'https://github.com/advisories/GHSA-abcd-1234' }] },
    },
  });
  const { io, fs } = makeIo({
    files: { [pkgAbs]: original },
    runImpl: (cmd) => (cmd === 'npm audit --json'
      ? { code: 0, stdout: dirtyAudit, stderr: '' }
      : { code: 0, stdout: '', stderr: '' }),
  });
  const r = await runOverridePlaybook({ signal: okSignal, repoDir: '/repo', io });
  assert.equal(r.status, 'rolled_back');
  assert.equal(r.stage, 'audit');
  assert.equal(fs.get(pkgAbs), original);
});

test('runOverridePlaybook: tests fallan tras override → rolled_back stage tests', async () => {
  const pkgAbs = '/repo/electron-app/package.json';
  const original = JSON.stringify({ name: 'app' }, null, 2);
  const { io, fs } = makeIo({
    files: { [pkgAbs]: original },
    runImpl: (cmd) => {
      if (cmd === 'npm audit --json') return { code: 0, stdout: cleanAudit, stderr: '' };
      if (cmd === 'npm test') return { code: 1, stdout: '', stderr: 'test failed' };
      return { code: 0, stdout: '', stderr: '' };
    },
  });
  const r = await runOverridePlaybook({ signal: okSignal, repoDir: '/repo', io });
  assert.equal(r.status, 'rolled_back');
  assert.equal(r.stage, 'tests');
  assert.equal(fs.get(pkgAbs), original);
});

test('runOverridePlaybook: build falla tras override → rolled_back stage build', async () => {
  const pkgAbs = '/repo/electron-app/package.json';
  const original = JSON.stringify({ name: 'app' }, null, 2);
  const { io } = makeIo({
    files: { [pkgAbs]: original },
    runImpl: (cmd) => {
      if (cmd === 'npm audit --json') return { code: 0, stdout: cleanAudit, stderr: '' };
      if (cmd === 'npm run build') return { code: 1, stdout: '', stderr: 'build failed' };
      return { code: 0, stdout: '', stderr: '' };
    },
  });
  const r = await runOverridePlaybook({ signal: okSignal, repoDir: '/repo', io });
  assert.equal(r.status, 'rolled_back');
  assert.equal(r.stage, 'build');
});

test('runOverridePlaybook: valida argumentos', async () => {
  const { io } = makeIo();
  await assert.rejects(() => runOverridePlaybook({ signal: null, repoDir: '/r', io }), /signal must be/);
  await assert.rejects(() => runOverridePlaybook({ signal: okSignal, repoDir: '', io }), /repoDir must be/);
  await assert.rejects(
    () => runOverridePlaybook({ signal: okSignal, repoDir: '/r', io: { readFile() {} } }),
    /io\.writeFile is required|io\.run is required/,
  );
});

test('runOverridePlaybook: lockfile inexistente no rompe el snapshot', async () => {
  const pkgAbs = '/repo/package.json';
  const { io, fs } = makeIo({
    files: { [pkgAbs]: JSON.stringify({ name: 'root' }, null, 2) },
    runImpl: (cmd) => (cmd === 'npm audit --json'
      ? { code: 0, stdout: cleanAudit, stderr: '' }
      : { code: 0, stdout: '', stderr: '' }),
  });
  const r = await runOverridePlaybook({
    signal: { ...okSignal, path: 'package-lock.json' },
    repoDir: '/repo',
    io,
  });
  assert.equal(r.status, 'applied');
  assert.ok(JSON.parse(fs.get(pkgAbs)).overrides['nth-check']);
});

// Regresión TD-12: el smoke real (gh run 25929781995) reveló ENOENT —
// npm corría en repoDir (raíz) pero el package.json de arbolado-app vive
// en electron-app/. npm install/audit/test/build deben ejecutarse en el
// DIRECTORIO del package.json, no en la raíz del repo.
test('runOverridePlaybook: npm corre en el dir del package.json (subdir)', async () => {
  const pkgAbs = '/repo/electron-app/package.json';
  const cwds = [];
  const { io } = makeIo({
    files: { [pkgAbs]: JSON.stringify({ name: 'app', devDependencies: { svgo: '^1' } }, null, 2) },
    runImpl: (cmd, opts) => {
      cwds.push(opts && opts.cwd);
      return cmd === 'npm audit --json'
        ? { code: 0, stdout: cleanAudit, stderr: '' }
        : { code: 0, stdout: '', stderr: '' };
    },
  });
  const r = await runOverridePlaybook({ signal: okSignal, repoDir: '/repo', io });
  assert.equal(r.status, 'applied');
  assert.ok(cwds.length >= 1, 'debe haber ejecutado npm');
  for (const c of cwds) {
    assert.equal(c, '/repo/electron-app', `npm debe correr en el subdir del package.json, no en ${c}`);
  }
});

test('runOverridePlaybook: package.json en raíz → npm corre en repoDir', async () => {
  const pkgAbs = '/repo/package.json';
  const cwds = [];
  const { io } = makeIo({
    files: { [pkgAbs]: JSON.stringify({ name: 'root' }, null, 2) },
    runImpl: (cmd, opts) => {
      cwds.push(opts && opts.cwd);
      return cmd === 'npm audit --json'
        ? { code: 0, stdout: cleanAudit, stderr: '' }
        : { code: 0, stdout: '', stderr: '' };
    },
  });
  const r = await runOverridePlaybook({ signal: { ...okSignal, path: 'package-lock.json' }, repoDir: '/repo', io });
  assert.equal(r.status, 'applied');
  for (const c of cwds) {
    assert.equal(c, '/repo', `package.json en raíz → cwd debe ser repoDir, no ${c}`);
  }
});
