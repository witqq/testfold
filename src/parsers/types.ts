/**
 * Parser Types
 */

import type { ErrorCategory, FailureDetail, TestResult } from '../config/types.js';

// Re-export TestResult for backward compatibility
export type { TestResult };

export interface ParseResult {
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  success: boolean;
  failures: FailureDetail[];
  /** Infrastructure failures are distinguished from test assertion failures. */
  errorCategory?: ErrorCategory;
  /** Raw test results for timing analysis */
  testResults?: TestResult[];
  /**
   * Every test file the framework ran, including files that crashed before
   * reporting a test. Used to confirm that each requested `--file` filter
   * selected at least one test file. Custom parsers may omit it; `testResults`
   * files are then used instead.
   */
  testFiles?: string[];
}

export interface Parser {
  /**
   * Parse test results from JSON file
   * @param jsonPath Path to JSON result file
   * @param logPath Path to log file (for error extraction)
   */
  parse(jsonPath: string, logPath?: string): Promise<ParseResult>;
}
