import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildAiderArgv, providerFromModel, supportsTemperature } from './flags.js';

describe('providerFromModel', () => {
  it('reconoce groq/, gemini/, openai/, openrouter/', () => {
    assert.equal(providerFromModel('groq/moonshotai/kimi-k2-instruct'), 'groq');
    assert.equal(providerFromModel('gemini/gemini-2.0-flash-exp'), 'gemini');
    assert.equal(providerFromModel('openai/gpt-4o'), 'openai');
    assert.equal(providerFromModel('openrouter/anthropic/claude-3'), 'openrouter');
  });

  it('null para prefijo desconocido', () => {
    assert.equal(providerFromModel('unknown/foo'), null);
  });
});

describe('supportsTemperature', () => {
  it('true para providers whitelisted', () => {
    assert.equal(supportsTemperature('groq/foo'), true);
    assert.equal(supportsTemperature('gemini/foo'), true);
    assert.equal(supportsTemperature('openai/foo'), true);
    assert.equal(supportsTemperature('openrouter/foo'), true);
  });

  it('false para provider desconocido', () => {
    assert.equal(supportsTemperature('mistral/foo'), false);
  });
});

describe('buildAiderArgv — desde execution.aider real', () => {
  const baseArgs = {
    model: 'groq/moonshotai/kimi-k2-instruct',
    prompt: 'Bump jest',
    files: ['/tmp/sandbox/package.json'],
    executionAider: {
      args: ['--no-stream', '--yes', '--map-tokens 0', '--edit-format diff'],
      temperature: 0.1,
      prompt: 'unused — el invoker recibe el prompt ya renderizado del caller',
    },
  };

  it('expande args con espacios (--map-tokens 0 → --map-tokens, 0)', () => {
    const argv = buildAiderArgv(baseArgs);
    const i = argv.indexOf('--map-tokens');
    assert.notEqual(i, -1);
    assert.equal(argv[i + 1], '0');
  });

  it('preserva flags del playbook (no los reescribe ni los duplica)', () => {
    const argv = buildAiderArgv(baseArgs);
    assert.ok(argv.includes('--no-stream'));
    assert.ok(argv.includes('--yes'));
    assert.ok(argv.includes('--edit-format'));
    assert.ok(argv.includes('diff'));
    assert.equal(argv.filter(a => a === '--no-stream').length, 1);
  });

  it('añade --no-auto-commits y --no-dirty-commits si no estaban', () => {
    const argv = buildAiderArgv(baseArgs);
    assert.ok(argv.includes('--no-auto-commits'));
    assert.ok(argv.includes('--no-dirty-commits'));
  });

  it('NO duplica --no-auto-commits si el playbook ya lo trae', () => {
    const argv = buildAiderArgv({
      ...baseArgs,
      executionAider: {
        ...baseArgs.executionAider,
        args: [...baseArgs.executionAider.args, '--no-auto-commits'],
      },
    });
    assert.equal(argv.filter(a => a === '--no-auto-commits').length, 1);
  });

  it('incluye --model y --message', () => {
    const argv = buildAiderArgv(baseArgs);
    const modelIdx = argv.indexOf('--model');
    const msgIdx = argv.indexOf('--message');
    assert.equal(argv[modelIdx + 1], baseArgs.model);
    assert.equal(argv[msgIdx + 1], baseArgs.prompt);
  });

  it('incluye --temperature 0.1 si provider está en whitelist', () => {
    const argv = buildAiderArgv(baseArgs);
    const tIdx = argv.indexOf('--temperature');
    assert.notEqual(tIdx, -1);
    assert.equal(argv[tIdx + 1], '0.1');
  });

  it('NO incluye --temperature si provider desconocido', () => {
    const argv = buildAiderArgv({ ...baseArgs, model: 'mistral/foo' });
    assert.equal(argv.indexOf('--temperature'), -1);
  });

  it('NO duplica --temperature si el playbook ya lo trae', () => {
    const argv = buildAiderArgv({
      ...baseArgs,
      executionAider: {
        ...baseArgs.executionAider,
        args: [...baseArgs.executionAider.args, '--temperature', '0.5'],
      },
    });
    assert.equal(argv.filter(a => a === '--temperature').length, 1);
    const i = argv.indexOf('--temperature');
    assert.equal(argv[i + 1], '0.5');
  });

  it('archivos van al final del argv', () => {
    const argv = buildAiderArgv({ ...baseArgs, files: ['/a/b.js', '/c/d.js'] });
    assert.equal(argv[argv.length - 2], '/a/b.js');
    assert.equal(argv[argv.length - 1], '/c/d.js');
  });

  it('NO incluye API key bajo ningún concepto', () => {
    const argv = buildAiderArgv({ ...baseArgs, apiKey: 'sk-secretkey-12345' });
    assert.ok(!argv.some(a => a.includes('sk-secretkey-12345')));
    assert.ok(!argv.some(a => a.includes('apiKey')));
  });

  it('rechaza si executionAider falta o args no es array', () => {
    assert.throws(
      () => buildAiderArgv({ ...baseArgs, executionAider: null }),
      /executionAider/,
    );
    assert.throws(
      () => buildAiderArgv({ ...baseArgs, executionAider: { args: 'not-an-array' } }),
      /args.*array/,
    );
  });
});
