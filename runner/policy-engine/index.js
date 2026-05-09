// Re-exports del policy engine. Punto de entrada único para consumers.

export { parsePackageJsonDiff, PolicyEngineMalformedJsonError } from './diff.js';
export {
  getRangeType,
  extractVersion,
  validateSemverChange,
} from './semver-rules.js';
export { classifyOperation, validateOperations } from './operations.js';
export { normalizeDeps, astEquivalent, areDiffsCompatible } from './equivalence.js';
export { validateLockfileChange } from './lockfile.js';
export { validatePackageJsonChange } from './validate.js';
export { resolveSafeVersion, enforceMaxDiff, parseDiffStat } from './aider-helpers.js';
