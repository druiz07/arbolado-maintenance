import { AliasNotFoundError } from './errors.js';

const KNOWN_ALIASES = {
  'groq/kimi-k2': 'groq/llama-3.3-70b-versatile',
  'google/gemini-2.5-flash': 'gemini/gemini-2.5-flash',
  'google/gemini-2.5-pro': 'gemini/gemini-2.5-pro',
};

export function resolveModelAlias(alias, { groqModels, geminiModels }) {
  const mapped = KNOWN_ALIASES[alias] || alias;
  const slashIdx = mapped.indexOf('/');
  if (slashIdx <= 0) {
    throw new AliasNotFoundError(`alias missing provider prefix: ${alias}`, { alias, availableModels: [] });
  }
  const provider = mapped.slice(0, slashIdx);
  const modelId = mapped.slice(slashIdx + 1);

  const list = provider === 'groq' ? groqModels : provider === 'gemini' ? geminiModels : null;
  if (!list) {
    throw new AliasNotFoundError(`unknown provider: ${provider}`, { alias, availableModels: [] });
  }
  if (!list.includes(modelId)) {
    throw new AliasNotFoundError(
      `model ${modelId} not in ${provider} available list`,
      { alias, availableModels: list },
    );
  }

  return {
    provider,
    resolved: mapped,
    mappedFrom: alias === mapped ? null : alias,
  };
}
