// validateOperations — forbidden siempre gana sobre allowed.
// Spec: docs/auto-maintenance/policy-engine-spec.md §"Función 3"

export function classifyOperation(depChange) {
  if (depChange.changeType === 'added') return 'add_dependency';
  if (depChange.changeType === 'removed') return 'remove_dependency';
  if (depChange.changeType === 'updated') return 'bump_version';
  return 'unknown';
}

export function validateOperations(ops, allowed, forbidden) {
  const violations = [];

  for (const dep of ops.dependencyChanges) {
    const op = classifyOperation(dep);

    if (forbidden.includes(op)) {
      violations.push({ type: 'forbidden_operation', op, dep: dep.name });
      continue;
    }

    if (!allowed.includes(op)) {
      violations.push({ type: 'not_allowed_operation', op, dep: dep.name });
    }
  }

  if (ops.scriptChanges.length > 0 && forbidden.includes('change_scripts')) {
    violations.push({ type: 'forbidden_scripts_change' });
  }

  if (ops.enginesChanged && forbidden.includes('modify_engines')) {
    violations.push({ type: 'forbidden_engines_change' });
  }

  return violations;
}
