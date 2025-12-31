/**
 * Jest JSON Result Parser
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import type { Parser, ParseResult, TestResult } from './types.js';
import type { FailureDetail } from '../config/types.js';

interface JestResult {
  numPassedTests: number;
  numFailedTests: number;
  numFailedTestSuites: number;
  numPendingTests: number;
  numTotalTests: number;
  success: boolean;
  testResults: JestTestFileResult[];
}

interface JestTestFileResult {
  name: string;
  status: 'passed' | 'failed';
  message: string;
  assertionResults: JestAssertionResult[];
  startTime: number;
  endTime: number;
}

interface JestAssertionResult {
  ancestorTitles: string[];
  title: string;
  status: 'passed' | 'failed' | 'pending';
  duration: number | null;
  failureMessages: string[];
}

export class JestParser implements Parser {
  async parse(jsonPath: string, logPath?: string): Promise<ParseResult> {
    if (!existsSync(jsonPath)) {
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

    const content = await readFile(jsonPath, 'utf-8');
    const data = JSON.parse(content) as JestResult;

    const failures: FailureDetail[] = [];
    const testResults: TestResult[] = [];
    let totalDuration = 0;

    let crashedSuites = 0;

    for (const fileResult of data.testResults) {
      const fileDuration = fileResult.endTime - fileResult.startTime;
      totalDuration += fileDuration;

      // Handle crashed test suite (failed to run, no assertions)
      if (
        fileResult.status === 'failed' &&
        fileResult.assertionResults.length === 0
      ) {
        crashedSuites++;
        failures.push({
          testName: 'Test Suite Crash',
          filePath: fileResult.name,
          error: fileResult.message || 'Test suite failed to run',
        });
        continue;
      }

      for (const assertion of fileResult.assertionResults) {
        const fullName = [...assertion.ancestorTitles, assertion.title].join(
          ' > ',
        );

        testResults.push({
          name: fullName,
          file: fileResult.name,
          status: assertion.status === 'pending' ? 'skipped' : assertion.status,
          duration: assertion.duration ?? 0,
        });

        if (assertion.status === 'failed') {
          failures.push({
            testName: fullName,
            filePath: fileResult.name,
            error: assertion.failureMessages.join('\n\n'),
            duration: assertion.duration ?? undefined,
          });
        }
      }
    }

    return {
      passed: data.numPassedTests,
      failed: data.numFailedTests + crashedSuites,
      skipped: data.numPendingTests,
      duration: totalDuration,
      success: data.success && crashedSuites === 0,
      failures,
      testResults,
    };
  }

  private detectFrameworkCrash(log: string): boolean {
    const errorPatterns = [
      'Error:',
      'ReferenceError',
      'SyntaxError',
      'TypeError',
      'failed to run',
      'Timed out',
      'ECONNREFUSED',
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
        line.includes('Cannot find'),
    );

    if (errorIndex === -1) {
      return logLines.slice(0, lines).join('\n');
    }

    const start = Math.max(0, errorIndex - 2);
    const end = Math.min(logLines.length, errorIndex + lines);
    return logLines.slice(start, end).join('\n');
  }
}
