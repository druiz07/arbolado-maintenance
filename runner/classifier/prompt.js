// Construye el prompt de un único call a Gemini Flash que ranquea TODOS los
// playbooks contra un signal. La estructura del prompt es estable
// (determinismo testeado en prompt.test.js) — cualquier cambio aquí necesita
// re-validar smoke (Task 12).

const INSTRUCTIONS = `Eres un clasificador de señales para mantenimiento autónomo de software.
Tu tarea: dado un INPUT SIGNAL y una lista de PLAYBOOKS, devuelve un ranking
con la confianza [0.0, 1.0] de que cada playbook sea el correcto para esta señal.

REGLAS GENERALES:
- Lee las reglas específicas de cada playbook bajo "REGLAS:" antes de puntuar.
- Si un playbook no aplica (regla excluye la señal), confidence = 0.0.
- Si un playbook aplica perfectamente, confidence cerca de 1.0.
- NO inventes playbook_id que no estén en la lista.
- NO emitas texto fuera del JSON.

OUTPUT FORMAT (JSON estricto):
{
  "rankings": [
    { "playbook_id": "<id>", "confidence": <number 0.0-1.0> },
    ...
  ]
}

Incluye TODOS los playbooks en rankings (incluso los con confidence=0).`;

/**
 * @param {object} signal — el signal JSON validado por el Worker
 * @param {Array<{id, description, classifierRules}>} playbooks — extraídos de los YAML
 * @returns {string} prompt determinista para Gemini
 */
export function buildClassifierPrompt(signal, playbooks) {
  if (!Array.isArray(playbooks) || playbooks.length === 0) {
    throw new Error('buildClassifierPrompt: at least one playbook required');
  }

  const playbooksBlock = playbooks
    .map((pb) => {
      return [
        `PLAYBOOK: ${pb.id}`,
        `DESCRIPTION: ${pb.description}`,
        `REGLAS: ${pb.classifierRules}`,
      ].join('\n');
    })
    .join('\n\n---\n\n');

  return [
    INSTRUCTIONS,
    '',
    'INPUT SIGNAL:',
    JSON.stringify(signal, null, 2),
    '',
    'PLAYBOOKS DISPONIBLES:',
    '',
    playbooksBlock,
  ].join('\n');
}
