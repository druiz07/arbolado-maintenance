import { ClassifierParseError } from './errors.js';

/**
 * Extrae rankings del response de Gemini, los ordena desc por confidence,
 * y clampa cada confidence a [0, 1].
 * @param {object} rawResponse — body parseado de generateContent
 * @returns {{ rankings: Array<{playbook_id, confidence}>, usage?: object }}
 * @throws {ClassifierParseError}
 */
export function parseGeminiResponse(rawResponse) {
  const candidate = rawResponse?.candidates?.[0];
  if (!candidate) {
    throw new ClassifierParseError('Gemini response sin candidates', { rawResponse });
  }
  const text = candidate?.content?.parts?.[0]?.text;
  if (typeof text !== 'string') {
    throw new ClassifierParseError('candidate sin parts[0].text', { rawResponse });
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new ClassifierParseError(`text no es JSON válido: ${err.message}`, { rawResponse });
  }

  if (!Array.isArray(parsed?.rankings)) {
    throw new ClassifierParseError('rankings no es array', { rawResponse });
  }

  const normalized = parsed.rankings.map((r, i) => {
    if (typeof r?.playbook_id !== 'string' || typeof r?.confidence !== 'number') {
      throw new ClassifierParseError(`ranking[${i}] inválido`, { rawResponse });
    }
    return {
      playbook_id: r.playbook_id,
      confidence: Math.max(0, Math.min(1, r.confidence)),
    };
  });

  normalized.sort((a, b) => b.confidence - a.confidence);

  const result = { rankings: normalized };
  if (rawResponse.usageMetadata) result.usage = rawResponse.usageMetadata;
  return result;
}
