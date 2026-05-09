# Recursos Cloudflare aprovisionados

> Creado en Sesión 0 (2026-05-09). El Worker (detector) **no** está implementado todavía — eso es trabajo de Sem 1. Este archivo captura los recursos ya provisionados para que el Worker se cablee limpio cuando nazca.

## Cuenta

- **Account ID:** `e4ccfa519c1e0fb94221ca6583220545`
- Misma cuenta donde vivió el (borrado) Worker `arbolado-auth` — ver `arbolado-app:docs/incident-response.md` y memoria `project_worker_borrado_2026-05-02.md`.

## KV namespace

- **Title:** `arbolado-maintenance-state`
- **ID:** `212fe2e1b8874298ad44a9a906375033`
- **Binding sugerido (en wrangler.toml del Worker futuro):** `arbolado_maintenance_state`

### Por qué un namespace fresco y no el viejo

Decisión operativa #3 del [arranque-plan](https://github.com/druiz07/arbolado-app/blob/main/docs/auto-maintenance/arranque-plan.md#decisiones-operativas-cerradas-2026-05-04): **NO** reutilizar el namespace del Worker `arbolado-auth` borrado el 2026-05-02. Espacio de claves limpio, sin contaminación de licencias o emails antiguos.

### Esquema de claves (prefijos)

| Clave | Tipo | Para qué |
|---|---|---|
| `kill_switch` | `JSON { enabled: bool, mode: "full"\|"dry-run"\|"off" }` | Apagado de emergencia desde dashboard CF |
| `health:<model>` | `JSON { pr_merge_rate, last_429_at, latency_p50, latency_p99 }` | Health scoring del router de LLMs |
| `last_runs:<playbook_id>` | ISO timestamp | Anti-cooldown — el playbook no se dispara dos veces en `cooldown_minutes` |
| `last_rollback:<playbook_id>` | ISO timestamp | Anti-loop en `rollback-on-build-failure` |
| `rollback_count_24h:<playbook_id>` | integer | Anti-loop — máximo 2 rollbacks/24h |
| `rate_limits:<provider>` | `JSON { remaining, reset_at }` | Tracking de cuota free tier por proveedor |
| `signal_baseline:<source>` | `JSON { baseline values }` | Detección de anomalías relativas (Sentry Release Health, etc.) |
| `signal_seen:<signal_hash>` | `"1"` con TTL 86400 | Dedup de señales repetidas — `cooldown_minutes` por playbook + dedup por hash de señal |

Detalle de cada uso en [`arbolado-app:docs/auto-maintenance/arranque-plan.md`](https://github.com/druiz07/arbolado-app/blob/main/docs/auto-maintenance/arranque-plan.md) y en el ajuste fino #5 del [playbook canónico](https://github.com/druiz07/arbolado-app/blob/main/docs/auto-maintenance/playbooks/bump-devdep-cve.yaml).

## wrangler.toml (template — copiar al Worker en Sem 1)

Cuando se cree el Worker en Sem 1, drop este bloque en su `wrangler.toml`:

```toml
name = "arbolado-maintenance-detector"
main = "src/worker.ts"
compatibility_date = "2026-05-09"
account_id = "e4ccfa519c1e0fb94221ca6583220545"

[[kv_namespaces]]
binding = "arbolado_maintenance_state"
id = "212fe2e1b8874298ad44a9a906375033"

[triggers]
crons = ["*/30 * * * *"]   # cada 30 min — tunear en Sem 1 según volumen real
```

> Nota: Workers Free tier permite **hasta 5 cron triggers por cuenta** y 100 k req/día. El cron de cada 30 min consume ~1 440 invocaciones/mes — sobra holgadamente.

## Verificar el namespace en cualquier momento

```powershell
wrangler kv namespace list | Select-String arbolado-maintenance-state
```

Esperando una entrada con el ID arriba.

## Si hay que rotar el namespace

> Anti-patrón: borrar el namespace y recrearlo con el mismo nombre **NO** preserva las claves. Si necesitas migrar (por corrupción de schema, etc.), exporta primero con `wrangler kv key list` + `wrangler kv key get` para cada clave, recrea el namespace, vuelve a inyectar.

Para borrar (cuidado):

```powershell
wrangler kv namespace delete --namespace-id 212fe2e1b8874298ad44a9a906375033
```
