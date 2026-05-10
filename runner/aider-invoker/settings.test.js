import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  buildModelSettingsYaml,
  writeModelSettingsFile,
  removeModelSettingsFile,
} from './settings.js';

describe('buildModelSettingsYaml', () => {
  it('genera YAML con name entre comillas y temperatura', () => {
    const yaml = buildModelSettingsYaml('groq/moonshotai/kimi-k2-instruct', 0.1);
    assert.match(yaml, /^- name: "groq\/moonshotai\/kimi-k2-instruct"$/m);
    assert.match(yaml, /^ {2}extra_params:$/m);
    assert.match(yaml, /^ {4}temperature: 0\.1$/m);
  });

  it('rechaza model con caracteres no permitidos', () => {
    assert.throws(() => buildModelSettingsYaml('bad model with space', 0.1), /invalid model name/);
    assert.throws(() => buildModelSettingsYaml('with"quote', 0.1), /invalid model name/);
    assert.throws(() => buildModelSettingsYaml('with\nnewline', 0.1), /invalid model name/);
  });

  it('rechaza model no-string', () => {
    assert.throws(() => buildModelSettingsYaml(null, 0.1), /invalid model name/);
    assert.throws(() => buildModelSettingsYaml(123, 0.1), /invalid model name/);
  });

  it('rechaza temperature no finita', () => {
    assert.throws(() => buildModelSettingsYaml('groq/foo', 'hot'), /finite number/);
    assert.throws(() => buildModelSettingsYaml('groq/foo', NaN), /finite number/);
    assert.throws(() => buildModelSettingsYaml('groq/foo', Infinity), /finite number/);
  });

  it('soporta temperatura 0 y enteros', () => {
    assert.match(buildModelSettingsYaml('groq/foo', 0), /temperature: 0$/m);
    assert.match(buildModelSettingsYaml('groq/foo', 1), /temperature: 1$/m);
  });
});

describe('writeModelSettingsFile + removeModelSettingsFile (real fs)', () => {
  it('escribe archivo legible y luego lo elimina', () => {
    const handle = writeModelSettingsFile('groq/foo', 0.1);
    assert.ok(existsSync(handle.path), 'file should exist after write');
    const content = readFileSync(handle.path, 'utf8');
    assert.match(content, /temperature: 0\.1/);

    removeModelSettingsFile(handle);
    assert.equal(existsSync(handle.path), false, 'file should not exist after remove');
    assert.equal(existsSync(handle.dir), false, 'dir should not exist after remove');
  });

  it('removeModelSettingsFile es seguro con handle null/undefined', () => {
    removeModelSettingsFile(null);
    removeModelSettingsFile(undefined);
    removeModelSettingsFile({});
    // sin throws → ok
  });

  it('removeModelSettingsFile no propaga errores del fs (best-effort)', () => {
    const fakeRm = () => { throw new Error('boom'); };
    // No throw incluso si _rm falla
    removeModelSettingsFile({ path: '/x', dir: '/x' }, { _rm: fakeRm });
  });
});
