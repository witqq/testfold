import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

describe('loadConfig', () => {
  const tempRoot = join(process.cwd(), 'claude-temp-files', 'config-loader-test');

  beforeEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
    await mkdir(tempRoot, { recursive: true });
  });

  afterAll(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it('loads a TypeScript config through the published runtime', async () => {
    const configPath = join(tempRoot, 'test-runner.config.ts');
    await writeFile(
      configPath,
      `
      type SuiteName = 'Unit';
      export default {
        artifactsDir: './test-results',
        suites: [{ name: 'Unit' as SuiteName, type: 'jest', command: 'true', resultFile: 'unit.json' }],
      };
    `,
    );

    const script = `
      const { loadConfig } = await import(${JSON.stringify(new URL('../../../dist/config/loader.js', import.meta.url).href)});
      const config = await loadConfig(${JSON.stringify(configPath)});
      process.stdout.write(JSON.stringify(config));
    `;
    const { stdout } = await execFileAsync(process.execPath, [
      '--input-type=module',
      '--eval',
      script,
    ]);
    expect(JSON.parse(stdout)).toEqual(
      expect.objectContaining({
        artifactsDir: './test-results',
        suites: [expect.objectContaining({ name: 'Unit', type: 'jest' })],
      }),
    );
  });
});
