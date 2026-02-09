/**
 * Tests for ConsoleReporter coverage detection
 */

import { ConsoleReporter } from '../../../src/reporters/console.js';
import type { AggregatedResults, SuiteResult } from '../../../src/config/types.js';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

describe('ConsoleReporter coverage detection', () => {
  let consoleLogs: string[];
  let originalLog: typeof console.log;
  const coverageDir = join(process.cwd(), 'coverage');
  let coverageDirExisted: boolean;

  beforeAll(() => {
    originalLog = console.log;
    coverageDirExisted = existsSync(coverageDir);
  });

  afterAll(() => {
    console.log = originalLog;
    // Restore original state
    if (!coverageDirExisted && existsSync(coverageDir)) {
      rmSync(coverageDir, { recursive: true });
    }
  });

  beforeEach(() => {
    consoleLogs = [];
    console.log = (...args: unknown[]) => {
      consoleLogs.push(args.map(String).join(' '));
    };
  });

  afterEach(() => {
    console.log = originalLog;
  });

  function makeSuite(overrides: Partial<SuiteResult> = {}): SuiteResult {
    return {
      name: 'Unit',
      passed: 10,
      failed: 0,
      skipped: 0,
      duration: 1000,
      success: true,
      failures: [],
      logFile: '/tmp/unit.log',
      resultFile: 'unit.json',
      ...overrides,
    };
  }

  function createResults(success: boolean): AggregatedResults {
    const suite = makeSuite({ failed: success ? 0 : 1, success });
    return {
      suites: [suite],
      totals: { passed: suite.passed, failed: suite.failed, skipped: 0, duration: 1000 },
      success,
      passRate: success ? 100 : 90.9,
      exitCode: success ? 0 : 1,
    };
  }

  function getOutput(): string {
    return consoleLogs.join('\n');
  }

  it('should print coverage hint when coverage directory exists', async () => {
    if (!existsSync(coverageDir)) {
      mkdirSync(coverageDir, { recursive: true });
    }

    const reporter = new ConsoleReporter();
    reporter.onStart([{ name: 'Unit', type: 'jest', command: '', resultFile: '' }]);
    await reporter.onComplete(createResults(true));

    const output = getOutput();
    expect(output).toContain('Coverage data available');
    expect(output).toContain(coverageDir);

    if (!coverageDirExisted) {
      rmSync(coverageDir, { recursive: true });
    }
  });

  it('should not print coverage hint when coverage directory does not exist', async () => {
    // Ensure coverage dir doesn't exist
    if (existsSync(coverageDir)) {
      rmSync(coverageDir, { recursive: true });
    }

    const reporter = new ConsoleReporter();
    reporter.onStart([{ name: 'Unit', type: 'jest', command: '', resultFile: '' }]);
    await reporter.onComplete(createResults(true));

    const output = getOutput();
    expect(output).not.toContain('Coverage data available');

    // Restore if it existed before
    if (coverageDirExisted) {
      mkdirSync(coverageDir, { recursive: true });
    }
  });

  it('should print coverage hint on both success and failure runs', async () => {
    if (!existsSync(coverageDir)) {
      mkdirSync(coverageDir, { recursive: true });
    }

    const reporter = new ConsoleReporter();
    reporter.onStart([{ name: 'Unit', type: 'jest', command: '', resultFile: '' }]);
    await reporter.onComplete(createResults(false));

    const output = getOutput();
    expect(output).toContain('Coverage data available');

    if (!coverageDirExisted) {
      rmSync(coverageDir, { recursive: true });
    }
  });

  it('should print coverage hint before artifacts section', async () => {
    if (!existsSync(coverageDir)) {
      mkdirSync(coverageDir, { recursive: true });
    }

    const reporter = new ConsoleReporter('./test-results');
    reporter.onStart([{ name: 'Unit', type: 'jest', command: '', resultFile: '' }]);
    await reporter.onComplete(createResults(true));

    const output = getOutput();
    const coverageIdx = output.indexOf('Coverage data available');
    const jsonIdx = output.indexOf('TESTFOLD_RESULT:');
    expect(coverageIdx).toBeGreaterThan(-1);
    expect(jsonIdx).toBeGreaterThan(coverageIdx);

    if (!coverageDirExisted) {
      rmSync(coverageDir, { recursive: true });
    }
  });

  it('should print coverage hint before JSON summary line', async () => {
    if (!existsSync(coverageDir)) {
      mkdirSync(coverageDir, { recursive: true });
    }

    const reporter = new ConsoleReporter();
    reporter.onStart([{ name: 'Unit', type: 'jest', command: '', resultFile: '' }]);
    await reporter.onComplete(createResults(true));

    const output = getOutput();
    const coverageIdx = output.indexOf('Coverage data available');
    const jsonIdx = output.indexOf('TESTFOLD_RESULT:');
    expect(coverageIdx).toBeGreaterThan(-1);
    expect(coverageIdx).toBeLessThan(jsonIdx);

    if (!coverageDirExisted) {
      rmSync(coverageDir, { recursive: true });
    }
  });
});
