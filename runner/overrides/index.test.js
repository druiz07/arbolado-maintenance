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

// --- Fix 1: guardia anti-downgrade ---
// El playbook fijaba ciegamente signal.patched_versions aunque la versión ya
// resuelta en el lockfile fuera >= → downgrade sin ganancia de seguridad
// (causa raíz del spam de 36 PRs stale-replay del 2026-05-17).
test('Fix1 anti-downgrade: lockfile ya >= patched → skipped, NO escribe ni downgradea', async () => {
  const pkgAbs = '/repo/electron-app/package.json';
  const lockAbs = '/repo/electron-app/package-lock.json';
  const pkg = JSON.stringify({ name: 'app', devDependencies: { svgo: '^1' } }, null, 2);
  const lock = JSON.stringify({
    lockfileVersion: 3,
    packages: { 'node_modules/nth-check': { version: '2.1.3' } },
  });
  const { io, writes } = makeIo({ files: { [pkgAbs]: pkg, [lockAbs]: lock } });
  // okSignal: nth-check >=2.0.1; instalada 2.1.3 ≥ 2.0.1 → no hay nada que mitigar
  const r = await runOverridePlaybook({ signal: okSignal, repoDir: '/repo', io });
  assert.equal(r.status, 'skipped');
  assert.equal(r.stage, 'already_safe');
  assert.equal(writes.length, 0, 'no debe escribir ni downgradear si ya es segura');
});

test('Fix1 anti-downgrade: alguna instancia < patched → procede (hay vuln real)', async () => {
  const pkgAbs = '/repo/electron-app/package.json';
  const lockAbs = '/repo/electron-app/package-lock.json';
  const pkg = JSON.stringify({ name: 'app' }, null, 2);
  const lock = JSON.stringify({
    lockfileVersion: 3,
    packages: {
      'node_modules/nth-check': { version: '2.1.3' },
      'node_modules/svgo/node_modules/nth-check': { version: '1.0.2' },
    },
  });
  const { io } = makeIo({
    files: { [pkgAbs]: pkg, [lockAbs]: lock },
    runImpl: (cmd) => (cmd === 'npm audit --json'
      ? { code: 0, stdout: cleanAudit, stderr: '' }
      : { code: 0, stdout: '', stderr: '' }),
  });
  // npm install regenera el lockfile (cambio real → no es no-op)
  const origRun = io.run;
  io.run = async (cmd, opts) => {
    const res = await origRun(cmd, opts);
    if (cmd === 'npm install') await io.writeFile(lockAbs, lock + '\n// regen');
    return res;
  };
  const r = await runOverridePlaybook({ signal: okSignal, repoDir: '/repo', io });
  assert.equal(r.status, 'applied', 'con una instancia 1.0.2 < 2.0.1 sí hay que mitigar');
});

test('Fix1 anti-downgrade: sin lockfile o dep no resuelta → procede (no se puede determinar)', async () => {
  const pkgAbs = '/repo/electron-app/package.json';
  const { io } = makeIo({
    files: { [pkgAbs]: JSON.stringify({ name: 'app' }, null, 2) },
    runImpl: (cmd) => (cmd === 'npm audit --json'
      ? { code: 0, stdout: cleanAudit, stderr: '' }
      : { code: 0, stdout: '', stderr: '' }),
  });
  const r = await runOverridePlaybook({ signal: okSignal, repoDir: '/repo', io });
  assert.equal(r.status, 'applied');
});

// --- Fix 2: supresión de no-op (lockfile sin cambios tras npm install) ---
// Si el override no altera el lockfile (la resolución ya era esa), abrir un PR
// es ruido: package.json gana una entrada overrides redundante y 0 cambio real.
test('Fix2 no-op: npm install no cambia el lockfile → noop, restaura, NO PR', async () => {
  const pkgAbs = '/repo/electron-app/package.json';
  const lockAbs = '/repo/electron-app/package-lock.json';
  const pkg = JSON.stringify({ name: 'app', devDependencies: { svgo: '^1' } }, null, 2);
  // lock válido SIN resolver nth-check → la guardia Fix1 no corta; pero
  // npm install (mock) no lo modifica → lockfile idéntico → no-op.
  const lock = JSON.stringify({ lockfileVersion: 3, packages: { '': { name: 'app' } } });
  const { io, fs } = makeIo({
    files: { [pkgAbs]: pkg, [lockAbs]: lock },
    runImpl: (cmd) => (cmd === 'npm audit --json'
      ? { code: 0, stdout: cleanAudit, stderr: '' }
      : { code: 0, stdout: '', stderr: '' }), // npm install NO toca fs
  });
  const r = await runOverridePlaybook({ signal: okSignal, repoDir: '/repo', io });
  assert.equal(r.status, 'noop');
  assert.equal(r.stage, 'lockfile_unchanged');
  assert.equal(fs.get(pkgAbs), pkg, 'package.json restaurado (override redundante)');
  assert.equal(fs.get(lockAbs), lock, 'lockfile intacto');
});

test('Fix2 no-op: si npm install SÍ cambia el lockfile → applied (cambio real)', async () => {
  const pkgAbs = '/repo/electron-app/package.json';
  const lockAbs = '/repo/electron-app/package-lock.json';
  const pkg = JSON.stringify({ name: 'app' }, null, 2);
  const lock = JSON.stringify({ lockfileVersion: 3, packages: { '': {} } });
  const { io } = makeIo({
    files: { [pkgAbs]: pkg, [lockAbs]: lock },
    runImpl: (cmd, opts) => {
      if (cmd === 'npm install') {
        // simula regeneración real del lockfile
        return { code: 0, stdout: '', stderr: '', _mutate: true };
      }
      return cmd === 'npm audit --json'
        ? { code: 0, stdout: cleanAudit, stderr: '' }
        : { code: 0, stdout: '', stderr: '' };
    },
  });
  // parche el io.run para que npm install reescriba el lock (cambio real)
  const origRun = io.run;
  io.run = async (cmd, opts) => {
    const res = await origRun(cmd, opts);
    if (cmd === 'npm install') await io.writeFile(lockAbs, lock + '\n// regenerado');
    return res;
  };
  const r = await runOverridePlaybook({ signal: okSignal, repoDir: '/repo', io });
  assert.equal(r.status, 'applied');
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

// --- Gaps de catálogo cerrados (camino-A robot operativo, 2026-06-07) ---
// Ramas defensivas presentes en index.js pero sin test directo. Caracterizan
// dos "tipos de señal de input" residuales del flujo override: el manifest del
// repo target corrupto, y `npm audit` devolviendo algo no-JSON. Ambas deben
// degradar de forma segura (sin escribir / restaurando), no romper el run.

test('runOverridePlaybook: package.json corrupto → skipped stage unparseable_package_json, NO escribe', async () => {
  const pkgAbs = '/repo/electron-app/package.json';
  // Sin lockfile → la guardia Fix1 no corta; el JSON.parse de pkgText lanza.
  const { io, writes } = makeIo({
    files: { [pkgAbs]: '{ "name": "app", esto-no-es-json,,, }' },
  });
  const r = await runOverridePlaybook({ signal: okSignal, repoDir: '/repo', io });
  assert.equal(r.status, 'skipped');
  assert.equal(r.stage, 'unparseable_package_json');
  assert.equal(writes.length, 0, 'no debe escribir si el manifest no parsea');
});

test('runOverridePlaybook: npm audit emite no-JSON → rolled_back stage audit_unparseable + restaura', async () => {
  const pkgAbs = '/repo/electron-app/package.json';
  const original = JSON.stringify({ name: 'app' }, null, 2);
  // Sin lockfile → Fix1/Fix2 no cortan; el override se aplica, npm install OK,
  // y `npm audit --json` devuelve texto no parseable (npm warn en stdout, etc.)
  // → no se puede verificar la advisory → rollback seguro.
  const { io, fs } = makeIo({
    files: { [pkgAbs]: original },
    runImpl: (cmd) => (cmd === 'npm audit --json'
      ? { code: 0, stdout: 'npm warn config ... <output no-JSON>', stderr: '' }
      : { code: 0, stdout: '', stderr: '' }),
  });
  const r = await runOverridePlaybook({ signal: okSignal, repoDir: '/repo', io });
  assert.equal(r.status, 'rolled_back');
  assert.equal(r.stage, 'audit_unparseable');
  assert.equal(fs.get(pkgAbs), original, 'package.json restaurado tras audit ilegible');
});
