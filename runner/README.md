# `runner/` — scripts Node del loop de mantenimiento

Sin dependencia del producto (`arbolado-app`). Solo orquestación:

| Carpeta | Estado | Para qué |
|---|---|---|
| `policy-engine/` | ✅ Sem 1 | AST validator de `package.json` (5 funciones + entry point + helpers Aider). Sin LLM, sin red. Testeable local. **70 tests.** |
| `playbook-loader/` | ✅ Sem 2 parcial 1 | Parser + validador de los YAMLs canónicos (`trigger`/`classifier`/`constraints`/`execution`). Forma normalizada que loop.yml consume. **45 tests.** |
| `aider-invoker/` | ✅ Sem 2 parcial 2 | Invoker de Aider headless 0.86.2 con flags estrictos (`--no-stream`/`--yes`/`--map-tokens 0`/`--edit-format diff`) + input slicing + `--model-settings-file` para temperatura. **38 tests mocked + 1 smoke gated por `AIDER_SMOKE=1`.** |
| `session-report/` | ✅ Sem 2 parcial 3 | Builder + writer del JSON estructurado (11 campos obligatorios incluyendo `failure_stage`). Path determinista `<YYYY-MM-DD>/<playbook-id>-<short-hash-12>.json`, idempotente, escritura atómica. **71 tests.** |
| `scripts/cli/` | ✅ Sem 2 parcial 3 | 4 thin orchestrators consumidos por `loop.yml` (`load-playbook`, `policy-validate`, `enforce-max-diff`, `build-and-write-report`). Sin tests propios — cubiertos por tests de los módulos que invocan. |
| `fixtures/` | ✅ Sem 2 parcial 3 | `sample-signal.json` para smoke real apply-playbooks. |
| `classifier/` | ⏳ Sem 3 (plan en arbolado-app) | Cliente Gemini 2.5 Flash + prompt + regla top-2 margin ≥ 0.15 + `classify_confidence_min` del playbook ganador. Plan: `docs/superpowers/plans/2026-05-10-g5-sem3-classifier-cron.md` (Tasks 1-6). |
| `signal-loader/` | ⏳ Sem 3 (plan en arbolado-app) | Cliente REST de Cloudflare KV (list/get/put paginado) + dedup `signal_seen:<hash>` con TTL 30d. Plan: mismo fichero (Tasks 7-11). |
| `router/` | — Sem 4 | Health scoring de proveedores LLM (Groq/Gemini/OpenRouter) — `pr_merge_rate`, `failure_stage`, latencia. Resolverá alias informales (`groq/kimi-k2`) consultando `GET /v1/models`. |

**Suite total runner: 251/251 verde** (~2.2 s con `npm test`). **Smoke real apply-playbooks validado** vía `workflow_dispatch` el 2026-05-10 — pipeline E2E corre, comportamiento defensivo confirmado por policy engine.

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
