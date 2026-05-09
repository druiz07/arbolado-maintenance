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
| **Sesión -1** — CLI prereqs (`wrangler`, `gh`) | ✅ |
| **Sesión 0** — repo + 3 secrets + KV namespace | ✅ 2026-05-09 |
| **Sem 1** — policy engine + 4 playbooks YAML + Worker detector + workflow loop | ✅ 2026-05-09 |
| **Sem 2** — Aider integration + session report estructurado | ⏳ siguiente |
| **Sem 3** — classifier Gemini Flash con top-2 margin ≥ 0.15 | — |
| **Sem 4** — router con health scoring (PR merge rate + failure stage) | — |

## Dónde vive el diseño

El diseño completo está en **`druiz07/arbolado-app`** (privado, requiere acceso autenticado para ver):

- `docs/auto-maintenance/README.md` — orientación general
- `docs/auto-maintenance/arranque-plan.md` — stack, arquitectura, 9 ajustes críticos, 4 playbooks iniciales
- `docs/auto-maintenance/signal-schema.md` — contrato JSON Worker → KV (con campo `dependency_type` clave)
- `docs/auto-maintenance/policy-engine-spec.md` — AST validator de `package.json`, 5 funciones + tests obligatorios
- `docs/auto-maintenance/playbooks/bump-devdep-cve.yaml` — playbook canónico (con 6 ajustes finos integrados)

## Estructura actual (post-Sem 1)

```
.
├── .env.example                       # variables (alineadas con secrets de GH Actions)
├── README.md                          # este archivo
├── LICENSE                            # MIT
├── .gitignore                         # Node defaults
├── .github/workflows/
│   └── loop.yml                       # cron orchestrator (Sem 1: tests + observe-signals)
├── cloudflare/
│   ├── NOTES.md                       # KV namespace ID + schema + wrangler.toml template
│   └── worker/                        # ✅ Sem 1
│       ├── wrangler.toml              # cron */30 + KV binding STATE
│       ├── package.json               # zod + wrangler + types
│       ├── tsconfig.json              # strict + workers-types + node
│       ├── src/
│       │   ├── worker.ts              # entry: scheduled() + fetch() de dev
│       │   ├── signal-schema.ts       # zod schema + generateSignalHash (SHA-256)
│       │   ├── dependabot.ts          # cliente API Dependabot Alerts
│       │   └── normalize.ts           # alert → Signal canónico
│       └── test/
│           └── normalize.test.ts      # 6/6 pasan
├── runner/                            # ✅ Sem 1
│   ├── package.json                   # node 20 + semver
│   ├── README.md
│   └── policy-engine/
│       ├── index.js                   # re-exports
│       ├── diff.js                    # parsePackageJsonDiff (AST, no regex)
│       ├── semver-rules.js            # validateSemverChange (semver real)
│       ├── operations.js              # validateOperations (forbidden > allowed)
│       ├── equivalence.js             # astEquivalent + areDiffsCompatible (double-run)
│       ├── lockfile.js                # validateLockfileChange
│       ├── validate.js                # entry point validatePackageJsonChange
│       ├── aider-helpers.js           # resolveSafeVersion + enforceMaxDiff + parseDiffStat
│       └── *.test.js                  # 70/70 pasan
└── docs/auto-maintenance/
    ├── playbooks/                     # ✅ Sem 1
    │   ├── README.md
    │   ├── bump-devdep-cve.yaml       # mirror del canónico (autoritativo en arbolado-app)
    │   ├── fix-tests-minor-version-bump.yaml  # derivado
    │   ├── rollback-on-build-failure.yaml     # derivado, critical: true
    │   └── lint-prettier-autofix.yaml         # derivado
    └── session-reports/               # creado en Sem 2 cuando arranque el dataset JSON
```

## Cómo correr los tests en local

```powershell
# Policy engine (Node 20, runtime real del loop)
cd runner
npm install
npm test
# ✔ 70 tests, 0 fail (~220 ms)

# Worker detector (TypeScript)
cd ../cloudflare/worker
npm install
npm run typecheck
npm test
# ✔ 6 tests, 0 fail (~300 ms)
```

## A añadir en Sem 2

```
runner/aider/                          # invoker headless con flags estrictos
runner/session-report/                 # builder del JSON con 10 campos obligatorios
runner/playbook-loader/                # loader YAML + validador de schema
docs/auto-maintenance/session-reports/<YYYY-MM-DD>/<playbook>-<hash>.json
.github/workflows/loop.yml             # añadir job apply-playbooks (Aider) tras observe-signals
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
