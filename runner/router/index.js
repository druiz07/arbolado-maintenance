// router — decide qué modelo + prompt variant usar para classifier e invoker
// según las métricas de salud (output de health-scorer/computeHealthMetrics).
//
// Diseño:
// - Si insufficient_data → defaults (no cambiar nada, dejar al sistema seguir
//   acumulando reports antes de tomar decisiones).
// - Si classifier failure_stage > 30 % → escalar a Gemini Pro (más capaz que Flash).
// - Si policy failure_stage > 50 % → forzar prompt variant `conservative` con
//   disclaimer explícito anti-add_dependency. (Nota Sem 4 Sesión C: TD-1 ya
//   fue mitigado estructuralmente vía pre-Aider precondition check, así que
//   este variant ahora cubre OTRAS policy failures — semver, max_diff, etc.)
//
// Spec: docs/superpowers/plans/2026-05-11-g5-sem4-router-llm.md Task 11.

const CLASSIFIER_FAILURE_THRESHOLD = 0.30;
const POLICY_FAILURE_THRESHOLD = 0.50;

const FALLBACK_INVOKER_MODEL = 'groq/llama-3.3-70b-versatile';

/**
 * @returns {{model:string, promptVariant:'canonical'|'aggressive', reason:string}}
 */
export function routeClassifierModel({ healthMetrics, defaultModel = 'gemini-2.5-flash' }) {
  if (healthMetrics.insufficient_data) {
    return { model: defaultModel, promptVariant: 'canonical', reason: 'insufficient_data' };
  }
  const classifierFailRate = healthMetrics.failure_stages.classifier ?? 0;
  if (classifierFailRate > CLASSIFIER_FAILURE_THRESHOLD) {
    return {
      model: 'gemini-2.5-pro',
      promptVariant: 'canonical',
      reason: `classifier_failure_rate=${classifierFailRate.toFixed(2)} > ${CLASSIFIER_FAILURE_THRESHOLD}`,
    };
  }
  return { model: defaultModel, promptVariant: 'canonical', reason: 'healthy' };
}

/**
 * @returns {{model:string, promptVariant:'canonical'|'conservative', reason:string}}
 */
export function routeInvokerModel({ healthMetrics, playbook }) {
  const primary = playbook?.execution?.model_strategy?.primary;
  if (!primary) {
    return { model: FALLBACK_INVOKER_MODEL, promptVariant: 'canonical', reason: 'no_primary_in_playbook' };
  }
  if (healthMetrics.insufficient_data) {
    return { model: primary, promptVariant: 'canonical', reason: 'insufficient_data' };
  }
  const policyFailRate = healthMetrics.failure_stages.policy ?? 0;
  if (policyFailRate > POLICY_FAILURE_THRESHOLD) {
    return {
      model: primary,
      promptVariant: 'conservative',
      reason: `policy_failure_rate=${policyFailRate.toFixed(2)} > ${POLICY_FAILURE_THRESHOLD}`,
    };
  }
  return { model: primary, promptVariant: 'canonical', reason: 'healthy' };
}
