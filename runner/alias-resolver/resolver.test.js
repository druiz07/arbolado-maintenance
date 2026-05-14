import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveModelAlias } from './resolver.js';

const GROQ_MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'];
const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.5-pro'];

test('resolveModelAlias devuelve el mismo string si ya es un modelo real', () => {
  const r = resolveModelAlias('groq/llama-3.3-70b-versatile', { groqModels: GROQ_MODELS, geminiModels: GEMINI_MODELS });
  assert.deepEqual(r, { provider: 'groq', resolved: 'groq/llama-3.3-70b-versatile', mappedFrom: null });
});

test('resolveModelAlias resuelve groq/kimi-k2 al primary actual de groq (mapping conocido)', () => {
  const r = resolveModelAlias('groq/kimi-k2', { groqModels: GROQ_MODELS, geminiModels: GEMINI_MODELS });
  assert.equal(r.provider, 'groq');
  assert.equal(r.resolved, 'groq/llama-3.3-70b-versatile');
  assert.equal(r.mappedFrom, 'groq/kimi-k2');
});

test('resolveModelAlias resuelve google/gemini-2.5-flash a gemini/gemini-2.5-flash si esta disponible', () => {
  const r = resolveModelAlias('google/gemini-2.5-flash', { groqModels: GROQ_MODELS, geminiModels: GEMINI_MODELS });
  assert.equal(r.provider, 'gemini');
  assert.equal(r.resolved, 'gemini/gemini-2.5-flash');
});

test('resolveModelAlias lanza AliasNotFoundError si alias no es mapeable y no existe', () => {
  assert.throws(
    () => resolveModelAlias('groq/totally-fake-model', { groqModels: GROQ_MODELS, geminiModels: GEMINI_MODELS }),
    (err) => err.name === 'AliasNotFoundError' && err.alias === 'groq/totally-fake-model',
  );
});

test('resolveModelAlias retorna mappedFrom=null cuando no hubo mapping (identity passthrough)', () => {
  const r = resolveModelAlias('gemini/gemini-2.5-flash', { groqModels: GROQ_MODELS, geminiModels: GEMINI_MODELS });
  assert.equal(r.mappedFrom, null);
});
