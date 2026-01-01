import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { Orchestrator } from '../../../src/core/orchestrator.js';
import type { ValidatedConfig } from '../../../src/config/schema.js';
import type { Reporter } from '../../../src/reporters/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Simple no-op reporter for testing
const createNoopReporter = (): Reporter => ({
  onStart: () => {},
  onSuiteComplete: () => {},
  onComplete: async () => {},
});

describe('Orchestrator', () => {
  const tempDir = resolve(__dirname, '../../fixtures/temp-orchestrator');

  beforeAll(async () => {
    await mkdir(tempDir, { recursive: true });
  });

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('graceful error recovery', () => {
    it('should handle corrupted JSON result file gracefully', async () => {
      // Create a corrupted JSON file
      const resultFile = resolve(tempDir, 'corrupted.json');
      const logFile = resolve(tempDir, 'corrupted.log');
      await writeFile(resultFile, '{ invalid json }}}');
      await writeFile(logFile, 'Some log content');

      const mockReporter = createNoopReporter();

      const config: ValidatedConfig = {
        suites: [
          {
            name: 'test-suite',
            type: 'jest',
            command: 'echo "test"',
            resultFile: 'corrupted.json',
          },
        ],
        artifactsDir: tempDir,
        parallel: false,
        failFast: false,
      };

      const orchestrator = new Orchestrator({
        config,
        reporters: [mockReporter],
        cwd: __dirname,
      });

      // Should not throw, should return result with parse error
      const results = await orchestrator.run();

      expect(results.suites).toHaveLength(1);
      expect(results.suites[0]?.failed).toBe(1);
      expect(results.suites[0]?.success).toBe(false);
      expect(results.suites[0]?.failures).toHaveLength(1);
      expect(results.suites[0]?.failures[0]?.testName).toBe('Result Parse Error');
    });

    it('should report partial results from failed test runs', async () => {
      // Create a valid JSON file with partial results
      const resultFile = resolve(tempDir, 'partial.json');
      const logFile = resolve(tempDir, 'partial.log');

      const partialResults = {
        numPassedTests: 3,
        numFailedTests: 2,
        numPendingTests: 1,
        numTotalTests: 6,
        success: false,
        testResults: [
          {
            name: '/test/file.test.ts',
            status: 'passed',
            message: '',
            startTime: 0,
            endTime: 1000,
            assertionResults: [
              {
                ancestorTitles: ['Suite'],
                title: 'passed test 1',
                status: 'passed',
                duration: 100,
                failureMessages: [],
              },
              {
                ancestorTitles: ['Suite'],
                title: 'passed test 2',
                status: 'passed',
                duration: 100,
                failureMessages: [],
              },
              {
                ancestorTitles: ['Suite'],
                title: 'passed test 3',
                status: 'passed',
                duration: 100,
                failureMessages: [],
              },
              {
                ancestorTitles: ['Suite'],
                title: 'failed test 1',
                status: 'failed',
                duration: 100,
                failureMessages: ['Error: expected true to be false'],
              },
              {
                ancestorTitles: ['Suite'],
                title: 'failed test 2',
                status: 'failed',
                duration: 100,
                failureMessages: ['Error: another error'],
              },
              {
                ancestorTitles: ['Suite'],
                title: 'skipped test',
                status: 'pending',
                duration: 0,
                failureMessages: [],
              },
            ],
          },
        ],
      };

      await writeFile(resultFile, JSON.stringify(partialResults));
      await writeFile(logFile, 'Test log content');

      const mockReporter = createNoopReporter();

      const config: ValidatedConfig = {
        suites: [
          {
            name: 'partial-suite',
            type: 'jest',
            command: 'echo "test"',
            resultFile: 'partial.json',
          },
        ],
        artifactsDir: tempDir,
        parallel: false,
        failFast: false,
      };

      const orchestrator = new Orchestrator({
        config,
        reporters: [mockReporter],
        cwd: __dirname,
      });

      const results = await orchestrator.run();

      // Should report partial results correctly
      expect(results.suites[0]?.passed).toBe(3);
      expect(results.suites[0]?.failed).toBe(2);
      expect(results.suites[0]?.skipped).toBe(1);
      expect(results.suites[0]?.success).toBe(false);
      expect(results.suites[0]?.failures).toHaveLength(2);
    });

    it('should handle empty result file gracefully', async () => {
      const resultFile = resolve(tempDir, 'empty.json');
      const logFile = resolve(tempDir, 'empty.log');
      await writeFile(resultFile, '');
      await writeFile(logFile, 'Empty test log');

      const mockReporter = createNoopReporter();

      const config: ValidatedConfig = {
        suites: [
          {
            name: 'empty-suite',
            type: 'jest',
            command: 'echo "test"',
            resultFile: 'empty.json',
          },
        ],
        artifactsDir: tempDir,
        parallel: false,
        failFast: false,
      };

      const orchestrator = new Orchestrator({
        config,
        reporters: [mockReporter],
        cwd: __dirname,
      });

      const results = await orchestrator.run();

      // Should handle gracefully with parse error
      expect(results.suites).toHaveLength(1);
      expect(results.suites[0]?.failed).toBe(1);
      expect(results.suites[0]?.failures[0]?.testName).toBe('Result Parse Error');
    });

    it('should determine success from test results, not exit code', async () => {
      // Valid results file with all tests passed
      const resultFile = resolve(tempDir, 'success.json');
      const logFile = resolve(tempDir, 'success.log');

      const successResults = {
        numPassedTests: 5,
        numFailedTests: 0,
        numPendingTests: 0,
        numTotalTests: 5,
        success: true,
        testResults: [
          {
            name: '/test/file.test.ts',
            status: 'passed',
            message: '',
            startTime: 0,
            endTime: 1000,
            assertionResults: [
              {
                ancestorTitles: ['Suite'],
                title: 'test 1',
                status: 'passed',
                duration: 100,
                failureMessages: [],
              },
              {
                ancestorTitles: ['Suite'],
                title: 'test 2',
                status: 'passed',
                duration: 100,
                failureMessages: [],
              },
              {
                ancestorTitles: ['Suite'],
                title: 'test 3',
                status: 'passed',
                duration: 100,
                failureMessages: [],
              },
              {
                ancestorTitles: ['Suite'],
                title: 'test 4',
                status: 'passed',
                duration: 100,
                failureMessages: [],
              },
              {
                ancestorTitles: ['Suite'],
                title: 'test 5',
                status: 'passed',
                duration: 100,
                failureMessages: [],
              },
            ],
          },
        ],
      };

      await writeFile(resultFile, JSON.stringify(successResults));
      await writeFile(logFile, 'Success log');

      const mockReporter = createNoopReporter();

      const config: ValidatedConfig = {
        suites: [
          {
            name: 'success-suite',
            type: 'jest',
            command: 'echo "test"',
            resultFile: 'success.json',
          },
        ],
        artifactsDir: tempDir,
        parallel: false,
        failFast: false,
      };

      const orchestrator = new Orchestrator({
        config,
        reporters: [mockReporter],
        cwd: __dirname,
      });

      const results = await orchestrator.run();

      // Even though executor might return non-zero, success is determined by test results
      expect(results.suites[0]?.passed).toBe(5);
      expect(results.suites[0]?.failed).toBe(0);
      expect(results.suites[0]?.success).toBe(true);
    });
  });

  describe('custom parser', () => {
    it('should use custom parser when type is "custom"', async () => {
      const resultFile = resolve(tempDir, 'custom-result.json');
      const logFile = resolve(tempDir, 'custom-result.log');
      await writeFile(resultFile, '{}'); // Custom parser ignores this
      await writeFile(logFile, 'Log');

      const mockReporter = createNoopReporter();

      // Path to valid custom parser fixture
      const customParserPath = resolve(
        __dirname,
        '../../fixtures/custom-parsers/valid-class.ts',
      );

      const config: ValidatedConfig = {
        suites: [
          {
            name: 'custom-suite',
            type: 'custom',
            command: 'echo "test"',
            resultFile: 'custom-result.json',
            parser: customParserPath,
          },
        ],
        artifactsDir: tempDir,
        parallel: false,
        failFast: false,
      };

      const orchestrator = new Orchestrator({
        config,
        reporters: [mockReporter],
        cwd: __dirname,
      });

      const results = await orchestrator.run();

      // Results from valid-class.ts custom parser
      expect(results.suites[0]?.passed).toBe(5);
      expect(results.suites[0]?.failed).toBe(1);
      expect(results.suites[0]?.skipped).toBe(2);
      expect(results.suites[0]?.failures[0]?.error).toContain(
        'Test error from custom parser',
      );
    });

    it('should throw error when custom type has no parser path', async () => {
      const mockReporter = createNoopReporter();

      const config: ValidatedConfig = {
        suites: [
          {
            name: 'no-parser-suite',
            type: 'custom',
            command: 'echo "test"',
            resultFile: 'result.json',
            // No parser specified
          },
        ],
        artifactsDir: tempDir,
        parallel: false,
        failFast: false,
      };

      const orchestrator = new Orchestrator({
        config,
        reporters: [mockReporter],
        cwd: __dirname,
      });

      // Should handle gracefully through error recovery
      const results = await orchestrator.run();
      expect(results.suites[0]?.failed).toBe(1);
      expect(results.suites[0]?.failures[0]?.error).toContain(
        'no parser path specified',
      );
    });
  });
});
