export class AliasResolverApiError extends Error {
  constructor(message, { provider, status, body } = {}) {
    super(message);
    this.name = 'AliasResolverApiError';
    this.provider = provider;
    this.status = status;
    this.body = body;
  }
}

export class AliasNotFoundError extends Error {
  constructor(message, { alias, availableModels } = {}) {
    super(message);
    this.name = 'AliasNotFoundError';
    this.alias = alias;
    this.availableModels = availableModels;
  }
}
