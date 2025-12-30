/**
 * Parser Types
 */

import type { FailureDetail } from '../config/types.js';

export interface ParseResult {
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  success: boolean;
  failures: FailureDetail[];
  /** Raw test results for timing analysis */
  testResults?: TestResult[];
}

export interface TestResult {
  name: string;
  file: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  error?: string;
}

export interface Parser {
  /**
   * Parse test results from JSON file
   * @param jsonPath Path to JSON result file
   * @param logPath Path to log file (for error extraction)
   */
  parse(jsonPath: string, logPath?: string): Promise<ParseResult>;
}
