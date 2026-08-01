// TD-14 (observabilidad) — heartbeat `last_cycle` del productor.
//
// Lección H.4.7 (2026-07-11): el productor puede morir (o no existir) en
// silencio — el ciclo sólo dejaba rastro en console.log, que nadie lee, y
// "0 señales en KV" es indistinguible de "no hay alertas". El Worker debe
// persistir un heartbeat `last_cycle` (SIN TTL) en CADA ciclo, incluso si el
// kill_switch está activo o el fetch a GitHub falla: el consumidor (loop.yml)
// alarma si falta o envejece. Estos tests caracterizan ese contrato.

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.ts';
import type { DependabotAlert } from '../src/dependabot.ts';

type Store = Map<string, string>;

function makeState(initial: Record<string, string> = {}) {
  const store: Store = new Map(Object.entries(initial));
  return {
    store,
    async get(key: string, type?: string): Promise<unknown> {
      const v = store.get(key);
      if (v === undefined) return null;
      return type === 'json' ? JSON.parse(v) : v;
    },
    async put(key: string, value: string, _opts?: unknown): Promise<void> {
      store.set(key, value);
    },
  };
}

function makeEnv(state: ReturnType<typeof makeState>) {
  return {
    STATE: state as unknown as KVNamespace,
    GH_PAT_ARBOLADO_APP: 'test-pat',
    TARGET_REPO_OWNER: 'druiz07',
    TARGET_REPO_NAME: 'arbolado-app',
    SIGNAL_TTL_SECONDS: '86400',
  };
}

function alertFixture(): DependabotAlert {
  return {
    number: 1,
    state: 'open',
    dependency: {
      package: { ecosystem: 'npm', name: 'eslint' },
      manifest_path: 'package.json',
      scope: 'development',
    },
    security_advisory: {
      ghsa_id: 'GHSA-xxxx-xxxx-xxxx',
      severity: 'high',
      summary: 'eslint vuln',
      vulnerabilities: [],
    },
    security_vulnerability: {
      package: { ecosystem: 'npm', name: 'eslint' },
      vulnerable_version_range: '< 8.56.0',
      first_patched_version: { identifier: '8.56.0' },
      severity: 'high',
    },
    created_at: '2026-05-04T00:00:00Z',
    updated_at: '2026-05-04T00:00:00Z',
    fixed_at: null,
    dismissed_at: null,
  };
}

describe('TD-14 heartbeat last_cycle', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    // Ningún test debe salir a la red: GitHub responde 401 sintético.
    globalThis.fetch = (async () =>
      new Response('{"message":"Bad credentials"}', { status: 401 })) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('POST /run escribe last_cycle aunque el fetch a GitHub falle', async () => {
    const state = makeState();
    const res = await worker.fetch(
      new Request('https://detector.test/run', { method: 'POST' }),
      makeEnv(state),
      {} as ExecutionContext,
    );
    assert.equal(res.status, 200);
    const summary = (await res.json()) as { errors: string[] };
    assert.ok(
      summary.errors.some((e) => e.startsWith('dependabot_fetch:')),
      'el ciclo debe reportar el fallo de fetch en errors',
    );
    const raw = state.store.get('last_cycle');
    assert.ok(raw, 'last_cycle debe escribirse SIEMPRE (también con el productor roto)');
    const hb = JSON.parse(raw as string);
    assert.equal(hb.trigger, 'manual');
    assert.ok(!Number.isNaN(Date.parse(hb.at)), 'at debe ser timestamp ISO parseable');
    assert.ok(Array.isArray(hb.errors) && hb.errors.length > 0, 'el heartbeat incluye el summary');
  });

  it('POST /run escribe last_cycle aunque el kill_switch esté en off', async () => {
    const state = makeState({
      kill_switch: JSON.stringify({ enabled: false, mode: 'off' }),
    });
    const res = await worker.fetch(
      new Request('https://detector.test/run', { method: 'POST' }),
      makeEnv(state),
      {} as ExecutionContext,
    );
    assert.equal(res.status, 200);
    const raw = state.store.get('last_cycle');
    assert.ok(raw, 'kill_switch apaga la emisión de señales, NO el heartbeat');
    const errors = JSON.parse(raw as string).errors as string[];
    assert.ok(errors.some((e) => e.startsWith('kill_switch_active')));
  });

  it('H.4.7 — un ciclo con alerta NO escribe signal_seen: (es del consumidor)', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify([alertFixture()]), { status: 200 })) as typeof fetch;
    const state = makeState();
    const res = await worker.fetch(
      new Request('https://detector.test/run', { method: 'POST' }),
      makeEnv(state),
      {} as ExecutionContext,
    );
    const summary = (await res.json()) as { signals_written: number };
    assert.equal(summary.signals_written, 1);

    const keys = [...state.store.keys()];
    assert.equal(keys.filter((k) => k.startsWith('signal:')).length, 1, 'debe emitir la señal');
    assert.deepEqual(
      keys.filter((k) => k.startsWith('signal_seen:')),
      [],
      'signal_seen: es del CONSUMIDOR (TTL 30d). Si el productor la escribe, loadNextSignal ' +
        'salta la señal recién nacida y el loop no procesa nada — raíz de H.4.7',
    );
    assert.equal(
      keys.filter((k) => k.startsWith('signal_emitted:')).length,
      1,
      'el productor lleva su propio dedup en clave separada',
    );
  });

  it('H.4.7 — el segundo ciclo deduplica por su propia marca, sin reemitir', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify([alertFixture()]), { status: 200 })) as typeof fetch;
    const state = makeState();
    const env = makeEnv(state);
    const run = async () =>
      (await (
        await worker.fetch(
          new Request('https://detector.test/run', { method: 'POST' }),
          env,
          {} as ExecutionContext,
        )
      ).json()) as { signals_written: number; signals_deduped: number };

    assert.equal((await run()).signals_written, 1);
    const second = await run();
    assert.equal(second.signals_written, 0, 'no se reemite cada 30 min');
    assert.equal(second.signals_deduped, 1);
  });

  it('H.4.7 — no reemite una señal que el consumidor ya procesó', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify([alertFixture()]), { status: 200 })) as typeof fetch;
    const state = makeState();
    const env = makeEnv(state);
    await worker.fetch(
      new Request('https://detector.test/run', { method: 'POST' }),
      env,
      {} as ExecutionContext,
    );
    const hash = [...state.store.keys()].find((k) => k.startsWith('signal:'))!.slice('signal:'.length);

    // El runner procesó la señal y la marcó (TTL 30d); luego caducan tanto la
    // señal como la marca propia del productor (TTL 24h).
    state.store.delete(`signal:${hash}`);
    state.store.delete(`signal_emitted:${hash}`);
    state.store.set(`signal_seen:${hash}`, '1');

    const res = await worker.fetch(
      new Request('https://detector.test/run', { method: 'POST' }),
      env,
      {} as ExecutionContext,
    );
    const summary = (await res.json()) as { signals_written: number; signals_deduped: number };
    assert.equal(summary.signals_written, 0, 'lo ya procesado no vuelve a la cola');
    assert.equal(summary.signals_deduped, 1);
  });

  it('scheduled escribe last_cycle con trigger cron', async () => {
    const state = makeState();
    const pending: Promise<unknown>[] = [];
    const ctx = {
      waitUntil(p: Promise<unknown>) {
        pending.push(p);
      },
    } as unknown as ExecutionContext;
    await worker.scheduled(
      { cron: '*/30 * * * *', scheduledTime: 0, noRetry() {} } as unknown as ScheduledEvent,
      makeEnv(state),
      ctx,
    );
    await Promise.all(pending);
    const raw = state.store.get('last_cycle');
    assert.ok(raw, 'el tick de cron debe dejar heartbeat');
    const hb = JSON.parse(raw as string);
    assert.equal(hb.trigger, 'cron');
    assert.equal(hb.cron, '*/30 * * * *');
  });
});
