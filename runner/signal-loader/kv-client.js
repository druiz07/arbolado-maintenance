import { SignalLoaderKvError } from './errors.js';

const CF_API = 'https://api.cloudflare.com/client/v4';

/**
 * Cliente REST mínimo de Cloudflare KV (list, get, put). Sin SDK.
 * @param {object} args
 * @param {string} args.accountId
 * @param {string} args.namespaceId
 * @param {string} args.apiToken
 * @param {typeof globalThis.fetch} [args.fetchFn]
 */
export function createKvClient({ accountId, namespaceId, apiToken, fetchFn = globalThis.fetch }) {
  const baseUrl = `${CF_API}/accounts/${accountId}/storage/kv/namespaces/${namespaceId}`;
  const authHeaders = { authorization: `Bearer ${apiToken}` };

  return {
    /**
     * Lista todas las keys con prefix dado, paginando por cursor hasta agotar.
     * @param {string} prefix
     * @returns {Promise<string[]>}
     */
    async listKeys(prefix) {
      const out = [];
      let cursor = '';
      do {
        const url = new URL(`${baseUrl}/keys`);
        url.searchParams.set('prefix', prefix);
        if (cursor) url.searchParams.set('cursor', cursor);
        const r = await fetchFn(url.toString(), { headers: authHeaders });
        if (!r.ok) {
          throw new SignalLoaderKvError(
            `KV listKeys ${r.status}`,
            { status: r.status, body: await r.text() },
          );
        }
        const body = await r.json();
        for (const k of body.result || []) out.push(k.name);
        cursor = body.result_info?.cursor || '';
      } while (cursor);
      return out;
    },

    /**
     * Lee un valor de KV. Devuelve null en 404, lanza en otros errores.
     * @param {string} key
     * @returns {Promise<any|null>} JSON parseado, string raw, o null
     */
    async getValue(key) {
      const url = `${baseUrl}/values/${encodeURIComponent(key)}`;
      const r = await fetchFn(url, { headers: authHeaders });
      if (r.status === 404) return null;
      if (!r.ok) {
        throw new SignalLoaderKvError(
          `KV getValue ${r.status}`,
          { status: r.status, body: await r.text(), key },
        );
      }
      const text = await r.text();
      try { return JSON.parse(text); } catch { return text; }
    },

    /**
     * Escribe un valor en KV con opcional TTL.
     * @param {string} key
     * @param {string} value — string. Caller hace JSON.stringify si necesita.
     * @param {object} [opts]
     * @param {number} [opts.expirationTtl] — segundos
     */
    async putValue(key, value, { expirationTtl } = {}) {
      const url = new URL(`${baseUrl}/values/${encodeURIComponent(key)}`);
      if (expirationTtl) url.searchParams.set('expiration_ttl', String(expirationTtl));
      const r = await fetchFn(url.toString(), {
        method: 'PUT',
        headers: { ...authHeaders, 'content-type': 'text/plain' },
        body: value,
      });
      if (!r.ok) {
        throw new SignalLoaderKvError(
          `KV putValue ${r.status}`,
          { status: r.status, body: await r.text(), key },
        );
      }
    },
  };
}
