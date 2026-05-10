import { ClassifierApiError } from './errors.js';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

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
 * Llama a Gemini 2.5 Flash con structured output (JSON schema constrained decoding).
 * @param {object} args
 * @param {string} args.prompt
 * @param {string} args.apiKey — Google AI Studio API key
 * @param {typeof globalThis.fetch} [args.fetchFn]
 * @param {AbortSignal} [args.signalAbort]
 * @returns {Promise<object>} body crudo de la response Gemini
 * @throws {ClassifierApiError} en status no-2xx
 */
export async function callGeminiFlash({ prompt, apiKey, fetchFn = globalThis.fetch, signalAbort }) {
  const url = `${ENDPOINT}?key=${encodeURIComponent(apiKey)}`;
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
