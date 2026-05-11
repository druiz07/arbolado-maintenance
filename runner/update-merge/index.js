import { readFile, writeFile, readdir, rename } from 'node:fs/promises';
import { join } from 'node:path';

const REPORTS_BASE = 'docs/auto-maintenance/session-reports';

/**
 * Busca un report por signal_hash. Itera subdirs YYYY-MM-DD descendiendo y
 * lee cada JSON hasta encontrar match. Devuelve null si no hay.
 * @param {string} repoRoot
 * @param {string} signalHash — hex64
 * @returns {Promise<{path:string, report:object}|null>}
 */
export async function findReportBySignalHash(repoRoot, signalHash) {
  const base = join(repoRoot, REPORTS_BASE);
  let dates;
  try { dates = (await readdir(base)).sort().reverse(); } catch { return null; }
  for (const date of dates) {
    const dir = join(base, date);
    let files;
    try { files = await readdir(dir); } catch { continue; }
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      const path = join(dir, f);
      let report;
      try { report = JSON.parse(await readFile(path, 'utf8')); } catch { continue; }
      if (report.signal_hash === signalHash) {
        return { path, report };
      }
    }
  }
  return null;
}

/**
 * Actualiza pr_merged en un report existente. Idempotencia estricta: si
 * pr_merged ya está set (true|false), lanza para evitar carrera con otro listener.
 * @param {string} reportPath
 * @param {boolean} merged
 */
export async function updateReportPrMerged(reportPath, merged) {
  if (typeof merged !== 'boolean') {
    throw new Error('updateReportPrMerged: merged must be boolean');
  }
  const raw = await readFile(reportPath, 'utf8');
  const report = JSON.parse(raw);
  if (report.pr_merged !== null) {
    throw new Error(`updateReportPrMerged: pr_merged already set (${report.pr_merged}) — refusing to overwrite`);
  }
  report.pr_merged = merged;
  const tmp = reportPath + '.tmp';
  await writeFile(tmp, JSON.stringify(report, null, 2) + '\n');
  await rename(tmp, reportPath);
}
