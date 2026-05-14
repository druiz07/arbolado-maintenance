import { AliasNotFoundError } from './errors.js';

// Tabla intencionalmente VACIA tras el refactor 2026-05-14. El resolver opera
// en modo "passthrough verificado": valida que el ID del playbook exista en la
// lista real de modelos del provider (consultada via GET /v1/models). Si en el
// futuro un provider jubila un modelo y necesitamos un mote temporal, esta
// tabla es el hook — pero el patron por defecto debe ser "el playbook declara
// IDs reales que el provider sirve hoy".
//
// Historico: hasta 2026-05-14 mapeaba `groq/kimi-k2 -> groq/llama-3.3-70b-versatile`
// porque Kimi K2 (modelo real de Moonshot AI) fue retirado de Groq. Esa entrada
// se elimina al actualizar el playbook canonico a `groq/openai/gpt-oss-120b`.
const KNOWN_ALIASES = {};

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
