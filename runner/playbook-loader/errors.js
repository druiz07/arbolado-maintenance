export class PlaybookValidationError extends Error {
  constructor(errors) {
    super(`Invalid playbook: ${errors.length} error(s)`);
    this.name = 'PlaybookValidationError';
    this.errors = errors;
  }
}
