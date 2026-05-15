import { test } from 'node:test';
import assert from 'node:assert/strict';
import { restoreSnapshot } from './rollback.js';

function makeIo() {
  const fs = new Map();
  const removed = [];
  return {
    fs,
    removed,
    io: {
      async writeFile(p, t) { fs.set(p, t); },
      async rm(p) { removed.push(p); fs.delete(p); },
    },
  };
}

test('restoreSnapshot: restaura package.json y lock cuando ambos existían', async () => {
  const { io, fs } = makeIo();
  await restoreSnapshot({
    io,
    snapshot: { pkgAbs: '/r/package.json', lockAbs: '/r/package-lock.json', pkgText: 'PKG', lockText: 'LOCK' },
  });
  assert.equal(fs.get('/r/package.json'), 'PKG');
  assert.equal(fs.get('/r/package-lock.json'), 'LOCK');
});

test('restoreSnapshot: lock inexistente previamente → intenta borrar el creado', async () => {
  const { io, removed } = makeIo();
  await restoreSnapshot({
    io,
    snapshot: { pkgAbs: '/r/package.json', lockAbs: '/r/package-lock.json', pkgText: 'PKG', lockText: null },
  });
  assert.deepEqual(removed, ['/r/package-lock.json']);
});

test('restoreSnapshot: validación', async () => {
  await assert.rejects(() => restoreSnapshot({ io: {}, snapshot: { pkgText: 'x' } }), /io\.writeFile is required/);
  await assert.rejects(
    () => restoreSnapshot({ io: { writeFile() {} }, snapshot: {} }),
    /snapshot\.pkgText is required/,
  );
});
