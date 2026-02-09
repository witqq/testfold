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
  async parse(jsonPath: string, logPath?: string): Promise<ParseResult> {
    const jsonExists = existsSync(jsonPath);
    let content = '';

    if (jsonExists) {
      content = (await readFile(jsonPath, 'utf-8')).trim();
    }

    if (!jsonExists || content === '') {
      // Check if framework crashed by looking at log
      if (logPath && existsSync(logPath)) {
        const log = await readFile(logPath, 'utf-8');
        if (this.detectFrameworkCrash(log)) {
          return {
            passed: 0,
            failed: 1,
            skipped: 0,
            duration: 0,
            success: false,
            failures: [
              {
                testName: 'Framework Crash',
                filePath: '',
                error: this.extractErrorSnippet(log),
              },
            ],
          };
        }
      }

      return {
        passed: 0,
        failed: 0,
        skipped: 0,
        duration: 0,
        success: true,
        failures: [],
      };
    }

    let data: PlaywrightResult;
    try {
      data = JSON.parse(content) as PlaywrightResult;
    } catch {
      // Corrupted/truncated JSON — try crash detection from log
      if (logPath && existsSync(logPath)) {
        const log = await readFile(logPath, 'utf-8');
        if (this.detectFrameworkCrash(log)) {
          return {
            passed: 0,
            failed: 1,
            skipped: 0,
            duration: 0,
            success: false,
            failures: [
              {
                testName: 'Framework Crash',
                filePath: '',
                error: this.extractErrorSnippet(log),
              },
            ],
          };
        }
      }

      return {
        passed: 0,
        failed: 1,
        skipped: 0,
        duration: 0,
        success: false,
        failures: [
          {
            testName: 'Result Parse Error',
            filePath: jsonPath,
            error: 'JSON result file is corrupted or truncated',
          },
        ],
      };
    }

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

            // Collect stdout/stderr/attachments from all results (all retry attempts)
            const allStdout: string[] = [];
            const allStderr: string[] = [];
            const allAttachments: Array<{ name: string; path: string }> = [];

            for (const result of test.results) {
              if (result.stdout) {
                for (const s of result.stdout) {
                  if (s.text) allStdout.push(s.text);
                }
              }
              if (result.stderr) {
                for (const s of result.stderr) {
                  if (s.text) allStderr.push(s.text);
                }
              }
              if (result.attachments) {
                for (const a of result.attachments) {
                  allAttachments.push({ name: a.name, path: a.path });
                }
              }
            }

            failures.push({
              testName: fullName,
              filePath: suite.file,
              error,
              stack,
              stdout: allStdout.length > 0 ? allStdout.join('\n') : undefined,
              stderr: allStderr.length > 0 ? allStderr.join('\n') : undefined,
              attachments:
                allAttachments.length > 0 ? allAttachments : undefined,
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

  private detectFrameworkCrash(log: string): boolean {
    const errorPatterns = [
      'Error:',
      'ReferenceError',
      'SyntaxError',
      'TypeError',
      'Timed out',
      'ECONNREFUSED',
      'globalSetup',
      'failed to run',
      'Cannot find module',
    ];
    return errorPatterns.some((pattern) => log.includes(pattern));
  }

  private extractErrorSnippet(log: string, lines = 10): string {
    const logLines = log.split('\n');
    const errorIndex = logLines.findIndex(
      (line) =>
        line.includes('Error:') ||
        line.includes('failed') ||
        line.includes('Cannot find') ||
        line.includes('globalSetup'),
    );

    if (errorIndex === -1) {
      return logLines.slice(0, lines).join('\n');
    }

    const start = Math.max(0, errorIndex - 2);
    const end = Math.min(logLines.length, errorIndex + lines);
    return logLines.slice(start, end).join('\n');
  }
}
