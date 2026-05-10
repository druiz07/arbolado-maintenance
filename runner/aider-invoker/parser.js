const EDITED_RE = /^Edited\s+(.+)$/gm;
const DIFF_FENCE_RE = /```diff\n([\s\S]*?)\n```/;
const HUNK_RE = /^@@\s+-\d+/m;

export function extractFilesEdited(stdout) {
  if (typeof stdout !== 'string') return [];
  const set = new Set();
  for (const match of stdout.matchAll(EDITED_RE)) {
    set.add(match[1].trim());
  }
  return [...set];
}

export function extractDiff(stdout) {
  if (typeof stdout !== 'string') return '';
  const match = stdout.match(DIFF_FENCE_RE);
  return match ? match[1] : '';
}

export function hasValidDiff(stdout) {
  if (typeof stdout !== 'string' || stdout.length === 0) return false;
  return HUNK_RE.test(stdout);
}
