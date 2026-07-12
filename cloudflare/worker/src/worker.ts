// Cloudflare Worker — detector cron del loop autónomo.
//
// Pipeline cada 30 min:
//   1. Comprobar kill_switch en KV — si "off", retornar inmediatamente.
//   2. Listar Dependabot alerts abiertas en arbolado-app (npm only).
//   3. Para cada alerta: normalizar a Signal → validar zod → hash determinista.
//   4. Si signal_seen:<hash> existe en KV (TTL 24h) → skip dup.
//   5. Escribir signal:<hash> = JSON con TTL SIGNAL_TTL_SECONDS.
//   6. Marcar signal_seen:<hash> = "1" con mismo TTL.
//
// El runner en GH Actions consume signal:* a través de wrangler kv key list
// + wrangler kv key get desde su workflow.

import { listOpenDependabotAlerts } from './dependabot.ts';
import { normalizeDependabotAlert } from './normalize.ts';
import { SignalSchema, generateSignalHash, type Signal } from './signal-schema.ts';

export interface Env {
  STATE: KVNamespace;
  GH_PAT_ARBOLADO_APP: string;
  TARGET_REPO_OWNER: string;
  TARGET_REPO_NAME: string;
  SIGNAL_TTL_SECONDS: string;
}

type KillSwitch = { enabled: boolean; mode: 'full' | 'dry-run' | 'off' };

async function readKillSwitch(state: KVNamespace): Promise<KillSwitch> {
  const raw = await state.get('kill_switch', 'json');
  if (!raw || typeof raw !== 'object') {
    return { enabled: true, mode: 'dry-run' };
  }
  const ks = raw as Partial<KillSwitch>;
  return {
    enabled: ks.enabled ?? true,
    mode: ks.mode === 'full' || ks.mode === 'off' || ks.mode === 'dry-run' ? ks.mode : 'dry-run',
  };
}

type RunSummary = {
  alerts_seen: number;
  signals_written: number;
  signals_deduped: number;
  validation_failures: number;
  errors: string[];
};

// TD-14 (observabilidad) — heartbeat persistente del productor. El ciclo sólo
// dejaba rastro en console.log, que nadie lee: un productor roto (o nunca
// desplegado, lección H.4.7) era indistinguible de "no hay alertas".
// `last_cycle` se escribe SIN TTL en cada ciclo — también con kill_switch
// activo o fetch a GitHub roto — y el consumidor (loop.yml, step
// "Check producer heartbeat") alarma si falta o envejece más del umbral.
async function writeLastCycle(
  state: KVNamespace,
  info: { trigger: 'cron' | 'manual'; cron?: string },
  summary: RunSummary,
): Promise<void> {
  try {
    await state.put(
      'last_cycle',
      JSON.stringify({ at: new Date().toISOString(), ...info, ...summary }),
    );
  } catch {
    // best-effort: el heartbeat nunca debe tumbar el ciclo (si KV falla,
    // el staleness del propio last_cycle ya es la alarma)
  }
}

async function runDetectionCycle(env: Env): Promise<RunSummary> {
  const summary: RunSummary = {
    alerts_seen: 0,
    signals_written: 0,
    signals_deduped: 0,
    validation_failures: 0,
    errors: [],
  };

  const ks = await readKillSwitch(env.STATE);
  if (!ks.enabled || ks.mode === 'off') {
    summary.errors.push(`kill_switch_active:${ks.mode}`);
    return summary;
  }

  let alerts: Awaited<ReturnType<typeof listOpenDependabotAlerts>>;
  try {
    alerts = await listOpenDependabotAlerts(
      env.TARGET_REPO_OWNER,
      env.TARGET_REPO_NAME,
      env.GH_PAT_ARBOLADO_APP,
    );
  } catch (err) {
    summary.errors.push(`dependabot_fetch:${(err as Error).message}`);
    return summary;
  }

  summary.alerts_seen = alerts.length;
  const ttl = Number.parseInt(env.SIGNAL_TTL_SECONDS, 10) || 86400;

  for (const alert of alerts) {
    let signal: Signal;
    try {
      const candidate = normalizeDependabotAlert(alert);
      signal = SignalSchema.parse(candidate);
    } catch (err) {
      summary.validation_failures += 1;
      summary.errors.push(
        `validation:${alert.security_advisory.ghsa_id}:${(err as Error).message.slice(0, 100)}`,
      );
      continue;
    }

    const hash = await generateSignalHash(signal);
    const seen = await env.STATE.get(`signal_seen:${hash}`);
    if (seen) {
      summary.signals_deduped += 1;
      continue;
    }

    await env.STATE.put(`signal:${hash}`, JSON.stringify(signal), { expirationTtl: ttl });
    await env.STATE.put(`signal_seen:${hash}`, '1', { expirationTtl: ttl });
    summary.signals_written += 1;
  }

  return summary;
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      runDetectionCycle(env).then(async (summary) => {
        console.log('detector_cycle', JSON.stringify({ cron: event.cron, ...summary }));
        await writeLastCycle(env.STATE, { trigger: 'cron', cron: event.cron }, summary);
      }),
    );
  },

  // Endpoint HTTP para invocación manual durante desarrollo (`wrangler dev`).
  // En producción no se expone — el cron es la única forma de disparar.
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/run' && request.method === 'POST') {
      const summary = await runDetectionCycle(env);
      await writeLastCycle(env.STATE, { trigger: 'manual' }, summary);
      return new Response(JSON.stringify(summary, null, 2), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.pathname === '/health') {
      return new Response('ok', { status: 200 });
    }
    return new Response('not_found', { status: 404 });
  },
};
