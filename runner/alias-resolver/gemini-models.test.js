import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchGeminiModels } from './gemini-models.js';

test('fetchGeminiModels hace GET a /v1beta/models con key en query', async () => {
  let captured;
  const fetchFn = async (url) => {
    captured = url;
    return new Response(JSON.stringify({
      models: [
        { name: 'models/gemini-2.5-flash' },
        { name: 'models/gemini-2.5-pro' },
        { name: 'models/text-embedding-004' },
      ],
    }), { status: 200 });
  };
  const ids = await fetchGeminiModels({ apiKey: 'AIzaTest', fetchFn });
  assert.match(captured, /generativelanguage\.googleapis\.com\/v1beta\/models\?key=AIzaTest$/);
  assert.deepEqual(ids, ['gemini-2.5-flash', 'gemini-2.5-pro', 'text-embedding-004']);
});

test('fetchGeminiModels lanza AliasResolverApiError en 403', async () => {
  const fetchFn = async () => new Response('{"error":{"code":403}}', { status: 403 });
  await assert.rejects(
    () => fetchGeminiModels({ apiKey: 'bad', fetchFn }),
    (err) => err.name === 'AliasResolverApiError' && err.provider === 'gemini' && err.status === 403,
  );
});

test('fetchGeminiModels strippea el prefijo "models/" de cada name', async () => {
  const fetchFn = async () => new Response(JSON.stringify({
    models: [{ name: 'models/gemini-2.5-flash' }],
  }), { status: 200 });
  const ids = await fetchGeminiModels({ apiKey: 'AIzaTest', fetchFn });
  assert.equal(ids[0], 'gemini-2.5-flash');
});
