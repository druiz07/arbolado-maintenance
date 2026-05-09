const FORBIDDEN_CHARS = /[?[\]{}]/;
const TRAVERSAL = /(^|\/)\.\.(\/|$)/;

export function isValidGlob(pattern) {
  if (typeof pattern !== 'string' || pattern.length === 0) return false;
  if (FORBIDDEN_CHARS.test(pattern)) return false;
  if (TRAVERSAL.test(pattern)) return false;
  return true;
}

export function matchesGlob(pattern, path) {
  if (!isValidGlob(pattern)) return false;
  const re = globToRegExp(pattern);
  return re.test(path);
}

function globToRegExp(pattern) {
  let src = '';
  let i = 0;
  while (i < pattern.length) {
    if (pattern.startsWith('**/', i)) {
      src += '(?:.*/)?';
      i += 3;
    } else if (pattern[i] === '*' && pattern[i + 1] === '*') {
      src += '.*';
      i += 2;
    } else if (pattern[i] === '*') {
      src += '[^/]*';
      i += 1;
    } else if ('.+^$()|\\'.includes(pattern[i])) {
      src += '\\' + pattern[i];
      i += 1;
    } else {
      src += pattern[i];
      i += 1;
    }
  }
  return new RegExp('^' + src + '$');
}
