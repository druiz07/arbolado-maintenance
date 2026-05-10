import { spawn } from 'node:child_process';
import { AiderTimeoutError } from './errors.js';

export function runProcess({ binPath, args, env, cwd, timeoutMs, abortSignal, _spawn = spawn }) {
  return new Promise((resolve, reject) => {
    if (abortSignal?.aborted) {
      resolve({ exitCode: null, stdout: '', stderr: '', durationMs: 0, timedOut: false, aborted: true });
      return;
    }

    const start = Date.now();
    const child = _spawn(binPath, args, { cwd, env });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let aborted = false;

    child.stdout?.on('data', chunk => { stdout += chunk.toString('utf8'); });
    child.stderr?.on('data', chunk => { stderr += chunk.toString('utf8'); });

    const killAndEscalate = () => {
      try { child.kill('SIGTERM'); } catch (_) {}
      setTimeout(() => {
        try { child.kill('SIGKILL'); } catch (_) {}
      }, 2000).unref?.();
    };

    const timer = setTimeout(() => {
      timedOut = true;
      killAndEscalate();
    }, timeoutMs);
    timer.unref?.();

    const onAbort = () => {
      aborted = true;
      killAndEscalate();
    };
    abortSignal?.addEventListener('abort', onAbort, { once: true });

    child.on('error', err => {
      clearTimeout(timer);
      abortSignal?.removeEventListener('abort', onAbort);
      reject(err);
    });

    child.on('close', code => {
      clearTimeout(timer);
      abortSignal?.removeEventListener('abort', onAbort);
      resolve({
        exitCode: code,
        stdout,
        stderr,
        durationMs: Date.now() - start,
        timedOut,
        aborted,
      });
    });
  });
}

export { AiderTimeoutError };
