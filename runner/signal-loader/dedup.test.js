import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSignalSeen, markSignalSeen, SIGNAL_SEEN_TTL_SECONDS } from './dedup.js';

const HASH = 'abc123def456';

test('isSignalSeen devuelve false si KV.getValue es null (404)', async () => {
  const kv = { getValue: async () => null };
  assert.equal(await isSignalSeen(HASH, kv), false);
});

test('isSignalSeen devuelve true si KV.getValue devuelve algo', async () => {
  const kv = { getValue: async () => '1' };
  assert.equal(await isSignalSeen(HASH, kv), true);
});

test('isSignalSeen consulta key con prefijo signal_seen:', async () => {
  let queried;
  const kv = { getValue: async (k) => { queried = k; return null; } };
  await isSignalSeen(HASH, kv);
  assert.equal(queried, `signal_seen:${HASH}`);
});

test('markSignalSeen escribe "1" con TTL default 30 días', async () => {
  let captured;
  const kv = {
    putValue: async (key, value, opts) => { captured = { key, value, opts }; },
  };
  await markSignalSeen(HASH, kv);
  assert.equal(captured.key, `signal_seen:${HASH}`);
  assert.equal(captured.value, '1');
  assert.equal(captured.opts.expirationTtl, SIGNAL_SEEN_TTL_SECONDS);
  assert.equal(SIGNAL_SEEN_TTL_SECONDS, 30 * 24 * 3600);
});

test('markSignalSeen acepta TTL custom', async () => {
  let captured;
  const kv = {
    putValue: async (key, value, opts) => { captured = { key, value, opts }; },
  };
  await markSignalSeen(HASH, kv, { ttlSeconds: 7200 });
  assert.equal(captured.opts.expirationTtl, 7200);
});
