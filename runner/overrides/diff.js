// enforceMaxDiff con scope `package.json_only`: el playbook acota el tamaño
// del cambio de package.json (la entrada overrides debería ser ~1-5 líneas).
// El package-lock.json lo REGENERA `npm install`, no es edición manual, así
// que NO se cuenta aquí — es justamente lo que documenta el playbook.

function serialize(obj) {
  return JSON.stringify(obj, null, 2).split('\n');
}

/**
 * Cuenta líneas cambiadas (añadidas + eliminadas) entre dos versiones del
 * package.json serializado con indentación de 2 espacios. Implementación
 * por multiconjunto de líneas — suficiente para acotar un cambio de overrides.
 *
 * @param {object} prev — package.json antes
 * @param {object} next — package.json después
 * @returns {number} líneas cambiadas
 */
export function countPackageJsonDiffLines(prev, next) {
  if (!prev || typeof prev !== 'object' || !next || typeof next !== 'object') {
    throw new Error('prev and next must be objects');
  }
  const a = serialize(prev);
  const b = serialize(next);

  const counts = new Map();
  for (const line of a) counts.set(line, (counts.get(line) ?? 0) + 1);
  for (const line of b) counts.set(line, (counts.get(line) ?? 0) - 1);

  let changed = 0;
  for (const delta of counts.values()) changed += Math.abs(delta);
  return changed;
}

/**
 * @param {object} args
 * @param {object} args.prev
 * @param {object} args.next
 * @param {number} args.max
 * @returns {{ok:boolean, lines:number, max:number}}
 */
export function enforceMaxDiff({ prev, next, max }) {
  if (!Number.isInteger(max) || max <= 0) {
    throw new Error('max must be a positive integer');
  }
  const lines = countPackageJsonDiffLines(prev, next);
  return { ok: lines <= max, lines, max };
}
