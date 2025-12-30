/**
 * Test Orchestrator - coordinates suite execution
 */

import { join } from 'node:path';
import type { ValidatedConfig } from '../config/schema.js';
import type { Suite, SuiteResult, AggregatedResults } from '../config/types.js';
import type { Reporter } from '../reporters/types.js';
import { JestParser } from '../parsers/jest.js';
import { PlaywrightParser } from '../parsers/playwright.js';
import { executeCommand } from './executor.js';

export interface OrchestratorOptions {
  config: ValidatedConfig;
  reporters: Reporter[];
  environment?: string;
  cwd: string;
}

export class Orchestrator {
  private config: ValidatedConfig;
  private reporters: Reporter[];
  private environment?: string;
  private cwd: string;

  constructor(options: OrchestratorOptions) {
    this.config = options.config;
    this.reporters = options.reporters;
    this.environment = options.environment;
    this.cwd = options.cwd;
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
    // Run before hook
    if (this.config.hooks?.beforeSuite) {
      await this.config.hooks.beforeSuite(suite);
    }

    // Determine environment
    const envConfig =
      this.environment && suite.environments
        ? suite.environments[this.environment]
        : undefined;

    // Build env variables
    const env: Record<string, string> = {
      ...suite.env,
      ...(envConfig && typeof envConfig === 'object' ? envConfig.env : {}),
    };

    if (envConfig && typeof envConfig === 'object' && envConfig.baseUrl) {
      env['TEST_BASE_URL'] = envConfig.baseUrl;
    }

    // Determine file paths
    const resultFile = join(this.config.artifactsDir, suite.resultFile);
    const logFile =
      suite.logFile ??
      join(
        this.config.artifactsDir,
        suite.resultFile.replace('.json', '.log'),
      );

    // Execute command
    const execResult = await executeCommand(suite, {
      cwd: this.cwd,
      env,
      timeout: suite.timeout,
      logFile,
    });

    // Parse results
    const parser = this.getParser(suite.type);
    const parseResult = await parser.parse(resultFile, logFile);

    const result: SuiteResult = {
      name: suite.name,
      passed: parseResult.passed,
      failed: parseResult.failed,
      skipped: parseResult.skipped,
      duration: parseResult.duration || execResult.duration,
      success: parseResult.success && execResult.exitCode === 0,
      failures: parseResult.failures,
      logFile,
      resultFile,
    };

    // Notify reporters
    for (const reporter of this.reporters) {
      reporter.onSuiteComplete(suite, result);
    }

    // Run after hook
    if (this.config.hooks?.afterSuite) {
      await this.config.hooks.afterSuite(suite, result);
    }

    return result;
  }

  private getParser(type: Suite['type']) {
    switch (type) {
      case 'jest':
        return new JestParser();
      case 'playwright':
        return new PlaywrightParser();
      case 'custom':
        // TODO: Support custom parsers
        throw new Error('Custom parsers not yet implemented');
      default:
        throw new Error(`Unknown parser type: ${type}`);
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

    return {
      suites: results,
      totals,
      success: totals.failed === 0,
      passRate,
    };
  }
}
