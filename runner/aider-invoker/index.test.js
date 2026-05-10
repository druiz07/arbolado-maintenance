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

// Stubs para no tocar fs en tests unitarios.
function makeSettingsStubs() {
  const calls = { writes: [], removes: [] };
  const _writeModelSettingsFile = (model, temperature) => {
    calls.writes.push({ model, temperature });
    return { path: `/tmp/fake-settings/${calls.writes.length}.yml`, dir: `/tmp/fake-settings/${calls.writes.length}` };
  };
  const _removeModelSettingsFile = (handle) => {
    calls.removes.push(handle);
  };
  return { _writeModelSettingsFile, _removeModelSettingsFile, calls };
}

describe('invokeAider — éxito', () => {
  it('errorClass null y diff parseado', async () => {
    const stubs = makeSettingsStubs();
    const r = await invokeAider({
      playbook: SAMPLE_PB, signal: {}, workdir: '/tmp', files: ['/tmp/package.json'],
      model: 'groq/foo', apiKey: 'sk-x', prompt: 'bump',
      _runProcess: fakeRun({ exitCode: 0, stdout: STDOUT_OK, stderr: '', durationMs: 10, timedOut: false, aborted: false }),
      ...stubs,
    });
    assert.equal(r.errorClass, null);
    assert.equal(r.exitCode, 0);
    assert.deepEqual(r.filesEdited, ['package.json']);
    assert.ok(r.diff.includes('--- a/package.json'));
  });
});

describe('invokeAider — errorClass', () => {
  it('timeout', async () => {
    const stubs = makeSettingsStubs();
    const r = await invokeAider({
      playbook: SAMPLE_PB, signal: {}, workdir: '/', files: ['/x'], model: 'groq/foo', apiKey: 'k', prompt: 'p',
      _runProcess: fakeRun({ exitCode: null, stdout: '', stderr: '', durationMs: 100, timedOut: true, aborted: false }),
      ...stubs,
    });
    assert.equal(r.errorClass, 'timeout');
  });

  it('exit ≠ 0 → process', async () => {
    const stubs = makeSettingsStubs();
    const r = await invokeAider({
      playbook: SAMPLE_PB, signal: {}, workdir: '/', files: ['/x'], model: 'groq/foo', apiKey: 'k', prompt: 'p',
      _runProcess: fakeRun({ exitCode: 1, stdout: '', stderr: 'boom', durationMs: 5, timedOut: false, aborted: false }),
      ...stubs,
    });
    assert.equal(r.errorClass, 'process');
  });

  it('exit 0 sin hunks → no_diff', async () => {
    const stubs = makeSettingsStubs();
    const r = await invokeAider({
      playbook: SAMPLE_PB, signal: {}, workdir: '/', files: ['/x'], model: 'groq/foo', apiKey: 'k', prompt: 'p',
      _runProcess: fakeRun({ exitCode: 0, stdout: 'no changes', stderr: '', durationMs: 5, timedOut: false, aborted: false }),
      ...stubs,
    });
    assert.equal(r.errorClass, 'no_diff');
  });

  it('aborted antes del spawn → process', async () => {
    const stubs = makeSettingsStubs();
    const r = await invokeAider({
      playbook: SAMPLE_PB, signal: {}, workdir: '/', files: ['/x'], model: 'groq/foo', apiKey: 'k', prompt: 'p',
      _runProcess: fakeRun({ exitCode: null, stdout: '', stderr: '', durationMs: 0, timedOut: false, aborted: true }),
      ...stubs,
    });
    assert.equal(r.errorClass, 'process');
  });
});

describe('invokeAider — env', () => {
  it('inyecta GROQ_API_KEY para model groq/...', async () => {
    let captured;
    const stubs = makeSettingsStubs();
    await invokeAider({
      playbook: SAMPLE_PB, signal: {}, workdir: '/', files: ['/x'],
      model: 'groq/kimi', apiKey: 'sk-secret', prompt: 'p',
      _runProcess: async (opts) => {
        captured = opts;
        return { exitCode: 0, stdout: STDOUT_OK, stderr: '', durationMs: 1, timedOut: false, aborted: false };
      },
      ...stubs,
    });
    assert.equal(captured.env.GROQ_API_KEY, 'sk-secret');
    assert.equal(captured.env.NO_COLOR, '1');
    assert.equal(captured.env.PYTHONUNBUFFERED, '1');
  });

  it('NO inyecta API key en argv', async () => {
    let captured;
    const stubs = makeSettingsStubs();
    await invokeAider({
      playbook: SAMPLE_PB, signal: {}, workdir: '/', files: ['/x'],
      model: 'groq/kimi', apiKey: 'sk-secret', prompt: 'p',
      _runProcess: async (opts) => {
        captured = opts;
        return { exitCode: 0, stdout: STDOUT_OK, stderr: '', durationMs: 1, timedOut: false, aborted: false };
      },
      ...stubs,
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
        ...makeSettingsStubs(),
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
        ...makeSettingsStubs(),
      }),
      err => /execution\.aider is null/.test(err.message) && /git_revert/.test(err.message),
    );
  });
});

describe('invokeAider — model-settings-file lifecycle', () => {
  it('genera settings file con la temperatura del playbook + --model-settings-file en argv', async () => {
    let captured;
    const stubs = makeSettingsStubs();
    await invokeAider({
      playbook: SAMPLE_PB, signal: {}, workdir: '/', files: ['/x'],
      model: 'groq/kimi', apiKey: 'k', prompt: 'p',
      _runProcess: async (opts) => {
        captured = opts;
        return { exitCode: 0, stdout: STDOUT_OK, stderr: '', durationMs: 1, timedOut: false, aborted: false };
      },
      ...stubs,
    });
    assert.equal(stubs.calls.writes.length, 1);
    assert.equal(stubs.calls.writes[0].model, 'groq/kimi');
    assert.equal(stubs.calls.writes[0].temperature, 0.1);
    const i = captured.args.indexOf('--model-settings-file');
    assert.notEqual(i, -1);
    assert.equal(captured.args[i + 1], '/tmp/fake-settings/1.yml');
  });

  it('limpia el settings file después del run (éxito)', async () => {
    const stubs = makeSettingsStubs();
    await invokeAider({
      playbook: SAMPLE_PB, signal: {}, workdir: '/', files: ['/x'],
      model: 'groq/kimi', apiKey: 'k', prompt: 'p',
      _runProcess: fakeRun({ exitCode: 0, stdout: STDOUT_OK, stderr: '', durationMs: 1, timedOut: false, aborted: false }),
      ...stubs,
    });
    assert.equal(stubs.calls.removes.length, 1);
    assert.equal(stubs.calls.removes[0].path, '/tmp/fake-settings/1.yml');
  });

  it('limpia el settings file también si runProcess falla', async () => {
    const stubs = makeSettingsStubs();
    await assert.rejects(
      () => invokeAider({
        playbook: SAMPLE_PB, signal: {}, workdir: '/', files: ['/x'],
        model: 'groq/kimi', apiKey: 'k', prompt: 'p',
        _runProcess: async () => { throw new Error('spawn ENOENT'); },
        ...stubs,
      }),
      /spawn ENOENT/,
    );
    assert.equal(stubs.calls.removes.length, 1);
  });

  it('NO genera settings file si el provider no es whitelisted', async () => {
    let captured;
    const stubs = makeSettingsStubs();
    await invokeAider({
      playbook: SAMPLE_PB, signal: {}, workdir: '/', files: ['/x'],
      model: 'mistral/foo', apiKey: 'k', prompt: 'p',
      _runProcess: async (opts) => {
        captured = opts;
        return { exitCode: 0, stdout: STDOUT_OK, stderr: '', durationMs: 1, timedOut: false, aborted: false };
      },
      ...stubs,
    });
    assert.equal(stubs.calls.writes.length, 0);
    assert.equal(stubs.calls.removes.length, 0);
    assert.equal(captured.args.indexOf('--model-settings-file'), -1);
  });

  it('NO genera settings file si el playbook no declara temperature', async () => {
    let captured;
    const stubs = makeSettingsStubs();
    const pbNoTemp = {
      ...SAMPLE_PB,
      execution: {
        ...SAMPLE_PB.execution,
        aider: { args: ['--no-stream', '--yes'] }, // sin temperature
      },
    };
    await invokeAider({
      playbook: pbNoTemp, signal: {}, workdir: '/', files: ['/x'],
      model: 'groq/kimi', apiKey: 'k', prompt: 'p',
      _runProcess: async (opts) => {
        captured = opts;
        return { exitCode: 0, stdout: STDOUT_OK, stderr: '', durationMs: 1, timedOut: false, aborted: false };
      },
      ...stubs,
    });
    assert.equal(stubs.calls.writes.length, 0);
    assert.equal(captured.args.indexOf('--model-settings-file'), -1);
  });
});
