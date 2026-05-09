// Helpers pre/post Aider — viven con el policy engine porque comparten reglas.
// Spec: docs/auto-maintenance/policy-engine-spec.md §"resolveSafeVersion" y §"enforceMaxDiff"

import semver from 'semver';

// resolveSafeVersion: retorna la mínima versión satisfactoria de patchedRange entre las
// publicadas. Si npm no devuelve ninguna, retorna null y el playbook va a edge_case.no_patch_available.
//
// La función pura recibe el lister de versiones inyectado para que los tests no toquen red.
// El módulo `aider-helpers-runtime.js` (no incluido aquí) es el wrapper que ejecuta
// `npm view <dep> versions --json` y llama a esta función — lo añade Sem 2.
export function resolveSafeVersion(dep, patchedRange, versionLister) {
  if (!patchedRange) return Promise.resolve(null);
  return Promise.resolve(versionLister(dep)).then((versions) => {
    if (!Array.isArray(versions) || versions.length === 0) return null;
    const valid = versions.filter((v) => semver.satisfies(v, patchedRange));
    if (valid.length === 0) return null;
    return semver.minSatisfying(valid, patchedRange);
  });
}

// enforceMaxDiff: bloquea si el diff real excede max_diff_lines (post-Aider).
// Recibe `actualLines` ya parseado del git diff stat — el wrapper que ejecuta
// `git diff --stat HEAD` se añade en Sem 2 (también vive en aider-helpers-runtime.js).
export function enforceMaxDiff(actualLines, max) {
  if (typeof actualLines !== 'number' || Number.isNaN(actualLines)) {
    return { valid: false, reason: 'diff_size_unparseable' };
  }
  if (actualLines > max) {
    return { valid: false, reason: 'diff_size_exceeded', observed: actualLines, max };
  }
  return { valid: true };
}

// parseDiffStat: extrae total de líneas insertadas+eliminadas del output de
// `git diff --stat HEAD`. Formato esperado en la última línea:
//   " 3 files changed, 12 insertions(+), 5 deletions(-)"
// Retorna NaN si no encuentra la línea (el caller usa enforceMaxDiff que falla cerrado).
export function parseDiffStat(stdout) {
  if (typeof stdout !== 'string') return NaN;
  const match = stdout.match(/(\d+)\s+insertion[s]?\(\+\)(?:,\s*(\d+)\s+deletion[s]?\(-\))?/);
  if (!match) {
    const onlyDel = stdout.match(/(\d+)\s+deletion[s]?\(-\)/);
    if (onlyDel) return Number(onlyDel[1]);
    return NaN;
  }
  const insertions = Number(match[1]);
  const deletions = match[2] ? Number(match[2]) : 0;
  return insertions + deletions;
}
