import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchGroqModels } from './groq-models.js';

test('fetchGroqModels hace GET a /v1/models con Authorization Bearer', async () => {
  let captured;
  const fetchFn = async (url, init) => {
    captured = { url, init };
    return new Response(JSON.stringify({
      object: 'list',
      data: [
        { id: 'llama-3.3-70b-versatile', object: 'model' },
        { id: 'llama-3.1-8b-instant', object: 'model' },
      ],
    }), { status: 200 });
  };
  const ids = await fetchGroqModels({ apiKey: 'gsk_test', fetchFn });
  assert.match(captured.url, /api\.groq\.com\/openai\/v1\/models$/);
  assert.equal(captured.init.headers.authorization, 'Bearer gsk_test');
  assert.deepEqual(ids, ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant']);
});

test('fetchGroqModels lanza AliasResolverApiError en 401', async () => {
  const fetchFn = async () => new Response('{"error":"invalid_api_key"}', { status: 401 });
  await assert.rejects(
    () => fetchGroqModels({ apiKey: 'bad', fetchFn }),
    (err) => err.name === 'AliasResolverApiError' && err.provider === 'groq' && err.status === 401,
  );
});

test('fetchGroqModels devuelve array vacio si data esta vacio', async () => {
  const fetchFn = async () => new Response('{"object":"list","data":[]}', { status: 200 });
  const ids = await fetchGroqModels({ apiKey: 'gsk_test', fetchFn });
  assert.deepEqual(ids, []);
});
