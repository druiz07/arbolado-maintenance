#!/usr/bin/env node
// Uso desde loop.yml:
//   env CLOUDFLARE_API_TOKEN=... node scripts/cli/mark-signal-seen.mjs <signal-hash>
// Marca signal_seen:<hash> con TTL default 30 días.
// Best-effort: si falla, log a stderr, exit 0 (no bloquea el job).

import { createKvClient, markSignalSeen } from '../../signal-loader/index.js';

const hash = process.argv[2];
if (!hash) {
  console.error('Usage: mark-signal-seen.mjs <signal-hash>');
  process.exit(2);
}

const client = createKvClient({
  accountId: process.env.CF_ACCOUNT_ID,
  namespaceId: process.env.KV_NAMESPACE_ID,
  apiToken: process.env.CLOUDFLARE_API_TOKEN,
});

try {
  await markSignalSeen(hash, client);
  console.log(`marked signal_seen:${hash} TTL 30d`);
} catch (err) {
  console.error(`mark-signal-seen failed (best-effort): ${err.message}`);
  process.exit(0);  // best-effort, NO failure
}
