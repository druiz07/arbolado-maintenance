// Errores específicos del signal-loader. Diferenciamos KV API failure
// (4xx/5xx de Cloudflare) de signal corrupto (JSON inválido en value)
// para que el loop.yml pueda decidir reintentar o saltar al próximo signal.
export class SignalLoaderKvError extends Error {
  constructor(message, { status, body, key } = {}) {
    super(message);
    this.name = 'SignalLoaderKvError';
    this.status = status;
    this.body = body;
    this.key = key;
  }
}

export class SignalLoaderParseError extends Error {
  constructor(message, { key, rawValue } = {}) {
    super(message);
    this.name = 'SignalLoaderParseError';
    this.key = key;
    this.rawValue = rawValue;
  }
}
