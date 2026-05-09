import { isValidGlob } from './globs.js';

const TOP_LEVEL_REQUIRED = ['id', 'version', 'trigger', 'classifier', 'constraints', 'execution'];

const CONSTRAINTS_REQUIRED = [
  'allowed_paths', 'allowed_operations', 'forbidden_operations',
  'max_diff_lines', 'required_checks', 'retry_limit', 'classify_confidence_min',
];

const ALLOWED_RANGE_CHANGES = ['patch', 'minor', 'major'];

export function validatePlaybook(pb) {
  const errors = [];

  if (!pb || typeof pb !== 'object') {
    return { ok: false, errors: [{ path: '', message: 'playbook must be an object' }] };
  }

  for (const field of TOP_LEVEL_REQUIRED) {
    if (pb[field] === undefined) {
      errors.push({ path: field, message: 'required field missing' });
    }
  }

  if (pb.trigger && typeof pb.trigger === 'object') {
    if (pb.trigger.type === undefined) {
      errors.push({ path: 'trigger.type', message: 'required field missing' });
    }
    if (pb.trigger.signal_schema === undefined) {
      errors.push({ path: 'trigger.signal_schema', message: 'required field missing' });
    }
  }

  if (pb.constraints && typeof pb.constraints === 'object') {
    validateConstraints(pb.constraints, errors);
  }

  if (pb.execution && typeof pb.execution === 'object') {
    if (!pb.execution.model_strategy || typeof pb.execution.model_strategy !== 'object') {
      errors.push({ path: 'execution.model_strategy', message: 'required object missing' });
    }
  }

  return { ok: errors.length === 0, errors };
}

function validateConstraints(c, errors) {
  for (const field of CONSTRAINTS_REQUIRED) {
    if (c[field] === undefined) {
      errors.push({ path: `constraints.${field}`, message: 'required field missing' });
    }
  }

  if (Array.isArray(c.allowed_paths)) {
    c.allowed_paths.forEach((p, idx) => {
      if (!isValidGlob(p)) {
        errors.push({ path: `constraints.allowed_paths[${idx}]`, message: `invalid glob: ${JSON.stringify(p)}` });
      }
    });
  }

  if (Array.isArray(c.forbidden_paths)) {
    c.forbidden_paths.forEach((p, idx) => {
      if (!isValidGlob(p)) {
        errors.push({ path: `constraints.forbidden_paths[${idx}]`, message: `invalid glob: ${JSON.stringify(p)}` });
      }
    });
  }

  const allowed = Array.isArray(c.allowed_operations) ? c.allowed_operations : null;
  const forbidden = Array.isArray(c.forbidden_operations) ? c.forbidden_operations : null;
  if (allowed === null && c.allowed_operations !== undefined) {
    errors.push({ path: 'constraints.allowed_operations', message: 'must be array' });
  }
  if (forbidden === null && c.forbidden_operations !== undefined) {
    errors.push({ path: 'constraints.forbidden_operations', message: 'must be array' });
  }
  if (allowed && forbidden) {
    const inter = allowed.filter(op => forbidden.includes(op));
    if (inter.length > 0) {
      errors.push({ path: 'constraints.allowed_operations', message: `must be disjoint from forbidden_operations (overlap: ${inter.join(', ')})` });
    }
  }

  if (c.max_diff_lines !== undefined && (!Number.isInteger(c.max_diff_lines) || c.max_diff_lines <= 0)) {
    errors.push({ path: 'constraints.max_diff_lines', message: 'must be positive integer' });
  }

  if (c.required_checks !== undefined && (!Array.isArray(c.required_checks) || c.required_checks.length === 0)) {
    errors.push({ path: 'constraints.required_checks', message: 'must be non-empty array' });
  }

  if (c.retry_limit !== undefined) {
    if (!Number.isInteger(c.retry_limit) || c.retry_limit < 0 || c.retry_limit > 5) {
      errors.push({ path: 'constraints.retry_limit', message: 'must be integer in [0, 5]' });
    }
  }

  if (c.cooldown_minutes !== undefined) {
    if (!Number.isInteger(c.cooldown_minutes) || c.cooldown_minutes < 0) {
      errors.push({ path: 'constraints.cooldown_minutes', message: 'must be non-negative integer' });
    }
  }

  if (c.critical === true) {
    if (typeof c.cooldown_minutes !== 'number' || c.cooldown_minutes < 30) {
      errors.push({ path: 'constraints.cooldown_minutes', message: 'critical:true requires cooldown_minutes >= 30' });
    }
  }

  if (c.classify_confidence_min !== undefined) {
    if (typeof c.classify_confidence_min !== 'number' || c.classify_confidence_min < 0 || c.classify_confidence_min > 1) {
      errors.push({ path: 'constraints.classify_confidence_min', message: 'must be number in [0, 1]' });
    }
  }

  if (c.version_rules) {
    const vr = c.version_rules;
    if (!Array.isArray(vr.allowed_range_changes) || vr.allowed_range_changes.some(x => !ALLOWED_RANGE_CHANGES.includes(x))) {
      errors.push({ path: 'constraints.version_rules.allowed_range_changes', message: `must be subset of ${ALLOWED_RANGE_CHANGES.join('|')}` });
    }
    if (typeof vr.forbid_major_bumps !== 'boolean') {
      errors.push({ path: 'constraints.version_rules.forbid_major_bumps', message: 'must be boolean' });
    }
    if (typeof vr.forbid_range_widening !== 'boolean') {
      errors.push({ path: 'constraints.version_rules.forbid_range_widening', message: 'must be boolean' });
    }
  }
}
