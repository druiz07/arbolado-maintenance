# arbolado-maintenance

> Runner del **loop de mantenimiento autónomo** para [`druiz07/arbolado-app`](https://github.com/druiz07/arbolado-app) (privado). Este repo es **público** para que GitHub Actions corra con minutos ilimitados — pero contiene **cero código fuente del producto**, solo orquestación: workflows, scripts e infra notes.

## Qué hace este repo

Periódicamente (cron) ejecuta este pipeline:

```
Worker (detector, en Cloudflare)
    ↓ signal.json validado por schema
Classifier LLM (Gemini Flash, top-2 margin ≥ 0.15)
    ↓ playbook_id + confidence
Policy Engine (JS local, validación AST — sin LLM)
    ↓ valida constraints semánticos
Router LLM (health-scored)
    ↓ elige proveedor sano
Aider (executor, scope cerrado)
    ↓ diff acotado
CI (npm test + npm run build) → PR en arbolado-app con label auto:dry-run
    ↓
Session report estructurado (commit en este repo)
```

Stack 0 € — Aider + Groq Kimi K2 + Gemini Flash + Cloudflare Workers + GH Actions, todos free tier.

## Estado

| Fase | Estado |
|---|---|
| **Sesión -1** — CLI prereqs (`wrangler`, `gh`, `aider`) | ✅ |
| **Sesión 0** — repo + 4 secrets + KV namespace | ✅ 2026-05-09 |
| **Sem 1** — policy engine + 4 playbooks YAML + Worker detector + workflow loop | ✅ 2026-05-09 |
| **Sem 2** — playbook loader + Aider invoker + session report builder + workflow `apply-playbooks` | ✅ 2026-05-10 |
| **Sem 3** — classifier real Gemini Flash con top-2 margin ≥ 0.15 + activar cron horario | ✅ 2026-05-10 |
| **Sem 4 Sesión B** — feedback loop `update-on-merge` (TD-8): notify→dispatch→listener→update-merge | ✅ 2026-05-11 |
| **Sem 4 Sesiones A/C/D/E** — alias resolution + router LLM con health scoring + double-run AST + cierre | ⏳ siguiente |

**Smoke real `apply-playbooks` validado** vía `workflow_dispatch` el 2026-05-10 (run [`25634323138`](https://github.com/druiz07/arbolado-maintenance/actions/runs/25634323138), ~2 m 30 s). El pipeline E2E corrió, Aider real con `groq/llama-3.3-70b-versatile` ($0.0022, 5.5 s), policy engine bloqueó defensivamente un cambio dudoso, report con 11 campos committed por el bot a `main`, PR `auto:dry-run` correctamente NO abierto. Detalle en `arbolado-app:docs/auto-maintenance/arranque-plan.md` §"Hallazgos del smoke real apply-playbooks 2026-05-10".

## Dónde vive el diseño

El diseño completo está en **`druiz07/arbolado-app`** (privado, requiere acceso autenticado para ver):

- `docs/auto-maintenance/README.md` — orientación general
- `docs/auto-maintenance/arranque-plan.md` — stack, arquitectura, 9 ajustes críticos, 4 playbooks iniciales
- `docs/auto-maintenance/signal-schema.md` — contrato JSON Worker → KV (con campo `dependency_type` clave)
- `docs/auto-maintenance/policy-engine-spec.md` — AST validator de `package.json`, 5 funciones + tests obligatorios
- `docs/auto-maintenance/playbooks/bump-devdep-cve.yaml` — playbook canónico (con 6 ajustes finos integrados)

## Estructura actual (post-Sem 2)

```
.
├── .env.example                       # variables (alineadas con secrets de GH Actions)
├── README.md                          # este archivo
├── LICENSE                            # MIT
├── .gitignore                         # Node defaults
├── .github/workflows/
│   └── loop.yml                       # cron orchestrator
│                                      #   - test-runner (cron + push)
│                                      #   - observe-signals (cron + push, KV listing)
│                                      #   - apply-playbooks (workflow_dispatch en Sem 2;
│                                      #     cron horario al activar Sem 3)
├── cloudflare/
│   ├── NOTES.md                       # KV namespace ID + schema + wrangler.toml template
│   └── worker/                        # ✅ Sem 1 — 6/6 tests
│       ├── wrangler.toml              # cron */30 + KV binding STATE
│       ├── package.json               # zod + wrangler + types
│       ├── tsconfig.json              # strict + workers-types + node
│       ├── src/{worker,signal-schema,dependabot,normalize}.ts
│       └── test/normalize.test.ts
├── runner/                            # ✅ Sem 1+2 — 251/251 tests verde (~2.2 s)
│   ├── package.json                   # node 20 + semver + js-yaml
│   ├── README.md
│   ├── fixtures/sample-signal.json    # fixture canónica para smoke real
│   ├── policy-engine/                 # ✅ Sem 1 (8 módulos JS + tests, 70 tests)
│   │   ├── {diff,semver-rules,operations,equivalence,lockfile,validate}.js
│   │   ├── aider-helpers.js           # resolveSafeVersion + enforceMaxDiff + parseDiffStat
│   │   └── index.js                   # re-exports
│   ├── playbook-loader/               # ✅ Sem 2 parcial 1 (8 módulos + tests, 45 tests)
│   │   ├── {globs,errors,schema,normalize,index}.js
│   │   └── *.test.js
│   ├── aider-invoker/                 # ✅ Sem 2 parcial 2 (9 módulos + tests, 38 mocks + smoke gated)
│   │   ├── {errors,flags,parser,runtime,settings,index}.js
│   │   └── smoke.test.js              # gated por AIDER_SMOKE=1 (llamada real a Groq)
│   ├── session-report/                # ✅ Sem 2 parcial 3 (5 módulos + tests, 71 tests)
│   │   ├── {signal-hash,schema,builder,writer,index}.js
│   │   └── *.test.js
│   └── scripts/cli/                   # thin orchestrators consumidos por loop.yml
│       ├── load-playbook.mjs
│       ├── policy-validate.mjs
│       ├── enforce-max-diff.mjs
│       └── build-and-write-report.mjs
└── docs/auto-maintenance/
    ├── playbooks/                     # ✅ Sem 1 — mirror del canónico
    │   ├── README.md
    │   ├── bump-devdep-cve.yaml       # mirror (autoritativo en arbolado-app)
    │   ├── fix-tests-minor-version-bump.yaml
    │   ├── rollback-on-build-failure.yaml     # critical: true
    │   └── lint-prettier-autofix.yaml
    └── session-reports/               # ✅ alimentado por el bot tras cada apply-playbooks
        └── <YYYY-MM-DD>/<playbook-id>-<short-hash-12>.json
```

## Cómo correr los tests en local

```powershell
# Runner completo (policy-engine + playbook-loader + aider-invoker + session-report)
cd runner
npm install
npm test
# ✔ 251 tests, 0 fail (~2.2 s)

# Smoke real opcional del aider-invoker (consume Groq tokens reales, ~6 s, ~$0.0015)
$env:AIDER_SMOKE = "1"
$env:GROQ_API_KEY = "<tu key>"
npm test
# ✔ 252 tests con smoke

# Worker detector (TypeScript)
cd ../cloudflare/worker
npm install
npm run typecheck
npm test
# ✔ 6 tests, 0 fail (~300 ms)
```

## Cómo disparar el smoke de `apply-playbooks` en CI

```powershell
# Manual, desde local. Requiere los 4 secrets vivos en el repo.
gh workflow run maintenance-loop --repo druiz07/arbolado-maintenance
gh run watch <run-id> --repo druiz07/arbolado-maintenance --exit-status
```

El job `apply-playbooks` está `gated` por `workflow_dispatch` durante Sem 2 — se activa en cron horario al integrar el classifier real (Sem 3).

## A añadir en Sem 3

> **Plan detallado commiteado** (en `arbolado-app:docs/superpowers/plans/2026-05-10-g5-sem3-classifier-cron.md`, commit `180ff53`): 14 tasks repartidas en 3 sesiones (A: módulo `classifier/` standalone con tests mocked; B: módulo `signal-loader/` desde KV + integración `loop.yml` todavía gated; C: smoke real con `GEMINI_API_KEY` + flip cron + commit del cierre). Suite esperada al cierre Sesión B = **298/298**.

```
runner/classifier/                     # 6 ficheros (errors, prompt, client, parser, threshold, index)
                                       # + 31 tests mocked + 1 smoke gated CLASSIFIER_SMOKE=1
runner/signal-loader/                  # 4 ficheros (errors, kv-client, dedup, index)
                                       # + 16 tests mocked
runner/scripts/cli/                    # +3 CLIs: load-next-signal, classify-signal, mark-signal-seen
.github/workflows/loop.yml             # 2 steps reemplazados (Load signal: fixture→KV;
                                       # Classify: hardcoded→CLI Gemini Flash) + 1 step nuevo
                                       # (Mark signal as seen, TTL 30d). Task 13: borrar
                                       # `if: workflow_dispatch` → cron horario activo.
```

## Desarrollo local

```powershell
copy .env.example .env
# rellena los valores — IDs públicos están en cloudflare/NOTES.md
# para los secrets, usa los mismos valores que en `gh secret list --repo druiz07/arbolado-maintenance`
```

`.env` ya está cubierto por `.gitignore`. Nunca commitearlo.

## Configuración

Las variables de entorno necesarias (nombres canónicos) están en [`.env.example`](./.env.example). Para desarrollo local, copia a `.env` y rellena valores. Para CI, los mismos nombres están provisionados como secrets del repo (gestión privada del mantenedor).

## Licencia

MIT — código de orquestación, no producto. Ver [LICENSE](./LICENSE).
