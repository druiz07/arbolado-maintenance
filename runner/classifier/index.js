import { buildClassifierPrompt } from './prompt.js';
import { callGeminiFlash } from './client.js';
import { parseGeminiResponse } from './parser.js';
import { applyTopTwoMargin } from './threshold.js';

export { ClassifierApiError, ClassifierParseError } from './errors.js';
export { buildClassifierPrompt } from './prompt.js';
export { callGeminiFlash } from './client.js';
export { parseGeminiResponse } from './parser.js';
export { applyTopTwoMargin } from './threshold.js';

/**
 * Composición end-to-end: signal + playbooks → decisión del classifier.
 * @param {object} args
 * @param {object} args.signal
 * @param {Array<{id, description, classifierRules, classifyConfidenceMin, marginThreshold}>} args.playbooks
 * @param {string} args.apiKey — GEMINI_API_KEY
 * @param {string} [args.model] — default 'gemini-2.5-flash'; el router (Sem 4)
 *   puede pasar 'gemini-2.5-pro' cuando classifier_failure_rate > 0.30
 * @param {typeof globalThis.fetch} [args.fetchFn]
 * @param {AbortSignal} [args.signalAbort]
 * @returns {Promise<object>} decisión final (ok|reason + metadata)
 */
export async function classifySignal({ signal, playbooks, apiKey, model, fetchFn, signalAbort }) {
  const prompt = buildClassifierPrompt(signal, playbooks);
  const raw = await callGeminiFlash({ prompt, apiKey, model, fetchFn, signalAbort });
  const parsed = parseGeminiResponse(raw);
  const decision = applyTopTwoMargin(parsed.rankings, playbooks);
  return { ...decision, usage: parsed.usage, rankings: parsed.rankings };
}
