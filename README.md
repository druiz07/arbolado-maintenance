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
| **Sem 1** — policy engine + 4 playbooks YAML + Worker detector | ⏳ siguiente |
| **Sem 2** — Aider integration + session report estructurado | — |
| **Sem 3** — classifier Gemini Flash con top-2 margin ≥ 0.15 | — |
| **Sem 4** — router con health scoring (PR merge rate + failure stage) | — |

## Dónde vive el diseño

El diseño completo está en **`druiz07/arbolado-app`** (privado, requiere acceso autenticado para ver):

- `docs/auto-maintenance/README.md` — orientación general
- `docs/auto-maintenance/arranque-plan.md` — stack, arquitectura, 9 ajustes críticos, 4 playbooks iniciales
- `docs/auto-maintenance/signal-schema.md` — contrato JSON Worker → KV (con campo `dependency_type` clave)
- `docs/auto-maintenance/policy-engine-spec.md` — AST validator de `package.json`, 5 funciones + tests obligatorios
- `docs/auto-maintenance/playbooks/bump-devdep-cve.yaml` — playbook canónico (con 6 ajustes finos integrados)

## Estructura actual

```
.
├── .env.example          # nombres exactos de variables (alineados con secrets de GH Actions)
├── README.md             # este archivo
├── LICENSE               # MIT
├── .gitignore            # Node defaults
└── cloudflare/
    └── NOTES.md          # KV namespace ID + schema + wrangler.toml template
```

## A añadir en Sem 1

```
cloudflare/worker/        # detector Worker (TypeScript), normaliza Dependabot+npm audit a signal-schema
runner/                   # scripts Node: classifier, policy engine, router, Aider invoker
.github/workflows/
└── loop.yml              # GH Actions cron orchestrator
docs/auto-maintenance/
├── playbooks/            # YAMLs derivados del canónico (fix-tests-minor-version-bump, rollback-on-build-failure, lint-prettier-autofix)
└── session-reports/      # JSON dataset de cada ejecución del loop (10 campos obligatorios)
```

## Desarrollo local

```powershell
copy .env.example .env
# rellena los valores — IDs públicos están en cloudflare/NOTES.md
# para los secrets, usa los mismos valores que en `gh secret list --repo druiz07/arbolado-maintenance`
```

`.env` ya está cubierto por `.gitignore`. Nunca commitearlo.

## Secrets en GitHub Actions

Configurados en Sesión 0:

```
GH_PAT_ARBOLADO_APP   # PAT scoped a arbolado-app (contents:write, pull_requests:write, actions:read)
GROQ_API_KEY          # Groq Cloud — Kimi K2 (executor primario)
GEMINI_API_KEY        # Google AI Studio — Gemini 2.5 Flash (classifier + fallback)
```

Verificar con:

```powershell
gh secret list --repo druiz07/arbolado-maintenance
```

## Licencia

MIT — código de orquestación, no producto. Ver [LICENSE](./LICENSE).
