// Aider 0.86.2 con --edit-format diff imprime bloques SEARCH/REPLACE, no unified
// diff con hunks @@. Aceptamos ambos formatos: SEARCH/REPLACE para Aider real,
// unified hunks para compatibilidad con otras herramientas o versiones.

const EDITED_RE = /^(?:Edited|Applied edit to)\s+(.+)$/gm;
const DIFF_FENCE_RE = /```diff\n([\s\S]*?)\n```/;
const SR_BLOCK_RE_GLOBAL = /<<<<<<<\s*SEARCH[\s\S]*?>>>>>>>\s*REPLACE/g;
const HUNK_RE = /^@@\s+-\d+/m;
const SR_MARKER_RE = /<<<<<<<\s*SEARCH/;

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
  // Preferred: explicit ```diff fence (Aider could emit it in some configs).
  const fenceMatch = stdout.match(DIFF_FENCE_RE);
  if (fenceMatch) return fenceMatch[1];
  // Aider 0.86.2 default: SEARCH/REPLACE blocks. Concat all blocks found.
  const blocks = stdout.match(SR_BLOCK_RE_GLOBAL);
  if (blocks && blocks.length > 0) return blocks.join('\n\n');
  return '';
}

export function hasValidDiff(stdout) {
  if (typeof stdout !== 'string' || stdout.length === 0) return false;
  return HUNK_RE.test(stdout) || SR_MARKER_RE.test(stdout);
}
