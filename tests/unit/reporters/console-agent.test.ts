/**
 * Tests for ConsoleReporter agent instructions block and JSON summary line
 */

import { ConsoleReporter } from '../../../src/reporters/console.js';
import type { AggregatedResults, SuiteResult, FailureDetail } from '../../../src/config/types.js';
import { ExitCode } from '../../../src/config/types.js';

describe('ConsoleReporter agent instructions', () => {
  let consoleLogs: string[];
  let originalLog: typeof console.log;

  beforeAll(() => {
    originalLog = console.log;
  });

  afterAll(() => {
    console.log = originalLog;
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

  function makeFailure(overrides: Partial<FailureDetail> = {}): FailureDetail {
    return {
      testName: 'test fails',
      filePath: 'tests/unit/example.test.ts',
      error: 'Expected true to be false',
      ...overrides,
    };
  }

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

  function createResults(suites: SuiteResult[], exitCode?: number): AggregatedResults {
    const totals = suites.reduce(
      (acc, s) => ({
        passed: acc.passed + s.passed,
        failed: acc.failed + s.failed,
        skipped: acc.skipped + s.skipped,
        duration: acc.duration + s.duration,
      }),
      { passed: 0, failed: 0, skipped: 0, duration: 0 },
    );
    const total = totals.passed + totals.failed + totals.skipped;

    return {
      suites,
      totals,
      success: totals.failed === 0,
      passRate: total > 0 ? (totals.passed / total) * 100 : 100,
      exitCode: exitCode ?? (totals.failed === 0 ? 0 : 1),
    };
  }

  function getOutput(): string {
    return consoleLogs.join('\n');
  }

  it('should show AGENT INSTRUCTIONS block when tests fail', async () => {
    const reporter = new ConsoleReporter();
    reporter.onStart([{ name: 'Unit', type: 'jest', command: '', resultFile: '' }]);

    const results = createResults([
      makeSuite({ failed: 2, success: false, failures: [makeFailure(), makeFailure({ testName: 'test 2' })] }),
    ]);

    await reporter.onComplete(results);
    const output = getOutput();

    expect(output).toContain('=== AGENT INSTRUCTIONS ===');
    expect(output).toContain('=== END AGENT INSTRUCTIONS ===');
    expect(output).toContain('Failures: 2');
    expect(output).toContain('Affected suites: Unit');
  });

  it('should NOT show AGENT INSTRUCTIONS when all pass', async () => {
    const reporter = new ConsoleReporter();
    reporter.onStart([{ name: 'Unit', type: 'jest', command: '', resultFile: '' }]);

    const results = createResults([makeSuite()]);

    await reporter.onComplete(results);
    const output = getOutput();

    expect(output).not.toContain('AGENT INSTRUCTIONS');
  });

  it('should show top error patterns', async () => {
    const reporter = new ConsoleReporter();
    reporter.onStart([{ name: 'Unit', type: 'jest', command: '', resultFile: '' }]);

    const results = createResults([
      makeSuite({
        failed: 3,
        success: false,
        failures: [
          makeFailure({ error: 'TypeError: Cannot read property' }),
          makeFailure({ error: 'TypeError: Cannot read property' }),
          makeFailure({ error: 'ReferenceError: x is not defined' }),
        ],
      }),
    ]);

    await reporter.onComplete(results);
    const output = getOutput();

    expect(output).toContain('Top error patterns:');
    expect(output).toContain('2x TypeError: Cannot read property');
    expect(output).toContain('1x ReferenceError: x is not defined');
  });

  it('should list affected suites from multiple failures', async () => {
    const reporter = new ConsoleReporter();
    reporter.onStart([
      { name: 'Unit', type: 'jest', command: '', resultFile: '' },
      { name: 'E2E', type: 'playwright', command: '', resultFile: '' },
    ]);

    const results = createResults([
      makeSuite({ name: 'Unit', failed: 1, success: false, failures: [makeFailure()] }),
      makeSuite({ name: 'E2E', failed: 1, success: false, failures: [makeFailure()] }),
    ]);

    await reporter.onComplete(results);
    const output = getOutput();

    expect(output).toContain('Affected suites: Unit, E2E');
  });

  it('should show infra error action when exitCode is 2', async () => {
    const reporter = new ConsoleReporter();
    reporter.onStart([{ name: 'Unit', type: 'jest', command: '', resultFile: '' }]);

    const results = createResults(
      [makeSuite({ failed: 1, success: false, failures: [makeFailure()], errorCategory: 'infra_error' })],
      ExitCode.INFRA_ERROR,
    );

    await reporter.onComplete(results);
    const output = getOutput();

    expect(output).toContain('infrastructure error');
  });

  it('should show timeout action when exitCode is 3', async () => {
    const reporter = new ConsoleReporter();
    reporter.onStart([{ name: 'Unit', type: 'jest', command: '', resultFile: '' }]);

    const results = createResults(
      [makeSuite({ failed: 1, success: false, failures: [makeFailure()], errorCategory: 'timeout' })],
      ExitCode.TIMEOUT,
    );

    await reporter.onComplete(results);
    const output = getOutput();

    expect(output).toContain('timeout');
  });

  it('should include suggested actions', async () => {
    const reporter = new ConsoleReporter();
    reporter.onStart([{ name: 'Unit', type: 'jest', command: '', resultFile: '' }]);

    const results = createResults([
      makeSuite({ failed: 1, success: false, failures: [makeFailure()] }),
    ]);

    await reporter.onComplete(results);
    const output = getOutput();

    expect(output).toContain('Suggested actions:');
    expect(output).toContain('Review the FAILURES section');
    expect(output).toContain('RE-RUN INSTRUCTIONS');
    expect(output).toContain('log files');
  });
});

describe('ConsoleReporter JSON summary line', () => {
  let consoleLogs: string[];
  let originalLog: typeof console.log;

  beforeAll(() => {
    originalLog = console.log;
  });

  afterAll(() => {
    console.log = originalLog;
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

  function createResults(suites: SuiteResult[], exitCode?: number): AggregatedResults {
    const totals = suites.reduce(
      (acc, s) => ({
        passed: acc.passed + s.passed,
        failed: acc.failed + s.failed,
        skipped: acc.skipped + s.skipped,
        duration: acc.duration + s.duration,
      }),
      { passed: 0, failed: 0, skipped: 0, duration: 0 },
    );
    const total = totals.passed + totals.failed + totals.skipped;

    return {
      suites,
      totals,
      success: totals.failed === 0,
      passRate: total > 0 ? (totals.passed / total) * 100 : 100,
      exitCode: exitCode ?? (totals.failed === 0 ? 0 : 1),
    };
  }

  it('should print JSON summary as last line on success', async () => {
    const reporter = new ConsoleReporter();
    reporter.onStart([{ name: 'Unit', type: 'jest', command: '', resultFile: '' }]);

    const results = createResults([makeSuite({ passed: 42, duration: 5000 })]);

    await reporter.onComplete(results);
    const lastLine = consoleLogs[consoleLogs.length - 1];

    expect(lastLine).toMatch(/^TESTFOLD_RESULT:/);
    const json = JSON.parse(lastLine!.replace('TESTFOLD_RESULT:', ''));
    expect(json.success).toBe(true);
    expect(json.passed).toBe(42);
    expect(json.failed).toBe(0);
    expect(json.exitCode).toBe(0);
  });

  it('should print JSON summary as last line on failure', async () => {
    const reporter = new ConsoleReporter();
    reporter.onStart([{ name: 'Unit', type: 'jest', command: '', resultFile: '' }]);

    const results = createResults([
      makeSuite({
        passed: 8, failed: 2, success: false,
        failures: [
          { testName: 't1', filePath: '', error: 'e1' },
          { testName: 't2', filePath: '', error: 'e2' },
        ],
      }),
    ]);

    await reporter.onComplete(results);
    const lastLine = consoleLogs[consoleLogs.length - 1];

    expect(lastLine).toMatch(/^TESTFOLD_RESULT:/);
    const json = JSON.parse(lastLine!.replace('TESTFOLD_RESULT:', ''));
    expect(json.success).toBe(false);
    expect(json.passed).toBe(8);
    expect(json.failed).toBe(2);
    expect(json.exitCode).toBe(1);
  });

  it('should always be the very last line of output', async () => {
    const reporter = new ConsoleReporter();
    reporter.onStart([{ name: 'Unit', type: 'jest', command: '', resultFile: '' }]);

    const results = createResults([makeSuite()]);

    await reporter.onComplete(results);

    // Last line should be the JSON summary
    const lastLine = consoleLogs[consoleLogs.length - 1];
    expect(lastLine).toContain('TESTFOLD_RESULT:');

    // No other log after it
    const jsonLineIndex = consoleLogs.findIndex((l) => l.includes('TESTFOLD_RESULT:'));
    expect(jsonLineIndex).toBe(consoleLogs.length - 1);
  });

  it('should contain all required fields', async () => {
    const reporter = new ConsoleReporter();
    reporter.onStart([{ name: 'Unit', type: 'jest', command: '', resultFile: '' }]);

    const results = createResults([makeSuite({ passed: 5, failed: 1, skipped: 2, duration: 3000, success: false, failures: [{ testName: 't', filePath: '', error: '' }] })]);

    await reporter.onComplete(results);
    const lastLine = consoleLogs[consoleLogs.length - 1]!;
    const json = JSON.parse(lastLine.replace('TESTFOLD_RESULT:', ''));

    expect(json).toHaveProperty('success');
    expect(json).toHaveProperty('passed');
    expect(json).toHaveProperty('failed');
    expect(json).toHaveProperty('skipped');
    expect(json).toHaveProperty('duration');
    expect(json).toHaveProperty('exitCode');
  });

  it('should be parseable JSON after the prefix', async () => {
    const reporter = new ConsoleReporter();
    reporter.onStart([{ name: 'Unit', type: 'jest', command: '', resultFile: '' }]);

    const results = createResults([makeSuite()]);

    await reporter.onComplete(results);
    const lastLine = consoleLogs[consoleLogs.length - 1]!;

    expect(lastLine.startsWith('TESTFOLD_RESULT:')).toBe(true);
    expect(() => JSON.parse(lastLine.replace('TESTFOLD_RESULT:', ''))).not.toThrow();
  });

  it('should include skipped count', async () => {
    const reporter = new ConsoleReporter();
    reporter.onStart([{ name: 'Unit', type: 'jest', command: '', resultFile: '' }]);

    const results = createResults([makeSuite({ skipped: 5 })]);

    await reporter.onComplete(results);
    const lastLine = consoleLogs[consoleLogs.length - 1]!;
    const json = JSON.parse(lastLine.replace('TESTFOLD_RESULT:', ''));

    expect(json.skipped).toBe(5);
  });
});
