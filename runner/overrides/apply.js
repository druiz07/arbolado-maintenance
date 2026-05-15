// Aplica un override de forma PURA sobre el objeto package.json parseado.
// No toca el filesystem ni ejecuta npm — eso lo hace el orquestador (index.js)
// con IO inyectado. Aquí sólo la transformación determinista del JSON.

/**
 * @param {object} args
 * @param {object} args.packageJson — package.json parseado (no se muta)
 * @param {string} args.dependency — nombre del paquete transitivo
 * @param {string} args.version — versión exacta a fijar (ya resuelta)
 * @returns {{next:object, prev:object, operation:'add_override'|'bump_override'|'noop'}}
 */
export function applyOverride({ packageJson, dependency, version }) {
  if (!packageJson || typeof packageJson !== 'object' || Array.isArray(packageJson)) {
    throw new Error('packageJson must be a plain object');
  }
  if (typeof dependency !== 'string' || dependency.length === 0) {
    throw new Error('dependency must be a non-empty string');
  }
  if (typeof version !== 'string' || version.length === 0) {
    throw new Error('version must be a non-empty string');
  }

  const prev = structuredClone(packageJson);
  const next = structuredClone(packageJson);
  const overrides = next.overrides && typeof next.overrides === 'object' && !Array.isArray(next.overrides)
    ? next.overrides
    : {};

  const current = overrides[dependency];
  let operation;
  if (current === version) {
    operation = 'noop';
  } else if (current === undefined) {
    operation = 'add_override';
  } else {
    operation = 'bump_override';
  }

  overrides[dependency] = version;
  next.overrides = overrides;

  return { next, prev, operation };
}
