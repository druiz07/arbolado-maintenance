// Orquestador del playbook bump-transitive-via-overrides.
//
// Determinista, SIN Aider/LLM. Todo el IO (lectura/escritura de ficheros y
// ejecución de npm) se INYECTA vía `io` → testeable sin red ni npm real y
// reutilizable por el CLI offline y el smoke contra el dataset histórico.
//
// io = {
//   readFile(abs) -> Promise<string>            // lanza si no existe
//   writeFile(abs, text) -> Promise<void>
//   run(cmd, {cwd}) -> Promise<{code, stdout, stderr}>   // comando npm fijo
//   rm?(abs) -> Promise<void>                    // opcional (rollback de lock nuevo)
// }
//
// Los comandos npm son literales fijos ('npm install', 'npm audit --json',
// 'npm test', 'npm run build') — sin interpolación de datos de la señal, por
// lo que no hay superficie de inyección de shell.

import semver from 'semver';
import {
  parseTargetVersion,
  manifestToPackageJsonPath,
  siblingLockPath,
  resolveInstalledVersions,
} from './version.js';
import { applyOverride } from './apply.js';
import { enforceMaxDiff } from './diff.js';
import { auditClean } from './audit.js';
import { restoreSnapshot } from './rollback.js';

const DEFAULT_MAX_DIFF = 80;

function joinRepo(repoDir, rel) {
  const base = repoDir.replace(/[/\\]+$/, '');
  return `${base}/${rel}`;
}

/**
 * @param {object} args
 * @param {object} args.signal — señal normalizada (schema bump-transitive)
 * @param {string} args.repoDir — raíz del repo target
 * @param {object} args.io — IO inyectado (ver cabecera)
 * @param {number} [args.maxDiffLines=80]
 * @returns {Promise<object>} resultado con `status`:
 *   skipped | noop | blocked | rolled_back | applied
 */
export async function runOverridePlaybook({ signal, repoDir, io, maxDiffLines = DEFAULT_MAX_DIFF }) {
  if (!signal || typeof signal !== 'object') throw new Error('signal must be an object');
  if (typeof repoDir !== 'string' || repoDir.length === 0) throw new Error('repoDir must be a non-empty string');
  for (const fn of ['readFile', 'writeFile', 'run']) {
    if (typeof io?.[fn] !== 'function') throw new Error(`io.${fn} is required`);
  }

  // pre_aider_steps: transitiveCheck
  if (signal.is_transitive !== true) {
    return { status: 'skipped', stage: 'not_transitive', reason: 'wrong_playbook_use_bump_devdep_cve' };
  }
  // pre_aider_steps: patchedVersionCheck
  if (signal.patched_versions == null || signal.patched_versions === '') {
    return { status: 'skipped', stage: 'no_patch_available', reason: 'no_patched_version_to_pin' };
  }

  const targetVersion = parseTargetVersion(signal.patched_versions);
  const pkgRel = manifestToPackageJsonPath(signal.path);
  const lockRel = siblingLockPath(pkgRel);
  const pkgAbs = joinRepo(repoDir, pkgRel);
  const lockAbs = joinRepo(repoDir, lockRel);
  // npm install/audit/test/build deben ejecutarse en el DIRECTORIO del
  // package.json, no en repoDir: arbolado-app no tiene package.json en raíz
  // (vive en electron-app/). Bug detectado por el smoke real TD-12
  // (gh run 25929781995: ENOENT app/package.json). Para package.json en
  // raíz, pkgDirRel === '' → cwd = repoDir.
  const pkgDirRel = pkgRel.replace(/\\/g, '/').replace(/\/?package\.json$/, '');
  const pkgDir = pkgDirRel ? joinRepo(repoDir, pkgDirRel) : repoDir;

  // Snapshot de texto para rollback fiel (preserva formato original).
  const pkgText = await io.readFile(pkgAbs);
  let lockText = null;
  try {
    lockText = await io.readFile(lockAbs);
  } catch {
    lockText = null; // lockfile puede no existir aún
  }
  const snapshot = { pkgAbs, lockAbs, pkgText, lockText };

  // Fix 1 — guardia anti-downgrade. Si el lockfile YA resuelve la dependencia
  // a una versión >= la parcheada en TODAS sus instancias, fijar el override a
  // patched_versions sería un downgrade (o no-op) sin ganancia de seguridad
  // (causa raíz del spam de 36 PRs stale-replay del 2026-05-17). Si no se puede
  // determinar (sin lock, dep no resuelta, lock corrupto) → proceder: npm audit
  // es la red de seguridad final.
  if (lockText !== null) {
    let lockJson = null;
    try {
      lockJson = JSON.parse(lockText);
    } catch {
      lockJson = null;
    }
    const installed = resolveInstalledVersions(lockJson, signal.dependency);
    if (
      installed.length > 0 &&
      installed.every((v) => semver.valid(v) && semver.gte(v, targetVersion))
    ) {
      return {
        status: 'skipped',
        stage: 'already_safe',
        reason: 'installed_satisfies_patched_range',
        targetVersion,
        installed,
      };
    }
  }

  let packageJson;
  try {
    packageJson = JSON.parse(pkgText);
  } catch {
    return { status: 'skipped', stage: 'unparseable_package_json', reason: 'package_json_not_valid_json' };
  }

  const { next, prev, operation } = applyOverride({
    packageJson,
    dependency: signal.dependency,
    version: targetVersion,
  });

  if (operation === 'noop') {
    return { status: 'noop', stage: 'already_pinned', targetVersion, pkgRel };
  }

  // post_aider_steps: enforceMaxDiff scope package.json_only
  const diff = enforceMaxDiff({ prev, next, max: maxDiffLines });
  if (!diff.ok) {
    return { status: 'blocked', stage: 'diff_size', reason: 'block_diff_size_exceeded', diffLines: diff.lines };
  }

  const serialized = JSON.stringify(next, null, 2) + '\n';
  await io.writeFile(pkgAbs, serialized);

  // npm install (regenera lockfile)
  const install = await io.run('npm install', { cwd: pkgDir });
  if (install.code !== 0) {
    await restoreSnapshot({ io, snapshot });
    return { status: 'rolled_back', stage: 'npm_install', operation, targetVersion, detail: install.stderr };
  }

  // Fix 2 — supresión de no-op. Si el lockfile existía y `npm install` lo dejó
  // byte-idéntico, el override no cambió la resolución real (era redundante):
  // abrir un PR sólo añadiría ruido (entrada overrides sin efecto). Se restaura
  // package.json y se reporta noop SIN PR. Si no había lock antes no se puede
  // concluir → se preserva el comportamiento previo (proceder).
  if (snapshot.lockText !== null) {
    let lockAfter = null;
    try {
      lockAfter = await io.readFile(lockAbs);
    } catch {
      lockAfter = null;
    }
    if (lockAfter !== null && lockAfter === snapshot.lockText) {
      await restoreSnapshot({ io, snapshot });
      return {
        status: 'noop',
        stage: 'lockfile_unchanged',
        reason: 'override_did_not_change_lockfile',
        targetVersion,
        pkgRel,
      };
    }
  }

  // required_checks: npm audit (la advisory concreta debe desaparecer)
  const auditRun = await io.run('npm audit --json', { cwd: pkgDir });
  let auditJson;
  try {
    auditJson = JSON.parse(auditRun.stdout || '{}');
  } catch {
    await restoreSnapshot({ io, snapshot });
    return { status: 'rolled_back', stage: 'audit_unparseable', operation, targetVersion };
  }
  const audit = auditClean({
    auditJson,
    dependency: signal.dependency,
    advisoryId: signal.advisory_id,
  });
  if (!audit.clean) {
    await restoreSnapshot({ io, snapshot });
    return { status: 'rolled_back', stage: 'audit', operation, targetVersion, auditReason: audit.reason };
  }

  // required_checks: npm test, npm run build
  const testRun = await io.run('npm test', { cwd: pkgDir });
  if (testRun.code !== 0) {
    await restoreSnapshot({ io, snapshot });
    return { status: 'rolled_back', stage: 'tests', operation, targetVersion };
  }
  const buildRun = await io.run('npm run build', { cwd: pkgDir });
  if (buildRun.code !== 0) {
    await restoreSnapshot({ io, snapshot });
    return { status: 'rolled_back', stage: 'build', operation, targetVersion };
  }

  return {
    status: 'applied',
    operation,
    targetVersion,
    pkgRel,
    diffLines: diff.lines,
    auditReason: audit.reason,
  };
}
