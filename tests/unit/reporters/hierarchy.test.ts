/**
 * Tests for test hierarchy formatting in reporters
 */

import { mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConsoleReporter } from '../../../src/reporters/console.js';
import { MarkdownReporter } from '../../../src/reporters/markdown.js';
import type { AggregatedResults, SuiteResult, Suite } from '../../../src/config/types.js';

describe('Test Hierarchy Formatting', () => {
  describe('ConsoleReporter', () => {
    let consoleLogs: string[];
    let originalLog: typeof console.log;

    beforeEach(() => {
      consoleLogs = [];
      originalLog = console.log;
      console.log = (...args: unknown[]) => {
        consoleLogs.push(args.map(String).join(' '));
      };
    });

    afterEach(() => {
      console.log = originalLog;
    });

    it('formats hierarchical test name with › separator', () => {
      const reporter = new ConsoleReporter();
      const suite: Suite = { name: 'Unit', type: 'jest', command: '', resultFile: 'unit.json' };
      const result: SuiteResult = {
        name: 'Unit',
        passed: 0,
        failed: 1,
        skipped: 0,
        duration: 100,
        success: false,
        failures: [
          {
            testName: 'describe1 > describe2 > should do something',
            filePath: 'test.ts',
            error: 'Expected true, got false',
          },
        ],
        logFile: 'unit.log',
        resultFile: 'unit.json',
      };

      reporter.onStart([suite]);
      reporter.onSuiteComplete(suite, result);

      // Check that hierarchy is formatted with › separator
      const hierarchyLog = consoleLogs.find((log) =>
        log.includes('describe1 › describe2 › should do something'),
      );
      expect(hierarchyLog).toBeDefined();
    });

    it('shows up to 3 failures with hierarchy', () => {
      const reporter = new ConsoleReporter();
      const suite: Suite = { name: 'Unit', type: 'jest', command: '', resultFile: 'unit.json' };
      const result: SuiteResult = {
        name: 'Unit',
        passed: 0,
        failed: 5,
        skipped: 0,
        duration: 100,
        success: false,
        failures: [
          { testName: 'Suite > test1', filePath: 't.ts', error: 'e1' },
          { testName: 'Suite > test2', filePath: 't.ts', error: 'e2' },
          { testName: 'Suite > test3', filePath: 't.ts', error: 'e3' },
          { testName: 'Suite > test4', filePath: 't.ts', error: 'e4' },
          { testName: 'Suite > test5', filePath: 't.ts', error: 'e5' },
        ],
        logFile: 'unit.log',
        resultFile: 'unit.json',
      };

      reporter.onStart([suite]);
      reporter.onSuiteComplete(suite, result);

      // Should show 3 failures
      const test1Log = consoleLogs.find((log) => log.includes('test1'));
      const test2Log = consoleLogs.find((log) => log.includes('test2'));
      const test3Log = consoleLogs.find((log) => log.includes('test3'));
      const test4Log = consoleLogs.find((log) => log.includes('test4'));
      const moreLog = consoleLogs.find((log) => log.includes('and 2 more'));

      expect(test1Log).toBeDefined();
      expect(test2Log).toBeDefined();
      expect(test3Log).toBeDefined();
      expect(test4Log).toBeUndefined(); // Should not show 4th
      expect(moreLog).toBeDefined();
    });

    it('handles single-level test name without separator', () => {
      const reporter = new ConsoleReporter();
      const suite: Suite = { name: 'Unit', type: 'jest', command: '', resultFile: 'unit.json' };
      const result: SuiteResult = {
        name: 'Unit',
        passed: 0,
        failed: 1,
        skipped: 0,
        duration: 100,
        success: false,
        failures: [
          { testName: 'simple test', filePath: 'test.ts', error: 'error' },
        ],
        logFile: 'unit.log',
        resultFile: 'unit.json',
      };

      reporter.onStart([suite]);
      reporter.onSuiteComplete(suite, result);

      const testLog = consoleLogs.find((log) => log.includes('simple test'));
      expect(testLog).toBeDefined();
      // Should not have › since no hierarchy
      expect(testLog).not.toContain('›');
    });
  });

  describe('MarkdownReporter', () => {
    const testDir = join(process.cwd(), 'test-hierarchy-md');
    const artifactsDir = join(testDir, 'test-results');

    beforeAll(() => {
      mkdirSync(artifactsDir, { recursive: true });
    });

    afterAll(() => {
      rmSync(testDir, { recursive: true, force: true });
    });

    beforeEach(() => {
      rmSync(testDir, { recursive: true, force: true });
      mkdirSync(artifactsDir, { recursive: true });
    });

    function createResults(suites: SuiteResult[]): AggregatedResults {
      return {
        suites,
        totals: { passed: 0, failed: 1, skipped: 0, duration: 100 },
        success: false,
        passRate: 0,
      };
    }

    it('formats hierarchical test name as indented list', async () => {
      const reporter = new MarkdownReporter(artifactsDir);
      const results = createResults([
        {
          name: 'Unit',
          passed: 0,
          failed: 1,
          skipped: 0,
          duration: 100,
          success: false,
          failures: [
            {
              testName: 'API > Users > should create user',
              filePath: 'api.test.ts',
              error: 'Expected 201',
            },
          ],
          logFile: 'unit.log',
          resultFile: 'unit.json',
        },
      ]);

      await reporter.onComplete(results);

      const failureFile = join(artifactsDir, 'failures', 'unit', '01-api-users-should-create-user.md');
      const content = readFileSync(failureFile, 'utf-8');

      // Check for hierarchy structure
      expect(content).toContain('## Test Hierarchy');
      expect(content).toContain('- API');
      expect(content).toContain('  - Users');
      expect(content).toContain('    - **should create user**');
    });

    it('handles single-level test name without hierarchy section', async () => {
      const reporter = new MarkdownReporter(artifactsDir);
      const results = createResults([
        {
          name: 'Unit',
          passed: 0,
          failed: 1,
          skipped: 0,
          duration: 100,
          success: false,
          failures: [
            {
              testName: 'simple test',
              filePath: 'test.ts',
              error: 'error',
            },
          ],
          logFile: 'unit.log',
          resultFile: 'unit.json',
        },
      ]);

      await reporter.onComplete(results);

      const failureFile = join(artifactsDir, 'failures', 'unit', '01-simple-test.md');
      const content = readFileSync(failureFile, 'utf-8');

      // Should use simple format without hierarchy
      expect(content).toContain('**Test:** simple test');
      expect(content).not.toContain('## Test Hierarchy');
    });

    it('formats deep hierarchy correctly', async () => {
      const reporter = new MarkdownReporter(artifactsDir);
      const results = createResults([
        {
          name: 'Unit',
          passed: 0,
          failed: 1,
          skipped: 0,
          duration: 100,
          success: false,
          failures: [
            {
              testName: 'Level1 > Level2 > Level3 > Level4 > actual test',
              filePath: 'deep.test.ts',
              error: 'deep error',
            },
          ],
          logFile: 'unit.log',
          resultFile: 'unit.json',
        },
      ]);

      await reporter.onComplete(results);

      const failureFile = join(
        artifactsDir,
        'failures',
        'unit',
        '01-level1-level2-level3-level4-actual-test.md',
      );
      const content = readFileSync(failureFile, 'utf-8');

      // Check deep hierarchy with proper indentation
      expect(content).toContain('- Level1');
      expect(content).toContain('  - Level2');
      expect(content).toContain('    - Level3');
      expect(content).toContain('      - Level4');
      expect(content).toContain('        - **actual test**');
    });
  });
});
