import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { jest } from '@jest/globals';
import { TestRunner } from '../../../src/core/runner.js';
import { Orchestrator } from '../../../src/core/orchestrator.js';
import type { Config } from '../../../src/config/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('TestRunner', () => {
  const tempDir = resolve(__dirname, '../../fixtures/temp-runner');
  const successFixture = resolve(__dirname, '../../fixtures/jest/success.json');

  beforeAll(async () => {
    await mkdir(tempDir, { recursive: true });
  });

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('reporter override', () => {
    it('should use reporter from options when provided', async () => {
      // Create a valid Jest result file
      const resultFile = resolve(tempDir, 'jest-result.json');
      await writeFile(
        resultFile,
        JSON.stringify({
          numPassedTests: 1,
          numFailedTests: 0,
          numPendingTests: 0,
          numTotalTests: 1,
          success: true,
          testResults: [
            {
              name: '/test/file.test.ts',
              status: 'passed',
              message: '',
              startTime: 0,
              endTime: 100,
              assertionResults: [
                {
                  ancestorTitles: ['Suite'],
                  title: 'test',
                  status: 'passed',
                  duration: 100,
                  failureMessages: [],
                },
              ],
            },
          ],
        }),
      );

      const config: Config = {
        suites: [
          {
            name: 'test-suite',
            type: 'jest',
            command: `node -e "require('node:fs').copyFileSync('${successFixture}', '${resultFile}')" --`,
            resultFile: 'jest-result.json',
          },
        ],
        artifactsDir: tempDir,
        reporters: ['console', 'markdown-failures'], // Config has multiple reporters
      };

      const runner = new TestRunner(config, __dirname);

      // Override with single JSON reporter
      const results = await runner.run(undefined, {
        reporter: ['json'],
        cwd: __dirname,
      });

      // Check that JSON reporter created summary.json
      const summaryPath = resolve(tempDir, '../summary.json');
      const summaryExists = await readFile(summaryPath, 'utf-8')
        .then(() => true)
        .catch(() => false);

      expect(summaryExists).toBe(true);
      expect(results.success).toBe(true);
    });
  });

  describe('passThrough arguments', () => {
    it('should pass arguments through to test command', async () => {
      // Create a result file
      const resultFile = resolve(tempDir, 'passthrough-result.json');
      await writeFile(
        resultFile,
        JSON.stringify({
          numPassedTests: 1,
          numFailedTests: 0,
          numPendingTests: 0,
          numTotalTests: 1,
          success: true,
          testResults: [
            {
              name: '/test/file.test.ts',
              status: 'passed',
              message: '',
              startTime: 0,
              endTime: 100,
              assertionResults: [
                {
                  ancestorTitles: [],
                  title: 'test',
                  status: 'passed',
                  duration: 100,
                  failureMessages: [],
                },
              ],
            },
          ],
        }),
      );

      const config: Config = {
        suites: [
          {
            name: 'test-suite',
            type: 'jest',
            command: `node -e "require('node:fs').copyFileSync('${successFixture}', '${resultFile}')" --`,
            resultFile: 'passthrough-result.json',
          },
        ],
        artifactsDir: tempDir,
        reporters: ['console'],
      };

      const runner = new TestRunner(config, __dirname);

      const results = await runner.run(undefined, {
        passThrough: ['--verbose', '--coverage'],
        cwd: __dirname,
      });

      expect(results.success).toBe(true);
      expect(results.totals.passed).toBe(5);
    });
  });

  describe('CLI execution policy overrides', () => {
    it('applies explicit parallel and fail-fast overrides without mutating the runner config', async () => {
      const config: Config = {
        suites: [{ name: 'test-suite', type: 'jest', command: 'unused', resultFile: 'unused.json' }],
        artifactsDir: tempDir,
        parallel: true,
        failFast: false,
        reporters: [],
      };
      const runner = new TestRunner(config, __dirname);
      let observed: { parallel: boolean; failFast: boolean } | undefined;
      const run = jest.spyOn(Orchestrator.prototype, 'run').mockImplementation(async function () {
        observed = (this as unknown as { config: { parallel: boolean; failFast: boolean } }).config;
        return {} as never;
      });
      try {
        await runner.run(undefined, { parallel: false, failFast: true });
        expect(observed).toEqual(expect.objectContaining({ parallel: false, failFast: true }));

        observed = undefined;
        await runner.run();
        expect(observed).toEqual(expect.objectContaining({ parallel: true, failFast: false }));
      } finally {
        run.mockRestore();
      }
    });
  });
});
