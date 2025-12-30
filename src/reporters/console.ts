/**
 * Console Reporter - colored output to terminal
 */

import type { Reporter } from './types.js';
import type { AggregatedResults, Suite, SuiteResult } from '../config/types.js';

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  bold: '\x1b[1m',
};

export class ConsoleReporter implements Reporter {
  private startTime = 0;

  onStart(suites: Suite[]): void {
    this.startTime = Date.now();

    console.log();
    console.log(
      `${colors.cyan}${'='.repeat(50)}${colors.reset}`,
    );
    console.log(
      `${colors.cyan}${colors.bold}  TEST RUNNER${colors.reset}`,
    );
    console.log(
      `${colors.cyan}${'='.repeat(50)}${colors.reset}`,
    );
    console.log();
    console.log(
      `${colors.gray}Running ${suites.length} suite(s)...${colors.reset}`,
    );
    console.log();
  }

  onSuiteComplete(suite: Suite, result: SuiteResult): void {
    const icon = result.success
      ? `${colors.green}✓${colors.reset}`
      : `${colors.red}✗${colors.reset}`;

    const time = `${(result.duration / 1000).toFixed(1)}s`;
    const stats = result.success
      ? `${colors.green}${result.passed} passed${colors.reset}`
      : `${colors.green}${result.passed} passed${colors.reset}, ${colors.red}${result.failed} failed${colors.reset}`;

    console.log(`${icon} ${suite.name}: ${stats} (${time})`);

    // Show error snippet for failures
    if (!result.success && result.failures.length > 0) {
      const firstFailure = result.failures[0];
      console.log(
        `  ${colors.gray}└─ ${firstFailure?.testName}${colors.reset}`,
      );
      if (firstFailure?.error) {
        const errorLine = firstFailure.error.split('\n')[0]?.slice(0, 80);
        console.log(`     ${colors.red}${errorLine}${colors.reset}`);
      }
    }
  }

  async onComplete(results: AggregatedResults): Promise<void> {
    const totalTime = Date.now() - this.startTime;

    console.log();
    console.log(
      `${colors.cyan}${'─'.repeat(50)}${colors.reset}`,
    );
    console.log(`${colors.bold}  SUMMARY${colors.reset}`);
    console.log(
      `${colors.cyan}${'─'.repeat(50)}${colors.reset}`,
    );
    console.log();

    // Table header
    console.log(
      `${colors.gray}Suite                Passed  Failed  Skipped    Time${colors.reset}`,
    );
    console.log(`${colors.gray}${'─'.repeat(55)}${colors.reset}`);

    // Suite rows
    for (const suite of results.suites) {
      const name = suite.name.padEnd(20);
      const passed = String(suite.passed).padStart(6);
      const failed = String(suite.failed).padStart(7);
      const skipped = String(suite.skipped).padStart(8);
      const time = `${(suite.duration / 1000).toFixed(1)}s`.padStart(8);

      const color = suite.success ? colors.reset : colors.red;
      console.log(`${color}${name}${passed}${failed}${skipped}${time}${colors.reset}`);
    }

    console.log(`${colors.gray}${'─'.repeat(55)}${colors.reset}`);

    // Totals
    const { totals } = results;
    const totalRow = [
      'TOTAL'.padEnd(20),
      String(totals.passed).padStart(6),
      String(totals.failed).padStart(7),
      String(totals.skipped).padStart(8),
      `${(totalTime / 1000).toFixed(1)}s`.padStart(8),
    ].join('');

    console.log(`${colors.bold}${totalRow}${colors.reset}`);
    console.log();

    // Final status
    if (results.success) {
      console.log(
        `${colors.green}${colors.bold}✓ ALL TESTS PASSED${colors.reset}`,
      );
    } else {
      console.log(
        `${colors.red}${colors.bold}✗ TESTS FAILED${colors.reset}`,
      );
    }

    console.log();
    console.log(
      `${colors.gray}Pass Rate: ${results.passRate.toFixed(1)}% | Total: ${totals.passed + totals.failed + totals.skipped}${colors.reset}`,
    );
    console.log();
  }
}
