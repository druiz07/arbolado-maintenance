# Session report — 2026-06-07 12:00 — manual (catálogo de señales + HITO operativo, camino A)

> Sesión **manual** (no cron). Trigger: decisión de Daniel 2026-06-07 — aceptar
> declarar el robot OPERATIVO, con un requisito previo: ejercitar/validar TODOS los
> tipos de señal de input que el pipeline G.5 procesa hoy (no sólo los dos extremos
> override-transitive + Aider-direct ya probados). Este report es la "validación E2E
> final" del Entregable A del HITO FINAL.

## Salud al empezar (verificada)

- `maintenance-loop` + `pr-merged-listener` = `active`.
- Últimos 12 runs `maintenance-loop` = 12/12 `success`.
- 0 PRs `auto:dry-run` abiertos.

## Catálogo completo de tipos de señal de input (pipeline G.5 activo: Dependabot→Worker→KV→cron)

Recorrido del código real (classifier, policy-engine, preconditions, overrides,
dependabot, signal-loader, builder, `loop.yml`). Cada señal recorre un camino con
`failure_stage`/`status` concreto. Todos los caminos que el código produce hoy:

| # | Camino | Cobertura |
|---|---|---|
| **Clasificación** ||
| C1 | direct dev → `bump-devdep-cve` (Aider) | ✅ smoke real `25928876870` + unit |
| C2 | transitive → `bump-transitive-via-overrides` | ✅ smoke real `25929991172` + unit |
| C3 | `low_confidence` → failure_stage=classifier | ✅ threshold.test |
| C4 | `margin_too_low` → classifier | ✅ threshold.test |
| C5 | playbook inexistente/YAML roto → classifier | ✅ builder.test |
| C6 | runtime direct → ningún playbook encaja (guardarraíl) | ✅ validate.test (not_dev_dependency) + classifier rules |
| **Flujo Aider (direct dev)** ||
| A1 | applied → policy ok → CI ok → PR `auto:dry-run` | ✅ smoke + builder.test |
| A2 | precondition `not_in_package_json` → policy | ✅ dep-exists.test |
| A3 | precondition `wrong_section` → policy | ✅ dep-exists.test |
| A4 | Aider errorClass≠null → aider | ✅ builder.test |
| A5 | policy violation (forbidden/semver/diff) → policy | ✅ validate/operations/semver tests |
| A6 | CI tests/build fallan → ci | ✅ builder.test |
| **Flujo override (transitive)** ||
| O1 | applied → PR | ✅ index.test + smoke `25929991172` |
| O2 | skipped `not_transitive` | ✅ index.test + report-bridge.test |
| O3 | skipped `no_patch_available` | ✅ index.test |
| O4 | skipped `already_safe` (Fix 1 anti-downgrade) | ✅ index.test + **smoke vivo 2026-06-07 `27089231233`** |
| O5 | skipped `unparseable_package_json` | ✅ **gap cerrado 2026-06-07 (TDD)** |
| O6 | noop `already_pinned` | ✅ index.test |
| O7 | noop `lockfile_unchanged` (Fix 2) | ✅ index.test |
| O8 | blocked `diff_size` | ✅ index.test + report-bridge.test |
| O9 | rolled_back `npm_install` → issue parent_strict_range | ✅ smoke `25928776319` + tests |
| O10 | rolled_back `audit_unparseable` | ✅ **gap cerrado 2026-06-07 (TDD)** |
| O11 | rolled_back `audit` (advisory persiste) | ✅ index.test |
| O12 | rolled_back `tests` | ✅ index.test |
| O13 | rolled_back `build` | ✅ index.test |
| **Dedup / carga** ||
| D1 | señal ya vista (hash) → no reprocesar | ✅ dedup.test (Worker `signal_seen` + signal-loader) |
| L1 | KV vacío / todo visto → run limpio | ✅ signal-loader.test |

## Gaps cerrados esta sesión (TDD)

- **O5 `unparseable_package_json`** y **O10 `audit_unparseable`**: ramas defensivas en
  `overrides/index.js` sin test directo. Añadidos 2 tests de caracterización en
  `overrides/index.test.js` (degradan seguro: sin escribir / restaurando). No se tocó
  código de runtime — eran gaps de *cobertura*, no de comportamiento.
- **Suite runner 439 → 441 pass / 1 skip / 0 fail.**

## Smoke E2E fresco (Entregable A — validación viva)

`workflow_dispatch -f seed_transitive_signal=true` → run **`27089231233`** (`success`).
Pipeline completo corrió HOY: seed → load-signal → classify → detect-playbook=**override**
→ apply-override → write-report → commit+push report (`35777d2`) → PR step evaluado.

**Resultado: `status=skipped / stage=already_safe / targetVersion=3.3.11`** →
`failure_stage=policy` → **sin PR** (correcto). El **Fix 1 (guardia anti-downgrade)
actuó EN VIVO**: el lockfile actual de arbolado-app ya resuelve nanoid ≥3.3.11 en
todas sus instancias → no se downgradea ni se abre PR. Es exactamente el patrón que
neutraliza el spam stale del 2026-05-17.

> **Nota de honestidad:** el seed idempotente (nanoid@3.3.11) ya **no puede** producir
> `applied`→PR — Fix 1 lo corta antes, que es lo deseado. El camino `applied`→PR fresco
> sólo se alcanzaría con una transitiva genuinamente desactualizada (no la fabrico:
> rompería el árbol o sería rollback). `applied`→PR queda validado históricamente
> (run `25929991172`, PR #2). El cableado completo (routing override, report, PR-gate)
> se confirmó vivo hoy.

Sin residuos: el smoke no creó rama (already_safe cortó antes); 0 PRs `auto:dry-run`
abiertos.

## Hallazgos (no bloqueantes)

1. **Fix 3 (coalesce dedup por dependencia) está huérfano** — implementado + 18 tests
   unit en `overrides/dedupe.js#coalesceSignalsByDependency`, pero **nadie lo importa**
   (grep exhaustivo). El pipeline procesa 1-señal/run → nunca construye el array que
   coalescaría. El dedup de producción es por identidad de hash (Worker + signal-loader),
   distinto. NO es regresión de seguridad (Fix 1 cubre el daño real); el residual es
   ruido de PRs duplicados misma-dep en dry-run. **Diferido como `TD-13`** (decisión
   Daniel 2026-06-07, latente/YAGNI como Sesión D) con disparador objetivo.
2. **"Divergencia npm audit vs Dependabot → issue"** NO existe en el pipeline activo —
   es fuente H.4 futura. `npm audit` hoy sólo se usa dentro del override como red de
   seguridad post-fix. Correcto que no esté (post-operativo).
3. **36 ramas `auto/override-*` colgadas** en arbolado-app (PRs #4–#39 ya cerrados pero
   ramas sin borrar, drenado mayo). Housekeeping (camino B, otra sesión). No bloquea.

## Decisión

Catálogo 100 % cubierto (tests + smokes; los únicos 2 gaps cerrados esta sesión).
Daniel declara el hito ✅ **OPERATIVO** → arranca la **ventana de 4 semanas supervisadas**
(guardarraíl H.4). Fin 2026-07-05.

## Nota a la siguiente sesión

Robot operativo en ventana supervisada (hasta 2026-07-05). Al empezar: revisar PRs
`auto:dry-run` (merge=aprobar / cerrar+motivo=rechazar; registrar `rejection_reason`)
y salud del cron (`--json jobs`, NO grep `--log`). Pendientes latentes: TD-13 (coalesce,
disparador objetivo), Sesión D (double-run AST, sin playbook critical activo), housekeeping
camino B (36 ramas colgadas + drift cadencia cron). El estado "operativo" se revisa al
cierre de las 4 semanas (review trimestral H.4.7).
