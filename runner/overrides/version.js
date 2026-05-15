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
