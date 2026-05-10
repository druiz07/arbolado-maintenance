// buildReport — compone el session report a partir de los retornos crudos del
// pipeline (loader, classifier, policy, invoker, CI, PR). Deriva failure_stage
// con orden estricto: classifier → policy → aider → ci → merge → none.
//
// Spec: docs/auto-maintenance/arranque-plan.md §5 + ajuste #8 (failure_stage).

import { generateSignalHash } from './signal-hash.js';

function deriveFailureStage({ playbook, classifierResult, policyResult, invokerResult, ciResult, prResult }) {
  // playbook == null implica que load-playbook falló (el classifier sugirió un
  // playbook que no existe o el YAML no parseó). Eso es un fallo a nivel
  // classifier (lo que vino antes en el pipeline) — gana sobre todo lo demás.
  if (playbook === null || playbook === undefined) return 'classifier';
  if (classifierResult === null || classifierResult === undefined) return 'classifier';
  if (policyResult && policyResult.valid === false) return 'policy';
  if (invokerResult && invokerResult.errorClass !== null) return 'aider';
  if (ciResult && (ciResult.testsOk === false || ciResult.buildOk === false)) return 'ci';
  if (prResult && prResult.merged === false) return 'merge';
  return 'none';
}

function deriveModelUsed({ invokerResult }) {
  if (invokerResult && typeof invokerResult.modelUsed === 'string' && invokerResult.modelUsed.length > 0) {
    return invokerResult.modelUsed;
  }
  return 'none';
}

function deriveDiffSize({ policyResult }) {
  if (policyResult && policyResult.ops && Number.isInteger(policyResult.ops.rawDiffLines)) {
    return policyResult.ops.rawDiffLines;
  }
  return 0;
}

function deriveTestsPassed({ ciResult }) {
  if (!ciResult) return false;
  return ciResult.testsOk === true && ciResult.buildOk === true;
}

export function buildReport({
  playbook,
  signal,
  invokerResult,
  policyResult,
  ciResult,
  prResult,
  retryCount,
  classifierResult,
  nowIso,
}) {
  // playbook === null es válido: significa que load-playbook falló y construimos
  // un report con failure_stage='classifier' usando el hint del classifier.
  // Si playbook NO es null pero le falta meta.id, sigue siendo un error de contrato.
  if (playbook !== null && playbook !== undefined) {
    if (!playbook?.meta?.id || typeof playbook.meta.id !== 'string') {
      throw new Error('buildReport: playbook.meta.id required (string)');
    }
  }

  const signal_hash = generateSignalHash(signal);

  const failure_stage = deriveFailureStage({ playbook, classifierResult, policyResult, invokerResult, ciResult, prResult });
  const model_used = deriveModelUsed({ invokerResult });
  const diff_size = deriveDiffSize({ policyResult });
  const tests_passed = deriveTestsPassed({ ciResult });

  // Si playbook es null, fallback al hint del classifier; si tampoco hay
  // classifier, 'unknown' (decisión #4 del plan: todo signal genera report).
  const playbook_id = (playbook && playbook.meta && playbook.meta.id)
    ? (classifierResult?.playbookId ?? playbook.meta.id)
    : (classifierResult?.playbookId ?? 'unknown');

  const policy_violations = (policyResult && Array.isArray(policyResult.violations))
    ? [...policyResult.violations]
    : [];

  const pr_merged = prResult?.merged ?? null;

  const classification_margin = (classifierResult && typeof classifierResult.margin === 'number')
    ? classifierResult.margin
    : null;

  const timestamp = nowIso ?? new Date().toISOString();

  return {
    playbook_id,
    model_used,
    diff_size,
    tests_passed,
    pr_merged,
    retry_count: retryCount,
    policy_violations,
    classification_margin,
    signal_hash,
    timestamp,
    failure_stage,
  };
}
