/**
 * Test Orchestrator - coordinates suite execution
 */

import { join } from 'node:path';
import type { ValidatedConfig } from '../config/schema.js';
import type { Suite, SuiteResult, AggregatedResults, GuardResult, ErrorCategory } from '../config/types.js';
import { ExitCode } from '../config/types.js';
import type { Reporter } from '../reporters/types.js';
import type { ParseResult } from '../parsers/types.js';
import { JestParser } from '../parsers/jest.js';
import { PlaywrightParser } from '../parsers/playwright.js';
import { CustomParserLoader } from '../parsers/custom.js';
import { executeCommand } from './executor.js';
import { readEnvFileContent } from '../config/env-loader.js';
import { createProgressCallback } from '../utils/progress.js';

export interface OrchestratorOptions {
  config: ValidatedConfig;
  reporters: Reporter[];
  environment?: string;
  cwd: string;
  /** Pass-through arguments appended to test commands */
  passThrough?: string[];
  /** Environment variables loaded from .env file */
  envFileVars?: Record<string, string>;
  /** Grep pattern to filter tests by name */
  grep?: string;
  /** Grep-invert pattern to exclude tests by name */
  grepInvert?: string;
  /** Filter by test file path */
  file?: string;
}

export class Orchestrator {
  private config: ValidatedConfig;
  private reporters: Reporter[];
  private environment?: string;
  private cwd: string;
  private passThrough: string[];
  private envFileVars: Record<string, string>;
  private grep?: string;
  private grepInvert?: string;
  private file?: string;

  constructor(options: OrchestratorOptions) {
    this.config = options.config;
    this.reporters = options.reporters;
    this.environment = options.environment;
    this.cwd = options.cwd;
    this.passThrough = options.passThrough ?? [];
    this.envFileVars = options.envFileVars ?? {};
    this.grep = options.grep;
    this.grepInvert = options.grepInvert;
    this.file = options.file;
  }

  async run(suiteNames?: string[]): Promise<AggregatedResults> {
    // Filter suites if specific ones requested
    const suitesToRun = suiteNames
      ? this.config.suites.filter(
          (s) =>
            suiteNames.includes(s.name) ||
            suiteNames.includes(s.name.toLowerCase()),
        )
      : this.config.suites;

    if (suitesToRun.length === 0) {
      throw new Error(
        suiteNames
          ? `No matching suites found: ${suiteNames.join(', ')}`
          : 'No suites configured',
      );
    }

    // Notify reporters
    for (const reporter of this.reporters) {
      reporter.onStart(suitesToRun);
    }

    // Run hooks
    if (this.config.hooks?.beforeAll) {
      await this.config.hooks.beforeAll();
    }

    // Execute suites
    const results = this.config.parallel
      ? await this.runParallel(suitesToRun)
      : await this.runSequential(suitesToRun);

    // Aggregate results
    const aggregated = this.aggregate(results);

    // Run hooks
    if (this.config.hooks?.afterAll) {
      await this.config.hooks.afterAll(aggregated);
    }

    // Notify reporters
    for (const reporter of this.reporters) {
      await reporter.onComplete(aggregated);
    }

    return aggregated;
  }

  private async runParallel(suites: Suite[]): Promise<SuiteResult[]> {
    const promises = suites.map((suite) => this.runSuite(suite));
    return Promise.all(promises);
  }

  private async runSequential(suites: Suite[]): Promise<SuiteResult[]> {
    const results: SuiteResult[] = [];

    for (const suite of suites) {
      const result = await this.runSuite(suite);
      results.push(result);

      if (this.config.failFast && !result.success) {
        break;
      }
    }

    return results;
  }

  private async runSuite(suite: Suite): Promise<SuiteResult> {
    // Run before hook and check guard result
    if (this.config.hooks?.beforeSuite) {
      const guardResult = await this.config.hooks.beforeSuite(suite);
      if (guardResult && typeof guardResult === 'object' && 'ok' in guardResult && !guardResult.ok) {
        const errorMsg = (guardResult as GuardResult).error ?? 'beforeSuite guard failed';
        const result: SuiteResult = {
          name: suite.name,
          passed: 0,
          failed: 1,
          skipped: 0,
          duration: 0,
          success: false,
          failures: [{ testName: 'beforeSuite Guard', filePath: '', error: errorMsg }],
          logFile: '',
          resultFile: '',
          errorCategory: 'infra_error',
        };
        for (const reporter of this.reporters) {
          reporter.onSuiteComplete(suite, result);
        }
        return result;
      }
    }

    // Determine environment
    const envConfig =
      this.environment && suite.environments
        ? suite.environments[this.environment]
        : undefined;

    // Build env variables: suite.env < envFileVars < envConfig.env
    const env: Record<string, string> = {
      ...suite.env,
      ...this.envFileVars,
      ...(envConfig && typeof envConfig === 'object' ? envConfig.env : {}),
    };

    // Determine baseUrl - static or extracted from env file
    if (envConfig && typeof envConfig === 'object') {
      if (envConfig.urlExtractor && envConfig.envFile) {
        // Extract URL from env file using extractor function
        const envContent = readEnvFileContent(envConfig.envFile, this.cwd);
        if (envContent) {
          const extractedUrl = envConfig.urlExtractor(envContent);
          if (extractedUrl) {
            env['TEST_BASE_URL'] = extractedUrl;
          }
        }
      } else if (envConfig.baseUrl) {
        // Use static baseUrl
        env['TEST_BASE_URL'] = envConfig.baseUrl;
      }
    }

    // Determine file paths
    const resultFile = join(this.config.artifactsDir, suite.resultFile);
    const logFile =
      suite.logFile ??
      join(
        this.config.artifactsDir,
        suite.resultFile.replace('.json', '.log'),
      );

    // Execute command with progress tracking
    const progress = createProgressCallback(suite.name, suite.type);
    const execResult = await executeCommand(suite, {
      cwd: this.cwd,
      env,
      timeout: suite.timeout,
      logFile,
      passThrough: this.passThrough,
      testsDir: this.config.testsDir,
      grep: this.grep,
      grepInvert: this.grepInvert,
      file: this.file,
      onOutput: progress.onOutput,
    });

    // Parse results with graceful error recovery
    // Attempt to parse even if executor returned non-zero exit code
    let parseResult: ParseResult;
    let errorCategory: ErrorCategory = 'none';

    // Determine initial error category from executor result
    if (execResult.exitCode === 124) {
      errorCategory = 'timeout';
    }

    try {
      const parser = this.getParser(suite);
      parseResult = await parser.parse(resultFile, logFile);
    } catch (parseError) {
      // Parse failure = infrastructure error
      errorCategory = errorCategory === 'timeout' ? 'timeout' : 'infra_error';
      parseResult = {
        passed: 0,
        failed: 1,
        skipped: 0,
        duration: 0,
        success: false,
        failures: [
          {
            testName: 'Result Parse Error',
            filePath: resultFile,
            error:
              parseError instanceof Error
                ? parseError.message
                : String(parseError),
          },
        ],
      };
    }

    // If no category set yet, determine from test results
    if (errorCategory === 'none' && parseResult.failed > 0) {
      errorCategory = 'test_failure';
    }

    // Success is determined by test results, not executor exit code
    // This allows partial results from failed runs to be reported
    const result: SuiteResult = {
      name: suite.name,
      passed: parseResult.passed,
      failed: parseResult.failed,
      skipped: parseResult.skipped,
      duration: parseResult.duration || execResult.duration,
      success: parseResult.failed === 0 && parseResult.success !== false,
      failures: parseResult.failures,
      logFile,
      resultFile,
      testResults: parseResult.testResults,
      errorCategory,
    };

    // Run after hook and check guard result
    if (this.config.hooks?.afterSuite) {
      const guardResult = await this.config.hooks.afterSuite(suite, result);
      if (guardResult && typeof guardResult === 'object' && 'ok' in guardResult && !guardResult.ok) {
        const errorMsg = (guardResult as GuardResult).error ?? 'afterSuite guard failed';
        result.success = false;
        result.failed += 1;
        result.failures.push({ testName: 'afterSuite Guard', filePath: '', error: errorMsg });
        if (!result.errorCategory || result.errorCategory === 'none') {
          result.errorCategory = 'infra_error';
        }
      }
    }

    // Notify reporters (after guard check so reporters see final state)
    for (const reporter of this.reporters) {
      reporter.onSuiteComplete(suite, result);
    }

    return result;
  }

  private getParser(suite: Suite) {
    switch (suite.type) {
      case 'jest':
        return new JestParser();
      case 'playwright':
        return new PlaywrightParser();
      case 'custom':
        if (!suite.parser) {
          throw new Error(
            `Suite "${suite.name}" has type "custom" but no parser path specified`,
          );
        }
        return new CustomParserLoader(suite.parser, this.cwd);
      default:
        throw new Error(`Unknown parser type: ${suite.type}`);
    }
  }

  private aggregate(results: SuiteResult[]): AggregatedResults {
    const totals = results.reduce(
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

    // Compute semantic exit code: worst category wins
    // Priority: timeout > infra_error > test_failure > pass
    const exitCode = this.computeExitCode(results);

    return {
      suites: results,
      totals,
      success: totals.failed === 0,
      passRate,
      exitCode,
    };
  }

  /**
   * Compute semantic exit code from suite results.
   * Priority: timeout (3) > infra_error (2) > test_failure (1) > pass (0)
   */
  private computeExitCode(results: SuiteResult[]): ExitCode {
    let worst = ExitCode.PASS;

    for (const r of results) {
      switch (r.errorCategory) {
        case 'timeout':
          return ExitCode.TIMEOUT; // highest priority, return immediately
        case 'infra_error':
          worst = ExitCode.INFRA_ERROR;
          break;
        case 'test_failure':
          if (worst < ExitCode.TEST_FAILURE) {
            worst = ExitCode.TEST_FAILURE;
          }
          break;
        default:
          // Safety fallback: if suite failed but has no errorCategory, treat as test failure
          if (!r.success && worst < ExitCode.TEST_FAILURE) {
            worst = ExitCode.TEST_FAILURE;
          }
          break;
      }
    }

    return worst;
  }
}
