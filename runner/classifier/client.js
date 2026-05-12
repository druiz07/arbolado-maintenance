import { ClassifierApiError } from './errors.js';

const DEFAULT_MODEL = 'gemini-2.5-flash';
const ENDPOINT_PREFIX = 'https://generativelanguage.googleapis.com/v1beta/models';

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    rankings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          playbook_id: { type: 'string' },
          confidence: { type: 'number' },
        },
        required: ['playbook_id', 'confidence'],
      },
    },
  },
  required: ['rankings'],
};

/**
 * Llama a Gemini con structured output (JSON schema constrained decoding).
 * Modelo por defecto: gemini-2.5-flash. El router puede pasar gemini-2.5-pro
 * cuando classifier_failure_rate > 0.30 (escalación a modelo más capaz).
 * @param {object} args
 * @param {string} args.prompt
 * @param {string} args.apiKey — Google AI Studio API key
 * @param {string} [args.model] — default 'gemini-2.5-flash'
 * @param {typeof globalThis.fetch} [args.fetchFn]
 * @param {AbortSignal} [args.signalAbort]
 * @returns {Promise<object>} body crudo de la response Gemini
 * @throws {ClassifierApiError} en status no-2xx
 */
export async function callGeminiFlash({ prompt, apiKey, model = DEFAULT_MODEL, fetchFn = globalThis.fetch, signalAbort }) {
  const url = `${ENDPOINT_PREFIX}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.1,
      topP: 0.9,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
    },
  };

  const response = await fetchFn(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: signalAbort,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new ClassifierApiError(
      `Gemini returned status ${response.status}`,
      { status: response.status, body: safeParseJson(text) },
    );
  }
  return safeParseJson(text);
}

function safeParseJson(text) {
  try { return JSON.parse(text); } catch { return { _raw: text }; }
}
