import { chmod, lstat } from 'node:fs/promises';
import { URL } from 'node:url';

const cli = new URL('../dist/cli/index.js', import.meta.url);
await chmod(cli, 0o755);

if (process.platform !== 'win32' && ((await lstat(cli)).mode & 0o111) === 0) {
  throw new Error('Built Testfold CLI must be executable.');
}
