# `runner/` — scripts Node del loop de mantenimiento

Sin dependencia del producto (`arbolado-app`). Solo orquestación:

| Carpeta | Estado | Para qué |
|---|---|---|
| `policy-engine/` | ✅ Sem 1 | AST validator de `package.json` (5 funciones + entry point + helpers Aider). Sin LLM, sin red. Testeable local. |
| `classifier/` | — Sem 3 | Llama a Gemini Flash para mapear signal→playbook con regla top-2 margin ≥ 0.15 |
| `router/` | — Sem 4 | Health scoring de proveedores LLM (Groq/Gemini/OpenRouter) — `pr_merge_rate`, `failure_stage`, latencia |
| `aider/` | — Sem 2 | Invoker de Aider headless con flags estrictos + input slicing por playbook |
| `session-report/` | — Sem 2 | Builder del JSON estructurado de cada ciclo (10 campos obligatorios) |

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
