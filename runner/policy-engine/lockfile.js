// validateLockfileChange — confiar en lockfile si package.json es válido,
// pero NO permitir cambio de lockfile sin cambio en package.json.
// Spec: docs/auto-maintenance/policy-engine-spec.md §"Función 5"

export function validateLockfileChange(pkgChanged, lockChanged) {
  if (!pkgChanged && lockChanged) {
    return { valid: false, reason: 'lockfile_changed_without_pkg' };
  }
  return { valid: true };
}
