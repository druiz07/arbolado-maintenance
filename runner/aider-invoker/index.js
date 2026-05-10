import { buildAiderArgv, providerFromModel } from './flags.js';
import { extractDiff, extractFilesEdited, hasValidDiff } from './parser.js';
import { runProcess } from './runtime.js';

const PROVIDER_ENV = {
  groq: 'GROQ_API_KEY',
  gemini: 'GEMINI_API_KEY',
  openai: 'OPENAI_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
};

export async function invokeAider({
  playbook,
  signal,
  workdir,
  files,
  model,
  apiKey,
  prompt,
  aiderBinPath = 'aider',
  timeoutMs = 120_000,
  signal_abort,
  _runProcess = runProcess,
}) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('invokeAider: files must be non-empty array');
  }
  if (typeof model !== 'string' || model.length === 0) {
    throw new Error('invokeAider: model required');
  }
  if (!playbook?.execution?.aider) {
    throw new Error(
      'invokeAider: playbook.execution.aider is null (playbook does not use aider). ' +
      'Caller must branch to execution.git_revert or execution.format_steps.'
    );
  }

  const provider = providerFromModel(model);
  const envVar = provider ? PROVIDER_ENV[provider] : null;
  const childEnv = {
    ...process.env,
    NO_COLOR: '1',
    PYTHONUNBUFFERED: '1',
  };
  if (envVar && apiKey) childEnv[envVar] = apiKey;

  const argv = buildAiderArgv({
    model,
    prompt,
    files,
    executionAider: playbook.execution.aider,
  });

  const r = await _runProcess({
    binPath: aiderBinPath,
    args: argv,
    env: childEnv,
    cwd: workdir,
    timeoutMs,
    abortSignal: signal_abort,
  });

  const diff = extractDiff(r.stdout);
  const filesEdited = extractFilesEdited(r.stdout);
  const validDiff = hasValidDiff(r.stdout);

  let errorClass = null;
  if (r.timedOut) errorClass = 'timeout';
  else if (r.aborted) errorClass = 'process';
  else if (r.exitCode !== 0) errorClass = 'process';
  else if (!validDiff) errorClass = 'no_diff';

  return {
    exitCode: r.exitCode,
    durationMs: r.durationMs,
    diff,
    stdout: r.stdout,
    stderr: r.stderr,
    filesEdited,
    modelUsed: model,
    errorClass,
  };
}
