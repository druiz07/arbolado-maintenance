import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createKvClient } from './kv-client.js';

const ACCOUNT = 'acc123';
const NS = 'ns456';
const TOKEN = 'cf-token-789';

function makeFetchMock(handlers) {
  return async (url, init) => {
    for (const h of handlers) {
      if (h.matches(url, init)) return h.respond(url, init);
    }
    throw new Error(`unexpected fetch: ${url}`);
  };
}

test('listKeys hace GET a /keys con prefix correcto y Authorization header', async () => {
  let captured;
  const fetchFn = makeFetchMock([{
    matches: (url) => url.includes('/keys'),
    respond: (url, init) => {
      captured = { url, init };
      return new Response(JSON.stringify({
        result: [{ name: 'signal:abc' }, { name: 'signal:def' }],
        success: true,
        result_info: { count: 2, cursor: '' },
      }), { status: 200 });
    },
  }]);
  const client = createKvClient({ accountId: ACCOUNT, namespaceId: NS, apiToken: TOKEN, fetchFn });
  const keys = await client.listKeys('signal:');
  assert.match(captured.url, /accounts\/acc123\/storage\/kv\/namespaces\/ns456\/keys/);
  assert.match(captured.url, /prefix=signal%3A/);
  assert.equal(captured.init.headers.authorization, 'Bearer cf-token-789');
  assert.deepEqual(keys, ['signal:abc', 'signal:def']);
});

test('getValue hace GET a /values/<key> y devuelve el body parseado', async () => {
  const fetchFn = makeFetchMock([{
    matches: (url) => url.includes('/values/signal%3Aabc'),
    respond: () => new Response(JSON.stringify({ dependency: 'eslint' }), { status: 200 }),
  }]);
  const client = createKvClient({ accountId: ACCOUNT, namespaceId: NS, apiToken: TOKEN, fetchFn });
  const v = await client.getValue('signal:abc');
  assert.deepEqual(v, { dependency: 'eslint' });
});

test('getValue devuelve null en 404', async () => {
  const fetchFn = async () => new Response('not found', { status: 404 });
  const client = createKvClient({ accountId: ACCOUNT, namespaceId: NS, apiToken: TOKEN, fetchFn });
  const v = await client.getValue('signal:missing');
  assert.equal(v, null);
});

test('putValue hace PUT a /values/<key> con body texto y opcional expiration_ttl', async () => {
  let captured;
  const fetchFn = async (url, init) => {
    captured = { url, init };
    return new Response('{"success":true}', { status: 200 });
  };
  const client = createKvClient({ accountId: ACCOUNT, namespaceId: NS, apiToken: TOKEN, fetchFn });
  await client.putValue('signal_seen:abc', '1', { expirationTtl: 2592000 });
  assert.equal(captured.init.method, 'PUT');
  assert.match(captured.url, /\/values\/signal_seen%3Aabc\?expiration_ttl=2592000/);
  assert.equal(captured.init.body, '1');
});

test('listKeys lanza SignalLoaderKvError en 401', async () => {
  const fetchFn = async () => new Response('{"error":"unauthorized"}', { status: 401 });
  const client = createKvClient({ accountId: ACCOUNT, namespaceId: NS, apiToken: 'bad', fetchFn });
  await assert.rejects(
    () => client.listKeys('signal:'),
    (err) => err.name === 'SignalLoaderKvError' && err.status === 401,
  );
});

test('listKeys pagina por cursor cuando result_info.cursor != ""', async () => {
  let calls = 0;
  const fetchFn = async (url) => {
    calls++;
    if (calls === 1) {
      return new Response(JSON.stringify({
        result: [{ name: 'signal:a' }],
        success: true,
        result_info: { count: 1, cursor: 'NEXT_CURSOR' },
      }), { status: 200 });
    }
    assert.match(url, /cursor=NEXT_CURSOR/);
    return new Response(JSON.stringify({
      result: [{ name: 'signal:b' }],
      success: true,
      result_info: { count: 1, cursor: '' },
    }), { status: 200 });
  };
  const client = createKvClient({ accountId: ACCOUNT, namespaceId: NS, apiToken: TOKEN, fetchFn });
  const keys = await client.listKeys('signal:');
  assert.deepEqual(keys, ['signal:a', 'signal:b']);
  assert.equal(calls, 2);
});
