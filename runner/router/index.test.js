import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeClassifierModel, routeInvokerModel } from './index.js';

const HEALTHY = {
  insufficient_data: false,
  pr_merge_rate: 0.85,
  failure_stages: { none: 0.85, classifier: 0.05, policy: 0.05, aider: 0.05 },
  per_playbook: { 'bump-devdep-cve': { pr_merge_rate: 0.85, samples: 20 } },
};
const FAILING_CLASSIFIER = {
  insufficient_data: false,
  pr_merge_rate: 0.30,
  failure_stages: { classifier: 0.40, policy: 0.20, none: 0.40 },
  per_playbook: {},
};
const FAILING_POLICY = {
  insufficient_data: false,
  pr_merge_rate: 0.20,
  failure_stages: { policy: 0.60, none: 0.40 },
  per_playbook: { 'bump-devdep-cve': { pr_merge_rate: 0.20, samples: 10 } },
};
const NO_DATA = { insufficient_data: true, pr_merge_rate: null, failure_stages: {}, per_playbook: {} };

test('routeClassifierModel devuelve default si insufficient_data', () => {
  const r = routeClassifierModel({ healthMetrics: NO_DATA, defaultModel: 'gemini-2.5-flash' });
  assert.equal(r.model, 'gemini-2.5-flash');
  assert.equal(r.promptVariant, 'canonical');
  assert.match(r.reason, /insufficient_data/);
});

test('routeClassifierModel devuelve default si classifier failure_stage < 30%', () => {
  const r = routeClassifierModel({ healthMetrics: HEALTHY, defaultModel: 'gemini-2.5-flash' });
  assert.equal(r.model, 'gemini-2.5-flash');
  assert.equal(r.promptVariant, 'canonical');
});

test('routeClassifierModel salta a Pro si classifier > 30% failures', () => {
  const r = routeClassifierModel({ healthMetrics: FAILING_CLASSIFIER, defaultModel: 'gemini-2.5-flash' });
  assert.equal(r.model, 'gemini-2.5-pro');
  assert.equal(r.promptVariant, 'canonical');
  assert.match(r.reason, /classifier_failure_rate/);
});

test('routeInvokerModel devuelve canonical si pr_merge_rate >= 50%', () => {
  const playbook = { id: 'bump-devdep-cve', execution: { model_strategy: { primary: 'groq/llama-3.3-70b-versatile' } } };
  const r = routeInvokerModel({ healthMetrics: HEALTHY, playbook });
  assert.equal(r.model, 'groq/llama-3.3-70b-versatile');
  assert.equal(r.promptVariant, 'canonical');
});

test('routeInvokerModel devuelve variant=conservative si policy failures > 50%', () => {
  const playbook = { id: 'bump-devdep-cve', execution: { model_strategy: { primary: 'groq/llama-3.3-70b-versatile' } } };
  const r = routeInvokerModel({ healthMetrics: FAILING_POLICY, playbook });
  assert.equal(r.promptVariant, 'conservative');
  assert.match(r.reason, /policy_failure_rate/);
});

test('routeInvokerModel devuelve default si insufficient_data', () => {
  const playbook = { id: 'bump-devdep-cve', execution: { model_strategy: { primary: 'groq/llama-3.3-70b-versatile' } } };
  const r = routeInvokerModel({ healthMetrics: NO_DATA, playbook });
  assert.equal(r.model, 'groq/llama-3.3-70b-versatile');
  assert.equal(r.promptVariant, 'canonical');
  assert.match(r.reason, /insufficient_data/);
});

test('routeInvokerModel cae a fallback si playbook sin model_strategy.primary', () => {
  const playbook = { id: 'foo' };
  const r = routeInvokerModel({ healthMetrics: HEALTHY, playbook });
  assert.equal(r.model, 'groq/llama-3.3-70b-versatile');
  assert.match(r.reason, /no_primary_in_playbook/);
});
