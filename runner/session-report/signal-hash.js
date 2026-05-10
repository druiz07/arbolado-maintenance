// generateSignalHash — sha256 determinista de los 5 campos estables del signal.
// Spec: docs/auto-maintenance/signal-schema.md §"Generación determinista de signal_hash"

import { createHash } from 'node:crypto';

const STABLE_KEYS = ['dependency', 'current_version', 'vulnerable_versions', 'patched_versions', 'advisory_id'];

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
