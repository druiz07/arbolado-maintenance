// Helpers puros para el playbook bump-transitive-via-overrides.
//
// - parseTargetVersion: del campo signal.patched_versions (que normalize.js
//   emite como ">=X.Y.Z") extrae la versión exacta a fijar en overrides.
// - manifestToPackageJsonPath: del signal.path (manifest_path Dependabot,
//   p.ej. "electron-app/package-lock.json") deriva el package.json hermano.

import semver from 'semver';

/**
 * @param {string|null} patchedVersions — p.ej. ">=1.2.3", "1.2.3", "^2.0.0 || >=3"
 * @returns {string} versión exacta mínima que satisface el rango (sin prefijo)
 * @throws si es null/vacío o no parseable a una versión
 */
export function parseTargetVersion(patchedVersions) {
  if (typeof patchedVersions !== 'string' || patchedVersions.trim().length === 0) {
    throw new Error('patchedVersions must be a non-empty string');
  }
  const trimmed = patchedVersions.trim();
  // Caso simple: ya es una versión exacta.
  if (semver.valid(trimmed)) return semver.clean(trimmed);
  let min = null;
  try {
    min = semver.minVersion(trimmed);
  } catch {
    min = null; // semver lanza ante comparadores inválidos en vez de devolver null
  }
  if (!min) {
    throw new Error(`cannot derive a concrete version from range: ${patchedVersions}`);
  }
  return min.version;
}

/**
 * TD-15: convierte una versión exacta en rango caret para package.json#overrides.
 * Un pin exacto ("0.2.6") se pudre: si un advisory posterior declara vulnerable
 * esa misma versión, el override del propio robot mantiene la dep clavada en
 * ella (caso real: tmp 0.2.6, PR #44 del 7-jun + advisory del 15-jun → 4
 * semanas fijada en la versión vulnerable). Con caret ("^0.2.7") npm puede
 * resolver a parches posteriores sin re-editar el override.
 *
 * @param {string} version — versión exacta (p.ej. "0.2.7" o "v1.2.3")
 * @returns {string} rango caret ("^0.2.7")
 * @throws si la entrada no es una versión concreta (los rangos se rechazan:
 *         evita doble-caret y entradas ambiguas)
 */
export function toCaretRange(version) {
  const clean = typeof version === 'string' && semver.valid(version)
    ? semver.clean(version)
    : null;
  if (!clean) {
    throw new Error(`cannot build caret range from invalid version: ${version}`);
  }
  return `^${clean}`;
}

/**
 * @param {string} manifestPath — manifest_path del alert Dependabot
 * @returns {string} ruta del package.json correspondiente (mismo separador `/`)
 * @throws si no es string no vacío
 */
export function manifestToPackageJsonPath(manifestPath) {
  if (typeof manifestPath !== 'string' || manifestPath.length === 0) {
    throw new Error('manifestPath must be a non-empty string');
  }
  const norm = manifestPath.replace(/\\/g, '/');
  if (norm.endsWith('/package.json') || norm === 'package.json') return norm;
  if (norm.endsWith('/package-lock.json')) {
    return norm.slice(0, -'package-lock.json'.length) + 'package.json';
  }
  if (norm === 'package-lock.json') return 'package.json';
  // Fallback: trata el path como directorio.
  const dir = norm.endsWith('/') ? norm : norm + '/';
  return dir + 'package.json';
}

/**
 * Extrae TODAS las versiones resueltas de `dependency` en un package-lock.json
 * parseado. Soporta lockfileVersion 2/3 (mapa `packages`) y 1 (árbol
 * `dependencies` anidado). Usado por la guardia anti-downgrade (Fix 1): si la
 * versión instalada ya satisface el rango parcheado, fijar el override sería un
 * downgrade sin ganancia de seguridad (causa raíz del spam stale-replay).
 *
 * @param {object|null} lockJson — package-lock.json parseado (o null)
 * @param {string} dependency — nombre del paquete (puede ser scoped @s/n)
 * @returns {string[]} versiones resueltas (sin orden garantizado, puede estar vacío)
 */
export function resolveInstalledVersions(lockJson, dependency) {
  if (!lockJson || typeof lockJson !== 'object') return [];
  if (typeof dependency !== 'string' || dependency.length === 0) return [];
  const out = [];

  // lockfileVersion 2/3: mapa `packages` con claves node_modules/...
  const packages = lockJson.packages;
  if (packages && typeof packages === 'object') {
    const suffix = `node_modules/${dependency}`;
    for (const [key, meta] of Object.entries(packages)) {
      if (!meta || typeof meta.version !== 'string') continue;
      if (key === suffix || key.endsWith(`/${suffix}`)) out.push(meta.version);
    }
  }

  // lockfileVersion 1: árbol `dependencies` anidado.
  const walk = (deps) => {
    if (!deps || typeof deps !== 'object') return;
    for (const [name, meta] of Object.entries(deps)) {
      if (!meta || typeof meta !== 'object') continue;
      if (name === dependency && typeof meta.version === 'string') out.push(meta.version);
      walk(meta.dependencies);
    }
  };
  walk(lockJson.dependencies);

  return [...new Set(out)];
}

/**
 * @param {string} pkgJsonPath — ruta de package.json
 * @returns {string} ruta del package-lock.json hermano
 */
export function siblingLockPath(pkgJsonPath) {
  if (typeof pkgJsonPath !== 'string' || pkgJsonPath.length === 0) {
    throw new Error('pkgJsonPath must be a non-empty string');
  }
  const norm = pkgJsonPath.replace(/\\/g, '/');
  if (!norm.endsWith('package.json')) {
    throw new Error('pkgJsonPath must end with package.json');
  }
  return norm.slice(0, -'package.json'.length) + 'package-lock.json';
}
