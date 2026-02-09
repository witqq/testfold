import { resolve } from 'node:path';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { TimingTextReporter } from '../../../src/reporters/timing-text.js';
import type { AggregatedResults, Suite, SuiteResult } from '../../../src/config/types.js';

describe('TimingTextReporter', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(resolve(tmpdir(), 'timing-text-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  function makeSuite(name: string): Suite {
    return { name, type: 'jest', command: `jest ${name}`, resultFile: `${name}.json` };
  }

  function makeResult(overrides: Partial<SuiteResult> = {}): SuiteResult {
    return {
      name: 'test-suite',
      passed: 5,
      failed: 0,
      skipped: 0,
      duration: 10000,
      success: true,
      failures: [],
      logFile: 'test.log',
      resultFile: 'test.json',
      ...overrides,
    };
  }

  it('should create timing txt file per suite', async () => {
    const reporter = new TimingTextReporter({ outputDir: tempDir });
    const suite = makeSuite('unit');
    reporter.onStart([suite]);
    reporter.onSuiteComplete(suite, makeResult());
    await reporter.onComplete({} as AggregatedResults);

    expect(existsSync(resolve(tempDir, 'unit-timing.txt'))).toBe(true);
  });

  it('should include suite name and total duration', async () => {
    const reporter = new TimingTextReporter({ outputDir: tempDir });
    const suite = makeSuite('integration');
    reporter.onStart([suite]);
    reporter.onSuiteComplete(suite, makeResult({ duration: 45000 }));
    await reporter.onComplete({} as AggregatedResults);

    const content = await readFile(resolve(tempDir, 'integration-timing.txt'), 'utf-8');
    expect(content).toContain('Timing Report: integration');
    expect(content).toContain('Total Duration: 45.0s');
  });

  it('should list slowest tests sorted by duration', async () => {
    const reporter = new TimingTextReporter({ outputDir: tempDir, topTests: 3 });
    const suite = makeSuite('unit');
    reporter.onStart([suite]);
    reporter.onSuiteComplete(suite, makeResult({
      testResults: [
        { name: 'fast test', file: 'a.test.ts', duration: 100, status: 'passed' },
        { name: 'slow test', file: 'b.test.ts', duration: 5000, status: 'passed' },
        { name: 'medium test', file: 'c.test.ts', duration: 1500, status: 'passed' },
        { name: 'slowest test', file: 'd.test.ts', duration: 8000, status: 'passed' },
        { name: 'tiny test', file: 'e.test.ts', duration: 10, status: 'passed' },
      ],
    }));
    await reporter.onComplete({} as AggregatedResults);

    const content = await readFile(resolve(tempDir, 'unit-timing.txt'), 'utf-8');
    const lines = content.split('\n');
    // Find lines between "Slowest Tests" header and next blank line
    const headerIdx = lines.findIndex((l) => l.includes('Slowest Tests'));
    const sectionLines = lines.slice(headerIdx + 2); // skip header + separator
    const testLines: string[] = [];
    for (const l of sectionLines) {
      if (l.trim() === '') break;
      if (l.match(/^\s+\d+\./)) testLines.push(l);
    }

    // Top 3 only
    expect(testLines).toHaveLength(3);
    // Sorted: slowest first
    expect(testLines[0]).toContain('slowest test');
    expect(testLines[1]).toContain('slow test');
    expect(testLines[2]).toContain('medium test');
  });

  it('should show file-level grouping', async () => {
    const reporter = new TimingTextReporter({ outputDir: tempDir });
    const suite = makeSuite('unit');
    reporter.onStart([suite]);
    reporter.onSuiteComplete(suite, makeResult({
      testResults: [
        { name: 'test 1', file: 'auth.test.ts', duration: 200, status: 'passed' },
        { name: 'test 2', file: 'auth.test.ts', duration: 300, status: 'passed' },
        { name: 'test 3', file: 'db.test.ts', duration: 100, status: 'passed' },
      ],
    }));
    await reporter.onComplete({} as AggregatedResults);

    const content = await readFile(resolve(tempDir, 'unit-timing.txt'), 'utf-8');
    expect(content).toContain('Files by Test Duration');
    expect(content).toContain('auth.test.ts');
    expect(content).toContain('(2 tests)');
  });

  it('should show setup/teardown overhead', async () => {
    const reporter = new TimingTextReporter({ outputDir: tempDir });
    const suite = makeSuite('e2e');
    reporter.onStart([suite]);
    // Suite took 10s but tests only 3s → 7s overhead
    reporter.onSuiteComplete(suite, makeResult({
      duration: 10000,
      testResults: [
        { name: 'test 1', file: 'a.test.ts', duration: 1000, status: 'passed' },
        { name: 'test 2', file: 'a.test.ts', duration: 2000, status: 'passed' },
      ],
    }));
    await reporter.onComplete({} as AggregatedResults);

    const content = await readFile(resolve(tempDir, 'e2e-timing.txt'), 'utf-8');
    expect(content).toContain('Setup/Teardown Overhead: 7.0s');
  });

  it('should handle suites with no test results', async () => {
    const reporter = new TimingTextReporter({ outputDir: tempDir });
    const suite = makeSuite('empty');
    reporter.onStart([suite]);
    reporter.onSuiteComplete(suite, makeResult({ testResults: undefined }));
    await reporter.onComplete({} as AggregatedResults);

    const content = await readFile(resolve(tempDir, 'empty-timing.txt'), 'utf-8');
    expect(content).toContain('No individual test results');
  });

  it('should create files for multiple suites', async () => {
    const reporter = new TimingTextReporter({ outputDir: tempDir });
    const s1 = makeSuite('unit');
    const s2 = makeSuite('e2e');
    reporter.onStart([s1, s2]);
    reporter.onSuiteComplete(s1, makeResult());
    reporter.onSuiteComplete(s2, makeResult());
    await reporter.onComplete({} as AggregatedResults);

    expect(existsSync(resolve(tempDir, 'unit-timing.txt'))).toBe(true);
    expect(existsSync(resolve(tempDir, 'e2e-timing.txt'))).toBe(true);
  });

  it('should format duration correctly', async () => {
    const reporter = new TimingTextReporter({ outputDir: tempDir });
    const suite = makeSuite('unit');
    reporter.onStart([suite]);
    reporter.onSuiteComplete(suite, makeResult({
      duration: 500,
      testResults: [
        { name: 'fast', file: 'a.test.ts', duration: 50, status: 'passed' },
        { name: 'slow', file: 'b.test.ts', duration: 2500, status: 'passed' },
      ],
    }));
    await reporter.onComplete({} as AggregatedResults);

    const content = await readFile(resolve(tempDir, 'unit-timing.txt'), 'utf-8');
    expect(content).toContain('500ms'); // sub-second
    expect(content).toContain('2.5s'); // seconds
    expect(content).toContain('50ms'); // ms
  });

  it('should sanitize suite names for filenames', async () => {
    const reporter = new TimingTextReporter({ outputDir: tempDir });
    const suite = makeSuite('E2E Browser');
    reporter.onStart([suite]);
    reporter.onSuiteComplete(suite, makeResult());
    await reporter.onComplete({} as AggregatedResults);

    expect(existsSync(resolve(tempDir, 'e2e-browser-timing.txt'))).toBe(true);
  });
});
