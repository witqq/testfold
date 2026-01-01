/**
 * Tests for ConsoleReporter artifact inventory
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConsoleReporter } from '../../../src/reporters/console.js';
import type { AggregatedResults, SuiteResult } from '../../../src/config/types.js';

describe('ConsoleReporter artifact inventory', () => {
  const testDir = join(process.cwd(), 'test-console-artifacts');
  const artifactsDir = join(testDir, 'test-results');

  let consoleLogs: string[] = [];
  let originalLog: typeof console.log;

  beforeAll(() => {
    mkdirSync(artifactsDir, { recursive: true });
    originalLog = console.log;
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
    console.log = originalLog;
  });

  beforeEach(() => {
    rmSync(testDir, { recursive: true, force: true });
    mkdirSync(artifactsDir, { recursive: true });
    consoleLogs = [];
    console.log = (...args: unknown[]) => {
      consoleLogs.push(args.map(String).join(' '));
    };
  });

  afterEach(() => {
    console.log = originalLog;
  });

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

    return {
      suites,
      totals,
      success: totals.failed === 0,
      passRate:
        totals.passed / (totals.passed + totals.failed + totals.skipped || 1) * 100,
    };
  }

  it('shows ARTIFACTS section when artifacts exist', async () => {
    // Create artifact files
    writeFileSync(join(artifactsDir, 'unit.json'), '{}');
    writeFileSync(join(artifactsDir, 'unit.log'), 'logs');

    const reporter = new ConsoleReporter(artifactsDir);
    const results = createResults([
      {
        name: 'Unit',
        passed: 1,
        failed: 0,
        skipped: 0,
        duration: 100,
        success: true,
        failures: [],
        logFile: join(artifactsDir, 'unit.log'),
        resultFile: 'unit.json',
      },
    ]);

    reporter.onStart([{ name: 'Unit', type: 'jest', command: '', resultFile: 'unit.json' }]);
    await reporter.onComplete(results);

    expect(consoleLogs.some((log) => log.includes('ARTIFACTS'))).toBe(true);
    expect(consoleLogs.some((log) => log.includes('unit.json'))).toBe(true);
    expect(consoleLogs.some((log) => log.includes('unit.log'))).toBe(true);
  });

  it('shows timing.json when it exists', async () => {
    writeFileSync(join(artifactsDir, 'unit.json'), '{}');
    writeFileSync(join(artifactsDir, 'timing.json'), '{}');

    const reporter = new ConsoleReporter(artifactsDir);
    const results = createResults([
      {
        name: 'Unit',
        passed: 1,
        failed: 0,
        skipped: 0,
        duration: 100,
        success: true,
        failures: [],
        logFile: 'unit.log',
        resultFile: 'unit.json',
      },
    ]);

    reporter.onStart([{ name: 'Unit', type: 'jest', command: '', resultFile: 'unit.json' }]);
    await reporter.onComplete(results);

    expect(consoleLogs.some((log) => log.includes('timing.json'))).toBe(true);
  });

  it('shows summary.json from parent directory', async () => {
    writeFileSync(join(artifactsDir, 'unit.json'), '{}');
    writeFileSync(join(testDir, 'summary.json'), '{}');

    const reporter = new ConsoleReporter(artifactsDir);
    const results = createResults([
      {
        name: 'Unit',
        passed: 1,
        failed: 0,
        skipped: 0,
        duration: 100,
        success: true,
        failures: [],
        logFile: 'unit.log',
        resultFile: 'unit.json',
      },
    ]);

    reporter.onStart([{ name: 'Unit', type: 'jest', command: '', resultFile: 'unit.json' }]);
    await reporter.onComplete(results);

    expect(consoleLogs.some((log) => log.includes('summary.json'))).toBe(true);
  });

  it('shows failure markdown files', async () => {
    // Create failures directory
    const failuresDir = join(artifactsDir, 'failures', 'unit');
    mkdirSync(failuresDir, { recursive: true });
    writeFileSync(join(failuresDir, '01-test-failure.md'), '# Failure');
    writeFileSync(join(artifactsDir, 'unit.json'), '{}');

    const reporter = new ConsoleReporter(artifactsDir);
    const results = createResults([
      {
        name: 'Unit',
        passed: 0,
        failed: 1,
        skipped: 0,
        duration: 100,
        success: false,
        failures: [{ testName: 'test', filePath: 'test.ts', error: 'fail' }],
        logFile: 'unit.log',
        resultFile: 'unit.json',
      },
    ]);

    reporter.onStart([{ name: 'Unit', type: 'jest', command: '', resultFile: 'unit.json' }]);
    await reporter.onComplete(results);

    expect(
      consoleLogs.some((log) => log.includes('failures/unit/01-test-failure.md')),
    ).toBe(true);
  });

  it('sanitizes suite name in failures path (spaces to hyphens)', async () => {
    const failuresDir = join(artifactsDir, 'failures', 'my-suite');
    mkdirSync(failuresDir, { recursive: true });
    writeFileSync(join(failuresDir, '01-error.md'), '# Error');
    writeFileSync(join(artifactsDir, 'result.json'), '{}');

    const reporter = new ConsoleReporter(artifactsDir);
    const results = createResults([
      {
        name: 'My Suite',
        passed: 0,
        failed: 1,
        skipped: 0,
        duration: 100,
        success: false,
        failures: [{ testName: 'test', filePath: 'test.ts', error: 'fail' }],
        logFile: 'result.log',
        resultFile: 'result.json',
      },
    ]);

    reporter.onStart([{ name: 'My Suite', type: 'jest', command: '', resultFile: 'result.json' }]);
    await reporter.onComplete(results);

    expect(
      consoleLogs.some((log) => log.includes('failures/my-suite/01-error.md')),
    ).toBe(true);
  });

  it('does not show ARTIFACTS section when no artifacts exist', async () => {
    const reporter = new ConsoleReporter(artifactsDir);
    const results = createResults([
      {
        name: 'Unit',
        passed: 1,
        failed: 0,
        skipped: 0,
        duration: 100,
        success: true,
        failures: [],
        logFile: 'unit.log',
        resultFile: 'unit.json',
      },
    ]);

    reporter.onStart([{ name: 'Unit', type: 'jest', command: '', resultFile: 'unit.json' }]);
    await reporter.onComplete(results);

    expect(consoleLogs.some((log) => log.includes('ARTIFACTS'))).toBe(false);
  });

  it('does not show artifacts when artifactsDir not provided', async () => {
    writeFileSync(join(artifactsDir, 'unit.json'), '{}');

    const reporter = new ConsoleReporter(); // No artifactsDir
    const results = createResults([
      {
        name: 'Unit',
        passed: 1,
        failed: 0,
        skipped: 0,
        duration: 100,
        success: true,
        failures: [],
        logFile: 'unit.log',
        resultFile: 'unit.json',
      },
    ]);

    reporter.onStart([{ name: 'Unit', type: 'jest', command: '', resultFile: 'unit.json' }]);
    await reporter.onComplete(results);

    expect(consoleLogs.some((log) => log.includes('ARTIFACTS'))).toBe(false);
  });
});
