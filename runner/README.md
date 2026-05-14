# `runner/` — scripts Node del loop de mantenimiento

Sin dependencia del producto (`arbolado-app`). Solo orquestación:

| Carpeta | Estado | Para qué |
|---|---|---|
| `policy-engine/` | ✅ Sem 1 | AST validator de `package.json` (5 funciones + entry point + helpers Aider). Sin LLM, sin red. Testeable local. **70 tests.** |
| `playbook-loader/` | ✅ Sem 2 parcial 1 | Parser + validador de los YAMLs canónicos. Forma normalizada que loop.yml consume. **45 tests.** |
| `aider-invoker/` | ✅ Sem 2 parcial 2 | Invoker de Aider headless 0.86.2 con flags estrictos. **38 tests mocked + 1 smoke gated por `AIDER_SMOKE=1`.** |
| `session-report/` | ✅ Sem 2 parcial 3 | Builder + writer del JSON estructurado (11 campos obligatorios incluyendo `failure_stage`). Path determinista, idempotente, escritura atómica. **71 tests.** |
| `classifier/` | ✅ Sem 3 + Sem 4 C | Cliente Gemini 2.5 Flash con structured output + top-2 margin ≥ 0.15. **Sem 4 C parametrizó `model`** (default Flash, router puede pasar Pro). **31 + 2 tests mocked + 1 smoke gated por `CLASSIFIER_SMOKE=1`.** |
| `signal-loader/` | ✅ Sem 3 | Cliente REST de Cloudflare KV (list/get/put paginado) + dedup `signal_seen:<hash>` con TTL 30d. **16 tests.** |
| `update-merge/` | ✅ Sem 4 B (TD-8) | `findReportBySignalHash` + `updateReportPrMerged` para el feedback loop `pr-merged-listener.yml`. Idempotencia estricta. **5 tests.** |
| `preconditions/` | ✅ Sem 4 C (TD-1) | `checkDepExists({packageJson, depName, depType})` — verifica AST de `package.json` ANTES de invocar Aider. Si la dep del signal no existe, el step `Check dep precondition (TD-1)` escribe un `policy.json` sintético con violation `precondition_dep_missing` y exit 1 → invoke-aider se salta. **9 tests.** |
| `health-scorer/` | ✅ Sem 4 C | `computeHealthMetrics(reports, {nowIso, windowDays=14, minSamples=5})` — agrega session reports en ventana móvil 14d → `{insufficient_data, total_reports_in_window, pr_merge_rate, failure_stages, per_playbook}`. Conservador: necesita >5 closed reports para activar router. **7 tests.** |
| `router/` | ✅ Sem 4 C | `routeClassifierModel` (escala a Gemini Pro si `classifier_failure_rate > 0.30`) + `routeInvokerModel` (promptVariant=`conservative` si `policy_failure_rate > 0.50`). Desde Sem 4 A, `router.invoker.model` SÍ se consume — fluye a `resolve-model` que lo resuelve a un ID real vía `/v1/models`. **7 tests.** |
| `alias-resolver/` | ✅ Sem 4 A (TD-7) | Cliente `GET /v1/models` Groq + Gemini que **verifica** que el ID declarado en el playbook existe en el catálogo actual del provider. Soporta IDs multi-segmento (`groq/openai/gpt-oss-120b`, `groq/meta-llama/llama-4-scout-17b-16e-instruct`). Tabla `KNOWN_ALIASES` vaciada en refactor 2026-05-14 (queda como hook futuro). Si el ID no está en el provider list → `AliasNotFoundError` con la lista real adjunta para diagnosticar. El step `Resolve model alias (TD-7)` en `loop.yml` lee el alias del router output (fallback al playbook primary si router falló) y emite el resolved como `AIDER_MODEL` para `Invoke Aider`. **13 tests** (3 groq-models + 3 gemini-models + 7 resolver). |
| `dependabot/` | ✅ Sem 4 F | Herramientas de validación batch contra dataset real Dependabot. `normalize.js` convierte `DependabotAlert` (formato API GitHub) a `Signal` canónico v1 (port en JS puro del normalizer del Worker, con `_meta.alert_state` para análisis de cohortes open/fixed); `dry-run-batch.js` corre el pipeline determinista (precondition + hash + summary) sobre array de signals y emite `failure_stage` distribution por `dependency_type`/`severity`/`alert_state`. NO se usa en el cron de producción — es CLI offline para investigación. **22 tests** (12 normalize + 10 dry-run). |
| `ast-equivalence/` | ⏳ Sem 4 D | Para playbooks `critical: true`: corre Aider 2× con seeds distintas y valida AST-equivalencia de los diffs. Latente sin playbook critical activo. |
| `scripts/cli/` | ✅ Sem 2-4 | 13 thin orchestrators (`load-playbook`, `policy-validate`, `enforce-max-diff`, `build-and-write-report`, `load-next-signal`, `classify-signal`, `mark-signal-seen`, `update-session-report-on-merge`, `check-dep-exists`, `route-models`, `resolve-alias`, **`dependabot-to-signals`** (offline), **`dry-run-batch`** (offline)). Los 11 primeros viven en `loop.yml`; los 2 de Sem 4 F son utilidades manuales para validación de cohorte. |
| `fixtures/` | ✅ Sem 2 parcial 3 | `sample-signal.json` para smoke real. |

**Suite total runner: 363 pass / 1 skip / 0 fail** (~2.2 s con `npm test`; baseline 341 post-Sem-4-A + refactor; +22 tests Sem 4 F). **Smokes E2E validados:** Sem 2/3 happy-path, Sem 4 B feedback loop, Sem 4 C TD-1 mitigation (`gh run 25757868927`, 2026-05-12), Sem 4 A TD-7 alias resolution (`gh run 25865491279`, 2026-05-14), **refactor post-A** (`gh run 25870531196`, mismo día) — playbook ahora declara `groq/openai/gpt-oss-120b` real; resolver hace passthrough (mappedFrom=null) contra `/v1/models` sin tabla de motes. **Sem 4 F:** sin smoke E2E nuevo (sesión offline) — 59 alertas Dependabot procesadas por dry-run determinista, 71 % precondition_fail (transitives), 29 % would_invoke_aider (sobre 1 sola dep, todas fixed).

## Cómo correr los tests

```powershell
cd runner
npm install
npm test
```

Node ≥ 20 — usa `node --test` runner nativo, sin Jest/Vitest.

## Convenciones

- **ESM puro** (`"type": "module"`). No CommonJS.
- **Sin dependencia de runtime** salvo `semver` — todo lo demás es Node estándar.
- **Tests viven al lado del código** (`foo.js` + `foo.test.js`), no en `__tests__/`.
- Cualquier helper que toque red (`npm view`, fetch a Dependabot, etc.) vive en módulo separado y se inyecta como dependencia para que los tests no necesiten sandbox de red.

## Dónde está la spec

- [`docs/auto-maintenance/policy-engine-spec.md`](https://github.com/druiz07/arbolado-app/blob/main/docs/auto-maintenance/policy-engine-spec.md) (privado)
- [`docs/auto-maintenance/signal-schema.md`](https://github.com/druiz07/arbolado-app/blob/main/docs/auto-maintenance/signal-schema.md) (privado)
- [`docs/auto-maintenance/playbooks/bump-devdep-cve.yaml`](https://github.com/druiz07/arbolado-app/blob/main/docs/auto-maintenance/playbooks/bump-devdep-cve.yaml) (privado)
