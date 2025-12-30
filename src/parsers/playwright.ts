/**
 * Playwright JSON Result Parser
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import type { Parser, ParseResult, TestResult } from './types.js';
import type { FailureDetail } from '../config/types.js';

interface PlaywrightResult {
  config: unknown;
  suites: PlaywrightSuite[];
  stats: {
    startTime: string;
    duration: number;
    expected: number;
    unexpected: number;
    skipped: number;
    flaky: number;
  };
}

interface PlaywrightSuite {
  title: string;
  file: string;
  specs: PlaywrightSpec[];
  suites?: PlaywrightSuite[];
}

interface PlaywrightSpec {
  title: string;
  ok: boolean;
  tests: PlaywrightTest[];
}

interface PlaywrightTest {
  title: string;
  results: PlaywrightTestResult[];
}

interface PlaywrightTestResult {
  status: 'passed' | 'failed' | 'timedOut' | 'skipped';
  duration: number;
  error?: {
    message: string;
    stack?: string;
  };
  errors?: Array<{ message: string; stack?: string }>;
  stdout?: Array<{ text?: string }>;
  stderr?: Array<{ text?: string }>;
  attachments?: Array<{ name: string; path: string }>;
}

export class PlaywrightParser implements Parser {
  async parse(jsonPath: string, _logPath?: string): Promise<ParseResult> {
    if (!existsSync(jsonPath)) {
      return {
        passed: 0,
        failed: 0,
        skipped: 0,
        duration: 0,
        success: true,
        failures: [],
      };
    }

    const content = await readFile(jsonPath, 'utf-8');
    const data = JSON.parse(content) as PlaywrightResult;

    const failures: FailureDetail[] = [];
    const testResults: TestResult[] = [];

    this.collectResults(data.suites, '', failures, testResults);

    return {
      passed: data.stats.expected,
      failed: data.stats.unexpected,
      skipped: data.stats.skipped,
      duration: data.stats.duration,
      success: data.stats.unexpected === 0,
      failures,
      testResults,
    };
  }

  private collectResults(
    suites: PlaywrightSuite[],
    parentTitle: string,
    failures: FailureDetail[],
    testResults: TestResult[],
  ): void {
    for (const suite of suites) {
      const suiteTitle = parentTitle
        ? `${parentTitle} > ${suite.title}`
        : suite.title;

      for (const spec of suite.specs) {
        for (const test of spec.tests) {
          // Take last result (after retries)
          const lastResult = test.results[test.results.length - 1];
          if (!lastResult) continue;

          const fullName = `${suiteTitle} > ${spec.title}`;

          testResults.push({
            name: fullName,
            file: suite.file,
            status:
              lastResult.status === 'passed'
                ? 'passed'
                : lastResult.status === 'skipped'
                  ? 'skipped'
                  : 'failed',
            duration: lastResult.duration,
          });

          if (!spec.ok && lastResult.status !== 'passed') {
            const error =
              lastResult.error?.message ||
              lastResult.errors?.map((e) => e.message).join('\n') ||
              'Unknown error';

            const stack =
              lastResult.error?.stack ||
              lastResult.errors?.map((e) => e.stack).join('\n');

            const stdout = lastResult.stdout
              ?.map((s) => s.text)
              .filter(Boolean)
              .join('\n');

            const stderr = lastResult.stderr
              ?.map((s) => s.text)
              .filter(Boolean)
              .join('\n');

            failures.push({
              testName: fullName,
              filePath: suite.file,
              error,
              stack,
              stdout: stdout || undefined,
              stderr: stderr || undefined,
              attachments: lastResult.attachments?.map((a) => ({
                name: a.name,
                path: a.path,
              })),
              duration: lastResult.duration,
            });
          }
        }
      }

      // Recurse into nested suites
      if (suite.suites) {
        this.collectResults(suite.suites, suiteTitle, failures, testResults);
      }
    }
  }
}
