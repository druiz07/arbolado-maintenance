// generateSignalHash — sha256 determinista de los 5 campos estables del signal.
// Spec: docs/auto-maintenance/signal-schema.md §"Generación determinista de signal_hash"

import { createHash } from 'node:crypto';

const STABLE_KEYS = ['dependency', 'current_version', 'vulnerable_versions', 'patched_versions', 'advisory_id'];

// Longitud del short-hash usado en nombres de fichero de session-reports y
// en branches `auto/<playbook-id>-<short-hash>`. 12 hex chars = 48 bits =
// colisión <1 entre 281 billones para los volúmenes esperados (decisión #2
// del plan sem 2 parcial 3). NO cambiar sin migrar reports históricos.
export const SIGNAL_HASH_SHORT_LENGTH = 12;

export function generateSignalHash(signal) {
  if (!signal || typeof signal !== 'object') {
    throw new Error('generateSignalHash: signal must be an object');
  }
  if (typeof signal.dependency !== 'string' || signal.dependency.length === 0) {
    throw new Error('generateSignalHash: signal.dependency required (non-empty string)');
  }

  const stable = {};
  for (const k of STABLE_KEYS) {
    stable[k] = signal[k] ?? null;
  }

  return createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}

/** Hash corto a partir de un signal: primeros SIGNAL_HASH_SHORT_LENGTH chars del sha256. */
export function shortSignalHash(signal) {
  return generateSignalHash(signal).slice(0, SIGNAL_HASH_SHORT_LENGTH);
}

/** Trunca un signal_hash ya calculado a SIGNAL_HASH_SHORT_LENGTH chars. */
export function truncateSignalHash(hash) {
  return hash.slice(0, SIGNAL_HASH_SHORT_LENGTH);
}
