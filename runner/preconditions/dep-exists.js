// Precondition: la dependencia objetivo del signal DEBE existir en package.json
// en la sección correspondiente (devDependencies para dep_type=dev, dependencies
// para runtime) ANTES de invocar Aider. Sin esto Aider añade la dep nueva en
// lugar de bumpearla (TD-1).
//
// Por qué precondición y no sólo prompt: el LLM puede regresionar; una check
// AST es determinística e idempotente.

const SECTION_BY_TYPE = {
  dev: 'devDependencies',
  runtime: 'dependencies',
};

/**
 * @param {object} args
 * @param {object} args.packageJson — package.json parseado
 * @param {string} args.depName — nombre de la dependencia (e.g., 'eslint')
 * @param {'dev'|'runtime'} args.depType
 * @returns {{ok:boolean, reason:'present'|'not_in_package_json'|'wrong_section', foundIn:string|null}}
 */
export function checkDepExists({ packageJson, depName, depType }) {
  if (!packageJson || typeof packageJson !== 'object' || Array.isArray(packageJson)) {
    throw new Error('packageJson must be a plain object');
  }
  if (typeof depName !== 'string' || depName.length === 0) {
    throw new Error('depName must be a non-empty string');
  }
  const expectedSection = SECTION_BY_TYPE[depType];
  if (!expectedSection) {
    throw new Error("depType must be 'dev' or 'runtime'");
  }

  const expected = packageJson[expectedSection] ?? {};
  if (Object.prototype.hasOwnProperty.call(expected, depName)) {
    return { ok: true, reason: 'present', foundIn: expectedSection };
  }

  const otherSection = expectedSection === 'devDependencies' ? 'dependencies' : 'devDependencies';
  const other = packageJson[otherSection] ?? {};
  if (Object.prototype.hasOwnProperty.call(other, depName)) {
    return { ok: false, reason: 'wrong_section', foundIn: otherSection };
  }

  return { ok: false, reason: 'not_in_package_json', foundIn: null };
}
