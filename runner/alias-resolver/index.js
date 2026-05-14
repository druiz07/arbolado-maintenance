export { AliasResolverApiError, AliasNotFoundError } from './errors.js';
export { fetchGroqModels } from './groq-models.js';
export { fetchGeminiModels } from './gemini-models.js';
export { resolveModelAlias } from './resolver.js';

import { fetchGroqModels } from './groq-models.js';
import { fetchGeminiModels } from './gemini-models.js';
import { resolveModelAlias } from './resolver.js';

export async function resolveAlias(alias, { groqKey, geminiKey, fetchFn }) {
  const [groqModels, geminiModels] = await Promise.all([
    fetchGroqModels({ apiKey: groqKey, fetchFn }),
    fetchGeminiModels({ apiKey: geminiKey, fetchFn }),
  ]);
  return resolveModelAlias(alias, { groqModels, geminiModels });
}
