import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = process.cwd();
const npmExecutable = path.join(
  path.dirname(process.execPath),
  process.platform === 'win32' ? 'npm.cmd' : 'npm',
);
const sourcePackage = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const version = requireString(sourcePackage.version, 'package version');
const evidenceRoot = path.join(root, 'test-results', 'package');
await mkdir(evidenceRoot, { recursive: true });
const candidateRoot = await mkdtemp(path.join(evidenceRoot, 'candidate-'));
const packCache = path.join(candidateRoot, '.npm-cache');

const packResult = await execFileAsync(
  npmExecutable,
  ['pack', '--json', '--ignore-scripts', '--pack-destination', candidateRoot],
  { cwd: root, env: npmEnvironment(packCache), maxBuffer: 10 * 1024 * 1024 },
);
const packRecords = JSON.parse(packResult.stdout);
if (!Array.isArray(packRecords) || packRecords.length !== 1) {
  throw new Error('npm pack must return exactly one package record.');
}
const packRecord = packRecords[0];
const filename = requireString(packRecord.filename, 'tarball filename');
const expectedFilename = `testfold-${version}.tgz`;
assert(filename === expectedFilename, `tarball must be named ${expectedFilename}`);
const tarballPath = path.join(candidateRoot, filename);
const tarballBytes = await readFile(tarballPath);
const sha256 = digest('sha256', tarballBytes, 'hex');
const shasum = digest('sha1', tarballBytes, 'hex');
const integrity = `sha512-${digest('sha512', tarballBytes, 'base64')}`;
const tarballStat = await lstat(tarballPath);
assert(packRecord.shasum === shasum, 'npm pack SHA-1 must match candidate bytes');
assert(packRecord.integrity === integrity, 'npm pack integrity must match candidate bytes');
assert(packRecord.size === tarballStat.size, 'npm pack size must match candidate bytes');

const listingResult = await execFileAsync('tar', ['-tf', tarballPath]);
const archiveFiles = listingResult.stdout
  .trim()
  .split(/\r?\n/u)
  .filter((entry) => entry !== '' && !entry.endsWith('/'))
  .sort();
const recordedFiles = requireArray(packRecord.files, 'npm pack files')
  .map((entry) => `package/${requireString(entry.path, 'npm pack file path')}`)
  .sort();
assertEqual(archiveFiles, recordedFiles, 'tar inventory and npm pack inventory');
for (const required of ['package/LICENSE', 'package/README.md', 'package/package.json']) {
  assert(archiveFiles.includes(required), `candidate includes ${required}`);
}
assert(archiveFiles.includes('package/dist/index.js'), 'candidate includes the ESM entry point');
assert(archiveFiles.includes('package/dist/index.d.ts'), 'candidate includes declarations');
assert(archiveFiles.includes('package/dist/cli/index.js'), 'candidate includes the CLI');
for (const file of archiveFiles) {
  assert(
    file === 'package/LICENSE' ||
      file === 'package/README.md' ||
      file === 'package/package.json' ||
      file.startsWith('package/dist/'),
    `candidate contains only public allowlisted files; found ${file}`,
  );
}

const extractedRoot = path.join(candidateRoot, 'extracted');
await mkdir(extractedRoot);
await execFileAsync('tar', ['-xf', tarballPath, '-C', extractedRoot]);
const packageRoot = path.join(extractedRoot, 'package');
for (const file of archiveFiles) {
  const candidate = path.join(extractedRoot, ...file.split('/'));
  const stat = await lstat(candidate);
  assert(stat.isFile(), `candidate entry ${file} is a regular file`);
  assert(!stat.isSymbolicLink(), `candidate entry ${file} is not a symbolic link`);
  assertPublishSafe(await readFile(candidate), file);
}

const manifest = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'));
assert(manifest.name === 'testfold', 'candidate package name is testfold');
assert(manifest.version === version, 'candidate version matches source package');
assert(manifest.license === 'MIT', 'candidate license metadata is MIT');
assert(manifest.engines?.node === '>=22.18.0', 'candidate preserves the Node.js contract');
assert(manifest.publishConfig?.access === 'public', 'candidate is explicitly public');
assert(
  manifest.repository?.url === 'git+https://github.com/witqq/testfold.git',
  'candidate repository identity is canonical',
);
assert(manifest.bin?.testfold === './dist/cli/index.js', 'candidate CLI target is canonical');
assert(manifest.exports?.['.']?.import === './dist/index.js', 'candidate ESM export is canonical');
assert(
  manifest.exports?.['.']?.types === './dist/index.d.ts',
  'candidate type export is canonical',
);
for (const dependencies of [manifest.dependencies, manifest.devDependencies]) {
  for (const value of Object.values(dependencies ?? {})) {
    assert(!/^(?:file|link|workspace):/u.test(String(value)), 'candidate has no local dependency');
  }
}
assert(
  (await readFile(path.join(packageRoot, 'README.md'))).equals(
    await readFile(path.join(root, 'README.md')),
  ),
  'candidate README matches the repository',
);
assert(
  (await readFile(path.join(packageRoot, 'LICENSE'))).equals(
    await readFile(path.join(root, 'LICENSE')),
  ),
  'candidate license matches the repository',
);
const cliPath = path.join(packageRoot, 'dist', 'cli', 'index.js');
assert(
  (await readFile(cliPath, 'utf8')).startsWith('#!/usr/bin/env node\n'),
  'candidate CLI has a shebang',
);
if (process.platform !== 'win32') {
  assert(((await lstat(cliPath)).mode & 0o111) !== 0, 'candidate CLI is executable');
}

const consumerRoot = path.join(root, 'test-results', 'package-consumers');
await mkdir(consumerRoot, { recursive: true });
const consumer = await mkdtemp(path.join(consumerRoot, 'consumer-'));
const consumerCache = path.join(consumer, '.npm-cache');
assert(
  !(await exists(path.join(consumer, 'node_modules'))),
  'consumer starts without node_modules',
);
await assertNoAmbientExecutable();
await writeFile(
  path.join(consumer, 'package.json'),
  `${JSON.stringify({ name: 'testfold-candidate-consumer', private: true, type: 'module' }, null, 2)}\n`,
);
await execFileAsync(
  npmExecutable,
  [
    'install',
    '--ignore-scripts',
    '--package-lock=false',
    '--no-audit',
    '--no-fund',
    '--loglevel=error',
    '--cache',
    consumerCache,
    tarballPath,
  ],
  { cwd: consumer, env: npmEnvironment(consumerCache), timeout: 120_000 },
);
const installedRoot = path.join(consumer, 'node_modules', 'testfold');
const installedManifest = JSON.parse(
  await readFile(path.join(installedRoot, 'package.json'), 'utf8'),
);
assert(installedManifest.name === 'testfold', 'installed package name is canonical');
assert(installedManifest.version === version, 'installed package version matches the candidate');
const shim = path.join(
  consumer,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'testfold.cmd' : 'testfold',
);
if (process.platform !== 'win32') {
  assert(
    (await realpath(shim)) === path.join(installedRoot, 'dist', 'cli', 'index.js'),
    'installed CLI shim resolves inside the candidate package',
  );
}
const versionResult = await execFileAsync(shim, ['--version'], { cwd: consumer });
assert(
  versionResult.stdout.trim() === `testfold v${version}`,
  'installed CLI reports candidate version',
);
const helpResult = await execFileAsync(shim, ['--help'], { cwd: consumer });
assert(helpResult.stdout.includes('Usage:'), 'installed CLI provides help');
const importResult = await execFileAsync(
  process.execPath,
  [
    '--input-type=module',
    '-e',
    "import { TestRunner, defineConfig } from 'testfold'; const config=defineConfig({artifactsDir:'./results',suites:[{name:'unit',type:'jest',command:'echo',resultFile:'unit.json'}]}); console.log(JSON.stringify({runner:typeof TestRunner,configured:config.suites[0].name}));",
  ],
  { cwd: consumer },
);
assert(
  importResult.stdout.trim() === '{"runner":"function","configured":"unit"}',
  'installed ESM API executes from candidate bytes',
);
await writeFile(
  path.join(consumer, 'contract.ts'),
  [
    "import { TestRunner, defineConfig, type Config, type Reporter } from 'testfold';",
    "const config: Config = defineConfig({ artifactsDir: './results', suites: [{ name: 'unit', type: 'jest', command: 'echo', resultFile: 'unit.json' }] });",
    'declare const reporter: Reporter;',
    'const runner = new TestRunner(config);',
    'void reporter;',
    'void runner;',
  ].join('\n'),
);
await writeFile(
  path.join(consumer, 'tsconfig.json'),
  `${JSON.stringify(
    {
      compilerOptions: {
        strict: true,
        noEmit: true,
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        target: 'ES2022',
        skipLibCheck: true,
      },
      include: ['contract.ts'],
    },
    null,
    2,
  )}\n`,
);
await execFileAsync(
  process.execPath,
  [path.join(root, 'node_modules', 'typescript', 'bin', 'tsc')],
  { cwd: consumer },
);

const sourceRevision = (
  await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: root })
).stdout.trim();
const sourceDirty =
  (await execFileAsync('git', ['status', '--porcelain'], { cwd: root })).stdout.trim() !== '';
const evidence = {
  package: { name: 'testfold', version, repository: manifest.repository.url },
  sourceRevision,
  sourceDirty,
  tarball: {
    path: tarballPath,
    filename,
    sha256,
    shasum,
    integrity,
    size: tarballStat.size,
  },
  inventory: archiveFiles,
  consumer: {
    packageRoot: installedRoot,
    executable: shim,
    version: versionResult.stdout.trim(),
    esm: true,
    types: true,
  },
};
await writeFile(
  path.join(candidateRoot, 'candidate-evidence.json'),
  `${JSON.stringify(evidence, null, 2)}\n`,
);
await writeFile(
  path.join(evidenceRoot, 'candidate-evidence.json'),
  `${JSON.stringify(evidence, null, 2)}\n`,
);
console.log(JSON.stringify({ candidate: tarballPath, sha256, version }));

function npmEnvironment(cache) {
  return {
    ...process.env,
    CI: 'true',
    NO_COLOR: '1',
    npm_config_cache: cache,
    npm_config_update_notifier: 'false',
  };
}

async function assertNoAmbientExecutable() {
  const names =
    process.platform === 'win32' ? ['testfold.cmd', 'testfold.exe', 'testfold.bat'] : ['testfold'];
  const directories = [path.dirname(process.execPath), '/usr/local/bin', '/usr/bin', '/bin'];
  for (const directory of new Set(directories)) {
    for (const name of names) {
      assert(
        !(await exists(path.join(directory, name))),
        `ambient executable is absent: ${path.join(directory, name)}`,
      );
    }
  }
}

function assertPublishSafe(bytes, file) {
  assert(!bytes.includes(0), `candidate text file ${file} has no NUL bytes`);
  const text = bytes.toString('utf8');
  const forbidden = [
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
    /(?:^|\n)\s*(?:NPM_TOKEN|NODE_AUTH_TOKEN|_authToken)\s*[:=]/u,
    /\b(?:ghp|github_pat|npm)_[A-Za-z0-9_-]{20,}\b/u,
    /\/(?:Users|home)\/[A-Za-z0-9._-]+\//u,
    /(?:^|\/)moira-ws(?:\/|$)/u,
    /(?:^|\/)agent_temp_files_local(?:\/|$)/u,
  ];
  for (const pattern of forbidden) {
    assert(!pattern.test(text), `candidate file ${file} is free of ${pattern}`);
  }
}

function digest(algorithm, bytes, encoding) {
  return createHash(algorithm).update(bytes).digest(encoding);
}

async function exists(candidate) {
  try {
    await lstat(candidate);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  }
}

function requireString(value, label) {
  if (typeof value !== 'string' || value === '') throw new Error(`${label} must be a string.`);
  return value;
}

function requireArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value;
}

function assertEqual(actual, expected, label) {
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${label} must match exactly`);
}

function assert(condition, message) {
  if (!condition) throw new Error(`Package check failed: ${message}.`);
}
