import { resolve } from 'node:path';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { SummaryLogReporter } from '../../../src/reporters/summary-log.js';
import { hasAnsi } from '../../../src/utils/ansi.js';
import type { AggregatedResults, SuiteResult } from '../../../src/config/types.js';

describe('SummaryLogReporter', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(resolve(tmpdir(), 'summary-log-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  function makeResults(overrides: Partial<AggregatedResults> = {}): AggregatedResults {
    return {
      success: true,
      passRate: 100,
      totals: { passed: 10, failed: 0, skipped: 0, duration: 5000 },
      suites: [],
      ...overrides,
    };
  }

  function makeSuiteResult(overrides: Partial<SuiteResult> = {}): SuiteResult {
    return {
      name: 'unit',
      passed: 10,
      failed: 0,
      skipped: 0,
      duration: 5000,
      success: true,
      failures: [],
      logFile: 'unit.log',
      resultFile: 'unit.json',
      ...overrides,
    };
  }

  it('should create test-summary.log file', async () => {
    const outputPath = resolve(tempDir, 'test-summary.log');
    const reporter = new SummaryLogReporter(outputPath);

    reporter.onStart([]);
    await reporter.onComplete(makeResults({ suites: [makeSuiteResult()] }));

    const content = await readFile(outputPath, 'utf-8');
    expect(content).toBeDefined();
    expect(content.length).toBeGreaterThan(0);
  });

  it('should contain no ANSI codes', async () => {
    const outputPath = resolve(tempDir, 'test-summary.log');
    const reporter = new SummaryLogReporter(outputPath);

    reporter.onStart([]);
    await reporter.onComplete(makeResults({
      success: false,
      passRate: 80,
      suites: [
        makeSuiteResult({ name: 'unit', passed: 8, failed: 2, success: false }),
        makeSuiteResult({ name: 'e2e', passed: 2, failed: 0 }),
      ],
    }));

    const content = await readFile(outputPath, 'utf-8');
    expect(hasAnsi(content)).toBe(false);
  });

  it('should contain summary table with suite names', async () => {
    const outputPath = resolve(tempDir, 'test-summary.log');
    const reporter = new SummaryLogReporter(outputPath);

    reporter.onStart([]);
    await reporter.onComplete(makeResults({
      suites: [
        makeSuiteResult({ name: 'unit', passed: 10, duration: 3000 }),
        makeSuiteResult({ name: 'integration', passed: 5, duration: 8000 }),
      ],
    }));

    const content = await readFile(outputPath, 'utf-8');
    expect(content).toContain('unit');
    expect(content).toContain('integration');
    expect(content).toContain('SUMMARY');
  });

  it('should contain pass/fail/skip counts and duration', async () => {
    const outputPath = resolve(tempDir, 'test-summary.log');
    const reporter = new SummaryLogReporter(outputPath);

    reporter.onStart([]);
    await reporter.onComplete(makeResults({
      suites: [makeSuiteResult({ passed: 15, failed: 3, skipped: 2, duration: 7500 })],
    }));

    const content = await readFile(outputPath, 'utf-8');
    expect(content).toContain('15');
    expect(content).toContain('3');
    expect(content).toContain('2');
    expect(content).toContain('7.5s');
  });

  it('should contain totals row', async () => {
    const outputPath = resolve(tempDir, 'test-summary.log');
    const reporter = new SummaryLogReporter(outputPath);

    reporter.onStart([]);
    await reporter.onComplete(makeResults({
      totals: { passed: 25, failed: 5, skipped: 2, duration: 15000 },
      suites: [makeSuiteResult()],
    }));

    const content = await readFile(outputPath, 'utf-8');
    expect(content).toContain('TOTAL');
    expect(content).toContain('25');
  });

  it('should show ALL TESTS PASSED when success', async () => {
    const outputPath = resolve(tempDir, 'test-summary.log');
    const reporter = new SummaryLogReporter(outputPath);

    reporter.onStart([]);
    await reporter.onComplete(makeResults({ success: true, suites: [makeSuiteResult()] }));

    const content = await readFile(outputPath, 'utf-8');
    expect(content).toContain('ALL TESTS PASSED');
  });

  it('should show TESTS FAILED when not success', async () => {
    const outputPath = resolve(tempDir, 'test-summary.log');
    const reporter = new SummaryLogReporter(outputPath);

    reporter.onStart([]);
    await reporter.onComplete(makeResults({ success: false, suites: [makeSuiteResult()] }));

    const content = await readFile(outputPath, 'utf-8');
    expect(content).toContain('TESTS FAILED');
  });

  it('should contain pass rate', async () => {
    const outputPath = resolve(tempDir, 'test-summary.log');
    const reporter = new SummaryLogReporter(outputPath);

    reporter.onStart([]);
    await reporter.onComplete(makeResults({
      passRate: 83.3,
      totals: { passed: 25, failed: 5, skipped: 0, duration: 1000 },
      suites: [makeSuiteResult()],
    }));

    const content = await readFile(outputPath, 'utf-8');
    expect(content).toContain('Pass Rate: 83.3%');
    expect(content).toContain('Total: 30');
  });

  it('should contain table header row', async () => {
    const outputPath = resolve(tempDir, 'test-summary.log');
    const reporter = new SummaryLogReporter(outputPath);

    reporter.onStart([]);
    await reporter.onComplete(makeResults({ suites: [makeSuiteResult()] }));

    const content = await readFile(outputPath, 'utf-8');
    expect(content).toContain('Suite');
    expect(content).toContain('Passed');
    expect(content).toContain('Failed');
    expect(content).toContain('Skipped');
    expect(content).toContain('Time');
  });
});
