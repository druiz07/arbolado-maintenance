import { AliasResolverApiError } from './errors.js';

const GEMINI_MODELS_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

export async function fetchGeminiModels({ apiKey, fetchFn = globalThis.fetch }) {
  const url = `${GEMINI_MODELS_URL}?key=${apiKey}`;
  const r = await fetchFn(url, { method: 'GET' });
  if (!r.ok) {
    throw new AliasResolverApiError(`Gemini /v1beta/models ${r.status}`, {
      provider: 'gemini',
      status: r.status,
      body: await r.text(),
    });
  }
  const body = await r.json();
  return (body.models || []).map((m) => m.name.replace(/^models\//, ''));
}
