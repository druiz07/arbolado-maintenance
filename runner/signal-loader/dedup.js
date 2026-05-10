// TTL del marcador signal_seen — 30 días. Permite que un signal regresado
// (Dependabot reabre alert) se reprocese tras un mes sin intervención humana.
// Subir a 90 días si Sem 4+ muestra que es necesario.
export const SIGNAL_SEEN_TTL_SECONDS = 30 * 24 * 3600;

const PREFIX = 'signal_seen:';

/**
 * @param {string} hash — sha256 hex64 del signal (generateSignalHash)
 * @param {{getValue: (key: string) => Promise<any|null>}} kvClient
 */
export async function isSignalSeen(hash, kvClient) {
  const v = await kvClient.getValue(`${PREFIX}${hash}`);
  return v !== null;
}

/**
 * @param {string} hash
 * @param {{putValue: (key: string, value: string, opts?: object) => Promise<void>}} kvClient
 * @param {object} [opts]
 * @param {number} [opts.ttlSeconds] — default 30 días
 */
export async function markSignalSeen(hash, kvClient, { ttlSeconds = SIGNAL_SEEN_TTL_SECONDS } = {}) {
  await kvClient.putValue(`${PREFIX}${hash}`, '1', { expirationTtl: ttlSeconds });
}
