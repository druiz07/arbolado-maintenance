# `playbooks/` — runtime YAMLs del loop autónomo

> **Source of truth de diseño:** [`arbolado-app/docs/auto-maintenance/playbooks/`](https://github.com/druiz07/arbolado-app/blob/main/docs/auto-maintenance/playbooks/) (privado).
>
> **Esta carpeta:** copias runtime que el loader del runner puede leer sin necesidad de checkout cruzado del repo privado para los derivados. El canónico `bump-devdep-cve.yaml` permanece autoritativo en `arbolado-app`. Si cambia el contrato del schema (ver `signal-schema.md`), bump de `signal_version` y revisión de los 4 playbooks **en el mismo PR**.

## Inventario Sem 1

| Playbook | Estado | Descripción |
|---|---|---|
| `bump-devdep-cve.yaml` | ⚠ **DRIFT 2026-05-12 (TD-10)** vs canónico de arbolado-app — refinado en Sem 4 C: `aider.prompt` con disclaimer explícito anti-add_dependency + nuevo `pre_aider_steps.depExistsCheck` que documenta la precondición estructural (cableada en `runner/preconditions/dep-exists.js` + step `Check dep precondition (TD-1)` en `loop.yml`). El runtime carga ESTE mirror, no el canónico → load-bearing. Resync canónica diferida a próxima sesión cross-repo en arbolado-app. Header del propio YAML documenta el drift. | CVE en `devDependencies` con parche disponible |
| `fix-tests-minor-version-bump.yaml` | derivado Sem 1 | tests rotos por bump menor en dep transitiva (corrige tests, no la dep) |
| `rollback-on-build-failure.yaml` | derivado Sem 1 | rollback automático si CI falla post-merge |
| `lint-prettier-autofix.yaml` | derivado Sem 1 | drift de formato (prettier/eslint --fix) |

## Diferidos (Sem 4+ tras calibrado)

- `bump-runtime-deps` — riesgo `.exe` roto en máquinas ajenas (ver memoria `obfuscator_lessons` y guardarraíles H.4)
- cambios en Electron main / IPC / CSP / Fuses / ASAR / safeStorage
- secretos del Worker
- config build complejo

## Esquema mínimo de cualquier playbook

Sin estos campos, **no se acepta** (validación al cargar):

```yaml
id: <kebab-case-id>
version: <int>
description: >
  <una frase>
trigger:
  type: <fuente>
  signal_schema: <jsonschema>
classifier:
  model: <modelo LLM>
  margin_threshold: 0.15
  prompt: |
    <prompt cerrado>
constraints:
  allowed_paths: [...]
  forbidden_paths: [...]
  allowed_operations: [...]
  forbidden_operations: [...]
  max_diff_lines: <int>
  required_checks: [...]
  retry_limit: <int>
  cooldown_minutes: <int>
  classify_confidence_min: <float>
  critical: <bool>
execution:
  model_strategy: { primary, fallback, backup }
  pre_aider_steps: [...]
  aider: { args, temperature, prompt }
  post_aider_steps: [...]
postconditions:
  require_tests_pass: <bool>
  require_build_pass: <bool>
  on_failure: { action }
edge_cases: { ... }
```

Campos extra según el playbook (`require_dev_dependency`, `version_rules`, `max_*_per_24h`, `last_rollback_*`, etc.) se documentan en cada YAML.
