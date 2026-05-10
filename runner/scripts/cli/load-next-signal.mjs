#!/usr/bin/env node
// Uso desde loop.yml:
//   env CLOUDFLARE_API_TOKEN=... node scripts/cli/load-next-signal.mjs
// Imprime a stdout JSON: {hasSignal, signal?, signalHash?, kvKey?}
// Exit 0 siempre (failure_stage del loop maneja "no signals").

import { loadNextSignal, createKvClient } from '../../signal-loader/index.js';

const ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const NS_ID = process.env.KV_NAMESPACE_ID;
const TOKEN = process.env.CLOUDFLARE_API_TOKEN;

if (!ACCOUNT_ID || !NS_ID || !TOKEN) {
  console.error('Missing env: CF_ACCOUNT_ID / KV_NAMESPACE_ID / CLOUDFLARE_API_TOKEN');
  process.exit(2);
}

const kv = createKvClient({ accountId: ACCOUNT_ID, namespaceId: NS_ID, apiToken: TOKEN });
const r = await loadNextSignal({ kvClient: kv });
process.stdout.write(JSON.stringify(r) + '\n');
