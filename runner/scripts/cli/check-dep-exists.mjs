#!/usr/bin/env node
// Pre-Aider precondition (TD-1): valida que la dep del signal ya existe en
// la sección correspondiente de package.json (devDependencies para
// dep_type=dev, dependencies para runtime). Si no existe, escribe un
// policy.json sintético para que el report final registre failure_stage=policy
// con violation precondition_dep_missing, y exit 1 para que el step
// "Invoke Aider" no se ejecute.
//
// Uso:
//   node scripts/cli/check-dep-exists.mjs <signalPath> <packageJsonPath> [policyJsonOutPath]
//
// Outputs:
//   stdout: JSON {ok, reason, foundIn}
//   <policyJsonOutPath> (si ok=false): policy.json sintético compatible con
//     session-report builder (valid:false, violations:[...], ops:{...}).
//   Exit code: 0 si ok=true, 1 si ok=false.

import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { checkDepExists } from '../../preconditions/dep-exists.js';

const [signalPath, packageJsonPath, policyOutArg] = process.argv.slice(2);
if (!signalPath || !packageJsonPath) {
  console.error('usage: check-dep-exists.mjs <signalPath> <packageJsonPath> [policyJsonOutPath]');
  process.exit(2);
}

const signal = JSON.parse(await readFile(signalPath, 'utf8'));
const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));

const result = checkDepExists({
  packageJson,
  depName: signal.dependency,
  depType: signal.dependency_type,
});

process.stdout.write(JSON.stringify(result) + '\n');

if (!result.ok) {
  // Default a workspace/intermediate/policy.json relativo al signal.json para
  // que el step pueda omitir el arg explícito.
  const policyOut = policyOutArg
    ?? join(dirname(resolve(signalPath)), 'policy.json');
  const syntheticPolicy = {
    valid: false,
    violations: [{
      type: 'precondition_dep_missing',
      dep: signal.dependency,
      dep_type: signal.dependency_type,
      precondition_reason: result.reason,
      ...(result.foundIn ? { found_in: result.foundIn } : {}),
    }],
    ops: {
      dependencyChanges: [],
      scriptChanges: [],
      enginesChanged: false,
      rawDiffLines: 0,
    },
  };
  await writeFile(policyOut, JSON.stringify(syntheticPolicy));
  process.exit(1);
}

process.exit(0);
