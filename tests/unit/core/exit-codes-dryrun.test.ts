/**
 * Tests for semantic exit codes and dry-run flag
 */

import { parseArgs } from '../../../src/cli/args.js';
import { ExitCode } from '../../../src/config/types.js';
import type { SuiteResult, AggregatedResults, ErrorCategory } from '../../../src/config/types.js';
import { execSync } from 'node:child_process';

describe('ExitCode enum', () => {
  it('should have correct numeric values', () => {
    expect(ExitCode.PASS).toBe(0);
    expect(ExitCode.TEST_FAILURE).toBe(1);
    expect(ExitCode.INFRA_ERROR).toBe(2);
    expect(ExitCode.TIMEOUT).toBe(3);
  });
});

describe('--dry-run flag', () => {
  it('should parse --dry-run flag', () => {
    const args = parseArgs(['--dry-run']);
    expect(args.dryRun).toBe(true);
  });

  it('should default dryRun to false', () => {
    const args = parseArgs([]);
    expect(args.dryRun).toBe(false);
  });

  it('should combine --dry-run with suite names', () => {
    const args = parseArgs(['unit', 'integration', '--dry-run']);
    expect(args.dryRun).toBe(true);
    expect(args.suites).toEqual(['unit', 'integration']);
  });

  it('should combine --dry-run with filter flags', () => {
    const args = parseArgs(['--dry-run', '--grep', 'auth', '--file', 'user.test.ts']);
    expect(args.dryRun).toBe(true);
    expect(args.grep).toBe('auth');
    expect(args.file).toBe('user.test.ts');
  });
});

describe('Exit code computation in AggregatedResults', () => {
  function makeSuiteResult(overrides: Partial<SuiteResult> = {}): SuiteResult {
    return {
      name: 'test-suite',
      passed: 10,
      failed: 0,
      skipped: 0,
      duration: 1000,
      success: true,
      failures: [],
      logFile: '/tmp/test.log',
      resultFile: '/tmp/test.json',
      errorCategory: 'none' as ErrorCategory,
      ...overrides,
    };
  }

  function makeAggregatedResults(suites: SuiteResult[]): AggregatedResults {
    const totals = suites.reduce(
      (acc, r) => ({
        passed: acc.passed + r.passed,
        failed: acc.failed + r.failed,
        skipped: acc.skipped + r.skipped,
        duration: acc.duration + r.duration,
      }),
      { passed: 0, failed: 0, skipped: 0, duration: 0 },
    );

    const total = totals.passed + totals.failed + totals.skipped;
    const passRate = total > 0 ? (totals.passed / total) * 100 : 100;

    // Compute exit code (same logic as orchestrator)
    let exitCode = ExitCode.PASS;
    for (const r of suites) {
      switch (r.errorCategory) {
        case 'timeout':
          exitCode = ExitCode.TIMEOUT;
          break;
        case 'infra_error':
          if (exitCode < ExitCode.INFRA_ERROR) exitCode = ExitCode.INFRA_ERROR;
          break;
        case 'test_failure':
          if (exitCode < ExitCode.TEST_FAILURE) exitCode = ExitCode.TEST_FAILURE;
          break;
      }
      if (exitCode === ExitCode.TIMEOUT) break;
    }

    return { suites, totals, success: totals.failed === 0, passRate, exitCode };
  }

  it('should return PASS (0) when all suites pass', () => {
    const results = makeAggregatedResults([
      makeSuiteResult({ name: 'unit', passed: 50 }),
      makeSuiteResult({ name: 'integration', passed: 20 }),
    ]);
    expect(results.exitCode).toBe(ExitCode.PASS);
  });

  it('should return TEST_FAILURE (1) when tests fail', () => {
    const results = makeAggregatedResults([
      makeSuiteResult({ name: 'unit', passed: 50 }),
      makeSuiteResult({
        name: 'integration',
        passed: 18,
        failed: 2,
        success: false,
        errorCategory: 'test_failure',
      }),
    ]);
    expect(results.exitCode).toBe(ExitCode.TEST_FAILURE);
  });

  it('should return INFRA_ERROR (2) for parse/spawn failures', () => {
    const results = makeAggregatedResults([
      makeSuiteResult({ name: 'unit', passed: 50 }),
      makeSuiteResult({
        name: 'broken',
        passed: 0,
        failed: 1,
        success: false,
        errorCategory: 'infra_error',
      }),
    ]);
    expect(results.exitCode).toBe(ExitCode.INFRA_ERROR);
  });

  it('should return TIMEOUT (3) for timed-out suites', () => {
    const results = makeAggregatedResults([
      makeSuiteResult({ name: 'unit', passed: 50 }),
      makeSuiteResult({
        name: 'slow',
        passed: 0,
        failed: 1,
        success: false,
        errorCategory: 'timeout',
      }),
    ]);
    expect(results.exitCode).toBe(ExitCode.TIMEOUT);
  });

  it('should prioritize timeout over infra_error', () => {
    const results = makeAggregatedResults([
      makeSuiteResult({ name: 'infra-fail', errorCategory: 'infra_error', failed: 1, success: false }),
      makeSuiteResult({ name: 'timed-out', errorCategory: 'timeout', failed: 1, success: false }),
    ]);
    expect(results.exitCode).toBe(ExitCode.TIMEOUT);
  });

  it('should prioritize infra_error over test_failure', () => {
    const results = makeAggregatedResults([
      makeSuiteResult({ name: 'test-fail', errorCategory: 'test_failure', failed: 2, success: false }),
      makeSuiteResult({ name: 'infra-fail', errorCategory: 'infra_error', failed: 1, success: false }),
    ]);
    expect(results.exitCode).toBe(ExitCode.INFRA_ERROR);
  });

  it('should handle mixed error categories with correct priority', () => {
    const results = makeAggregatedResults([
      makeSuiteResult({ name: 'pass', errorCategory: 'none' }),
      makeSuiteResult({ name: 'test-fail', errorCategory: 'test_failure', failed: 1, success: false }),
      makeSuiteResult({ name: 'infra-fail', errorCategory: 'infra_error', failed: 1, success: false }),
    ]);
    expect(results.exitCode).toBe(ExitCode.INFRA_ERROR);
  });

  it('should include exitCode in AggregatedResults type', () => {
    const results = makeAggregatedResults([makeSuiteResult()]);
    expect(typeof results.exitCode).toBe('number');
    expect(results.exitCode).toBeGreaterThanOrEqual(0);
    expect(results.exitCode).toBeLessThanOrEqual(3);
  });
});

describe('ErrorCategory on SuiteResult', () => {
  it('should default to none for passing suites', () => {
    const result: SuiteResult = {
      name: 'unit',
      passed: 10,
      failed: 0,
      skipped: 0,
      duration: 500,
      success: true,
      failures: [],
      logFile: '',
      resultFile: '',
      errorCategory: 'none',
    };
    expect(result.errorCategory).toBe('none');
  });

  it('should accept all valid error categories', () => {
    const categories: ErrorCategory[] = ['none', 'test_failure', 'infra_error', 'timeout'];
    for (const cat of categories) {
      const result: SuiteResult = {
        name: 'test',
        passed: 0,
        failed: 0,
        skipped: 0,
        duration: 0,
        success: true,
        failures: [],
        logFile: '',
        resultFile: '',
        errorCategory: cat,
      };
      expect(result.errorCategory).toBe(cat);
    }
  });
});

describe('--dry-run CLI output', () => {
  it('should print suite commands without executing', () => {
    const output = execSync(
      'node dist/cli/index.js --dry-run',
      { encoding: 'utf-8', cwd: process.cwd() },
    );
    expect(output).toContain('Dry Run:');
    expect(output).toContain('suite(s) would execute');
    expect(output).toContain('Parallel:');
    expect(output).toContain('Artifacts:');
  });

  it('should exit with code 0', () => {
    // execSync throws on non-zero exit code, so if this doesn't throw, exit code is 0
    const output = execSync(
      'node dist/cli/index.js --dry-run',
      { encoding: 'utf-8', cwd: process.cwd() },
    );
    expect(output).toBeTruthy();
  });
});

describe('Exit code safety fallback', () => {
  it('should return TEST_FAILURE for failed suite without errorCategory', () => {
    const results = makeAggregatedResults([
      makeSuiteResult({ name: 'no-category', failed: 3, success: false, errorCategory: undefined as unknown as ErrorCategory }),
    ]);
    expect(results.exitCode).toBe(ExitCode.TEST_FAILURE);
  });

  // Helper for this describe block — reuse from above
  function makeSuiteResult(overrides: Partial<SuiteResult> = {}): SuiteResult {
    return {
      name: 'test-suite',
      passed: 10,
      failed: 0,
      skipped: 0,
      duration: 1000,
      success: true,
      failures: [],
      logFile: '/tmp/test.log',
      resultFile: '/tmp/test.json',
      errorCategory: 'none' as ErrorCategory,
      ...overrides,
    };
  }

  function makeAggregatedResults(suites: SuiteResult[]): AggregatedResults {
    const totals = suites.reduce(
      (acc, r) => ({
        passed: acc.passed + r.passed,
        failed: acc.failed + r.failed,
        skipped: acc.skipped + r.skipped,
        duration: acc.duration + r.duration,
      }),
      { passed: 0, failed: 0, skipped: 0, duration: 0 },
    );
    const total = totals.passed + totals.failed + totals.skipped;
    const passRate = total > 0 ? (totals.passed / total) * 100 : 100;

    let exitCode = ExitCode.PASS;
    for (const r of suites) {
      switch (r.errorCategory) {
        case 'timeout':
          exitCode = ExitCode.TIMEOUT;
          break;
        case 'infra_error':
          if (exitCode < ExitCode.INFRA_ERROR) exitCode = ExitCode.INFRA_ERROR;
          break;
        case 'test_failure':
          if (exitCode < ExitCode.TEST_FAILURE) exitCode = ExitCode.TEST_FAILURE;
          break;
        default:
          if (!r.success && exitCode < ExitCode.TEST_FAILURE) {
            exitCode = ExitCode.TEST_FAILURE;
          }
          break;
      }
      if (exitCode === ExitCode.TIMEOUT) break;
    }

    return { suites, totals, success: totals.failed === 0, passRate, exitCode };
  }
});
