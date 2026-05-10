const DEFAULT_MARGIN_THRESHOLD = 0.15;
const DEFAULT_CONFIDENCE_MIN = 0.7;

/**
 * Aplica regla top-2 margin + classify_confidence_min usando los umbrales del
 * playbook ganador (top1). Si el playbook no está en la lista provista, usa
 * los defaults del spec G.5 (margin 0.15, minConfidence 0.7).
 *
 * @param {Array<{playbook_id, confidence}>} rankings — sorted desc (parser.js garantiza)
 * @param {Array<{id, classifyConfidenceMin, marginThreshold}>} playbooks
 * @returns {object} resultado del classifier
 */
export function applyTopTwoMargin(rankings, playbooks) {
  if (!Array.isArray(rankings) || rankings.length === 0) {
    throw new Error('applyTopTwoMargin: rankings vacío');
  }

  const top1 = rankings[0];
  const top2 = rankings[1] ?? { confidence: 0 };
  const margin = top1.confidence - top2.confidence;

  const winnerSpec = playbooks.find((p) => p.id === top1.playbook_id);
  const minConfidence = winnerSpec?.classifyConfidenceMin ?? DEFAULT_CONFIDENCE_MIN;
  const marginThreshold = winnerSpec?.marginThreshold ?? DEFAULT_MARGIN_THRESHOLD;

  if (top1.confidence < minConfidence) {
    return {
      ok: false,
      reason: 'low_confidence',
      top1: top1.confidence,
      top2: top2.confidence,
      margin,
      playbookHint: top1.playbook_id,
      thresholds: { minConfidence, marginThreshold },
    };
  }

  if (margin < marginThreshold) {
    return {
      ok: false,
      reason: 'margin_too_low',
      top1: top1.confidence,
      top2: top2.confidence,
      margin,
      playbookHint: top1.playbook_id,
      thresholds: { minConfidence, marginThreshold },
    };
  }

  return {
    ok: true,
    playbookId: top1.playbook_id,
    confidence: top1.confidence,
    top1: top1.confidence,
    top2: top2.confidence,
    margin,
    thresholds: { minConfidence, marginThreshold },
  };
}
