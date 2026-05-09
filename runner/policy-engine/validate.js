// validatePackageJsonChange — entry point que orquesta diff + ops + semver.
// Spec: docs/auto-maintenance/policy-engine-spec.md §"Pipeline completo (entry point)"

import { parsePackageJsonDiff } from './diff.js';
import { validateOperations } from './operations.js';
import { validateSemverChange } from './semver-rules.js';

export function validatePackageJsonChange(beforeStr, afterStr, policy) {
  const ops = parsePackageJsonDiff(beforeStr, afterStr);

  const violations = [];

  if (policy.require_dev_dependency) {
    for (const dep of ops.dependencyChanges) {
      if (dep.section !== 'devDependencies') {
        violations.push({
          type: 'not_dev_dependency',
          dep: dep.name,
          section: dep.section,
        });
      }
    }
  }

  violations.push(
    ...validateOperations(ops, policy.allowed_operations, policy.forbidden_operations),
  );

  for (const dep of ops.dependencyChanges) {
    if (dep.changeType !== 'updated') continue;
    const res = validateSemverChange(dep.oldRange, dep.newRange, policy.version_rules);
    if (!res.valid) {
      violations.push({ type: 'semver_violation', dep: dep.name, reason: res.reason });
    }
  }

  if (typeof policy.max_diff_lines === 'number' && ops.rawDiffLines > policy.max_diff_lines) {
    violations.push({
      type: 'diff_size_exceeded',
      observed: ops.rawDiffLines,
      max: policy.max_diff_lines,
    });
  }

  return { valid: violations.length === 0, violations, ops };
}
