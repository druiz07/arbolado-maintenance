export function normalizePlaybook(pb) {
  const c = pb.constraints || {};
  const ex = pb.execution || {};

  return {
    meta: {
      id: pb.id,
      version: pb.version,
      description: pb.description ?? null,
      critical: c.critical === true,
    },
    trigger: {
      type: pb.trigger?.type,
      signal_schema: pb.trigger?.signal_schema,
    },
    classifier: pb.classifier,
    constraints: {
      allowed_paths: Array.isArray(c.allowed_paths) ? [...c.allowed_paths] : [],
      forbidden_paths: Array.isArray(c.forbidden_paths) ? [...c.forbidden_paths] : [],
      allowed_operations: Array.isArray(c.allowed_operations) ? [...c.allowed_operations] : [],
      forbidden_operations: Array.isArray(c.forbidden_operations) ? [...c.forbidden_operations] : [],
      version_rules: c.version_rules ? { ...c.version_rules } : null,
      max_diff_lines: c.max_diff_lines,
      required_checks: Array.isArray(c.required_checks) ? [...c.required_checks] : [],
      retry_limit: c.retry_limit,
      cooldown_minutes: c.cooldown_minutes ?? null,
      max_rollbacks_per_24h: c.max_rollbacks_per_24h ?? null,
      classify_confidence_min: c.classify_confidence_min,
      require_dev_dependency: c.require_dev_dependency ?? null,
    },
    execution: {
      model_strategy: ex.model_strategy ? { ...ex.model_strategy } : null,
      pre_aider_steps: Array.isArray(ex.pre_aider_steps) ? [...ex.pre_aider_steps] : [],
      post_aider_steps: Array.isArray(ex.post_aider_steps) ? [...ex.post_aider_steps] : [],
      aider: ex.aider ? { ...ex.aider } : null,
      git_revert: ex.git_revert ? { ...ex.git_revert } : null,
      format_steps: Array.isArray(ex.format_steps) ? [...ex.format_steps] : null,
    },
    postconditions: pb.postconditions ?? null,
    edge_cases: pb.edge_cases ?? null,
    raw: pb,
  };
}
