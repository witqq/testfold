/**
 * Tests for TimingReporter
 */

import { mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TimingReporter, type TimingOutput } from '../../../src/reporters/timing.js';
import type { AggregatedResults, SuiteResult } from '../../../src/config/types.js';

describe('TimingReporter', () => {
  const testDir = join(process.cwd(), 'test-timing-reporter');

  beforeAll(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    rmSync(testDir, { recursive: true, force: true });
    mkdirSync(testDir, { recursive: true });
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
      passRate: totals.passed / (totals.passed + totals.failed + totals.skipped) * 100,
    };
  }

  it('writes timing.json with tests sorted by duration descending', async () => {
    const reporter = new TimingReporter(join(testDir, 'timing.json'));
    const results = createResults([
      {
        name: 'Unit',
        passed: 3,
        failed: 0,
        skipped: 0,
        duration: 1000,
        success: true,
        failures: [],
        logFile: 'unit.log',
        resultFile: 'unit.json',
        testResults: [
          { name: 'fast test', file: 'a.test.ts', status: 'passed', duration: 10 },
          { name: 'slow test', file: 'b.test.ts', status: 'passed', duration: 500 },
          { name: 'medium test', file: 'c.test.ts', status: 'passed', duration: 100 },
        ],
      },
    ]);

    await reporter.onComplete(results);

    const content = readFileSync(join(testDir, 'timing.json'), 'utf-8');
    const output: TimingOutput = JSON.parse(content);

    expect(output.tests).toHaveLength(3);
    expect(output.tests[0].name).toBe('slow test');
    expect(output.tests[0].duration).toBe(500);
    expect(output.tests[1].name).toBe('medium test');
    expect(output.tests[1].duration).toBe(100);
    expect(output.tests[2].name).toBe('fast test');
    expect(output.tests[2].duration).toBe(10);
  });

  it('includes suite name in each test entry', async () => {
    const reporter = new TimingReporter(join(testDir, 'timing.json'));
    const results = createResults([
      {
        name: 'Integration',
        passed: 1,
        failed: 0,
        skipped: 0,
        duration: 500,
        success: true,
        failures: [],
        logFile: 'integration.log',
        resultFile: 'integration.json',
        testResults: [
          { name: 'api test', file: 'api.test.ts', status: 'passed', duration: 200 },
        ],
      },
    ]);

    await reporter.onComplete(results);

    const output: TimingOutput = JSON.parse(
      readFileSync(join(testDir, 'timing.json'), 'utf-8'),
    );

    expect(output.tests[0].suite).toBe('Integration');
  });

  it('combines tests from multiple suites sorted by duration', async () => {
    const reporter = new TimingReporter(join(testDir, 'timing.json'));
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
        testResults: [
          { name: 'unit test', file: 'unit.test.ts', status: 'passed', duration: 50 },
        ],
      },
      {
        name: 'E2E',
        passed: 1,
        failed: 0,
        skipped: 0,
        duration: 500,
        success: true,
        failures: [],
        logFile: 'e2e.log',
        resultFile: 'e2e.json',
        testResults: [
          { name: 'e2e test', file: 'e2e.test.ts', status: 'passed', duration: 300 },
        ],
      },
    ]);

    await reporter.onComplete(results);

    const output: TimingOutput = JSON.parse(
      readFileSync(join(testDir, 'timing.json'), 'utf-8'),
    );

    expect(output.tests).toHaveLength(2);
    expect(output.tests[0].name).toBe('e2e test');
    expect(output.tests[0].suite).toBe('E2E');
    expect(output.tests[1].name).toBe('unit test');
    expect(output.tests[1].suite).toBe('Unit');
  });

  it('handles suites without testResults gracefully', async () => {
    const reporter = new TimingReporter(join(testDir, 'timing.json'));
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
        // No testResults
      },
    ]);

    await reporter.onComplete(results);

    const output: TimingOutput = JSON.parse(
      readFileSync(join(testDir, 'timing.json'), 'utf-8'),
    );

    expect(output.tests).toHaveLength(0);
    expect(output.totalDuration).toBe(100);
  });

  it('includes timestamp and totalDuration in output', async () => {
    const reporter = new TimingReporter(join(testDir, 'timing.json'));
    const results = createResults([
      {
        name: 'Unit',
        passed: 1,
        failed: 0,
        skipped: 0,
        duration: 1234,
        success: true,
        failures: [],
        logFile: 'unit.log',
        resultFile: 'unit.json',
        testResults: [],
      },
    ]);

    await reporter.onComplete(results);

    const output: TimingOutput = JSON.parse(
      readFileSync(join(testDir, 'timing.json'), 'utf-8'),
    );

    expect(output.timestamp).toBeDefined();
    expect(new Date(output.timestamp).getTime()).toBeLessThanOrEqual(Date.now());
    expect(output.totalDuration).toBe(1234);
  });

  it('includes test status in timing entries', async () => {
    const reporter = new TimingReporter(join(testDir, 'timing.json'));
    const results = createResults([
      {
        name: 'Unit',
        passed: 1,
        failed: 1,
        skipped: 1,
        duration: 300,
        success: false,
        failures: [{ testName: 'failing test', filePath: 'fail.test.ts', error: 'fail' }],
        logFile: 'unit.log',
        resultFile: 'unit.json',
        testResults: [
          { name: 'passing test', file: 'pass.test.ts', status: 'passed', duration: 100 },
          { name: 'failing test', file: 'fail.test.ts', status: 'failed', duration: 150 },
          { name: 'skipped test', file: 'skip.test.ts', status: 'skipped', duration: 0 },
        ],
      },
    ]);

    await reporter.onComplete(results);

    const output: TimingOutput = JSON.parse(
      readFileSync(join(testDir, 'timing.json'), 'utf-8'),
    );

    const passed = output.tests.find((t) => t.name === 'passing test');
    const failed = output.tests.find((t) => t.name === 'failing test');
    const skipped = output.tests.find((t) => t.name === 'skipped test');

    expect(passed?.status).toBe('passed');
    expect(failed?.status).toBe('failed');
    expect(skipped?.status).toBe('skipped');
  });
});
