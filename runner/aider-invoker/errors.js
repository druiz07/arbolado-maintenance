export class AiderTimeoutError extends Error {
  constructor(timeoutMs) {
    super(`aider exceeded timeout of ${timeoutMs}ms`);
    this.name = 'AiderTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

export class AiderProcessError extends Error {
  constructor(message, { exitCode, stderr }) {
    super(message);
    this.name = 'AiderProcessError';
    this.exitCode = exitCode;
    this.stderr = stderr;
  }
}
