/**
 * Progress Formatter - real-time test progress tracking
 *
 * Processes executor streaming output, detects framework-specific
 * test result patterns, and emits progress summaries to stderr.
 */

import { stripAnsi } from './ansi.js';

export interface ProgressState {
  suiteName: string;
  passed: number;
  failed: number;
  startTime: number;
}

// Jest patterns: ✓ or ✕ or ✗ or PASS or FAIL prefix
const JEST_PASS = /^\s*(✓|✔|PASS)\s/;
const JEST_FAIL = /^\s*(✕|✗|✘|FAIL)\s/;

// Playwright patterns: ok/failed count lines or ✓/✘ markers
const PLAYWRIGHT_RESULT = /(\d+)\s+passed|(\d+)\s+failed/;
const PLAYWRIGHT_PASS = /^\s*(✓|ok)\s/i;
const PLAYWRIGHT_FAIL = /^\s*(✘|✗|failed)\s/i;

/**
 * Create a progress callback for streaming executor output.
 * Returns a function to pass as onOutput to executeCommand.
 */
export function createProgressCallback(
  suiteName: string,
  framework: string,
): { onOutput: (chunk: string) => void; getState: () => ProgressState } {
  const state: ProgressState = {
    suiteName,
    passed: 0,
    failed: 0,
    startTime: Date.now(),
  };

  let lineBuffer = '';
  let lastReportedTotal = 0;
  const REPORT_INTERVAL = 10;

  const processLine = (rawLine: string): void => {
    const line = stripAnsi(rawLine).trim();
    if (!line) return;

    if (framework === 'jest') {
      if (JEST_PASS.test(line)) state.passed++;
      else if (JEST_FAIL.test(line)) state.failed++;
    } else if (framework === 'playwright') {
      if (PLAYWRIGHT_PASS.test(line)) state.passed++;
      else if (PLAYWRIGHT_FAIL.test(line)) state.failed++;
      else {
        const match = line.match(PLAYWRIGHT_RESULT);
        if (match) {
          if (match[1]) state.passed = parseInt(match[1], 10);
          if (match[2]) state.failed = parseInt(match[2], 10);
        }
      }
    }

    const currentTotal = state.passed + state.failed;
    if (
      currentTotal > 0 &&
      currentTotal - lastReportedTotal >= REPORT_INTERVAL
    ) {
      emitProgress(state);
      lastReportedTotal = currentTotal;
    }
  };

  const onOutput = (chunk: string): void => {
    lineBuffer += chunk;
    const lines = lineBuffer.split('\n');
    lineBuffer = lines.pop() ?? '';
    for (const line of lines) {
      processLine(line);
    }
  };

  return { onOutput, getState: () => ({ ...state }) };
}

function emitProgress(state: ProgressState): void {
  const elapsed = ((Date.now() - state.startTime) / 1000).toFixed(0);
  const total = state.passed + state.failed;
  const status = state.failed > 0 ? '⚠' : '…';
  process.stderr.write(
    `[${state.suiteName}] ${status} ${total} tests (${state.passed} passed, ${state.failed} failed) ${elapsed}s\n`,
  );
}
