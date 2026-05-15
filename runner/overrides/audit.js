// Interpreta la salida de `npm audit --json` (auditReportVersion 2) para decidir
// si el override resolvió la advisory concreta. Determinista sobre el JSON dado:
// NO ejecuta npm (eso lo hace el orquestador con exec inyectado).

/**
 * @param {object} args
 * @param {object} args.auditJson — objeto parseado de `npm audit --json`
 * @param {string} args.dependency — paquete transitivo objetivo
 * @param {string} [args.advisoryId] — GHSA id de la alerta (opcional)
 * @returns {{clean:boolean, reason:string}}
 */
export function auditClean({ auditJson, dependency, advisoryId }) {
  if (!auditJson || typeof auditJson !== 'object' || Array.isArray(auditJson)) {
    throw new Error('auditJson must be a plain object');
  }
  if (typeof dependency !== 'string' || dependency.length === 0) {
    throw new Error('dependency must be a non-empty string');
  }

  const vulns = auditJson.vulnerabilities;
  if (!vulns || typeof vulns !== 'object') {
    // npm audit sin vulnerabilidades reporta {} — árbol limpio.
    return { clean: true, reason: 'no_vulnerabilities_block' };
  }

  const entry = vulns[dependency];
  if (!entry) {
    return { clean: true, reason: 'dependency_absent_from_audit' };
  }

  // El paquete sigue listado. Si tenemos advisoryId, comprobamos si la
  // advisory CONCRETA persiste; otra advisory distinta no es nuestro scope.
  if (advisoryId) {
    const via = Array.isArray(entry.via) ? entry.via : [];
    const stillHasAdvisory = via.some((v) => {
      if (typeof v !== 'object' || v === null) return false;
      const url = typeof v.url === 'string' ? v.url : '';
      const src = v.source != null ? String(v.source) : '';
      const name = typeof v.name === 'string' ? v.name : '';
      return url.includes(advisoryId) || src === advisoryId || name === advisoryId;
    });
    if (!stillHasAdvisory) {
      return { clean: true, reason: 'target_advisory_resolved_other_remains' };
    }
    return { clean: false, reason: 'target_advisory_still_present' };
  }

  return { clean: false, reason: 'dependency_still_vulnerable' };
}
