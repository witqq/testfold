/**
 * Tests for Plain Text Reporter
 */

import { mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TextReporter } from '../../../src/reporters/text.js';
import type { AggregatedResults, SuiteResult } from '../../../src/config/types.js';

describe('TextReporter', () => {
  const testDir = join(process.cwd(), 'test-text-reporter');
  const outputPath = join(testDir, 'results.txt');

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

  function createResults(suites: SuiteResult[], success = true): AggregatedResults {
    const totals = {
      passed: suites.reduce((sum, s) => sum + s.passed, 0),
      failed: suites.reduce((sum, s) => sum + s.failed, 0),
      skipped: suites.reduce((sum, s) => sum + s.skipped, 0),
      duration: suites.reduce((sum, s) => sum + s.duration, 0),
    };
    return {
      suites,
      totals,
      success,
      passRate: totals.passed / (totals.passed + totals.failed) * 100 || 100,
    };
  }

  it('generates plain text output without ANSI codes', async () => {
    const reporter = new TextReporter(outputPath);
    const results = createResults([
      {
        name: 'Unit',
        passed: 10,
        failed: 0,
        skipped: 0,
        duration: 1000,
        success: true,
        failures: [],
        logFile: 'unit.log',
        resultFile: 'unit.json',
      },
    ]);

    await reporter.onComplete(results);

    const content = readFileSync(outputPath, 'utf-8');

    // Should not contain ANSI escape codes
    expect(content).not.toMatch(/\x1b\[/);
    // Should contain plain text
    expect(content).toContain('TEST RESULTS');
    expect(content).toContain('Status: PASSED');
    expect(content).toContain('Unit: PASS');
  });

  it('does not contain markdown formatting', async () => {
    const reporter = new TextReporter(outputPath);
    const results = createResults([
      {
        name: 'Unit',
        passed: 5,
        failed: 1,
        skipped: 0,
        duration: 500,
        success: false,
        failures: [
          {
            testName: 'should work',
            filePath: 'test.ts',
            error: 'Expected true',
          },
        ],
        logFile: 'unit.log',
        resultFile: 'unit.json',
      },
    ], false);

    await reporter.onComplete(results);

    const content = readFileSync(outputPath, 'utf-8');

    // Should not contain markdown formatting
    expect(content).not.toContain('**');
    expect(content).not.toContain('##');
    expect(content).not.toContain('```');
    expect(content).not.toContain('*');
    // Should contain plain status
    expect(content).toContain('Status: FAILED');
  });

  it('includes failure details', async () => {
    const reporter = new TextReporter(outputPath);
    const results = createResults([
      {
        name: 'Integration',
        passed: 2,
        failed: 2,
        skipped: 0,
        duration: 2000,
        success: false,
        failures: [
          {
            testName: 'API > Users > should create user',
            filePath: 'api.test.ts',
            error: 'Expected 201, got 500',
          },
          {
            testName: 'simple test',
            filePath: 'simple.test.ts',
            error: 'Assertion failed',
          },
        ],
        logFile: 'int.log',
        resultFile: 'int.json',
      },
    ], false);

    await reporter.onComplete(results);

    const content = readFileSync(outputPath, 'utf-8');

    // Should include failure info
    expect(content).toContain('Failures:');
    expect(content).toContain('API > Users > should create user');
    expect(content).toContain('File: api.test.ts');
    expect(content).toContain('Error: Expected 201, got 500');
    expect(content).toContain('simple test');
  });

  it('formats totals correctly', async () => {
    const reporter = new TextReporter(outputPath);
    const results = createResults([
      {
        name: 'Unit',
        passed: 50,
        failed: 5,
        skipped: 3,
        duration: 5000,
        success: false,
        failures: [],
        logFile: 'unit.log',
        resultFile: 'unit.json',
      },
    ], false);

    await reporter.onComplete(results);

    const content = readFileSync(outputPath, 'utf-8');

    expect(content).toContain('Passed:  50');
    expect(content).toContain('Failed:  5');
    expect(content).toContain('Skipped: 3');
    expect(content).toContain('Duration: 5.0s');
    expect(content).toContain('Pass Rate: 90.9%');
  });

  it('includes multiple suites', async () => {
    const reporter = new TextReporter(outputPath);
    const results = createResults([
      {
        name: 'Unit',
        passed: 20,
        failed: 0,
        skipped: 0,
        duration: 1000,
        success: true,
        failures: [],
        logFile: 'unit.log',
        resultFile: 'unit.json',
      },
      {
        name: 'E2E',
        passed: 5,
        failed: 1,
        skipped: 0,
        duration: 3000,
        success: false,
        failures: [
          { testName: 'login test', filePath: 'login.test.ts', error: 'Timeout' },
        ],
        logFile: 'e2e.log',
        resultFile: 'e2e.json',
      },
    ], false);

    await reporter.onComplete(results);

    const content = readFileSync(outputPath, 'utf-8');

    expect(content).toContain('Unit: PASS');
    expect(content).toContain('E2E: FAIL');
    expect(content).toContain('Suites:');
  });

  it('handles empty error gracefully', async () => {
    const reporter = new TextReporter(outputPath);
    const results = createResults([
      {
        name: 'Unit',
        passed: 0,
        failed: 1,
        skipped: 0,
        duration: 100,
        success: false,
        failures: [
          { testName: 'test', filePath: 'test.ts', error: '' },
        ],
        logFile: 'unit.log',
        resultFile: 'unit.json',
      },
    ], false);

    await reporter.onComplete(results);

    const content = readFileSync(outputPath, 'utf-8');
    // Should not throw, file should exist
    expect(content).toContain('test');
  });
});
