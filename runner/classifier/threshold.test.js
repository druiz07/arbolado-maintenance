import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyTopTwoMargin } from './threshold.js';

const playbooks = [
  { id: 'bump-devdep-cve', classifyConfidenceMin: 0.7, marginThreshold: 0.15 },
  { id: 'lint-prettier-autofix', classifyConfidenceMin: 0.5, marginThreshold: 0.10 },
  { id: 'rollback-on-build-failure', classifyConfidenceMin: 0.8, marginThreshold: 0.20 },
];

test('applyTopTwoMargin acepta cuando top1 ≥ minConfidence Y margin ≥ threshold', () => {
  const r = applyTopTwoMargin(
    [
      { playbook_id: 'bump-devdep-cve', confidence: 0.92 },
      { playbook_id: 'lint-prettier-autofix', confidence: 0.34 },
    ],
    playbooks,
  );
  assert.equal(r.ok, true);
  assert.equal(r.playbookId, 'bump-devdep-cve');
  assert.equal(r.confidence, 0.92);
  assert.ok(Math.abs(r.margin - 0.58) < 1e-9);
});

test('applyTopTwoMargin rechaza con margin_too_low si top1-top2 < threshold del winner', () => {
  const r = applyTopTwoMargin(
    [
      { playbook_id: 'bump-devdep-cve', confidence: 0.85 },
      { playbook_id: 'lint-prettier-autofix', confidence: 0.80 },  // margin=0.05 < 0.15
    ],
    playbooks,
  );
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'margin_too_low');
  assert.equal(r.top1, 0.85);
  assert.equal(r.top2, 0.80);
  assert.ok(Math.abs(r.margin - 0.05) < 1e-9);
  assert.equal(r.playbookHint, 'bump-devdep-cve');  // top1 id para builder
});

test('applyTopTwoMargin rechaza con low_confidence si top1 < min del winner', () => {
  const r = applyTopTwoMargin(
    [
      { playbook_id: 'bump-devdep-cve', confidence: 0.65 },  // < 0.7
      { playbook_id: 'lint-prettier-autofix', confidence: 0.10 },
    ],
    playbooks,
  );
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'low_confidence');
  assert.equal(r.top1, 0.65);
  assert.equal(r.playbookHint, 'bump-devdep-cve');
});

test('applyTopTwoMargin con un solo playbook usa top2=0', () => {
  const r = applyTopTwoMargin(
    [{ playbook_id: 'bump-devdep-cve', confidence: 0.92 }],
    playbooks,
  );
  assert.equal(r.ok, true);
  assert.equal(r.top2, 0);
  assert.equal(r.margin, 0.92);
});

test('applyTopTwoMargin lanza si rankings vacío', () => {
  assert.throws(
    () => applyTopTwoMargin([], playbooks),
    /rankings vacío/,
  );
});

test('applyTopTwoMargin usa thresholds default si winner no los define', () => {
  const r = applyTopTwoMargin(
    [
      { playbook_id: 'unknown-playbook', confidence: 0.92 },
      { playbook_id: 'bump-devdep-cve', confidence: 0.30 },
    ],
    playbooks,
  );
  // unknown-playbook no está en la lista → defaults: minConfidence=0.7, marginThreshold=0.15
  assert.equal(r.ok, true);
  assert.equal(r.playbookId, 'unknown-playbook');
});

test('applyTopTwoMargin respeta umbrales específicos del winner', () => {
  // lint-prettier-autofix tiene minConfidence=0.5, marginThreshold=0.10
  const r = applyTopTwoMargin(
    [
      { playbook_id: 'lint-prettier-autofix', confidence: 0.55 },  // 0.55 ≥ 0.5 ✓
      { playbook_id: 'bump-devdep-cve', confidence: 0.40 },  // margin=0.15 ≥ 0.10 ✓
    ],
    playbooks,
  );
  assert.equal(r.ok, true);
  assert.equal(r.playbookId, 'lint-prettier-autofix');
});
