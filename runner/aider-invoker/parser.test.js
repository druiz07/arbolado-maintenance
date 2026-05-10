import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractDiff, extractFilesEdited, hasValidDiff } from './parser.js';

const SAMPLE_STDOUT_UNIFIED = `
Reading inputs...
Edited package.json
Edited src/index.js

\`\`\`diff
--- a/package.json
+++ b/package.json
@@ -1,5 +1,5 @@
 {
   "name": "x",
-  "version": "1.0.0",
+  "version": "1.0.1",
   "scripts": {}
 }
\`\`\`

Done.
`;

// Salida real observada de Aider 0.86.2 con --edit-format diff sobre groq/llama-3.3.
const SAMPLE_STDOUT_AIDER_SR = `
Aider v0.86.2
Model: groq/llama-3.3-70b-versatile with diff edit format
Added package.json to the chat.

package.json
\`\`\`javascript
<<<<<<< SEARCH
"jest": "^29.0.0"
=======
"jest": "^30.0.0"
>>>>>>> REPLACE
\`\`\`

Tokens: 2.5k sent, 43 received. Cost: $0.0015 message, $0.0015 session.
Applied edit to package.json
`;

describe('extractFilesEdited — formato unified diff (legacy)', () => {
  it('detecta líneas "Edited <path>"', () => {
    const files = extractFilesEdited(SAMPLE_STDOUT_UNIFIED);
    assert.deepEqual(files.sort(), ['package.json', 'src/index.js']);
  });

  it('vacío si no hay matches', () => {
    assert.deepEqual(extractFilesEdited('nothing here'), []);
  });

  it('deduplica', () => {
    const stdout = 'Edited foo.js\nEdited foo.js\n';
    assert.deepEqual(extractFilesEdited(stdout), ['foo.js']);
  });
});

describe('extractFilesEdited — formato Aider 0.86.2 (Applied edit to)', () => {
  it('detecta líneas "Applied edit to <path>"', () => {
    const files = extractFilesEdited(SAMPLE_STDOUT_AIDER_SR);
    assert.deepEqual(files, ['package.json']);
  });

  it('mezcla "Edited" y "Applied edit to" sin duplicar', () => {
    const stdout = 'Edited foo.js\nApplied edit to foo.js\nApplied edit to bar.js\n';
    assert.deepEqual(extractFilesEdited(stdout).sort(), ['bar.js', 'foo.js']);
  });
});

describe('extractDiff — formato unified diff', () => {
  it('extrae el contenido entre fences ```diff', () => {
    const diff = extractDiff(SAMPLE_STDOUT_UNIFIED);
    assert.ok(diff.includes('--- a/package.json'));
    assert.ok(diff.includes('+++ b/package.json'));
    assert.ok(diff.includes('+   "version": "1.0.1"') || diff.includes('+  "version": "1.0.1"'));
  });

  it('string vacío si no hay fence ni SEARCH/REPLACE', () => {
    assert.equal(extractDiff('no diff here'), '');
  });
});

describe('extractDiff — formato Aider 0.86.2 (SEARCH/REPLACE)', () => {
  it('extrae el bloque SEARCH/REPLACE completo', () => {
    const diff = extractDiff(SAMPLE_STDOUT_AIDER_SR);
    assert.ok(diff.includes('<<<<<<< SEARCH'));
    assert.ok(diff.includes('"jest": "^29.0.0"'));
    assert.ok(diff.includes('======='));
    assert.ok(diff.includes('"jest": "^30.0.0"'));
    assert.ok(diff.includes('>>>>>>> REPLACE'));
  });

  it('concatena varios bloques SEARCH/REPLACE separados por blank line', () => {
    const stdout = `
foo.js
\`\`\`javascript
<<<<<<< SEARCH
const a = 1;
=======
const a = 2;
>>>>>>> REPLACE
\`\`\`
bar.js
\`\`\`javascript
<<<<<<< SEARCH
const b = 3;
=======
const b = 4;
>>>>>>> REPLACE
\`\`\`
`;
    const diff = extractDiff(stdout);
    assert.ok(diff.includes('const a = 1;'));
    assert.ok(diff.includes('const a = 2;'));
    assert.ok(diff.includes('const b = 3;'));
    assert.ok(diff.includes('const b = 4;'));
    assert.equal((diff.match(/<<<<<<< SEARCH/g) || []).length, 2);
    assert.equal((diff.match(/>>>>>>> REPLACE/g) || []).length, 2);
  });
});

describe('hasValidDiff', () => {
  it('true cuando hay hunks @@ (unified)', () => {
    assert.equal(hasValidDiff(SAMPLE_STDOUT_UNIFIED), true);
  });

  it('true cuando hay marker SEARCH (Aider 0.86.2)', () => {
    assert.equal(hasValidDiff(SAMPLE_STDOUT_AIDER_SR), true);
  });

  it('false cuando no hay ni @@ ni SEARCH', () => {
    assert.equal(hasValidDiff('Edited foo.js but no diff'), false);
  });

  it('false con stdout vacío', () => {
    assert.equal(hasValidDiff(''), false);
  });
});
