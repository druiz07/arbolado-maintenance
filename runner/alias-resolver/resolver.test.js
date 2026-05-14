import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveModelAlias } from './resolver.js';

// Lista representativa post-refactor 2026-05-14: IDs reales que Groq sirve
// segun la pagina console.groq.com/models (verificable en runtime con
// fetchGroqModels). Nota: estos IDs son simbolicos para el test — el resolver
// es agnostico a los nombres concretos, solo verifica que el modelId del alias
// este presente en la lista que recibe.
const GROQ_MODELS = [
  'llama-3.3-70b-versatile',
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'meta-llama/llama-4-scout-17b-16e-instruct',
];
const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.5-pro'];

test('resolveModelAlias passthrough cuando el ID simple esta en groqModels', () => {
  const r = resolveModelAlias('groq/llama-3.3-70b-versatile', { groqModels: GROQ_MODELS, geminiModels: GEMINI_MODELS });
  assert.deepEqual(r, { provider: 'groq', resolved: 'groq/llama-3.3-70b-versatile', mappedFrom: null });
});

test('resolveModelAlias soporta IDs multi-segmento (provider/proveedor-real/modelo)', () => {
  const r = resolveModelAlias('groq/openai/gpt-oss-120b', { groqModels: GROQ_MODELS, geminiModels: GEMINI_MODELS });
  assert.equal(r.provider, 'groq');
  assert.equal(r.resolved, 'groq/openai/gpt-oss-120b');
  assert.equal(r.mappedFrom, null);
});

test('resolveModelAlias soporta IDs largos (Llama 4 Scout completo)', () => {
  const r = resolveModelAlias('groq/meta-llama/llama-4-scout-17b-16e-instruct', { groqModels: GROQ_MODELS, geminiModels: GEMINI_MODELS });
  assert.equal(r.provider, 'groq');
  assert.equal(r.resolved, 'groq/meta-llama/llama-4-scout-17b-16e-instruct');
});

test('resolveModelAlias resuelve gemini/<id> contra geminiModels', () => {
  const r = resolveModelAlias('gemini/gemini-2.5-flash', { groqModels: GROQ_MODELS, geminiModels: GEMINI_MODELS });
  assert.equal(r.provider, 'gemini');
  assert.equal(r.resolved, 'gemini/gemini-2.5-flash');
  assert.equal(r.mappedFrom, null);
});

test('resolveModelAlias lanza AliasNotFoundError si el modelo no esta en la lista del provider', () => {
  assert.throws(
    () => resolveModelAlias('groq/openai/gpt-oss-999b', { groqModels: GROQ_MODELS, geminiModels: GEMINI_MODELS }),
    (err) => err.name === 'AliasNotFoundError' && err.alias === 'groq/openai/gpt-oss-999b' && err.availableModels.length === GROQ_MODELS.length,
  );
});

test('resolveModelAlias lanza AliasNotFoundError si el provider no es groq ni gemini', () => {
  assert.throws(
    () => resolveModelAlias('anthropic/claude-opus-4', { groqModels: GROQ_MODELS, geminiModels: GEMINI_MODELS }),
    (err) => err.name === 'AliasNotFoundError' && /unknown provider/.test(err.message),
  );
});

test('resolveModelAlias lanza AliasNotFoundError si el alias no tiene prefijo provider', () => {
  assert.throws(
    () => resolveModelAlias('just-a-model-name', { groqModels: GROQ_MODELS, geminiModels: GEMINI_MODELS }),
    (err) => err.name === 'AliasNotFoundError' && /missing provider prefix/.test(err.message),
  );
});
