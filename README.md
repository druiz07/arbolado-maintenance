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
| **Sem 4 Sesión C** — TD-1 estructural (preconditions/dep-exists) + health-scorer + router + Task 12 wire en `loop.yml` | ✅ 2026-05-12 |
| **Sem 4 Sesión A** — alias resolution (TD-7): `runner/alias-resolver/` + step `Resolve model alias` en `loop.yml`; `AIDER_MODEL` ahora router-driven sin hardcoded fallback | ✅ 2026-05-14 |
| **Refactor post-Sesión-A** — `KNOWN_ALIASES` vaciada (Kimi K2 era modelo real de Moonshot retirado por Groq, no un mote); playbook cambió a `groq/openai/gpt-oss-120b` real | ✅ 2026-05-14 |
| **Sem 4 Sesión F** — validación con dataset real Dependabot (~3 h): módulo `runner/dependabot/` + 2 CLIs + dry-run batch sobre 59 alertas (open + fixed) | ✅ 2026-05-14 — hallazgos abstractos abajo |
| **P1 (TD-11)** — playbook nuevo `bump-transitive-via-overrides` (cierra el gap del 70 % transitives): `runner/overrides/` determinista sin Aider + CLI offline. Adelanto proactivo (disparador ≥10 open NO cumplido) | ✅ 2026-05-15 |
| **TD-12** — `bump-transitive-via-overrides` **cableado en `loop.yml`**: branching `Detect playbook kind` + `Apply override` (wrapper `apply-override.mjs` IO real) + `report-bridge.js` (report unificado) + issue `parent_strict_range` + PR override. **Ambos extremos validados con npm real:** rollback (`25928776319`) + **applied → PR `#2`** (`25929991172`) + regresión Aider (`25928876870`). Bug cwd del módulo P1 destapado y corregido (+2 tests). Suite **412→424**. Adelanto proactivo | ✅ 2026-05-15 |
| **Sem 4 Sesiones D/E** — double-run AST (latente sin playbook critical) + cierre formal | ⏳ tras D |

**Smokes E2E validados:**
- Sem 2 + Sem 3 happy-path: `gh run 25634323138` (2026-05-10) y `gh run 25639705586` (cron horario activado).
- Sem 4 B (TD-8 feedback loop): smoke 2026-05-11 con `pr_merged: null→false` propagado vía `repository_dispatch`.
- Sem 4 C (TD-1 + router): `gh run 25757868927` (2026-05-12). Pipeline corre: `Route models` → classifier (Gemini Flash, `insufficient_data: true → defaults`) → `Check dep precondition (TD-1)` → eslint NO en `package.json` → Aider skipped → report `failure_stage='policy'` con violation `precondition_dep_missing`. PR correctamente NO abierto.
- **Sem 4 A (TD-7 alias):** `gh run 25865491279` (2026-05-14). Step nuevo `Resolve model alias (TD-7)` consumió `invoker_model=groq/kimi-k2` del router output, lo mapeó a `groq/llama-3.3-70b-versatile` real, y el `Invoke Aider` lo usó como `AIDER_MODEL`. Resto del pipeline igual que Sem 4 C (precondition falla con eslint → Aider skipped). **El `AIDER_MODEL` ya no se hardcodea en el env del job; viene del router 100%.**
- **Refactor post-Sesión-A:** `gh run 25870531196` (2026-05-14, mismo día). Playbook canónico ahora declara IDs reales de Groq (`groq/openai/gpt-oss-120b` primary). El resolver pasa el ID por `mappedFrom: null` — passthrough verificado contra `/v1/models` sin necesidad de tabla de motes. Output del step: `"resolved": "groq/openai/gpt-oss-120b"`.
- **Sem 4 Sesión F (validación dataset real):** sin smoke E2E nuevo (la sesión es análisis offline). Pipeline determinista corrió sobre 59 alertas Dependabot del repo `arbolado-app` (open + fixed); 71 % cayó en `precondition_dep_missing` (transitives no presentes en `package.json` direct), 29 % pasaría a Aider pero **el conjunto que pasaría es 1 sola dep** (electron, distintos advisory_ids ya fixed). Hallazgo principal: el bottleneck del flujo Dependabot real NO es la calidad del LLM — es el **scope del único playbook activo** (sólo cubre direct deps con patch). La validación empírica del modelo nuevo (gpt-oss-120b) vs anterior queda diferida hasta volver a tener ≥10 signals open con direct deps procesables. Detalle (deps concretas) NO commiteado por seguridad — vive en `workspace/F5-propuesta-2026-05-14.md` (gitignored).
- **P1 / TD-11 (2026-05-15):** sin smoke E2E nuevo (offline; playbook aún no cableado en `loop.yml` *en ese momento* — **cerrado el mismo día en TD-12, ver entrada siguiente**). CLI determinista `override-dry-run` corrió el orquestador `runner/overrides/` sobre el mismo dataset histórico de 59 signals → **42 `applied`** (las transitives que eran el 71 % `precondition_fail` con `bump-devdep-cve`, ahora cubiertas vía `package.json#overrides`) + **17 `skipped:not_transitive`** (direct → siguen siendo de `bump-devdep-cve`; coexistencia disjunta confirmada), 0 rolled_back / 0 blocked. Suite runner **363 → 412 pass / 1 skip** (+49 tests TDD `overrides/`).
- **TD-12 (2026-05-15):** `bump-transitive-via-overrides` **cableado en `loop.yml`** + `report-bridge.js` (+10 tests). **Ambos extremos validados con npm real contra el repo real:** (a) **rollback** `gh run 25928776319` — seed transitive → `npm install` falla → rollback (repo target limpio, sin rama colgada) → issue `parent_strict_range` (#1, cerrado) → `failure_stage=ci` → sin PR; (b) **applied** `gh run 25929991172` — seed idempotente nanoid@3.3.11 → override aplicado → npm install/audit/test/build OK → `failure_stage=none` → **PR `#2` auto:dry-run** (`auto/override-nanoid-*`, diff `"nanoid":"3.3.11"` en overrides + lockfile; cerrado tras verificación). **Regresión Aider** `gh run 25928876870` (cadena Aider entra, PR Aider dispara, override skipped). **Bug del módulo P1 destapado por el smoke real:** `runner/overrides/index.js` corría `npm` en `repoDir` pero arbolado-app no tiene package.json en raíz (vive en `electron-app/`) → `ENOENT` → `applied` inalcanzable; offline no se vio (fixture pkg en raíz). Fix `cwd`=dir del package.json + **2 tests regresión**. **Suite 412 → 424 pass / 1 skip / 0 fail.**

## Dónde vive el diseño

El diseño completo está en **`druiz07/arbolado-app`** (privado, requiere acceso autenticado para ver):

- `docs/auto-maintenance/README.md` — orientación general
- `docs/auto-maintenance/arranque-plan.md` — stack, arquitectura, 9 ajustes críticos, 4 playbooks iniciales
- `docs/auto-maintenance/signal-schema.md` — contrato JSON Worker → KV (con campo `dependency_type` clave)
- `docs/auto-maintenance/policy-engine-spec.md` — AST validator de `package.json`, 5 funciones + tests obligatorios
- `docs/auto-maintenance/playbooks/bump-devdep-cve.yaml` — playbook canónico (con 6 ajustes finos integrados)

## Estructura actual (post-Sem-4-C)

```
.
├── .env.example                       # variables (alineadas con secrets de GH Actions)
├── README.md                          # este archivo
├── LICENSE                            # MIT
├── .gitignore                         # Node defaults
├── .github/workflows/
│   ├── loop.yml                       # cron orchestrator
│   │                                  #   - test-runner (cron + push)
│   │                                  #   - test-worker
│   │                                  #   - observe-signals (cron + push, KV listing)
│   │                                  #   - apply-playbooks (cron */30 desde 2026-05-16, horario Sem 3→2026-05-16;
│   │                                  #     pipeline: load-signal → route-models (Sem 4 C) →
│   │                                  #     classify (router-driven model) → load-playbook →
│   │                                  #     snapshot-before → check-dep-precondition (Sem 4 C, TD-1) →
│   │                                  #     invoke-aider (router-driven prompt variant) →
│   │                                  #     snapshot-after → policy → enforce-max-diff →
│   │                                  #     ci-tests → ci-build → write-report → commit-report →
│   │                                  #     open-pr → mark-signal-seen)
│   └── pr-merged-listener.yml         # ✅ Sem 4 B (TD-8): consume repository_dispatch desde
│                                      #   arbolado-app y actualiza pr_merged del session report
├── cloudflare/
│   ├── NOTES.md                       # KV namespace ID + schema + wrangler.toml template
│   └── worker/                        # ✅ Sem 1 — 6/6 tests
│       ├── wrangler.toml              # cron */30 + KV binding STATE
│       ├── package.json               # zod + wrangler + types
│       ├── tsconfig.json              # strict + workers-types + node
│       ├── src/{worker,signal-schema,dependabot,normalize}.ts
│       └── test/normalize.test.ts
├── runner/                            # ✅ post-Sem-4-C — 328 pass / 1 skip / 0 fail
│   ├── package.json                   # node 20 + semver + js-yaml
│   ├── README.md
│   ├── fixtures/sample-signal.json    # fixture canónica para smoke real
│   ├── policy-engine/                 # ✅ Sem 1 (70 tests)
│   ├── playbook-loader/               # ✅ Sem 2 parcial 1 (45 tests)
│   ├── aider-invoker/                 # ✅ Sem 2 parcial 2 (38 mocks + smoke gated)
│   ├── session-report/                # ✅ Sem 2 parcial 3 (71 tests)
│   ├── classifier/                    # ✅ Sem 3 (31 tests + 2 nuevos Sem 4 C model param)
│   │   ├── {errors,prompt,client,parser,threshold,index}.js
│   │   └── *.test.js                  # callGeminiFlash y classifySignal aceptan `model` (Sem 4 C)
│   ├── signal-loader/                 # ✅ Sem 3 (16 tests)
│   ├── update-merge/                  # ✅ Sem 4 B (5 tests, TD-8)
│   │   └── {index,index.test}.js      # findReportBySignalHash + updateReportPrMerged
│   ├── preconditions/                 # ✅ Sem 4 C (9 tests, TD-1 mitigation)
│   │   └── dep-exists.{js,test.js}    # checkDepExists determinístico pre-Aider
│   ├── health-scorer/                 # ✅ Sem 4 C (7 tests)
│   │   └── index.{js,test.js}         # ventana móvil 14d + per-playbook breakdown
│   ├── router/                        # ✅ Sem 4 C (7 tests)
│   │   └── index.{js,test.js}         # routeClassifierModel + routeInvokerModel
│   └── scripts/cli/                   # thin orchestrators consumidos por loop.yml
│       ├── load-playbook.mjs
│       ├── policy-validate.mjs
│       ├── enforce-max-diff.mjs
│       ├── build-and-write-report.mjs
│       ├── load-next-signal.mjs       # ✅ Sem 3 (KV REST + dedup)
│       ├── classify-signal.mjs        # ✅ Sem 3 (acepta --model <id> desde Sem 4 C)
│       ├── mark-signal-seen.mjs       # ✅ Sem 3 (KV PUT TTL 30d)
│       ├── update-session-report-on-merge.mjs  # ✅ Sem 4 B (TD-8)
│       ├── check-dep-exists.mjs       # ✅ Sem 4 C (TD-1: precondition + policy.json sintético)
│       └── route-models.mjs           # ✅ Sem 4 C (lee reports → health → routing JSON)
└── docs/auto-maintenance/
    ├── playbooks/                     # mirror del canónico
    │   ├── README.md
    │   ├── bump-devdep-cve.yaml       # ⚠ DRIFT 2026-05-12 vs canónico (TD-10): refinado en
    │   │                              #   Sem 4 C con depExistsCheck + prompt explícito
    │   ├── bump-transitive-via-overrides.yaml # ✅ P1 2026-05-15 (TD-11): transitives vía
    │   │                              #   package.json#overrides, sin Aider; CABLEADO (TD-12 ✅)
    │   ├── fix-tests-minor-version-bump.yaml
    │   ├── rollback-on-build-failure.yaml     # critical: true (documental, no activo)
    │   └── lint-prettier-autofix.yaml
    └── session-reports/               # ✅ alimentado por el bot + actualizado por el listener
        └── <YYYY-MM-DD>/<playbook-id>-<short-hash-12>.json
```

## Cómo correr los tests en local

```powershell
# Runner completo (todos los módulos)
cd runner
npm install
npm test
# ✔ 328 pass, 0 fail, 1 skip (~2.2 s)

# Smoke real opcional del aider-invoker (consume Groq tokens reales, ~6 s, ~$0.0015)
$env:AIDER_SMOKE = "1"
$env:GROQ_API_KEY = "<tu key>"
npm test

# Smoke real opcional del classifier (Gemini Flash real)
$env:CLASSIFIER_SMOKE = "1"
$env:GEMINI_API_KEY = "<tu key>"
npm test

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
# El flag seed_test_signal=true siembra signal:sem3-smoke-task12 en KV
# Y borra el signal_seen:<hash> previo (sin esto el dedup hace skip).
gh workflow run maintenance-loop --repo druiz07/arbolado-maintenance -f seed_test_signal=true
gh run watch <run-id> --repo druiz07/arbolado-maintenance --exit-status

# L1 aceleración: replay del backlog real de Dependabot en dry-run.
# Regenera TODAS las alertas de arbolado-app y las siembra en KV; el cron
# las drena 1/run → muchos PRs auto:dry-run reales para gradar merge_rate.
# Requiere que GH_PAT_ARBOLADO_APP tenga permiso Dependabot alerts: Read.
gh workflow run maintenance-loop --repo druiz07/arbolado-maintenance -f seed_dependabot_backlog=true
```

> **⚠ Estado operativo (puede ser transitorio):** durante un drenado de backlog
> L1 el cron puede estar **temporalmente en `*/10`** en vez de `*/30`; al
> terminar el drenado se revierte a `*/30` (cadencia real de producción).
> **Prioridad mientras dure:** al empezar cualquier sesión, revisar y gradar
> primero los PRs `auto:dry-run` abiertos en arbolado-app
> (`gh pr list -R druiz07/arbolado-app --label auto:dry-run`). Estado vivo
> exacto: ver `docs/auto-maintenance/arranque-plan.md` (HITO FINAL) en
> arbolado-proyecto.

El job `apply-playbooks` corre en cron `*/30` (cada 30 min) desde 2026-05-16 (antes horario desde 2026-05-10; L2 aceleración, alineado con el Worker `*/30`). Cada ejecución:
1. lee KV (`signal:*`), salta los ya marcados (`signal_seen:<hash>`),
2. **route-models** (Sem 4 C) lee health metrics + decide modelo+promptVariant,
3. classifier (Gemini Flash o Pro según router) elige playbook con top-2 margin ≥ 0.15,
4. **check-dep-precondition** (Sem 4 C, TD-1) bloquea si la dep no existe en `package.json`,
5. **resolve-model** (Sem 4 A, TD-7) toma el `invoker_model` del router output (alias informal `groq/kimi-k2`) y lo resuelve a un model id real consultando `/v1/models` de Groq/Gemini → emite `AIDER_MODEL` para `Invoke Aider`,
6. Aider hace el bump usando ese model id real,
7. policy AST + enforce-max-diff + CI tests/build + write report,
8. abre PR `auto:dry-run` sólo si `failure_stage='none'`,
9. marca signal como visto con TTL 30d.

## Pendiente — Sem 4 Sesión D (latente)

> **Plan detallado:** `arbolado-app:docs/superpowers/plans/2026-05-11-g5-sem4-router-llm.md` Tasks 13-15 (Sesión D). ~2.5 h.

Implementar modo double-run AST equivalence en `runner/ast-equivalence/`: para playbooks `constraints.critical: true` (el primer candidato sería `rollback-on-build-failure.yaml`), correr Aider 2× con seeds distintas, comparar diffs por AST. Si difieren, abortar. **Latente** porque ningún playbook activo declara `critical: true` aún — diferido a H.1/H.4 cuando el primer playbook crítico lo demande.

```
runner/ast-equivalence/                # compareJsonAst + tests
runner/scripts/cli/double-run-aider.mjs
.github/workflows/loop.yml             # branching: si playbook critical → double-run-aider.mjs
```

Tras Sesión D, **Sesión E** (~30 min) hace el cierre formal: consolida bloque Sem 4 en `arranque-plan.md`, marca TD-7/TD-1/TD-8 ya cerrados en tabla y deja la fase G.5 lista para pasar a H.4.

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
