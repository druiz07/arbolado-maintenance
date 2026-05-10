// Errores específicos del classifier. El loop.yml diferencia entre
// API error (Gemini caído / quota / key) → reintenta en próximo cron,
// parse error (respuesta no conforme schema) → bug del prompt, escalar,
// margin error (ambigüedad legítima) → failure_stage='classifier' clean.
export class ClassifierApiError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = 'ClassifierApiError';
    this.status = status;
    this.body = body;
  }
}

export class ClassifierParseError extends Error {
  constructor(message, { rawResponse } = {}) {
    super(message);
    this.name = 'ClassifierParseError';
    this.rawResponse = rawResponse;
  }
}
