import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { TestRunner } from '../../../src/core/runner.js';
import type { Config } from '../../../src/config/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('TestRunner', () => {
  const tempDir = resolve(__dirname, '../../fixtures/temp-runner');

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
            command: 'echo "test"',
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
            command: 'echo',
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

      // Should run successfully with pass-through args
      expect(results).toBeDefined();
    });
  });
});
