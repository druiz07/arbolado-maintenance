#!/usr/bin/env node
// Uso: node load-playbook.mjs <path-to-yaml>
// Output: JSON del playbook normalizado en stdout. Exit code != 0 si falla.

import { loadPlaybook, PlaybookValidationError } from '../../playbook-loader/index.js';

const path = process.argv[2];
if (!path) {
  console.error('usage: load-playbook.mjs <path-to-yaml>');
  process.exit(2);
}

try {
  const pb = await loadPlaybook(path);
  process.stdout.write(JSON.stringify(pb));
} catch (err) {
  if (err instanceof PlaybookValidationError) {
    console.error(JSON.stringify({ error: 'PlaybookValidationError', errors: err.errors }));
    process.exit(3);
  }
  console.error(err.message);
  process.exit(1);
}
