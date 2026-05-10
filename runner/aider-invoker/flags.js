const TEMPERATURE_WHITELIST = new Set(['groq', 'gemini', 'openai', 'openrouter']);

export function providerFromModel(model) {
  if (typeof model !== 'string') return null;
  const idx = model.indexOf('/');
  if (idx <= 0) return null;
  const prefix = model.slice(0, idx);
  return TEMPERATURE_WHITELIST.has(prefix) ? prefix : null;
}

export function supportsTemperature(model) {
  return providerFromModel(model) !== null;
}

export function buildAiderArgv({ model, prompt, files, executionAider }) {
  if (!executionAider || !Array.isArray(executionAider.args)) {
    throw new Error('buildAiderArgv: executionAider.args must be an array');
  }

  const argv = [];

  for (const a of executionAider.args) {
    argv.push(...String(a).split(/\s+/).filter(Boolean));
  }

  const has = (flag) => argv.includes(flag);

  if (!has('--no-auto-commits')) argv.push('--no-auto-commits');
  if (!has('--no-dirty-commits')) argv.push('--no-dirty-commits');

  argv.push('--model', model);

  if (
    supportsTemperature(model) &&
    !has('--temperature') &&
    executionAider.temperature !== undefined
  ) {
    argv.push('--temperature', String(executionAider.temperature));
  }

  argv.push('--message', prompt);

  argv.push(...files);

  return argv;
}
