import { readFile } from 'node:fs/promises';
import { load as parseYaml } from 'js-yaml';
import { validatePlaybook } from './schema.js';
import { normalizePlaybook } from './normalize.js';
import { PlaybookValidationError } from './errors.js';

export { PlaybookValidationError } from './errors.js';

export async function loadPlaybook(filePath) {
  const raw = await readFile(filePath, 'utf8');
  const parsed = parseYaml(raw);
  const result = validatePlaybook(parsed);
  if (!result.ok) {
    throw new PlaybookValidationError(result.errors);
  }
  return normalizePlaybook(parsed);
}
