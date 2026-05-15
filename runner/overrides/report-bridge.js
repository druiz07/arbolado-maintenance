// Bridge: traduce el resultado de runOverridePlaybook a los intermedios y
// outcomes que build-and-write-report.mjs (flujo Aider) ya sabe leer, para que
// el report del cron sea unificado SIN tocar el builder de session-report.
//
// failure_stage del builder = classifier|policy|aider|ci|merge|none, derivado
// en ese orden. El playbook override es determinista (sin Aider/LLM), así que:
//   - invoker SIEMPRE { errorClass: null } → nunca failure_stage='aider'.
//   - applied/noop          → policy ok + ci ok            → failure_stage=none → PR
//   - blocked:diff_size     → policy inválida (diff_size)  → failure_stage=policy
//   - skipped:*             → policy inválida (skip)        → failure_stage=policy
//   - rolled_back:build     → ci-tests ok, ci-build fail    → failure_stage=ci
//   - rolled_back:otros     → ci-tests fail                 → failure_stage=ci
//   - rolled_back:npm_install→ además issue (edge_case parent_strict_range)
//   - estado desconocido    → fallo seguro (policy inválida, sin PR)

const OK_STATUSES = new Set(['applied', 'noop']);

function emptyOps(rawDiffLines = 0) {
  return { dependencyChanges: [], scriptChanges: [], enginesChanged: false, rawDiffLines };
}

/**
 * @param {object} result — retorno de runOverridePlaybook
 * @returns {{
 *   invoker: {errorClass: null, modelUsed: 'none'},
 *   policy: {valid: boolean, violations: object[], ops: object},
 *   ciTests: boolean|null,
 *   ciBuild: boolean|null,
 *   issue: {title: string, body: string}|null,
 *   prEligible: boolean
 * }}
 */
export function mapOverrideResult(result) {
  const status = result?.status;
  const stage = result?.stage ?? null;
  const invoker = { errorClass: null, modelUsed: 'none' };

  // Caminos OK: el override se aplicó (o ya estaba fijado). policy/ci verdes.
  if (OK_STATUSES.has(status)) {
    return {
      invoker,
      policy: { valid: true, violations: [], ops: emptyOps(result.diffLines ?? 0) },
      ciTests: true,
      ciBuild: true,
      issue: null,
      prEligible: true,
    };
  }

  // blocked:diff_size → la única razón de blocked hoy. policy inválida.
  if (status === 'blocked') {
    const observed = result.diffLines ?? 0;
    return {
      invoker,
      policy: {
        valid: false,
        violations: [{ type: 'diff_size_exceeded', observed, reason: result.reason ?? 'block_diff_size_exceeded' }],
        ops: emptyOps(observed),
      },
      ciTests: null,
      ciBuild: null,
      issue: null,
      prEligible: false,
    };
  }

  // skipped:* → el playbook no aplicaba (no debería ocurrir si el classifier
  // enrutó bien, pero se registra como policy para que el report lo capture).
  if (status === 'skipped') {
    return {
      invoker,
      policy: {
        valid: false,
        violations: [{ type: 'override_skipped', stage, reason: result.reason ?? null }],
        ops: emptyOps(0),
      },
      ciTests: null,
      ciBuild: null,
      issue: null,
      prEligible: false,
    };
  }

  if (status === 'rolled_back') {
    // build aislado: tests pasaron, el fallo fue sólo en `npm run build`.
    const buildOnly = stage === 'build';
    const issue =
      stage === 'npm_install'
        ? {
            title: `[auto-maintenance] override ineffective: npm install falló (parent_strict_range)`,
            body:
              `El playbook bump-transitive-via-overrides fijó el override pero ` +
              `\`npm install\` falló (probable rango estricto del paquete padre que ` +
              `ancla el rango vulnerable). Se restauró package.json/lockfile vía rollback.\n\n` +
              `detalle: ${result.detail ?? '(sin stderr)'}\n` +
              `targetVersion: ${result.targetVersion ?? '?'}\n\n` +
              `edge_case: parent_strict_range — requiere revisión manual.`,
          }
        : null;
    return {
      invoker,
      policy: { valid: true, violations: [], ops: emptyOps(0) },
      ciTests: buildOnly ? true : false,
      ciBuild: false,
      issue,
      prEligible: false,
    };
  }

  // Estado desconocido (no debería pasar): fallo seguro, sin PR.
  return {
    invoker,
    policy: {
      valid: false,
      violations: [{ type: 'override_unknown_status', stage, status: status ?? null }],
      ops: emptyOps(0),
    },
    ciTests: null,
    ciBuild: null,
    issue: null,
    prEligible: false,
  };
}
