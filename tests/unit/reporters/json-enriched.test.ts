import { resolve } from 'node:path';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { JsonReporter } from '../../../src/reporters/json.js';
import type { AggregatedResults, SuiteResult } from '../../../src/config/types.js';

describe('JsonReporter enriched output', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(resolve(tmpdir(), 'json-reporter-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  function makeResults(overrides: Partial<AggregatedResults> = {}): AggregatedResults {
    return {
      success: true,
      passRate: 100,
      totals: { passed: 5, failed: 0, skipped: 0, duration: 1000 },
      suites: [],
      ...overrides,
    };
  }

  function makeSuiteResult(overrides: Partial<SuiteResult> = {}): SuiteResult {
    return {
      name: 'unit',
      passed: 5,
      failed: 0,
      skipped: 0,
      duration: 1000,
      success: true,
      failures: [],
      logFile: 'unit.log',
      resultFile: 'unit.json',
      ...overrides,
    };
  }

  it('should include failedTests array with test names', async () => {
    const outputPath = resolve(tempDir, 'summary.json');
    const reporter = new JsonReporter(outputPath);
    const results = makeResults({
      success: false,
      suites: [makeSuiteResult({
        failed: 2,
        success: false,
        failures: [
          { testName: 'auth > should login', filePath: 'auth.test.ts', error: 'Expected true' },
          { testName: 'auth > should logout', filePath: 'auth.test.ts', error: 'Timeout' },
        ],
      })],
    });

    reporter.onStart([]);
    await reporter.onComplete(results);

    const json = JSON.parse(await readFile(outputPath, 'utf-8'));
    expect(json.failedTests).toEqual(['auth > should login', 'auth > should logout']);
  });

  it('should include errors array with error messages', async () => {
    const outputPath = resolve(tempDir, 'summary.json');
    const reporter = new JsonReporter(outputPath);
    const results = makeResults({
      success: false,
      suites: [makeSuiteResult({
        failed: 1,
        success: false,
        failures: [
          { testName: 'test1', filePath: 'a.test.ts', error: 'Expected 2 to be 3' },
        ],
      })],
    });

    reporter.onStart([]);
    await reporter.onComplete(results);

    const json = JSON.parse(await readFile(outputPath, 'utf-8'));
    expect(json.errors).toEqual(['Expected 2 to be 3']);
  });

  it('should have empty failedTests and errors when all pass', async () => {
    const outputPath = resolve(tempDir, 'summary.json');
    const reporter = new JsonReporter(outputPath);
    const results = makeResults({
      suites: [makeSuiteResult()],
    });

    reporter.onStart([]);
    await reporter.onComplete(results);

    const json = JSON.parse(await readFile(outputPath, 'utf-8'));
    expect(json.failedTests).toEqual([]);
    expect(json.errors).toEqual([]);
  });

  it('should aggregate failures across multiple suites', async () => {
    const outputPath = resolve(tempDir, 'summary.json');
    const reporter = new JsonReporter(outputPath);
    const results = makeResults({
      success: false,
      suites: [
        makeSuiteResult({
          name: 'unit',
          failures: [{ testName: 'unit test A', filePath: 'a.test.ts', error: 'Error A' }],
        }),
        makeSuiteResult({
          name: 'e2e',
          failures: [{ testName: 'e2e test B', filePath: 'b.test.ts', error: 'Error B' }],
        }),
      ],
    });

    reporter.onStart([]);
    await reporter.onComplete(results);

    const json = JSON.parse(await readFile(outputPath, 'utf-8'));
    expect(json.failedTests).toEqual(['unit test A', 'e2e test B']);
    expect(json.errors).toEqual(['Error A', 'Error B']);
  });

  it('should include per-suite testResults when available', async () => {
    const outputPath = resolve(tempDir, 'summary.json');
    const reporter = new JsonReporter(outputPath);
    const results = makeResults({
      suites: [makeSuiteResult({
        testResults: [
          { name: 'test 1', file: 'a.test.ts', status: 'passed', duration: 100 },
          { name: 'test 2', file: 'a.test.ts', status: 'failed', duration: 200, error: 'boom' },
        ],
      })],
    });

    reporter.onStart([]);
    await reporter.onComplete(results);

    const json = JSON.parse(await readFile(outputPath, 'utf-8'));
    expect(json.suites[0].testResults).toHaveLength(2);
    expect(json.suites[0].testResults[0].name).toBe('test 1');
    expect(json.suites[0].testResults[1].error).toBe('boom');
  });

  it('should omit testResults when not available', async () => {
    const outputPath = resolve(tempDir, 'summary.json');
    const reporter = new JsonReporter(outputPath);
    const results = makeResults({
      suites: [makeSuiteResult()],
    });

    reporter.onStart([]);
    await reporter.onComplete(results);

    const json = JSON.parse(await readFile(outputPath, 'utf-8'));
    expect(json.suites[0].testResults).toBeUndefined();
  });

  it('should still include standard fields', async () => {
    const outputPath = resolve(tempDir, 'summary.json');
    const reporter = new JsonReporter(outputPath);
    const results = makeResults({
      passRate: 95.5,
      suites: [makeSuiteResult({ name: 'integration', duration: 5000 })],
    });

    reporter.onStart([]);
    await reporter.onComplete(results);

    const json = JSON.parse(await readFile(outputPath, 'utf-8'));
    expect(json.success).toBe(true);
    expect(json.passRate).toBe(95.5);
    expect(json.timestamp).toBeDefined();
    expect(json.totals).toEqual({ passed: 5, failed: 0, skipped: 0, duration: 1000 });
    expect(json.suites[0].name).toBe('integration');
  });
});
