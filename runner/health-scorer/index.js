// computeHealthMetrics — computa métricas de salud agregadas desde una lista
// de session reports (los .json en docs/auto-maintenance/session-reports/).
// Usa ventana móvil de WINDOW_DAYS días para que el router se adapte a
// cambios recientes y no quede sesgado por data antigua.
//
// Output: { insufficient_data, total_reports_in_window, pr_merge_rate,
//   failure_stages: {<stage>: fracción}, per_playbook: {<id>: {pr_merge_rate, samples}} }
//
// Spec: docs/superpowers/plans/2026-05-11-g5-sem4-router-llm.md Task 10.

const WINDOW_DAYS = 14;
const MIN_SAMPLES = 5;

/**
 * @param {Array<object>} reports — session reports (cualquier orden).
 * @param {object} opts
 * @param {string} opts.nowIso — ISO timestamp del "now" (para tests deterministas).
 * @param {number} [opts.windowDays] — default 14.
 * @param {number} [opts.minSamples] — default 5; mínimo de reports CERRADOS
 *   (pr_merged !== null) en ventana para considerar la data significativa.
 * @returns {{
 *   insufficient_data: boolean,
 *   total_reports_in_window: number,
 *   pr_merge_rate: number|null,
 *   failure_stages: Record<string, number>,
 *   per_playbook: Record<string, {pr_merge_rate:number, samples:number}>,
 * }}
 */
export function computeHealthMetrics(reports, { nowIso, windowDays = WINDOW_DAYS, minSamples = MIN_SAMPLES }) {
  const nowMs = Date.parse(nowIso);
  const cutoffMs = nowMs - windowDays * 24 * 3600 * 1000;
  const inWindow = reports.filter((r) => Date.parse(r.timestamp) >= cutoffMs);

  const closed = inWindow.filter((r) => r.pr_merged !== null);
  // Estricto >: necesitamos MÁS de minSamples (no exactamente minSamples)
  // para considerar la data significativa. Con minSamples=5 default, ≥6
  // closed reports activan el router. Decisión adoptada en Sem 4 Sesión C
  // tras conflicto entre la doc del plan (≥5) y el test 5 (5 → insufficient):
  // se prima el test (umbral más conservador).
  if (closed.length <= minSamples) {
    return {
      insufficient_data: true,
      total_reports_in_window: inWindow.length,
      pr_merge_rate: null,
      failure_stages: {},
      per_playbook: {},
    };
  }

  const merged = closed.filter((r) => r.pr_merged === true).length;
  const pr_merge_rate = merged / closed.length;

  // failure_stages: fracción de TODOS los reports en ventana (no sólo cerrados).
  // Incluye reports en vuelo — mide cuán seguido el pipeline falla en cada etapa.
  const stageCounts = {};
  for (const r of inWindow) {
    stageCounts[r.failure_stage] = (stageCounts[r.failure_stage] || 0) + 1;
  }
  const failure_stages = {};
  for (const k of Object.keys(stageCounts)) {
    failure_stages[k] = stageCounts[k] / inWindow.length;
  }

  // per_playbook: agrupa SÓLO cerrados por playbook_id; pr_merge_rate específico.
  const byPb = {};
  for (const r of closed) {
    byPb[r.playbook_id] = byPb[r.playbook_id] || { merged: 0, total: 0 };
    byPb[r.playbook_id].total++;
    if (r.pr_merged === true) byPb[r.playbook_id].merged++;
  }
  const per_playbook = {};
  for (const [pb, c] of Object.entries(byPb)) {
    per_playbook[pb] = { pr_merge_rate: c.merged / c.total, samples: c.total };
  }

  return {
    insufficient_data: false,
    total_reports_in_window: inWindow.length,
    pr_merge_rate,
    failure_stages,
    per_playbook,
  };
}
