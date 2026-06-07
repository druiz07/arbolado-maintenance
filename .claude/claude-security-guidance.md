# Guía de seguridad — runner de mantenimiento autónomo (arbolado-maintenance)

Modelo de amenaza para el plugin Security Guidance. Avísame **de inmediato**
(antes de seguir) si un cambio introduce cualquiera de estos riesgos.

**Contexto / activos:** el runner es código Node.js que se ejecuta de forma
**autónoma en GitHub Actions** (cron + dispatch). Maneja secrets:
`CLOUDFLARE_API_TOKEN`, `GH_PAT_ARBOLADO_APP` (token con permisos sobre
arbolado-app) y API keys de LLM. Procesa **"señales"** derivadas de alertas
Dependabot — sus campos (`dependency`, `patched_versions`, `path`, `advisory_id`)
están **influenciados por advisories de terceros** → entrada NO confiable.
Ejecuta `npm`/`git` vía `child_process`, clona arbolado-app y escribe en su
`package.json`/lockfile. Llama a Cloudflare KV, GitHub y APIs LLM.

## Ejecución de comandos (npm / git) — superficie principal

- Comandos `npm`/`git` SOLO desde un **allowlist de literales fijos** (`npm install`,
  `npm audit --json`, `npm test`, `npm run build`, …). Nunca construir el comando
  interpolando datos de una señal.
- Usar `spawn` con **array de args** y `shell: false`. Nunca `shell: true`. Nunca
  `exec`/`execSync` con template strings que incluyan datos externos.
- Los campos de señal (`dependency`, `version`) NO deben llegar al `argv` de un
  proceso como flags: validar que un nombre de paquete no empiece por `-`.

## Path traversal

- Cualquier ruta derivada de una señal (`signal.path`, `manifest_path`) debe
  validarse para que quede **dentro del repo target** antes de leer/escribir. Ya
  existe la guardia `escapesRepo` en `runner/overrides/index.js` — mantenerla y
  aplicar el mismo patrón en cualquier nuevo flujo que toque el fs con datos de señal.

## Tokens y secretos

- Pasar tokens SIEMPRE por **variable de entorno** o cabecera
  `Authorization: Bearer`. Nunca por línea de comandos (visible en `ps`), ni
  interpolados en URLs.
- **Nunca logear** tokens ni secrets (`console.log`, `core.info`, artefactos). Las
  URLs se asumen seguras; los Bearer tokens no.
- No hardcodear `CLOUDFLARE_API_TOKEN`, `GH_PAT_ARBOLADO_APP`, ni API keys de LLM
  (Groq `gsk_…`, etc.). Usar secrets del CI.

## Datos de señal (entrada NO confiable)

- Tratar todos los campos de la señal como potencialmente influenciados por un
  advisory de terceros. Antes de usarlos:
  - **Escritura a `package.json`:** validar nombre de paquete y versión (semver
    para la versión); confiar en `JSON.stringify` para escapar valores (no
    construir JSON por concatenación).
  - **Rutas fs:** ver path traversal.
  - **URLs:** ver SSRF.

## SSRF

- Los hosts de Cloudflare/GitHub/LLM son **constantes hardcodeadas**. Ningún campo
  de señal debe influir en el **host** ni el **protocolo** de una URL `fetch`/`curl`.
  `accountId`/`namespaceId` vienen de env, no de señal. `encodeURIComponent` en las
  keys de KV.

## Ejecución dinámica

- No usar `eval`, `new Function`, ni `require()` dinámico con datos de señal.
  Imports estáticos; parseo de señales con `JSON.parse` puro.

## Principios

- Validar la entrada en cada límite de confianza; fallar de forma segura.
- Mantener el guardarraíl de no auto-publicar runtime deps; los cambios de seguridad
  del runtime del runner van por PR con tests verdes.
- Ante cualquier duda de seguridad introducida por un cambio: **párate y avísame
  con el riesgo + el fix**.
