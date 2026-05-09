// Normaliza Dependabot alerts → Signal canónico.
// El normalizador absorbe la heterogeneidad de la API y emite el schema único.

import type { DependabotAlert } from './dependabot.ts';
import type { Signal } from './signal-schema.ts';

// Mapeo de severidad GitHub → severidad signal.
// GitHub usa "medium", schema usa "moderate".
function normalizeSeverity(s: DependabotAlert['security_vulnerability']['severity']): Signal['severity'] {
  if (s === 'medium') return 'moderate';
  return s;
}

function isTransitive(alert: DependabotAlert): boolean {
  // Heurística: si manifest_path apunta a package-lock.json (no package.json),
  // la alerta es para una transitiva. La determinación exacta del parent se
  // delega a una pasada con `npm ls <dep>` en el runner — el Worker se queda
  // con la heurística (suficiente para el classifier; el campo es luego
  // refinado por el runner en Sem 2 si hace falta).
  return alert.dependency.manifest_path.endsWith('package-lock.json');
}

function dependencyType(alert: DependabotAlert): Signal['dependency_type'] {
  // GitHub Dependabot expone scope: 'development' | 'runtime' | null.
  // null suele significar transitiva — asumimos 'dev' por defecto cuando es
  // null Y manifest es lockfile. Si scope viene explícito, lo respetamos.
  if (alert.dependency.scope === 'development') return 'dev';
  if (alert.dependency.scope === 'runtime') return 'runtime';
  return isTransitive(alert) ? 'dev' : 'runtime';
}

export function normalizeDependabotAlert(alert: DependabotAlert): Signal {
  const dep = alert.dependency.package.name;
  const vuln = alert.security_vulnerability;
  const transitive = isTransitive(alert);

  return {
    source: 'worker',
    dependency: dep,
    current_version: extractCurrentVersionPlaceholder(vuln.vulnerable_version_range),
    vulnerable_versions: vuln.vulnerable_version_range,
    patched_versions: vuln.first_patched_version?.identifier
      ? `>=${vuln.first_patched_version.identifier}`
      : null,
    severity: normalizeSeverity(vuln.severity),
    is_transitive: transitive,
    dependency_type: dependencyType(alert),
    path: alert.dependency.manifest_path,
    advisory_id: alert.security_advisory.ghsa_id,

    detected_at: new Date().toISOString(),
    signal_version: 1,

    context: {
      package_manager: 'npm',
      lockfile_present: true, // el repo arbolado-app commitea package-lock.json
      direct_dependency: !transitive,
      parent_dependency: null, // se resuelve en runner con npm ls
      dependency_chain: transitive ? [] : [dep],
      fix_available: vuln.first_patched_version !== null,
    },
  };
}

// Extrae una pseudo-current_version del rango vulnerable. La versión exacta
// instalada viene del lockfile — el runner puede sobreescribirlo en Sem 2.
function extractCurrentVersionPlaceholder(range: string): string {
  // "< 8.56.0" → "<8.56.0" — la usa el classifier sólo como input contextual.
  return range.replace(/\s+/g, '');
}
