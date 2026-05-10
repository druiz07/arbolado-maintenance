import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const MODEL_NAME_RE = /^[a-zA-Z0-9_./@:\-]+$/;

export function buildModelSettingsYaml(model, temperature) {
  if (typeof model !== 'string' || !MODEL_NAME_RE.test(model)) {
    throw new Error(`buildModelSettingsYaml: invalid model name "${model}"`);
  }
  if (typeof temperature !== 'number' || !Number.isFinite(temperature)) {
    throw new Error('buildModelSettingsYaml: temperature must be a finite number');
  }
  return `- name: ${JSON.stringify(model)}\n  extra_params:\n    temperature: ${temperature}\n`;
}

export function writeModelSettingsFile(
  model,
  temperature,
  { _mkdtemp = mkdtempSync, _writeFile = writeFileSync } = {},
) {
  const dir = _mkdtemp(join(tmpdir(), 'aider-settings-'));
  const path = join(dir, 'model-settings.yml');
  const yaml = buildModelSettingsYaml(model, temperature);
  _writeFile(path, yaml, 'utf8');
  return { path, dir };
}

export function removeModelSettingsFile(handle, { _rm = rmSync } = {}) {
  if (!handle?.dir) return;
  try {
    _rm(handle.dir, { recursive: true, force: true });
  } catch (_) {
    // best-effort cleanup; tmpdir GC eventualmente lo barre
  }
}
