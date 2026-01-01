/**
 * Console Reporter - colored output to terminal
 */

import { existsSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
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
  private artifactsDir?: string;

  constructor(artifactsDir?: string) {
    this.artifactsDir = artifactsDir;
  }

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

    // Show error snippet for failures with hierarchy
    if (!result.success && result.failures.length > 0) {
      for (const failure of result.failures.slice(0, 3)) {
        // Format hierarchy: "describe1 > describe2 > test" -> indented display
        const hierarchy = this.formatHierarchy(failure.testName);
        console.log(`  ${colors.gray}└─ ${hierarchy}${colors.reset}`);
        if (failure.error) {
          const errorLine = failure.error.split('\n')[0]?.slice(0, 80);
          console.log(`     ${colors.red}${errorLine}${colors.reset}`);
        }
      }
      if (result.failures.length > 3) {
        console.log(
          `  ${colors.gray}... and ${result.failures.length - 3} more${colors.reset}`,
        );
      }
    }
  }

  /**
   * Format test hierarchy for display
   * "describe1 > describe2 > test" -> "describe1 › describe2 › test"
   */
  private formatHierarchy(testName: string): string {
    const parts = testName.split(' > ');
    if (parts.length <= 1) return testName;
    // Use › separator for clearer hierarchy
    return parts.join(' › ');
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

    // Show artifact inventory if artifactsDir is available
    if (this.artifactsDir) {
      this.printArtifacts(results);
    }
  }

  private printArtifacts(results: AggregatedResults): void {
    const artifacts: string[] = [];

    // Collect known artifacts from results
    for (const suite of results.suites) {
      // Result file
      if (existsSync(join(this.artifactsDir!, basename(suite.resultFile)))) {
        artifacts.push(suite.resultFile);
      }

      // Log file
      const logFileName = basename(suite.logFile);
      if (existsSync(join(this.artifactsDir!, logFileName))) {
        artifacts.push(logFileName);
      }

      // Failure reports
      if (suite.failures.length > 0) {
        const sanitizedName = suite.name.toLowerCase().replace(/\s+/g, '-');
        const failuresDir = join(this.artifactsDir!, 'failures', sanitizedName);
        if (existsSync(failuresDir)) {
          try {
            const failureFiles = readdirSync(failuresDir).filter((f) =>
              f.endsWith('.md'),
            );
            for (const f of failureFiles) {
              artifacts.push(`failures/${sanitizedName}/${f}`);
            }
          } catch {
            // Ignore directory read errors
          }
        }
      }
    }

    // Check for timing.json
    if (existsSync(join(this.artifactsDir!, 'timing.json'))) {
      artifacts.push('timing.json');
    }

    // Check for summary.json (in parent dir)
    const summaryPath = join(this.artifactsDir!, '..', 'summary.json');
    if (existsSync(summaryPath)) {
      artifacts.push('../summary.json');
    }

    if (artifacts.length === 0) return;

    console.log(`${colors.cyan}${'─'.repeat(50)}${colors.reset}`);
    console.log(`${colors.bold}  ARTIFACTS${colors.reset}`);
    console.log(`${colors.cyan}${'─'.repeat(50)}${colors.reset}`);
    console.log();

    for (const artifact of artifacts) {
      console.log(`${colors.gray}  ${artifact}${colors.reset}`);
    }

    console.log();
  }
}
