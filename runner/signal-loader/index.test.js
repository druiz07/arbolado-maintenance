import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadNextSignal } from './index.js';
import { generateSignalHash } from '../session-report/signal-hash.js';

const SIGNAL_A = {
  source: 'worker', dependency: 'eslint', severity: 'high',
  current_version: '^8.54.0', dependency_type: 'dev',
  vulnerable_versions: '<8.56.0', patched_versions: '>=8.56.0',
};
const SIGNAL_B = {
  source: 'worker', dependency: 'jest', severity: 'moderate',
  current_version: '^29.0.0', dependency_type: 'dev',
  vulnerable_versions: '<29.7.0', patched_versions: '>=29.7.0',
};
const HASH_A = generateSignalHash(SIGNAL_A);
const HASH_B = generateSignalHash(SIGNAL_B);

function makeKv(state) {
  return {
    listKeys: async (prefix) =>
      Object.keys(state).filter((k) => k.startsWith(prefix)),
    getValue: async (k) => state[k] ?? null,
    putValue: async (k, v) => { state[k] = v; },
  };
}

test('loadNextSignal devuelve {hasSignal:false} si no hay signals en KV', async () => {
  const kv = makeKv({});
  const r = await loadNextSignal({ kvClient: kv });
  assert.equal(r.hasSignal, false);
  assert.equal(r.signal, undefined);
});

test('loadNextSignal devuelve el primer signal no visto', async () => {
  const kv = makeKv({
    'signal:001': JSON.stringify(SIGNAL_A),
    'signal:002': JSON.stringify(SIGNAL_B),
  });
  const r = await loadNextSignal({ kvClient: kv });
  assert.equal(r.hasSignal, true);
  assert.equal(r.signal.dependency, 'eslint');
  assert.equal(r.kvKey, 'signal:001');
  assert.equal(r.signalHash, HASH_A);
});

test('loadNextSignal salta signals ya marcados como seen', async () => {
  const kv = makeKv({
    'signal:001': JSON.stringify(SIGNAL_A),
    'signal:002': JSON.stringify(SIGNAL_B),
    [`signal_seen:${HASH_A}`]: '1',
  });
  const r = await loadNextSignal({ kvClient: kv });
  assert.equal(r.hasSignal, true);
  assert.equal(r.signal.dependency, 'jest');
  assert.equal(r.signalHash, HASH_B);
});

test('loadNextSignal devuelve {hasSignal:false} si TODOS están seen', async () => {
  const kv = makeKv({
    'signal:001': JSON.stringify(SIGNAL_A),
    [`signal_seen:${HASH_A}`]: '1',
  });
  const r = await loadNextSignal({ kvClient: kv });
  assert.equal(r.hasSignal, false);
});

test('loadNextSignal salta signals con JSON corrupto y sigue al siguiente', async () => {
  const kv = makeKv({
    'signal:bad': 'not-json{{',
    'signal:good': JSON.stringify(SIGNAL_B),
  });
  const r = await loadNextSignal({ kvClient: kv });
  assert.equal(r.hasSignal, true);
  assert.equal(r.signal.dependency, 'jest');
});
