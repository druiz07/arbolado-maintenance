#!/usr/bin/env node
import { resolveAlias } from '../../alias-resolver/index.js';

const alias = process.argv[2];
if (!alias) { console.error('Usage: resolve-alias.mjs <alias>'); process.exit(2); }
const groqKey = process.env.GROQ_API_KEY;
const geminiKey = process.env.GEMINI_API_KEY;
if (!groqKey || !geminiKey) { console.error('Missing GROQ_API_KEY / GEMINI_API_KEY'); process.exit(2); }

try {
  const r = await resolveAlias(alias, { groqKey, geminiKey });
  process.stdout.write(JSON.stringify(r) + '\n');
} catch (err) {
  process.stdout.write(JSON.stringify({ error: err.name, message: err.message, alias }) + '\n');
  process.exit(1);
}
