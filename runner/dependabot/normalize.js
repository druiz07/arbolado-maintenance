function normalizeSeverity(s) {
  return s === 'medium' ? 'moderate' : s;
}

function isTransitive(alert) {
  if (alert.dependency.relationship === 'transitive') return true;
  if (alert.dependency.relationship === 'direct') return false;
  return alert.dependency.manifest_path.endsWith('package-lock.json');
}

function dependencyType(alert, transitive) {
  if (alert.dependency.scope === 'development') return 'dev';
  if (alert.dependency.scope === 'runtime') return 'runtime';
  return transitive ? 'dev' : 'runtime';
}

export function normalizeDependabotAlert(alert) {
  const vuln = alert.security_vulnerability;
  const transitive = isTransitive(alert);
  const patched = vuln.first_patched_version?.identifier ?? null;

  return {
    source: 'dependabot-cli',
    dependency: alert.dependency.package.name,
    current_version: vuln.vulnerable_version_range.replace(/\s+/g, ''),
    vulnerable_versions: vuln.vulnerable_version_range,
    patched_versions: patched ? `>=${patched}` : null,
    severity: normalizeSeverity(vuln.severity),
    is_transitive: transitive,
    dependency_type: dependencyType(alert, transitive),
    path: alert.dependency.manifest_path,
    advisory_id: alert.security_advisory.ghsa_id,
    detected_at: new Date().toISOString(),
    signal_version: 1,
    context: {
      package_manager: 'npm',
      lockfile_present: true,
      direct_dependency: !transitive,
      parent_dependency: null,
      dependency_chain: transitive ? [] : [alert.dependency.package.name],
      fix_available: patched !== null,
    },
    _meta: {
      alert_number: alert.number,
      alert_state: alert.state,
      alert_created_at: alert.created_at,
      alert_fixed_at: alert.fixed_at,
    },
  };
}

function hasMinimalShape(alert) {
  return (
    alert &&
    typeof alert === 'object' &&
    alert.dependency?.package?.name &&
    alert.dependency?.manifest_path &&
    alert.security_advisory?.ghsa_id &&
    alert.security_vulnerability?.vulnerable_version_range &&
    alert.security_vulnerability?.severity
  );
}

export function normalizeSnapshot(alerts, opts = {}) {
  const { skipUnpatchable = true } = opts;
  const signals = [];
  const skipped = [];

  for (const alert of alerts) {
    if (!hasMinimalShape(alert)) {
      skipped.push({
        alert_number: alert?.number ?? null,
        advisory_id: alert?.security_advisory?.ghsa_id ?? null,
        reason: 'malformed_alert',
      });
      continue;
    }
    const noPatch = !alert.security_vulnerability.first_patched_version;
    if (skipUnpatchable && noPatch) {
      skipped.push({
        alert_number: alert.number,
        advisory_id: alert.security_advisory.ghsa_id,
        reason: 'no_patched_version',
      });
      continue;
    }
    signals.push(normalizeDependabotAlert(alert));
  }

  return { signals, skipped };
}
