import { isSignalSeen } from './dedup.js';
import { generateSignalHash } from '../session-report/signal-hash.js';

export { createKvClient } from './kv-client.js';
export { isSignalSeen, markSignalSeen, SIGNAL_SEEN_TTL_SECONDS } from './dedup.js';
export { SignalLoaderKvError, SignalLoaderParseError } from './errors.js';

const SIGNAL_PREFIX = 'signal:';

/**
 * Itera signals de KV (prefix `signal:`) y devuelve el primero no visto.
 * Salta signals con JSON corrupto en lugar de abortar.
 *
 * @param {object} args
 * @param {{listKeys, getValue, putValue}} args.kvClient — createKvClient(...)
 * @returns {Promise<{hasSignal: true, signal, signalHash, kvKey} | {hasSignal: false}>}
 */
export async function loadNextSignal({ kvClient }) {
  const keys = await kvClient.listKeys(SIGNAL_PREFIX);
  for (const key of keys) {
    const raw = await kvClient.getValue(key);
    if (raw === null) continue;
    let signal;
    if (typeof raw === 'string') {
      try { signal = JSON.parse(raw); } catch { continue; }
    } else {
      signal = raw;
    }
    if (typeof signal !== 'object' || signal === null) continue;

    const hash = generateSignalHash(signal);
    if (await isSignalSeen(hash, kvClient)) continue;
    return { hasSignal: true, signal, signalHash: hash, kvKey: key };
  }
  return { hasSignal: false };
}
