// astEquivalent + areDiffsCompatible — para double-run en playbooks critical: true.
// Spec: docs/auto-maintenance/policy-engine-spec.md §"Función 4"

const COMPARED_SECTIONS = ['dependencies', 'devDependencies'];

export function normalizeDeps(pkg) {
  const out = {};
  for (const s of COMPARED_SECTIONS) {
    out[s] = Object.fromEntries(
      Object.entries(pkg[s] || {}).sort(([a], [b]) => a.localeCompare(b)),
    );
  }
  return out;
}

export function astEquivalent(pkgA, pkgB) {
  return JSON.stringify(normalizeDeps(pkgA)) === JSON.stringify(normalizeDeps(pkgB));
}

export function areDiffsCompatible(a, b) {
  if (astEquivalent(a.after, b.after)) return true;

  const sameDeps =
    JSON.stringify(Object.keys(a.after.dependencies || {}).sort()) ===
    JSON.stringify(Object.keys(b.after.dependencies || {}).sort());

  return sameDeps && Math.abs(a.diffLines - b.diffLines) < 20;
}
