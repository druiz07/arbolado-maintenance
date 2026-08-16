# arbolado-maintenance

> Runner del **loop de mantenimiento autónomo** para [`druiz07/arbolado-app`](https://github.com/druiz07/arbolado-app) (privado). Este repo es **público** para que GitHub Actions corra con minutos ilimitados — pero contiene **cero código fuente del producto**, solo orquestación: workflows, scripts e infra notes.

> # ⛔ ESTADO: JUBILADO (2026-08-16)
>
> **Este repositorio ya no ejecuta nada por su cuenta.** Se retiró el `schedule` de `maintenance-loop` (PR #26); todo lo demás —playbooks, classifier, router, policy engine, runner y sus tests— se conserva **intacto como archivo** y solo corre si alguien lo lanza a mano.
>
> **La vigilancia de vulnerabilidades vive ahora en `arbolado-app`**, en un workflow diario que hace `npm audit` sobre el propio repositorio **sin ninguna credencial**: `.github/workflows/vigia-vulnerabilidades.yml` + `scripts/vigia-vulnerabilidades.mjs`.
>
> ## Por qué
>
> **1. Lo que producía no compensaba.** 42 PRs en toda su vida → **41 cerrados, 1 mergeado**. El 1-ago las 25 alertas abiertas se cerraron con **4 `npm update` de los paquetes padre y ningún override**, justo lo contrario de lo que él habría propuesto (~9 PRs de overrides). El 16-ago la vulnerabilidad de producción se arregló **exactamente igual**.
>
> **2. La mitad que sí valía —enterarse— tampoco la estaba dando.** Del **10 al 16 de agosto estuvo ciego y en verde**: caducó `CLOUDFLARE_API_TOKEN`, el loader empezó a reventar con `SignalLoaderKvError: KV listKeys 401` y **tres disfraces lo convirtieron en calma**:
>
> | # | Disfraz | Efecto |
> |---|---|---|
> | **TD-22** | `continue-on-error: true` en `Load next unseen signal` | El step se marca **success** pese al `exit 1`; `signal-load.json` queda a **0 bytes**; la salida `has-signal` sale **vacía** y el gate `if: … == 'true'` se salta. Run verde |
> | **TD-23** | La alarma TD-14 trata **cualquier HTTP ≠ 200/404 como transitorio** | Un **401 es credencial muerta, no red**. La alarma que existe para *"el robot está ciego"* fue ciega justo a eso |
> | (TD-17 otra vez) | El snapshot imprime `Signals encontradas: 0` | Un informe que miente. Tercera repetición del patrón TD-4/TD-17 |
>
> En esos 6 días entró **`js-yaml` (alta y de runtime, 11-ago)**, que colgaba de `electron-updater` y **viajaba dentro del `.exe` que instalan los técnicos**, y `extract-zip` (13-ago). **Cero avisos.**
>
> **3. Los cuatro fallos de su historia —TD-14, TD-16, TD-17 y este— están en la misma fontanería: Worker + KV + token.** Un vigía cuyo modo de fallo es callarse y ponerse verde **es peor que no tener vigía**, porque se confía en su silencio.
>
> ## Qué hay que hacer para resucitarlo
>
> **Tres cosas, no una:**
>
> 1. Regenerar **`CLOUDFLARE_API_TOKEN`** (el actual está muerto desde el 10-ago) y ponerlo como secret del repo.
> 2. Descomentar el `schedule` en [`.github/workflows/loop.yml`](.github/workflows/loop.yml) (queda escrito tal cual estaba).
> 3. `gh variable set ROBOT_MODE --body auto --repo druiz07/arbolado-maintenance`.
>
> **Y antes de eso**, tapar **TD-22, TD-23 y TD-24** (los tres de la autopsia) y cerrar **TD-20**. Los cinco están con disparador objetivo en `arbolado-app:docs/auto-maintenance/arranque-plan.md`.

## Estado actual de cada pieza — sin cabos sueltos

| Pieza | Estado hoy | Qué implica |
|---|---|---|
| **`maintenance-loop`** (workflow) | 🟡 **Sin cron.** Solo `workflow_dispatch` | No corre solo. Ojo: al no haber cron, **los tests del runner y del Worker solo se ejecutan si lo lanzas a mano** |
| **`pr-merged-listener`** (workflow) | 🟡 **Dormido.** Sigue activo pero nunca se dispara | Escucha `repository_dispatch` desde `arbolado-app`, que solo lo emite para PRs con label `auto:dry-run`. Como el robot ya no abre PRs, **no llegará ninguno** |
| **Worker `arbolado-maintenance-detector`** (Cloudflare) | 🟠 **Sigue desplegado y con su cron `*/30`** | Escribe señales en la KV **que ya no lee nadie**. No hace daño y no cuesta dinero (free tier), pero es basura: conviene **borrarlo desde el panel de Cloudflare** |
| **KV namespace `212fe2e1…`** | 🟠 Vivo, con señales que expiran solas (TTL 24 h) y `last_cycle` sin TTL | Se puede borrar junto con el Worker |
| **`CLOUDFLARE_API_TOKEN`** (secret) | 🔴 **MUERTO** — devuelve 401 desde el 10-ago | Es lo que dejó ciego al robot. **Hay que regenerarlo si se resucita**; hoy no hace falta para nada |
| **`GH_PAT_ARBOLADO_APP`** (secret del repo **y** del Worker) | 🟡 Vivo, caduca **11-oct-2026** | **Ya no importa**: nada lo usa. No hay que renovarlo |
| **`MAINTENANCE_REPO_DISPATCH_TOKEN`** (en `arbolado-app`) | 🟡 Vivo, caduca **30-oct-2026** | **Ya no importa** por lo mismo |
| **`GEMINI_API_KEY` / `GROQ_API_KEY`** (secrets) | 🟡 Vivos, sin uso | El pipeline que los consumía no corre. Cero gasto |
| **Variable `ROBOT_MODE`** | `watch` | Irrelevante mientras no haya cron. Sigue siendo el interruptor si se resucita (**`auto` = abre PRs; cualquier otro valor o ausente = no**, default fail-safe a propósito) |
| **Issues del repo** | ✅ **0 abiertos** | Los tres avisos de modo vigía (#23 `undici`, #24 `nanoid`, #25 `electron`) se cerraron el 16-ago al quedar resueltas las vulnerabilidades |
| **PRs del repo** | ✅ **0 abiertos**, 0 ramas huérfanas | — |
| **Alertas Dependabot de `arbolado-app`** | ✅ **0 abiertas** | Los tres audits (app `--omit=dev`, app total, worker) están a 0 desde el 16-ago |

> 💡 **El aviso #24 (`nanoid`) nunca fue real:** su advisory era `GHSA-td12-override-smoke`, una señal sembrada del smoke test de TD-12 que se quedó en la cola. De los tres avisos que llegó a emitir el modo vigía, **dos fueron de verdad**.

## Qué hacía este repo

> ⛔ En pasado a propósito: esto describe la maquinaria archivada.

```
Worker (detector, en Cloudflare)              ← cron */30, escribía signal:<hash> en KV
    ↓ signal.json validado por schema (zod)
Load next unseen signal (runner)              ← leía la KV y saltaba las ya vistas
    ↓
🔭 Watch mode gate (ROBOT_MODE)                ← si NO es 'auto': avisa por issue y para aquí
    ↓ solo con ROBOT_MODE=auto
Classifier LLM (Gemini Flash, top-2 margin ≥ 0.15)
    ↓ playbook_id + confidence
Policy Engine (JS local, validación AST — sin LLM)
    ↓
Router LLM (health-scored)                    ← elegía proveedor sano según histórico
    ↓
Aider (executor, scope cerrado)               ← o el módulo de overrides, determinista y sin LLM
    ↓ diff acotado
CI (npm test + npm run build) → PR en arbolado-app con label auto:dry-run
    ↓
Session report estructurado (commit en este repo)
```

Stack 0 € — Aider + **Groq (`openai/gpt-oss-120b`)** + Gemini Flash + Cloudflare Workers + GH Actions, todos free tier. **Nunca usó Claude ni consumió cuota de Anthropic.**

> ⚠️ Nota histórica: durante un tiempo la documentación decía "Groq Kimi K2". Era un modelo real de Moonshot que Groq retiró; se sustituyó por el ID real el 2026-05-14.

## Estado por fases (histórico completo)

| Fase | Estado |
|---|---|
| **Sesión -1** — CLI prereqs (`wrangler`, `gh`, `aider`) | ✅ |
| **Sesión 0** — repo + 4 secrets + KV namespace | ✅ 2026-05-09 |
| **Sem 1** — policy engine + 4 playbooks YAML + Worker detector + workflow loop | ✅ 2026-05-09 |
| **Sem 2** — playbook loader + Aider invoker + session report builder + workflow `apply-playbooks` | ✅ 2026-05-10 |
| **Sem 3** — classifier real Gemini Flash con top-2 margin ≥ 0.15 + activar cron horario | ✅ 2026-05-10 |
| **Sem 4 Sesión B** — feedback loop `update-on-merge` (TD-8): notify→dispatch→listener→update-merge | ✅ 2026-05-11 |
| **Sem 4 Sesión C** — TD-1 estructural (preconditions/dep-exists) + health-scorer + router + Task 12 wire en `loop.yml` | ✅ 2026-05-12 |
| **Sem 4 Sesión A** — alias resolution (TD-7): `runner/alias-resolver/` + step `Resolve model alias`; `AIDER_MODEL` router-driven sin fallback hardcodeado | ✅ 2026-05-14 |
| **Refactor post-Sesión-A** — `KNOWN_ALIASES` vaciada (Kimi K2 era un modelo real retirado por Groq, no un mote); playbook a `groq/openai/gpt-oss-120b` | ✅ 2026-05-14 |
| **Sem 4 Sesión F** — validación con dataset real Dependabot: módulo `runner/dependabot/` + 2 CLIs + dry-run batch sobre 59 alertas | ✅ 2026-05-14 |
| **P1 (TD-11)** — playbook `bump-transitive-via-overrides` (cierra el gap del 70 % transitives), determinista y sin Aider | ✅ 2026-05-15 |
| **TD-12** — `bump-transitive-via-overrides` cableado en `loop.yml`; ambos extremos validados con npm real (rollback + applied → PR #2) | ✅ 2026-05-15 |
| **3 fixes dry-run-hardening (G.5)** — anti-downgrade + supresión de no-op + dedup por dependencia. Suite 424→439 | ✅ 2026-05-17 |
| **✅ HITO OPERATIVO (camino A)** — catálogo completo de tipos de señal (C1-C6 / A1-A6 / O1-O13 / D1 / L1), cobertura 100 %. Declarado operativo por Daniel → ventana de 4 semanas supervisadas | ✅ 2026-06-07 |
| **TD-15 + TD-14 (observabilidad)** — overrides como rango caret (el pin del propio robot se pudría) + heartbeat `last_cycle` + alarma de productor mudo | ✅ 2026-07-12 |
| **🚀 TD-14 CERRADO — Worker detector DESPLEGADO** — nunca se había ejecutado el `wrangler deploy`: **todas las señales históricas habían sido seeds manuales**. Desplegado (`48e12860`) + PAT regenerado en sus **dos** destinos | ✅ 2026-07-13 |
| **TD-16 — H.4.7 desatascado** — el productor escribía `signal_seen:`, que es la marca **del consumidor** ⇒ **cada señal nacía marcada como procesada**. Corregido con dedup propio (`signal_emitted:`, TTL 24 h). Verificado en vivo: `signals_written` 0 → 23, y **los dos primeros PRs orgánicos de su historia** (#93, #94 en `arbolado-app`) | ✅ 2026-08-01 |
| **Gradado de esos dos PRs** — **rechazados con motivo**: no por incorrectos, sino por **peores que la alternativa**. Sustituidos por 4 `npm update` de los padres → app 12→0, worker 5→0, Dependabot 25→0, **sin un solo override**. De ahí salen **TD-20** y **TD-21** | ✅ 2026-08-01 |
| **🔭 MODO VIGÍA** — deja de abrir PRs; detecta y avisa por issue. Interruptor `ROBOT_MODE`, corte antes de clasificar, verificado E2E (run `30765236541`) | ✅ 2026-08-02 |
| **⛔ JUBILACIÓN** — retirado el `schedule` tras 6 días ciego y en verde. La vigilancia se muda a `arbolado-app`. Deudas nuevas **TD-22/23/24** | ✅ 2026-08-16 |
| **Sem 4 Sesiones D/E** — double-run AST + cierre formal | ⛔ **CANCELADAS.** Nunca hicieron falta: ningún playbook activo declaró `critical: true`. No se harán salvo que se resucite el robot **y** aparezca un playbook crítico |

<details>
<summary>🗄️ Smokes E2E validados en su día (histórico)</summary>

- Sem 2 + Sem 3 happy-path: `gh run 25634323138` (2026-05-10) y `gh run 25639705586` (cron horario activado).
- Sem 4 B (TD-8 feedback loop): smoke 2026-05-11 con `pr_merged: null→false` propagado vía `repository_dispatch`.
- Sem 4 C (TD-1 + router): `gh run 25757868927` (2026-05-12). `Route models` → classifier → `Check dep precondition` → eslint no está en `package.json` → Aider skipped → report `failure_stage='policy'`. PR correctamente NO abierto.
- Sem 4 A (TD-7 alias): `gh run 25865491279` (2026-05-14). El `AIDER_MODEL` deja de hardcodearse y viene del router al 100 %.
- Refactor post-Sesión-A: `gh run 25870531196` (2026-05-14). Passthrough del ID real verificado contra `/v1/models`.
- Sem 4 F: análisis offline sobre 59 alertas reales. **Hallazgo principal: el cuello de botella no era la calidad del LLM, sino el scope del único playbook activo** (solo cubría direct deps con parche).
- P1/TD-11 (2026-05-15): 42 `applied` + 17 `skipped:not_transitive` sobre el dataset histórico. Suite 363 → 412.
- TD-12 (2026-05-15): rollback (`25928776319`), applied → PR #2 (`25929991172`), regresión Aider (`25928876870`). Bug de `cwd` destapado por el smoke real (arbolado-app no tiene `package.json` en la raíz, vive en `electron-app/`). Suite 412 → 424.
- 3 fixes dry-run-hardening (2026-05-17): el drenado L1 (59 señales → 36 PRs, **todos rechazados**) destapó 3 fallos bloqueantes del playbook de overrides. Suite 424 → 439.
- Modo vigía (2026-08-02): run `30765236541` con `seed_test_signal=true` — gate en success y **skipped** en clasificar, report, commit y **los dos steps de PR**. Aviso creado (issue #22, cerrado luego por ser artefacto del smoke).

</details>

## Dónde vive el diseño

El diseño completo está en **`druiz07/arbolado-app`** (privado, requiere acceso autenticado):

- `docs/auto-maintenance/README.md` — orientación general
- `docs/auto-maintenance/arranque-plan.md` — stack, arquitectura, **banner de jubilación y tabla de tech debt con disparadores** (TD-18/20/21/22/23/24)
- `docs/auto-maintenance/RUNBOOK.md` — **manual operativo en lenguaje llano**; su §0 explica cómo funciona la vigilancia hoy
- `docs/auto-maintenance/signal-schema.md` — contrato JSON Worker → KV
- `docs/auto-maintenance/policy-engine-spec.md` — AST validator de `package.json`
- `docs/auto-maintenance/playbooks/bump-devdep-cve.yaml` — playbook canónico

## Estructura

```
.
├── .env.example                       # variables (alineadas con los secrets de GH Actions)
├── README.md                          # este archivo
├── LICENSE                            # MIT
├── .github/workflows/
│   ├── loop.yml                       # ⛔ SIN CRON desde 2026-08-16 — solo workflow_dispatch
│   │                                  #   jobs: test-runner · test-worker · observe-signals · apply-playbooks
│   │                                  #   pipeline: load-signal → watch-gate → route-models → classify →
│   │                                  #     load-playbook → precondition → aider|override → policy →
│   │                                  #     enforce-max-diff → ci-tests → ci-build → write-report →
│   │                                  #     commit-report → open-pr → mark-signal-seen
│   └── pr-merged-listener.yml         # 🟡 dormido: consume repository_dispatch de arbolado-app,
│                                      #   que solo se emite para PRs auto:dry-run (ya no habrá)
├── cloudflare/
│   ├── NOTES.md                       # KV namespace ID + schema + plantilla de wrangler.toml
│   └── worker/                        # 🟠 desplegado y con cron, pero nadie consume lo que escribe
│       ├── wrangler.toml              # cron */30 + binding KV STATE + workers_dev=false
│       ├── src/{worker,signal-schema,dependabot,normalize}.ts
│       └── test/{normalize,worker}.test.ts        # 12/12
├── runner/                            # 446 pass / 1 skip / 0 fail (447 tests, 74 suites)
│   ├── policy-engine/                 # validación AST de package.json, sin LLM
│   ├── playbook-loader/  aider-invoker/  session-report/
│   ├── classifier/                    # Gemini Flash + top-2 margin
│   ├── signal-loader/                 # KV REST + dedup  ← donde saltó el 401 de agosto
│   ├── overrides/                     # transitives vía package.json#overrides, determinista
│   ├── update-merge/  preconditions/  health-scorer/  router/  alias-resolver/  dependabot/
│   └── scripts/cli/                   # orquestadores finos consumidos por loop.yml
└── docs/auto-maintenance/
    ├── playbooks/                     # mirror del canónico (load-bearing en runtime)
    │   ├── bump-devdep-cve.yaml
    │   ├── bump-transitive-via-overrides.yaml
    │   ├── fix-tests-minor-version-bump.yaml
    │   ├── rollback-on-build-failure.yaml     # critical: true (documental, nunca activo)
    │   └── lint-prettier-autofix.yaml
    └── session-reports/               # <YYYY-MM-DD>/<playbook-id>-<short-hash-12>.json
```

## Cómo correr los tests en local

Siguen pasando y siguen siendo útiles como documentación ejecutable del pipeline.

```powershell
# Runner completo (todos los módulos)
cd runner
npm install
npm test
# ✔ 447 tests: 446 pass, 0 fail, 1 skip — 74 suites (~2,2 s)

# Smoke real opcional del aider-invoker (consume tokens reales de Groq, ~6 s)
$env:AIDER_SMOKE = "1"; $env:GROQ_API_KEY = "<tu key>"; npm test

# Smoke real opcional del classifier (Gemini Flash real)
$env:CLASSIFIER_SMOKE = "1"; $env:GEMINI_API_KEY = "<tu key>"; npm test

# Worker detector (TypeScript)
cd ../cloudflare/worker
npm install
npm run typecheck
npm test
# ✔ 12 tests, 0 fail (~430 ms)
```

> ⚠️ **Sin cron, estos tests ya no se ejecutan solos en CI.** Corren dentro de `maintenance-loop`, así que solo se disparan con `workflow_dispatch` o corriéndolos en local.

## Cómo lanzarlo a mano (si alguna vez hace falta)

> 🔴 **Hoy esto NO funciona tal cual:** los pasos que tocan la KV fallarán con **401** hasta que se regenere `CLOUDFLARE_API_TOKEN`. Y aunque se regenere, con `ROBOT_MODE` distinto de `auto` el pipeline se corta en el watch-gate: detecta, avisa por issue y no abre PR.

```powershell
# Lanzar el loop una vez
gh workflow run maintenance-loop --repo druiz07/arbolado-maintenance
gh run watch <run-id> --repo druiz07/arbolado-maintenance --exit-status

# Sembrar una señal de prueba en KV (el flag borra su signal_seen: previo,
# sin eso el dedup la salta)
gh workflow run maintenance-loop --repo druiz07/arbolado-maintenance -f seed_test_signal=true
```

**Al leer un run, `--json jobs`, nunca `--log`:** `gh run view --log` devuelve el **texto del script**, no su salida, y ya ha provocado dos diagnósticos falsos. Y un step en `success` seguido de todo `skipped` significa que **el gate de arriba no pasó**, no que no hubiera trabajo.

## Desarrollo local

```powershell
copy .env.example .env
# rellena los valores — los IDs públicos están en cloudflare/NOTES.md
# para los secrets, los mismos nombres que en `gh secret list --repo druiz07/arbolado-maintenance`
```

`.env` está cubierto por `.gitignore`. Nunca commitearlo.

## Configuración

Los nombres canónicos de las variables están en [`.env.example`](./.env.example). En CI están provisionados como secrets del repo (gestión privada del mantenedor). **Ninguno se consume hoy**: ver la tabla *"Estado actual de cada pieza"*.

## Licencia

MIT — código de orquestación, no producto. Ver [LICENSE](./LICENSE).
