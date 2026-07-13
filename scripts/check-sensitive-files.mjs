import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const excludedDirectories = new Set(['.git', '.private', 'coverage', 'dist', 'node_modules']);
const environmentFileName = /^\.env(?:\..+)?$/i;
const forbiddenNames = [/private[-_.]?key/i, /wallet[-_.]?(?:addresses?|export)/i];
const allowedNames = new Set(['.env.example']);
const forbiddenContents = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\b(?:mnemonic|private_key|secret_key)\s*=\s*(?!example|placeholder|change-me)[^\s#]+/i,
];

const violations = [];
const execFileAsync = promisify(execFile);
let trackedFiles = new Set();

try {
  const { stdout } = await execFileAsync('git', ['ls-files', '-z'], { encoding: 'utf8' });
  trackedFiles = new Set(stdout.split('\0').filter(Boolean));
} catch {
  // The content checks still run outside a Git checkout.
}

async function scan(directory) {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;

    const absolutePath = path.join(directory, entry.name);
    const relativePath = path.relative(process.cwd(), absolutePath);

    if (entry.isDirectory()) {
      await scan(absolutePath);
      continue;
    }

    if (!entry.isFile()) continue;

    if (!allowedNames.has(entry.name) && environmentFileName.test(entry.name)) {
      if (trackedFiles.has(relativePath)) {
        violations.push(`${relativePath}: local environment file is tracked by Git`);
      }
      continue;
    }

    if (
      !allowedNames.has(entry.name) &&
      forbiddenNames.some((pattern) => pattern.test(entry.name))
    ) {
      violations.push(`${relativePath}: forbidden sensitive filename`);
      continue;
    }

    const contents = await readFile(absolutePath, 'utf8').catch(() => '');
    if (forbiddenContents.some((pattern) => pattern.test(contents))) {
      violations.push(`${relativePath}: possible secret material`);
    }
  }
}

await scan(process.cwd());

if (violations.length > 0) {
  console.error(`Sensitive-file check failed:\n- ${violations.join('\n- ')}`);
  process.exitCode = 1;
} else {
  console.info('Sensitive-file check passed.');
}
