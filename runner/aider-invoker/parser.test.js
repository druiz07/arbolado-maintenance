import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractDiff, extractFilesEdited, hasValidDiff } from './parser.js';

const SAMPLE_STDOUT = `
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

describe('extractFilesEdited', () => {
  it('detecta líneas "Edited <path>"', () => {
    const files = extractFilesEdited(SAMPLE_STDOUT);
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

describe('extractDiff', () => {
  it('extrae el contenido entre fences ```diff', () => {
    const diff = extractDiff(SAMPLE_STDOUT);
    assert.ok(diff.includes('--- a/package.json'));
    assert.ok(diff.includes('+++ b/package.json'));
    assert.ok(diff.includes('+   "version": "1.0.1"') || diff.includes('+  "version": "1.0.1"'));
  });

  it('string vacío si no hay fence', () => {
    assert.equal(extractDiff('no diff here'), '');
  });
});

describe('hasValidDiff', () => {
  it('true cuando hay hunks @@', () => {
    assert.equal(hasValidDiff(SAMPLE_STDOUT), true);
  });

  it('false cuando no hay @@', () => {
    assert.equal(hasValidDiff('Edited foo.js but no diff'), false);
  });

  it('false con stdout vacío', () => {
    assert.equal(hasValidDiff(''), false);
  });
});
