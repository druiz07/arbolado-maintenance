import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { runProcess } from './runtime.js';

function mockSpawn({ stdoutChunks = [], stderrChunks = [], exitCode = 0, exitDelayMs = 5, errorOnSpawn = null } = {}) {
  const calls = [];
  const fn = (binPath, args, opts) => {
    calls.push({ binPath, args, opts });
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = (sig) => { child._killed = sig; };

    if (errorOnSpawn) {
      setImmediate(() => child.emit('error', errorOnSpawn));
      return child;
    }

    // Orden determinista: primero emit chunks (en setImmediate para que el
    // runtime tenga tiempo de registrar los listeners), luego close tras
    // exitDelayMs. Sin esto hay race: el close puede llegar antes que los
    // chunks si exitDelayMs es muy pequeño.
    setImmediate(() => {
      for (const c of stdoutChunks) child.stdout.emit('data', Buffer.from(c, 'utf8'));
      for (const c of stderrChunks) child.stderr.emit('data', Buffer.from(c, 'utf8'));
      setTimeout(() => child.emit('close', exitCode), exitDelayMs);
    });
    return child;
  };
  fn.calls = calls;
  return fn;
}

describe('runProcess', () => {
  it('captura stdout y stderr y devuelve exitCode', async () => {
    const spawnMock = mockSpawn({ stdoutChunks: ['hello\n'], stderrChunks: ['warn\n'], exitCode: 0 });
    const r = await runProcess({
      binPath: 'fake', args: ['--x'], env: { K: 'V' }, cwd: '/tmp', timeoutMs: 1000, _spawn: spawnMock,
    });
    assert.equal(r.exitCode, 0);
    assert.equal(r.stdout, 'hello\n');
    assert.equal(r.stderr, 'warn\n');
    assert.equal(r.timedOut, false);
    assert.ok(r.durationMs >= 0);
  });

  it('pasa cwd y env al spawn', async () => {
    const spawnMock = mockSpawn();
    await runProcess({
      binPath: 'fake', args: [], env: { FOO: 'bar' }, cwd: '/work', timeoutMs: 1000, _spawn: spawnMock,
    });
    assert.equal(spawnMock.calls[0].opts.cwd, '/work');
    assert.equal(spawnMock.calls[0].opts.env.FOO, 'bar');
  });

  it('timeout dispara SIGTERM', async () => {
    const spawnMock = mockSpawn({ exitDelayMs: 1000 });
    let captured;
    const wrappedSpawn = (...a) => {
      const ch = spawnMock(...a);
      captured = ch;
      return ch;
    };
    const r = await runProcess({
      binPath: 'fake', args: [], env: {}, cwd: '/', timeoutMs: 50, _spawn: wrappedSpawn,
    });
    assert.equal(r.timedOut, true);
    assert.equal(captured._killed, 'SIGTERM');
  });

  it('AbortSignal disparado antes del spawn → no spawnea, resuelve aborted', async () => {
    const spawnMock = mockSpawn();
    const ac = new AbortController();
    ac.abort();
    const r = await runProcess({
      binPath: 'fake', args: [], env: {}, cwd: '/', timeoutMs: 1000,
      abortSignal: ac.signal, _spawn: spawnMock,
    });
    assert.equal(r.aborted, true);
    assert.equal(spawnMock.calls.length, 0);
  });

  it('AbortSignal durante el spawn → SIGTERM', async () => {
    const spawnMock = mockSpawn({ exitDelayMs: 1000 });
    const ac = new AbortController();
    let captured;
    const wrappedSpawn = (...a) => {
      const ch = spawnMock(...a);
      captured = ch;
      return ch;
    };
    setTimeout(() => ac.abort(), 20);
    const r = await runProcess({
      binPath: 'fake', args: [], env: {}, cwd: '/', timeoutMs: 1000,
      abortSignal: ac.signal, _spawn: wrappedSpawn,
    });
    assert.equal(r.aborted, true);
    assert.equal(captured._killed, 'SIGTERM');
  });

  it('error de spawn → reject', async () => {
    const spawnMock = mockSpawn({ errorOnSpawn: new Error('ENOENT') });
    await assert.rejects(
      () => runProcess({ binPath: 'nope', args: [], env: {}, cwd: '/', timeoutMs: 1000, _spawn: spawnMock }),
      /ENOENT/,
    );
  });
});
