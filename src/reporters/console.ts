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

    // Consolidated failures and re-run instructions
    if (!results.success) {
      this.printConsolidatedFailures(results);
      this.printRerunInstructions(results);
      this.printAgentInstructions(results);
    }

    // Coverage hint
    this.printCoverageHint();

    // Show artifact inventory if artifactsDir is available
    if (this.artifactsDir) {
      this.printArtifacts(results);
    }

    // JSON summary line — always printed as the very last line
    this.printJsonSummary(results);
  }

  /**
   * Print structured agent instructions block for AI agent consumption
   */
  private printAgentInstructions(results: AggregatedResults): void {
    const failedSuites = results.suites.filter((s) => !s.success);
    const totalFailures = results.totals.failed;

    // Collect top error patterns (deduplicated first lines)
    const errorPatterns = new Map<string, number>();
    for (const suite of failedSuites) {
      for (const f of suite.failures) {
        const pattern = f.error?.split('\n')[0]?.slice(0, 80) ?? 'Unknown error';
        errorPatterns.set(pattern, (errorPatterns.get(pattern) ?? 0) + 1);
      }
    }
    const topPatterns = [...errorPatterns.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    console.log(`${colors.cyan}${'─'.repeat(50)}${colors.reset}`);
    console.log('=== AGENT INSTRUCTIONS ===');
    console.log();
    console.log(`Failures: ${totalFailures}`);
    console.log(`Affected suites: ${failedSuites.map((s) => s.name).join(', ')}`);

    if (topPatterns.length > 0) {
      console.log();
      console.log('Top error patterns:');
      for (const [pattern, count] of topPatterns) {
        console.log(`  ${count}x ${pattern}`);
      }
    }

    console.log();
    console.log('Suggested actions:');
    console.log('  1. Review the FAILURES section above for details');
    console.log('  2. Use RE-RUN INSTRUCTIONS to reproduce failures');
    console.log('  3. Check log files in test-results/ for full output');
    if (results.exitCode === 2) {
      console.log('  4. Exit code 2 indicates infrastructure error — check test setup');
    } else if (results.exitCode === 3) {
      console.log('  4. Exit code 3 indicates timeout — consider increasing suite timeout');
    }
    console.log();
    console.log('=== END AGENT INSTRUCTIONS ===');
    console.log();
  }

  /**
   * Print machine-readable JSON summary as the very last line of output
   */
  private printJsonSummary(results: AggregatedResults): void {
    const summary = {
      success: results.success,
      passed: results.totals.passed,
      failed: results.totals.failed,
      skipped: results.totals.skipped,
      duration: results.totals.duration,
      exitCode: results.exitCode,
    };
    console.log(`TESTFOLD_RESULT:${JSON.stringify(summary)}`);
  }

  /**
   * Print consolidated failure list across all suites
   */
  private printConsolidatedFailures(results: AggregatedResults): void {
    const allFailures: Array<{ suite: string; testName: string; filePath: string; error: string }> = [];

    for (const suite of results.suites) {
      for (const failure of suite.failures) {
        allFailures.push({
          suite: suite.name,
          testName: failure.testName,
          filePath: failure.filePath,
          error: failure.error?.split('\n')[0]?.slice(0, 120) ?? '',
        });
      }
    }

    if (allFailures.length === 0) return;

    console.log(`${colors.cyan}${'─'.repeat(50)}${colors.reset}`);
    console.log(`${colors.bold}  FAILURES${colors.reset}`);
    console.log(`${colors.cyan}${'─'.repeat(50)}${colors.reset}`);
    console.log();

    for (const f of allFailures) {
      console.log(`${colors.red}✗${colors.reset} ${colors.bold}[${f.suite}]${colors.reset} ${f.testName}`);
      if (f.filePath) {
        console.log(`  ${colors.gray}${f.filePath}${colors.reset}`);
      }
      if (f.error) {
        console.log(`  ${colors.red}${f.error}${colors.reset}`);
      }
    }

    console.log();
  }

  /**
   * Print re-run instructions for failed suites
   */
  private printRerunInstructions(results: AggregatedResults): void {
    const failedSuites = results.suites.filter((s) => !s.success);
    if (failedSuites.length === 0) return;

    console.log(`${colors.cyan}${'─'.repeat(50)}${colors.reset}`);
    console.log(`${colors.bold}  RE-RUN INSTRUCTIONS${colors.reset}`);
    console.log(`${colors.cyan}${'─'.repeat(50)}${colors.reset}`);
    console.log();

    // Re-run all failed suites
    const suiteNames = failedSuites.map((s) => s.name.toLowerCase()).join(' ');
    console.log(`${colors.gray}# Re-run all failed suites${colors.reset}`);
    console.log(`testfold ${suiteNames}`);
    console.log();

    // Per-suite re-run with specific files
    for (const suite of failedSuites) {
      const uniqueFiles = [...new Set(suite.failures.map((f) => f.filePath).filter(Boolean))];

      if (uniqueFiles.length > 0 && uniqueFiles.length <= 5) {
        console.log(`${colors.gray}# Re-run ${suite.name} failed files${colors.reset}`);
        for (const file of uniqueFiles) {
          console.log(`testfold ${suite.name.toLowerCase()} -- ${file}`);
        }
        console.log();
      }
    }
  }

  /**
   * Print coverage hint if standard coverage directory exists
   */
  private printCoverageHint(): void {
    const coveragePath = join(process.cwd(), 'coverage');
    if (existsSync(coveragePath)) {
      console.log(
        `${colors.cyan}📊 Coverage data available: ${coveragePath}${colors.reset}`,
      );
      console.log();
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
