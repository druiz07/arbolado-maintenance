import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { invokeAider } from './index.js';

const SAMPLE_PB = {
  meta: { id: 'sample', critical: false },
  execution: {
    model_strategy: { primary: 'groq/kimi-k2', fallback: 'gemini/flash', backup: 'openrouter/free' },
    aider: {
      args: ['--no-stream', '--yes', '--map-tokens 0', '--edit-format diff'],
      temperature: 0.1,
      prompt: 'unused — caller renders prompt',
    },
  },
};

const PB_WITHOUT_AIDER = {
  meta: { id: 'rollback-sample', critical: true },
  execution: {
    model_strategy: { primary: 'none', fallback: 'none', backup: 'none' },
    aider: null,
    git_revert: { target_sha: 'abc', branch_name: 'auto/revert-abc' },
  },
};

const STDOUT_OK = `
Edited package.json

\`\`\`diff
--- a/package.json
+++ b/package.json
@@ -1,3 +1,3 @@
-  "version": "1.0.0",
+  "version": "1.0.1",
\`\`\`
`;

function fakeRun(result) { return async () => result; }

describe('invokeAider — éxito', () => {
  it('errorClass null y diff parseado', async () => {
    const r = await invokeAider({
      playbook: SAMPLE_PB, signal: {}, workdir: '/tmp', files: ['/tmp/package.json'],
      model: 'groq/foo', apiKey: 'sk-x', prompt: 'bump',
      _runProcess: fakeRun({ exitCode: 0, stdout: STDOUT_OK, stderr: '', durationMs: 10, timedOut: false, aborted: false }),
    });
    assert.equal(r.errorClass, null);
    assert.equal(r.exitCode, 0);
    assert.deepEqual(r.filesEdited, ['package.json']);
    assert.ok(r.diff.includes('--- a/package.json'));
  });
});

describe('invokeAider — errorClass', () => {
  it('timeout', async () => {
    const r = await invokeAider({
      playbook: SAMPLE_PB, signal: {}, workdir: '/', files: ['/x'], model: 'groq/foo', apiKey: 'k', prompt: 'p',
      _runProcess: fakeRun({ exitCode: null, stdout: '', stderr: '', durationMs: 100, timedOut: true, aborted: false }),
    });
    assert.equal(r.errorClass, 'timeout');
  });

  it('exit ≠ 0 → process', async () => {
    const r = await invokeAider({
      playbook: SAMPLE_PB, signal: {}, workdir: '/', files: ['/x'], model: 'groq/foo', apiKey: 'k', prompt: 'p',
      _runProcess: fakeRun({ exitCode: 1, stdout: '', stderr: 'boom', durationMs: 5, timedOut: false, aborted: false }),
    });
    assert.equal(r.errorClass, 'process');
  });

  it('exit 0 sin hunks → no_diff', async () => {
    const r = await invokeAider({
      playbook: SAMPLE_PB, signal: {}, workdir: '/', files: ['/x'], model: 'groq/foo', apiKey: 'k', prompt: 'p',
      _runProcess: fakeRun({ exitCode: 0, stdout: 'no changes', stderr: '', durationMs: 5, timedOut: false, aborted: false }),
    });
    assert.equal(r.errorClass, 'no_diff');
  });

  it('aborted antes del spawn → process', async () => {
    const r = await invokeAider({
      playbook: SAMPLE_PB, signal: {}, workdir: '/', files: ['/x'], model: 'groq/foo', apiKey: 'k', prompt: 'p',
      _runProcess: fakeRun({ exitCode: null, stdout: '', stderr: '', durationMs: 0, timedOut: false, aborted: true }),
    });
    assert.equal(r.errorClass, 'process');
  });
});

describe('invokeAider — env', () => {
  it('inyecta GROQ_API_KEY para model groq/...', async () => {
    let captured;
    await invokeAider({
      playbook: SAMPLE_PB, signal: {}, workdir: '/', files: ['/x'],
      model: 'groq/kimi', apiKey: 'sk-secret', prompt: 'p',
      _runProcess: async (opts) => {
        captured = opts;
        return { exitCode: 0, stdout: STDOUT_OK, stderr: '', durationMs: 1, timedOut: false, aborted: false };
      },
    });
    assert.equal(captured.env.GROQ_API_KEY, 'sk-secret');
    assert.equal(captured.env.NO_COLOR, '1');
    assert.equal(captured.env.PYTHONUNBUFFERED, '1');
  });

  it('NO inyecta API key en argv', async () => {
    let captured;
    await invokeAider({
      playbook: SAMPLE_PB, signal: {}, workdir: '/', files: ['/x'],
      model: 'groq/kimi', apiKey: 'sk-secret', prompt: 'p',
      _runProcess: async (opts) => {
        captured = opts;
        return { exitCode: 0, stdout: STDOUT_OK, stderr: '', durationMs: 1, timedOut: false, aborted: false };
      },
    });
    assert.ok(!captured.args.some(a => a.includes('sk-secret')));
  });
});

describe('invokeAider — guards', () => {
  it('rechaza files vacío', async () => {
    await assert.rejects(
      () => invokeAider({
        playbook: SAMPLE_PB, signal: {}, workdir: '/', files: [],
        model: 'groq/kimi', apiKey: 'k', prompt: 'p',
        _runProcess: fakeRun({}),
      }),
      /files must be non-empty/,
    );
  });

  it('rechaza playbook sin execution.aider con mensaje claro', async () => {
    await assert.rejects(
      () => invokeAider({
        playbook: PB_WITHOUT_AIDER, signal: {}, workdir: '/', files: ['/x'],
        model: 'groq/kimi', apiKey: 'k', prompt: 'p',
        _runProcess: fakeRun({}),
      }),
      err => /execution\.aider is null/.test(err.message) && /git_revert/.test(err.message),
    );
  });
});
