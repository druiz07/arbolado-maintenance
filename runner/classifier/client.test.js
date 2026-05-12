import { test } from 'node:test';
import assert from 'node:assert/strict';
import { callGeminiFlash } from './client.js';
import { ClassifierApiError } from './errors.js';

function makeFetchMock({ status = 200, body = {}, captureCall } = {}) {
  return async (url, init) => {
    if (captureCall) captureCall({ url, init });
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  };
}

const VALID_RESPONSE_BODY = {
  candidates: [{
    content: {
      parts: [{ text: '{"rankings":[{"playbook_id":"bump-devdep-cve","confidence":0.92}]}' }],
    },
    finishReason: 'STOP',
  }],
  usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 30, totalTokenCount: 130 },
};

test('callGeminiFlash POST a la URL correcta con apiKey en querystring', async () => {
  let captured;
  const fetchFn = makeFetchMock({
    body: VALID_RESPONSE_BODY,
    captureCall: (c) => { captured = c; },
  });
  await callGeminiFlash({ prompt: 'test', apiKey: 'KEY123', fetchFn });
  assert.equal(captured.init.method, 'POST');
  assert.match(captured.url, /generativelanguage\.googleapis\.com/);
  assert.match(captured.url, /gemini-2\.5-flash:generateContent/);
  assert.match(captured.url, /\?key=KEY123/);
});

test('callGeminiFlash usa el param `model` en la URL (router-driven escalation)', async () => {
  let captured;
  const fetchFn = makeFetchMock({
    body: VALID_RESPONSE_BODY,
    captureCall: (c) => { captured = c; },
  });
  await callGeminiFlash({ prompt: 'test', apiKey: 'k', model: 'gemini-2.5-pro', fetchFn });
  assert.match(captured.url, /gemini-2\.5-pro:generateContent/);
  assert.doesNotMatch(captured.url, /gemini-2\.5-flash/);
});

test('callGeminiFlash body contiene contents + generationConfig con responseSchema', async () => {
  let captured;
  const fetchFn = makeFetchMock({
    body: VALID_RESPONSE_BODY,
    captureCall: (c) => { captured = c; },
  });
  await callGeminiFlash({ prompt: 'mi prompt', apiKey: 'k', fetchFn });
  const body = JSON.parse(captured.init.body);
  assert.equal(body.contents[0].parts[0].text, 'mi prompt');
  assert.equal(body.generationConfig.temperature, 0.1);
  assert.equal(body.generationConfig.topP, 0.9);
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
  assert.equal(body.generationConfig.responseSchema.properties.rankings.type, 'array');
});

test('callGeminiFlash devuelve el cuerpo parseado en éxito', async () => {
  const fetchFn = makeFetchMock({ body: VALID_RESPONSE_BODY });
  const r = await callGeminiFlash({ prompt: 'p', apiKey: 'k', fetchFn });
  assert.deepEqual(r, VALID_RESPONSE_BODY);
});

test('callGeminiFlash lanza ClassifierApiError en 4xx', async () => {
  const fetchFn = makeFetchMock({ status: 401, body: { error: { message: 'API key invalid' } } });
  await assert.rejects(
    () => callGeminiFlash({ prompt: 'p', apiKey: 'bad', fetchFn }),
    (err) => {
      assert.equal(err.name, 'ClassifierApiError');
      assert.equal(err.status, 401);
      return true;
    },
  );
});

test('callGeminiFlash lanza ClassifierApiError en 5xx', async () => {
  const fetchFn = makeFetchMock({ status: 503, body: { error: { message: 'Service unavailable' } } });
  await assert.rejects(
    () => callGeminiFlash({ prompt: 'p', apiKey: 'k', fetchFn }),
    /ClassifierApiError/,
  );
});

test('callGeminiFlash apiKey NUNCA aparece en el body', async () => {
  let captured;
  const fetchFn = makeFetchMock({
    body: VALID_RESPONSE_BODY,
    captureCall: (c) => { captured = c; },
  });
  await callGeminiFlash({ prompt: 'p', apiKey: 'SECRET-KEY', fetchFn });
  assert.doesNotMatch(captured.init.body, /SECRET-KEY/);
});

test('callGeminiFlash respeta AbortSignal', async () => {
  const ac = new AbortController();
  ac.abort();
  let aborted = false;
  const fetchFn = async (_url, init) => {
    if (init.signal?.aborted) { aborted = true; throw new Error('AbortError'); }
    return new Response('{}', { status: 200 });
  };
  await assert.rejects(
    () => callGeminiFlash({ prompt: 'p', apiKey: 'k', fetchFn, signalAbort: ac.signal }),
  );
  assert.equal(aborted, true);
});
