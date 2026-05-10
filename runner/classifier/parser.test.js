import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGeminiResponse } from './parser.js';
import { ClassifierParseError } from './errors.js';

const goodResponse = {
  candidates: [{
    content: {
      parts: [{
        text: JSON.stringify({
          rankings: [
            { playbook_id: 'bump-devdep-cve', confidence: 0.92 },
            { playbook_id: 'lint-prettier-autofix', confidence: 0.34 },
            { playbook_id: 'rollback-on-build-failure', confidence: 0.05 },
          ],
        }),
      }],
    },
    finishReason: 'STOP',
  }],
};

test('parseGeminiResponse extrae rankings ordenados desc por confidence', () => {
  const r = parseGeminiResponse(goodResponse);
  assert.equal(r.rankings.length, 3);
  assert.equal(r.rankings[0].playbook_id, 'bump-devdep-cve');
  assert.equal(r.rankings[0].confidence, 0.92);
  assert.equal(r.rankings[2].confidence, 0.05);
});

test('parseGeminiResponse re-ordena si Gemini devuelve unsorted', () => {
  const unsorted = structuredClone(goodResponse);
  unsorted.candidates[0].content.parts[0].text = JSON.stringify({
    rankings: [
      { playbook_id: 'lint-prettier-autofix', confidence: 0.34 },
      { playbook_id: 'bump-devdep-cve', confidence: 0.92 },
    ],
  });
  const r = parseGeminiResponse(unsorted);
  assert.equal(r.rankings[0].playbook_id, 'bump-devdep-cve');
  assert.equal(r.rankings[1].playbook_id, 'lint-prettier-autofix');
});

test('parseGeminiResponse incluye usageMetadata si está presente', () => {
  const withUsage = structuredClone(goodResponse);
  withUsage.usageMetadata = { promptTokenCount: 100, totalTokenCount: 130 };
  const r = parseGeminiResponse(withUsage);
  assert.deepEqual(r.usage, { promptTokenCount: 100, totalTokenCount: 130 });
});

test('parseGeminiResponse lanza ClassifierParseError si no hay candidates', () => {
  assert.throws(
    () => parseGeminiResponse({ candidates: [] }),
    (err) => err.name === 'ClassifierParseError',
  );
});

test('parseGeminiResponse lanza ClassifierParseError si text no es JSON', () => {
  const bad = structuredClone(goodResponse);
  bad.candidates[0].content.parts[0].text = 'not-json {{';
  assert.throws(
    () => parseGeminiResponse(bad),
    (err) => err.name === 'ClassifierParseError',
  );
});

test('parseGeminiResponse lanza si rankings no es array', () => {
  const bad = structuredClone(goodResponse);
  bad.candidates[0].content.parts[0].text = JSON.stringify({ rankings: 'oops' });
  assert.throws(
    () => parseGeminiResponse(bad),
    (err) => err.name === 'ClassifierParseError',
  );
});

test('parseGeminiResponse lanza si algún ranking no tiene playbook_id o confidence', () => {
  const bad = structuredClone(goodResponse);
  bad.candidates[0].content.parts[0].text = JSON.stringify({
    rankings: [{ playbook_id: 'x' }],  // missing confidence
  });
  assert.throws(
    () => parseGeminiResponse(bad),
    (err) => err.name === 'ClassifierParseError',
  );
});

test('parseGeminiResponse clamp de confidence a [0, 1]', () => {
  const wonky = structuredClone(goodResponse);
  wonky.candidates[0].content.parts[0].text = JSON.stringify({
    rankings: [
      { playbook_id: 'a', confidence: 1.3 },   // → 1.0
      { playbook_id: 'b', confidence: -0.2 },  // → 0.0
    ],
  });
  const r = parseGeminiResponse(wonky);
  assert.equal(r.rankings[0].confidence, 1.0);
  assert.equal(r.rankings[1].confidence, 0.0);
});
