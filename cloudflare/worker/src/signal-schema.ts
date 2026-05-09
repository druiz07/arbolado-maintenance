// Signal schema canónico — debe coincidir 1:1 con
// arbolado-app/docs/auto-maintenance/signal-schema.md
//
// Cualquier cambio aquí exige bump de signal_version y revisión de los 4
// playbooks de Sem 1 (alineados al campo `signal_version`).

import { z } from 'zod';

export const SignalSchema = z.object({
  source: z.string(),
  dependency: z.string(),
  current_version: z.string(),
  vulnerable_versions: z.string().optional(),
  patched_versions: z.string().nullable(),
  severity: z.enum(['low', 'moderate', 'high', 'critical']),
  is_transitive: z.boolean(),
  dependency_type: z.enum(['dev', 'runtime']),
  path: z.string(),
  advisory_id: z.string(),

  detected_at: z.string(),
  signal_version: z.literal(1),

  context: z.object({
    package_manager: z.literal('npm'),
    lockfile_present: z.boolean(),
    direct_dependency: z.boolean(),
    parent_dependency: z.string().nullable(),
    dependency_chain: z.array(z.string()),
    fix_available: z.boolean(),
  }),
});

export type Signal = z.infer<typeof SignalSchema>;

// generateSignalHash — determinista, SOLO sobre los 5 campos estables del CVE.
// NO incluir detected_at (rompería deduplicación entre runs).
export async function generateSignalHash(signal: Signal): Promise<string> {
  const stable = {
    dependency: signal.dependency,
    current_version: signal.current_version,
    vulnerable_versions: signal.vulnerable_versions ?? null,
    patched_versions: signal.patched_versions,
    advisory_id: signal.advisory_id,
  };
  const data = new TextEncoder().encode(JSON.stringify(stable));
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
