// validateSemverChange — núcleo crítico. Usa npm semver, no comparación de strings.
// Spec: docs/auto-maintenance/policy-engine-spec.md §"Función 2"

import semver from 'semver';

export function getRangeType(range) {
  if (!range) return 'none';
  if (range === '*' || range === 'latest') return 'wildcard';
  if (range.startsWith('^')) return 'caret';
  if (range.startsWith('~')) return 'tilde';
  return 'exact_or_other';
}

export function extractVersion(range) {
  try {
    const v = semver.minVersion(range);
    return v ? v.version : null;
  } catch {
    return null;
  }
}

export function validateSemverChange(oldRange, newRange, rules) {
  if (!oldRange || !newRange) return { valid: true };

  const oldType = getRangeType(oldRange);
  const newType = getRangeType(newRange);

  if (rules.forbid_range_widening && newType === 'wildcard') {
    return { valid: false, reason: 'range_widening_to_wildcard' };
  }

  if (rules.forbid_range_widening && oldType === 'tilde' && newType === 'caret') {
    return { valid: false, reason: 'range_widening_tilde_to_caret' };
  }

  const oldV = extractVersion(oldRange);
  const newV = extractVersion(newRange);

  if (!oldV || !newV) {
    return { valid: false, reason: 'invalid_semver_parse' };
  }

  if (semver.eq(oldV, newV)) return { valid: true };

  if (semver.major(oldV) !== semver.major(newV)) {
    if (rules.forbid_major_bumps) return { valid: false, reason: 'major_bump_forbidden' };
    return { valid: true };
  }

  if (semver.minor(oldV) !== semver.minor(newV)) {
    if (!rules.allowed_range_changes.includes('minor')) {
      return { valid: false, reason: 'minor_bump_not_allowed' };
    }
    return { valid: true };
  }

  if (semver.patch(oldV) !== semver.patch(newV)) {
    if (!rules.allowed_range_changes.includes('patch')) {
      return { valid: false, reason: 'patch_bump_not_allowed' };
    }
    return { valid: true };
  }

  return { valid: true };
}
