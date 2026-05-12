import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifySignal } from './index.js';

const SIGNAL = {
  source: 'worker',
  dependency: 'eslint',
  current_version: '^8.54.0',
  patched_versions: '>=8.56.0',
  severity: 'high',
  is_transitive: false,
  dependency_type: 'dev',
};

const PLAYBOOKS = [
  {
    id: 'bump-devdep-cve',
    description: 'Bump devDep CVE',
    classifierRules: 'Solo si dependency_type=dev y patched_versions presente.',
    classifyConfidenceMin: 0.7,
    marginThreshold: 0.15,
  },
  {
    id: 'rollback-on-build-failure',
    description: 'Rollback CI fail',
    classifierRules: 'Solo si source=ci_failure.',
    classifyConfidenceMin: 0.8,
    marginThreshold: 0.20,
  },
];

function makeFetchMockReturning(rankings) {
  return async () => new Response(JSON.stringify({
    candidates: [{
      content: { parts: [{ text: JSON.stringify({ rankings }) }] },
      finishReason: 'STOP',
    }],
    usageMetadata: { totalTokenCount: 200 },
  }), { status: 200, headers: { 'content-type': 'application/json' } });
}

test('classifySignal propaga `model` al client (router-driven escalation)', async () => {
  let capturedUrl;
  const fetchFn = async (url) => {
    capturedUrl = url;
    return new Response(JSON.stringify({
      candidates: [{
        content: { parts: [{ text: JSON.stringify({ rankings: [{ playbook_id: 'bump-devdep-cve', confidence: 0.9 }] }) }] },
        finishReason: 'STOP',
      }],
      usageMetadata: { totalTokenCount: 100 },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  await classifySignal({
    signal: SIGNAL, playbooks: PLAYBOOKS, apiKey: 'k', model: 'gemini-2.5-pro', fetchFn,
  });
  assert.match(capturedUrl, /gemini-2\.5-pro:generateContent/);
});

test('classifySignal integración happy path', async () => {
  const fetchFn = makeFetchMockReturning([
    { playbook_id: 'bump-devdep-cve', confidence: 0.92 },
    { playbook_id: 'rollback-on-build-failure', confidence: 0.05 },
  ]);
  const r = await classifySignal({
    signal: SIGNAL, playbooks: PLAYBOOKS, apiKey: 'test', fetchFn,
  });
  assert.equal(r.ok, true);
  assert.equal(r.playbookId, 'bump-devdep-cve');
  assert.equal(r.confidence, 0.92);
  assert.ok(r.margin > 0.8);
  assert.ok(r.usage);
});

test('classifySignal falla con margin_too_low', async () => {
  const fetchFn = makeFetchMockReturning([
    { playbook_id: 'bump-devdep-cve', confidence: 0.85 },
    { playbook_id: 'rollback-on-build-failure', confidence: 0.80 },
  ]);
  const r = await classifySignal({
    signal: SIGNAL, playbooks: PLAYBOOKS, apiKey: 'test', fetchFn,
  });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'margin_too_low');
  assert.equal(r.playbookHint, 'bump-devdep-cve');
});

test('classifySignal falla con low_confidence', async () => {
  const fetchFn = makeFetchMockReturning([
    { playbook_id: 'bump-devdep-cve', confidence: 0.50 },
    { playbook_id: 'rollback-on-build-failure', confidence: 0.10 },
  ]);
  const r = await classifySignal({
    signal: SIGNAL, playbooks: PLAYBOOKS, apiKey: 'test', fetchFn,
  });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'low_confidence');
});

test('classifySignal propaga ClassifierApiError en fallo de red', async () => {
  const fetchFn = async () => new Response('{"error":"key invalid"}', { status: 401 });
  await assert.rejects(
    () => classifySignal({ signal: SIGNAL, playbooks: PLAYBOOKS, apiKey: 'bad', fetchFn }),
    /ClassifierApiError/,
  );
});

// ---- Smoke real — sólo corre con CLASSIFIER_SMOKE=1 + GEMINI_API_KEY local ----
test('SMOKE: clasifica signal real con Gemini Flash live', { skip: process.env.CLASSIFIER_SMOKE !== '1' }, async () => {
  const apiKey = process.env.GEMINI_API_KEY;
  assert.ok(apiKey, 'GEMINI_API_KEY env required for smoke');

  const playbooks = [
    {
      id: 'bump-devdep-cve',
      description: 'Aplica parche automático a CVEs en devDependencies',
      classifierRules: 'Solo si dependency_type == dev y patched_versions presente.',
      classifyConfidenceMin: 0.7,
      marginThreshold: 0.15,
    },
    {
      id: 'rollback-on-build-failure',
      description: 'Rollback automático si CI falla post-release',
      classifierRules: 'Solo si source == ci_failure y post-release.',
      classifyConfidenceMin: 0.8,
      marginThreshold: 0.20,
    },
    {
      id: 'lint-prettier-autofix',
      description: 'Drift de formato — autofix prettier',
      classifierRules: 'Solo si source == lint_drift.',
      classifyConfidenceMin: 0.5,
      marginThreshold: 0.10,
    },
  ];

  const t0 = Date.now();
  const r = await classifySignal({ signal: SIGNAL, playbooks, apiKey });
  const ms = Date.now() - t0;

  console.log(`SMOKE classifier latency=${ms}ms tokens=${JSON.stringify(r.usage)}`);
  console.log(`SMOKE rankings=${JSON.stringify(r.rankings)}`);

  assert.equal(r.ok, true, `expected ok, got: ${JSON.stringify(r)}`);
  assert.equal(r.playbookId, 'bump-devdep-cve', 'expected bump-devdep-cve as winner');
  assert.ok(r.margin >= 0.15, `margin ${r.margin} < 0.15`);
  assert.ok(ms < 10000, `latency ${ms}ms > 10s`);
});
