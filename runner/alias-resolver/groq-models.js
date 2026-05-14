import { AliasResolverApiError } from './errors.js';

const GROQ_MODELS_URL = 'https://api.groq.com/openai/v1/models';

export async function fetchGroqModels({ apiKey, fetchFn = globalThis.fetch }) {
  const r = await fetchFn(GROQ_MODELS_URL, {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  if (!r.ok) {
    throw new AliasResolverApiError(`Groq /v1/models ${r.status}`, {
      provider: 'groq',
      status: r.status,
      body: await r.text(),
    });
  }
  const body = await r.json();
  return (body.data || []).map((m) => m.id);
}
