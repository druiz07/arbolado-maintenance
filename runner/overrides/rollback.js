// Restaura package.json (+ package-lock.json si existía) desde el snapshot de
// texto tomado ANTES de aplicar el override. Idempotente.

/**
 * @param {object} args
 * @param {{io:{writeFile:Function, rm?:Function}}} args.io
 * @param {{pkgAbs:string, lockAbs:string, pkgText:string, lockText:string|null}} args.snapshot
 */
export async function restoreSnapshot({ io, snapshot }) {
  if (!io || typeof io.writeFile !== 'function') {
    throw new Error('io.writeFile is required');
  }
  if (!snapshot || typeof snapshot.pkgText !== 'string') {
    throw new Error('snapshot.pkgText is required');
  }
  await io.writeFile(snapshot.pkgAbs, snapshot.pkgText);
  if (snapshot.lockText !== null && snapshot.lockText !== undefined) {
    await io.writeFile(snapshot.lockAbs, snapshot.lockText);
  } else if (typeof io.rm === 'function') {
    // No existía lock antes; si npm install lo creó, intentar limpiarlo.
    try {
      await io.rm(snapshot.lockAbs);
    } catch {
      /* best-effort */
    }
  }
  return { restored: true };
}
