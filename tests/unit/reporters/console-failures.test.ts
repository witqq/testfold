/**
 * Tests for ConsoleReporter consolidated failures and re-run instructions
 */

import { ConsoleReporter } from '../../../src/reporters/console.js';
import type { AggregatedResults, SuiteResult, FailureDetail } from '../../../src/config/types.js';

describe('ConsoleReporter consolidated failures', () => {
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
      testName: 'should work correctly',
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

  function createResults(suites: SuiteResult[]): AggregatedResults {
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
      exitCode: totals.failed === 0 ? 0 : 1,
    };
  }

  function getOutput(): string {
    return consoleLogs.join('\n');
  }

  it('should show FAILURES section when tests fail', async () => {
    const reporter = new ConsoleReporter();
    reporter.onStart([{ name: 'Unit', type: 'jest', command: '', resultFile: '' }]);

    const results = createResults([
      makeSuite({
        failed: 1,
        success: false,
        failures: [makeFailure()],
      }),
    ]);

    await reporter.onComplete(results);
    const output = getOutput();

    expect(output).toContain('FAILURES');
    expect(output).toContain('should work correctly');
    expect(output).toContain('tests/unit/example.test.ts');
    expect(output).toContain('Expected true to be false');
  });

  it('should NOT show FAILURES section when all pass', async () => {
    const reporter = new ConsoleReporter();
    reporter.onStart([{ name: 'Unit', type: 'jest', command: '', resultFile: '' }]);

    const results = createResults([makeSuite()]);

    await reporter.onComplete(results);
    const output = getOutput();

    expect(output).not.toContain('FAILURES');
    expect(output).not.toContain('RE-RUN');
  });

  it('should show failures from multiple suites', async () => {
    const reporter = new ConsoleReporter();
    reporter.onStart([
      { name: 'Unit', type: 'jest', command: '', resultFile: '' },
      { name: 'Integration', type: 'jest', command: '', resultFile: '' },
    ]);

    const results = createResults([
      makeSuite({
        name: 'Unit',
        failed: 1,
        success: false,
        failures: [makeFailure({ testName: 'unit test fails' })],
      }),
      makeSuite({
        name: 'Integration',
        failed: 1,
        success: false,
        failures: [makeFailure({ testName: 'integration test fails' })],
      }),
    ]);

    await reporter.onComplete(results);
    const output = getOutput();

    expect(output).toContain('[Unit]');
    expect(output).toContain('unit test fails');
    expect(output).toContain('[Integration]');
    expect(output).toContain('integration test fails');
  });

  it('should include suite name in each failure entry', async () => {
    const reporter = new ConsoleReporter();
    reporter.onStart([{ name: 'E2E', type: 'playwright', command: '', resultFile: '' }]);

    const results = createResults([
      makeSuite({
        name: 'E2E',
        failed: 2,
        success: false,
        failures: [
          makeFailure({ testName: 'login fails' }),
          makeFailure({ testName: 'signup fails' }),
        ],
      }),
    ]);

    await reporter.onComplete(results);
    const output = getOutput();

    expect(output).toContain('[E2E]');
    expect(output).toContain('login fails');
    expect(output).toContain('signup fails');
  });

  it('should truncate long error messages to 120 chars', async () => {
    const reporter = new ConsoleReporter();
    reporter.onStart([{ name: 'Unit', type: 'jest', command: '', resultFile: '' }]);

    const longError = 'A'.repeat(200);
    const results = createResults([
      makeSuite({
        failed: 1,
        success: false,
        failures: [makeFailure({ error: longError })],
      }),
    ]);

    await reporter.onComplete(results);
    const output = getOutput();

    // Should contain truncated error (120 chars)
    expect(output).toContain('A'.repeat(120));
    expect(output).not.toContain('A'.repeat(200));
  });

  it('should handle failures with empty error', async () => {
    const reporter = new ConsoleReporter();
    reporter.onStart([{ name: 'Unit', type: 'jest', command: '', resultFile: '' }]);

    const results = createResults([
      makeSuite({
        failed: 1,
        success: false,
        failures: [makeFailure({ error: '' })],
      }),
    ]);

    await reporter.onComplete(results);
    const output = getOutput();

    expect(output).toContain('FAILURES');
    expect(output).toContain('should work correctly');
  });

  it('should handle failures with multiline error (show first line only)', async () => {
    const reporter = new ConsoleReporter();
    reporter.onStart([{ name: 'Unit', type: 'jest', command: '', resultFile: '' }]);

    const results = createResults([
      makeSuite({
        failed: 1,
        success: false,
        failures: [makeFailure({
          error: 'Line 1: main error\nLine 2: stack trace\nLine 3: more details',
        })],
      }),
    ]);

    await reporter.onComplete(results);
    const output = getOutput();

    expect(output).toContain('Line 1: main error');
    expect(output).not.toContain('Line 2: stack trace');
  });
});

describe('ConsoleReporter re-run instructions', () => {
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
      error: 'Error',
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

  function createResults(suites: SuiteResult[]): AggregatedResults {
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
      exitCode: totals.failed === 0 ? 0 : 1,
    };
  }

  function getOutput(): string {
    return consoleLogs.join('\n');
  }

  it('should show RE-RUN INSTRUCTIONS section', async () => {
    const reporter = new ConsoleReporter();
    reporter.onStart([{ name: 'Unit', type: 'jest', command: '', resultFile: '' }]);

    const results = createResults([
      makeSuite({
        failed: 1,
        success: false,
        failures: [makeFailure()],
      }),
    ]);

    await reporter.onComplete(results);
    const output = getOutput();

    expect(output).toContain('RE-RUN INSTRUCTIONS');
  });

  it('should include testfold command with failed suite name', async () => {
    const reporter = new ConsoleReporter();
    reporter.onStart([{ name: 'Unit', type: 'jest', command: '', resultFile: '' }]);

    const results = createResults([
      makeSuite({
        failed: 1,
        success: false,
        failures: [makeFailure()],
      }),
    ]);

    await reporter.onComplete(results);
    const output = getOutput();

    expect(output).toContain('testfold unit');
  });

  it('should include per-file re-run commands', async () => {
    const reporter = new ConsoleReporter();
    reporter.onStart([{ name: 'Unit', type: 'jest', command: '', resultFile: '' }]);

    const results = createResults([
      makeSuite({
        failed: 2,
        success: false,
        failures: [
          makeFailure({ filePath: 'tests/unit/auth.test.ts' }),
          makeFailure({ filePath: 'tests/unit/db.test.ts' }),
        ],
      }),
    ]);

    await reporter.onComplete(results);
    const output = getOutput();

    expect(output).toContain('testfold unit -- tests/unit/auth.test.ts');
    expect(output).toContain('testfold unit -- tests/unit/db.test.ts');
  });

  it('should deduplicate files in re-run commands', async () => {
    const reporter = new ConsoleReporter();
    reporter.onStart([{ name: 'Unit', type: 'jest', command: '', resultFile: '' }]);

    const results = createResults([
      makeSuite({
        failed: 3,
        success: false,
        failures: [
          makeFailure({ testName: 'test 1', filePath: 'tests/auth.test.ts' }),
          makeFailure({ testName: 'test 2', filePath: 'tests/auth.test.ts' }),
          makeFailure({ testName: 'test 3', filePath: 'tests/db.test.ts' }),
        ],
      }),
    ]);

    await reporter.onComplete(results);
    const output = getOutput();

    // auth.test.ts should appear only once in re-run
    const rerunSection = output.split('RE-RUN')[1] ?? '';
    const authMatches = rerunSection.match(/tests\/auth\.test\.ts/g);
    expect(authMatches?.length).toBe(1);
  });

  it('should list multiple failed suites in re-run command', async () => {
    const reporter = new ConsoleReporter();
    reporter.onStart([
      { name: 'Unit', type: 'jest', command: '', resultFile: '' },
      { name: 'E2E', type: 'playwright', command: '', resultFile: '' },
    ]);

    const results = createResults([
      makeSuite({
        name: 'Unit',
        failed: 1,
        success: false,
        failures: [makeFailure()],
      }),
      makeSuite({
        name: 'E2E',
        failed: 1,
        success: false,
        failures: [makeFailure({ filePath: 'tests/e2e/login.spec.ts' })],
      }),
    ]);

    await reporter.onComplete(results);
    const output = getOutput();

    expect(output).toContain('testfold unit e2e');
  });

  it('should not show per-file commands when more than 5 unique files', async () => {
    const reporter = new ConsoleReporter();
    reporter.onStart([{ name: 'Unit', type: 'jest', command: '', resultFile: '' }]);

    const failures = Array.from({ length: 6 }, (_, i) =>
      makeFailure({ testName: `test ${i}`, filePath: `tests/file${i}.test.ts` }),
    );

    const results = createResults([
      makeSuite({
        failed: 6,
        success: false,
        failures,
      }),
    ]);

    await reporter.onComplete(results);
    const output = getOutput();

    // Should have the suite-level command but no per-file commands
    expect(output).toContain('testfold unit');
    expect(output).not.toContain('Re-run Unit failed files');
  });

  it('should handle failures with empty filePath', async () => {
    const reporter = new ConsoleReporter();
    reporter.onStart([{ name: 'Unit', type: 'jest', command: '', resultFile: '' }]);

    const results = createResults([
      makeSuite({
        failed: 1,
        success: false,
        failures: [makeFailure({ filePath: '' })],
      }),
    ]);

    await reporter.onComplete(results);
    const output = getOutput();

    expect(output).toContain('RE-RUN INSTRUCTIONS');
    expect(output).toContain('testfold unit');
  });
});
