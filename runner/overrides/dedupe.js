// Fix 3 — dedup por dependencia.
//
// El backlog real de Dependabot trae N advisories distintos para la MISMA
// dependencia transitiva (p.ej. varios GHSA sobre nth-check). Sin dedup el
// loop abriría N PRs (1 por advisory) que pinnean la misma dep — ruido y
// riesgo de downgrade entre ellos. Esta función pura coalesce las señales de
// una misma dep a UNA sola, fijando la versión segura MÁXIMA del grupo y
// fusionando los advisory_ids. Determinista, sin IO.

import semver from 'semver';
import { parseTargetVersion } from './version.js';

/**
 * @param {object[]} signals — señales normalizadas (schema bump-transitive)
 * @returns {object[]} señales coalescidas: 1 por dependencia con target máximo
 *   y `coalesced_advisory_ids` (sólo cuando hubo fusión real). Las señales sin
 *   versión comparable pasan individualmente (no se pueden coalescer).
 */
export function coalesceSignalsByDependency(signals) {
  if (!Array.isArray(signals)) return [];

  const order = [];
  const groups = new Map();
  const passthrough = [];

  for (const s of signals) {
    let target = null;
    try {
      target = parseTargetVersion(s?.patched_versions);
    } catch {
      target = null;
    }
    if (!s || typeof s.dependency !== 'string' || target === null) {
      passthrough.push({ signal: s, idx: passthrough.length, kind: 'pass' });
      continue;
    }
    if (!groups.has(s.dependency)) {
      groups.set(s.dependency, []);
      order.push(s.dependency);
    }
    groups.get(s.dependency).push({ signal: s, target });
  }

  const out = [];
  for (const dep of order) {
    const group = groups.get(dep);
    if (group.length === 1) {
      out.push(group[0].signal);
      continue;
    }
    // Gana la señal con la versión segura máxima del grupo.
    let winner = group[0];
    for (const g of group) {
      if (semver.gt(g.target, winner.target)) winner = g;
    }
    const advisoryIds = [
      ...new Set(group.map((g) => g.signal.advisory_id).filter(Boolean)),
    ].sort();
    out.push({ ...winner.signal, coalesced_advisory_ids: advisoryIds });
  }

  // Las no-coalescibles van al final, en su orden original.
  for (const p of passthrough) out.push(p.signal);
  return out;
}
