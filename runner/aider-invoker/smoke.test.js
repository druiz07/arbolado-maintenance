import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { invokeAider } from './index.js';

const SMOKE_ENABLED = process.env.AIDER_SMOKE === '1';

describe('aider invoker — smoke real (gated AIDER_SMOKE=1)', { skip: !SMOKE_ENABLED }, () => {
  let sandbox;

  before(() => {
    if (!SMOKE_ENABLED) return;
    sandbox = mkdtempSync(join(tmpdir(), 'aider-smoke-'));
    writeFileSync(join(sandbox, 'package.json'), JSON.stringify({
      name: 'smoke',
      version: '1.0.0',
      devDependencies: { jest: '^29.0.0' },
    }, null, 2));
  });

  after(() => {
    if (!SMOKE_ENABLED || !sandbox) return;
    rmSync(sandbox, { recursive: true, force: true });
  });

  it('aider real ejecuta y produce diff sobre package.json', async () => {
    if (!process.env.GROQ_API_KEY) {
      assert.fail('GROQ_API_KEY required for smoke; export your local key (NOT the public-repo one)');
    }

    const aiderBin = process.env.AIDER_BIN || 'aider';

    // Playbook con shape real post-normalize (compatible con el guard del invoker).
    const playbook = {
      meta: { id: 'smoke-bump-jest', critical: false },
      execution: {
        model_strategy: { primary: 'groq/moonshotai/kimi-k2-instruct', fallback: 'none', backup: 'none' },
        aider: {
          args: ['--no-stream', '--yes', '--map-tokens 0', '--edit-format diff'],
          temperature: 0.1,
          prompt: 'unused — smoke renders prompt below',
        },
      },
    };

    const r = await invokeAider({
      playbook,
      signal: { id: 'smoke' },
      workdir: sandbox,
      files: [join(sandbox, 'package.json')],
      model: 'groq/moonshotai/kimi-k2-instruct',
      apiKey: process.env.GROQ_API_KEY,
      prompt: 'Bump jest devDependency from ^29.0.0 to ^30.0.0',
      aiderBinPath: aiderBin,
      timeoutMs: 90_000,
    });

    assert.equal(r.errorClass, null, `errorClass should be null, got ${r.errorClass}; stderr=${r.stderr}`);
    assert.equal(r.exitCode, 0);
    assert.ok(r.diff.length > 0, 'diff should not be empty');
    assert.ok(
      r.filesEdited.some(f => f.endsWith('package.json')),
      `filesEdited should include package.json: ${JSON.stringify(r.filesEdited)}`,
    );
  });
});
