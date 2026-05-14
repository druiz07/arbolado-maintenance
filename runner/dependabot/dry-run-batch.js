import { createHash } from 'node:crypto';
import { checkDepExists } from '../preconditions/dep-exists.js';

function hashSignal(signal) {
  const stable = JSON.stringify({
    dep: signal.dependency,
    advisory: signal.advisory_id,
  });
  return createHash('sha256').update(stable).digest('hex').slice(0, 12);
}

export function dryRunSignal({ signal, packageJson }) {
  const base = {
    signal_hash: hashSignal(signal),
    dependency: signal.dependency,
    dependency_type: signal.dependency_type,
    severity: signal.severity,
    is_transitive: signal.is_transitive,
    advisory_id: signal.advisory_id,
    alert_state: signal._meta?.alert_state ?? null,
    alert_number: signal._meta?.alert_number ?? null,
  };

  let pre;
  try {
    pre = checkDepExists({
      packageJson,
      depName: signal.dependency,
      depType: signal.dependency_type,
    });
  } catch (err) {
    return {
      ...base,
      failure_stage: 'precondition_error',
      precondition_reason: 'exception',
      precondition_error: err.message,
      would_invoke_aider: false,
    };
  }

  if (!pre.ok) {
    return {
      ...base,
      failure_stage: 'precondition',
      precondition_reason: pre.reason,
      precondition_foundIn: pre.foundIn ?? null,
      would_invoke_aider: false,
    };
  }

  return {
    ...base,
    failure_stage: 'would_invoke_aider',
    precondition_reason: 'present',
    precondition_foundIn: pre.foundIn,
    would_invoke_aider: true,
  };
}

export function dryRunBatch({ signals, packageJson }) {
  const results = signals.map((s) => dryRunSignal({ signal: s, packageJson }));

  const by_failure_stage = {};
  const by_alert_state = {};
  const by_dep_type = {};
  const by_severity = {};
  const advisories = new Set();

  for (const r of results) {
    by_failure_stage[r.failure_stage] = (by_failure_stage[r.failure_stage] ?? 0) + 1;
    if (r.alert_state) by_alert_state[r.alert_state] = (by_alert_state[r.alert_state] ?? 0) + 1;
    if (r.dependency_type) by_dep_type[r.dependency_type] = (by_dep_type[r.dependency_type] ?? 0) + 1;
    if (r.severity) by_severity[r.severity] = (by_severity[r.severity] ?? 0) + 1;
    if (r.advisory_id) advisories.add(r.advisory_id);
  }

  const would_invoke_aider = results.filter((r) => r.would_invoke_aider).length;

  return {
    results,
    summary: {
      total: results.length,
      would_invoke_aider,
      unique_advisories: advisories.size,
      duplicate_advisories: results.length - advisories.size,
      by_failure_stage,
      by_alert_state,
      by_dep_type,
      by_severity,
    },
  };
}
