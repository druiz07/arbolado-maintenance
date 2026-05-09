// parsePackageJsonDiff — convierte before/after JSON a operaciones semánticas.
// Spec: docs/auto-maintenance/policy-engine-spec.md §"Función 1"

const SECTIONS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
];

function diffLineCount(beforeStr, afterStr) {
  const a = beforeStr.split('\n');
  const b = afterStr.split('\n');
  const aSet = new Map();
  for (const line of a) aSet.set(line, (aSet.get(line) ?? 0) + 1);
  let removed = 0;
  for (const line of b) {
    const remaining = aSet.get(line) ?? 0;
    if (remaining > 0) aSet.set(line, remaining - 1);
  }
  for (const count of aSet.values()) removed += count;
  let added = b.length;
  const aMap = new Map();
  for (const line of a) aMap.set(line, (aMap.get(line) ?? 0) + 1);
  for (const line of b) {
    const remaining = aMap.get(line) ?? 0;
    if (remaining > 0) {
      aMap.set(line, remaining - 1);
      added--;
    }
  }
  return removed + added;
}

export function parsePackageJsonDiff(beforeStr, afterStr) {
  let before;
  let after;
  try {
    before = JSON.parse(beforeStr);
  } catch (err) {
    throw new PolicyEngineMalformedJsonError('before', err.message);
  }
  try {
    after = JSON.parse(afterStr);
  } catch (err) {
    throw new PolicyEngineMalformedJsonError('after', err.message);
  }

  const dependencyChanges = [];

  for (const section of SECTIONS) {
    const b = before[section] || {};
    const a = after[section] || {};
    const allDeps = new Set([...Object.keys(b), ...Object.keys(a)]);

    for (const dep of allDeps) {
      const oldRange = Object.prototype.hasOwnProperty.call(b, dep) ? b[dep] : null;
      const newRange = Object.prototype.hasOwnProperty.call(a, dep) ? a[dep] : null;
      if (oldRange === newRange) continue;

      let changeType;
      if (oldRange === null) changeType = 'added';
      else if (newRange === null) changeType = 'removed';
      else changeType = 'updated';

      dependencyChanges.push({ name: dep, section, oldRange, newRange, changeType });
    }
  }

  const scriptChanges = [];
  const bScripts = before.scripts || {};
  const aScripts = after.scripts || {};
  const allScripts = new Set([...Object.keys(bScripts), ...Object.keys(aScripts)]);
  for (const s of allScripts) {
    const oldValue = Object.prototype.hasOwnProperty.call(bScripts, s) ? bScripts[s] : null;
    const newValue = Object.prototype.hasOwnProperty.call(aScripts, s) ? aScripts[s] : null;
    if (oldValue !== newValue) scriptChanges.push({ name: s, oldValue, newValue });
  }

  const enginesChanged =
    JSON.stringify(before.engines || {}) !== JSON.stringify(after.engines || {});

  return {
    dependencyChanges,
    scriptChanges,
    enginesChanged,
    rawDiffLines: diffLineCount(beforeStr, afterStr),
  };
}

export class PolicyEngineMalformedJsonError extends Error {
  constructor(side, parserMessage) {
    super(`malformed_json:${side}:${parserMessage}`);
    this.name = 'PolicyEngineMalformedJsonError';
    this.side = side;
  }
}
