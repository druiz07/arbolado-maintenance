import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isValidGlob, matchesGlob } from './globs.js';

describe('isValidGlob — subset aceptado', () => {
  it('acepta literal sin wildcards', () => {
    assert.equal(isValidGlob('package.json'), true);
  });

  it('acepta * (un segmento)', () => {
    assert.equal(isValidGlob('src/*.js'), true);
  });

  it('acepta ** (recursivo)', () => {
    assert.equal(isValidGlob('src/**/*.js'), true);
  });

  it('rechaza .. (path traversal)', () => {
    assert.equal(isValidGlob('../etc/passwd'), false);
  });

  it('rechaza ? (no soportado)', () => {
    assert.equal(isValidGlob('file?.js'), false);
  });

  it('rechaza clases [abc]', () => {
    assert.equal(isValidGlob('file[abc].js'), false);
  });

  it('rechaza alternancia {a,b}', () => {
    assert.equal(isValidGlob('file.{js,ts}'), false);
  });

  it('rechaza string vacío', () => {
    assert.equal(isValidGlob(''), false);
  });

  it('rechaza no-string', () => {
    assert.equal(isValidGlob(null), false);
    assert.equal(isValidGlob(123), false);
  });
});

describe('matchesGlob', () => {
  it('match literal', () => {
    assert.equal(matchesGlob('package.json', 'package.json'), true);
    assert.equal(matchesGlob('package.json', 'README.md'), false);
  });

  it('match * dentro de un segmento', () => {
    assert.equal(matchesGlob('src/*.js', 'src/index.js'), true);
    assert.equal(matchesGlob('src/*.js', 'src/sub/index.js'), false);
  });

  it('match ** atraviesa segmentos', () => {
    assert.equal(matchesGlob('src/**/*.js', 'src/index.js'), true);
    assert.equal(matchesGlob('src/**/*.js', 'src/a/b/c.js'), true);
    assert.equal(matchesGlob('src/**/*.js', 'lib/index.js'), false);
  });

  it('match exacto sin extensión', () => {
    assert.equal(matchesGlob('Makefile', 'Makefile'), true);
    assert.equal(matchesGlob('Makefile', 'Makefile.am'), false);
  });
});
