// writeReport — escribe el session report en
// <repoRoot>/docs/auto-maintenance/session-reports/<YYYY-MM-DD>/<playbook-id>-<short-hash>.json
//
// Idempotencia: si el archivo ya existe, NO sobreescribe — devuelve {written: false}.
// El path commiteado al repo es la fuente de verdad de "ya procesado" para signal_hash.
//
// Atomicidad: write a <path>.tmp + rename atómico a <path>. Si <path>.tmp existe
// huérfano de un run anterior interrumpido, lo sobreescribimos sin temer.

import { mkdir, writeFile, rename, stat, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { validateReport } from './schema.js';
import { truncateSignalHash } from './signal-hash.js';

export function computeReportPath(repoRoot, report) {
  const date = report.timestamp.slice(0, 10);
  const shortHash = truncateSignalHash(report.signal_hash);
  const filename = `${report.playbook_id}-${shortHash}.json`;
  return join(repoRoot, 'docs', 'auto-maintenance', 'session-reports', date, filename);
}

export async function writeReport(repoRoot, report) {
  const v = validateReport(report);
  if (!v.ok) {
    const summary = v.errors.map(e => `${e.path}: ${e.message}`).join('; ');
    throw new Error(`writeReport: invalid report — ${summary}`);
  }

  try {
    const s = await stat(repoRoot);
    if (!s.isDirectory()) throw new Error('not a directory');
  } catch (err) {
    throw new Error(`writeReport: repoRoot does not exist or is not a directory: ${repoRoot} (${err.message})`);
  }

  const finalPath = computeReportPath(repoRoot, report);

  try {
    await access(finalPath);
    return { written: false, path: finalPath, reason: 'already_exists' };
  } catch {
    // no existe — proceder
  }

  await mkdir(dirname(finalPath), { recursive: true });

  const tmp = finalPath + '.tmp';
  const json = JSON.stringify(report, null, 2) + '\n';
  await writeFile(tmp, json, { encoding: 'utf8' });
  await rename(tmp, finalPath);

  return { written: true, path: finalPath };
}
