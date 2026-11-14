import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const failures = [];
const licensePath = join(root, 'LICENSE');
const license = existsSync(licensePath) ? readFileSync(licensePath, 'utf8') : '';
if (!/^MIT License\r?\n\r?\nCopyright \(c\) \d{4} \S/.test(license) ||
    !license.includes('to permit persons to whom the Software is') ||
    !license.includes('copies or substantial portions of the Software.') ||
    !license.includes('SOFTWARE.')) {
  failures.push('LICENSE: missing MIT notice, permission terms, or disclaimer');
}

function markdownFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return markdownFiles(path);
    return entry.isFile() && entry.name.endsWith('.md') ? [path] : [];
  });
}

const docs = [join(root, 'README.md'), ...markdownFiles(join(root, 'docs'))];
for (const file of docs) {
  let fence;
  for (const [index, line] of readFileSync(file, 'utf8').split(/\r?\n/).entries()) {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = undefined;
      continue;
    }
    if (fence) continue;
    for (const [, target] of line.matchAll(/\[[^\]]*\]\(([^\s)]+)\)/g)) {
      if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(target)) continue;
      const path = decodeURIComponent(target.split(/[?#]/, 1)[0]);
      if (!existsSync(resolve(dirname(file), path))) {
        failures.push(`${relative(root, file)}:${index + 1}: missing link target ${target}`);
      }
    }
  }
  if (fence) failures.push(`${relative(root, file)}: unclosed code fence`);
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Checked the MIT license and ${docs.length} Markdown files.`);
}
