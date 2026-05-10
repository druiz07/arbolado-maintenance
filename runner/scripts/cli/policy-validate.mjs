#!/usr/bin/env node
// Uso: node policy-validate.mjs <playbook-json> <package-before> <package-after>

import { readFile } from 'node:fs/promises';
import { validatePackageJsonChange } from '../../policy-engine/index.js';

const [pbJsonPath, beforePath, afterPath] = process.argv.slice(2);
if (!pbJsonPath || !beforePath || !afterPath) {
  console.error('usage: policy-validate.mjs <playbook-json> <package-before> <package-after>');
  process.exit(2);
}

try {
  const pb = JSON.parse(await readFile(pbJsonPath, 'utf8'));
  const before = await readFile(beforePath, 'utf8');
  const after = await readFile(afterPath, 'utf8');
  const result = validatePackageJsonChange(before, after, pb.constraints);
  process.stdout.write(JSON.stringify(result));
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
