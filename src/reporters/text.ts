/**
 * Plain Text Reporter - clean output for CI/tool integration
 * No ANSI codes, no markdown formatting
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Reporter } from './types.js';
import type { AggregatedResults, Suite, SuiteResult } from '../config/types.js';

export class TextReporter implements Reporter {
  constructor(private outputPath: string) {}

  onStart(_suites: Suite[]): void {
    // Nothing to do
  }

  onSuiteComplete(_suite: Suite, _result: SuiteResult): void {
    // Nothing to do - we write all at once in onComplete
  }

  async onComplete(results: AggregatedResults): Promise<void> {
    await mkdir(dirname(this.outputPath), { recursive: true });

    const lines: string[] = [];

    // Header
    lines.push('TEST RESULTS');
    lines.push('='.repeat(50));
    lines.push('');

    // Summary line
    const status = results.success ? 'PASSED' : 'FAILED';
    lines.push(`Status: ${status}`);
    lines.push(`Pass Rate: ${results.passRate.toFixed(1)}%`);
    lines.push('');

    // Totals
    const { totals } = results;
    lines.push('Totals:');
    lines.push(`  Passed:  ${totals.passed}`);
    lines.push(`  Failed:  ${totals.failed}`);
    lines.push(`  Skipped: ${totals.skipped}`);
    lines.push(`  Duration: ${(totals.duration / 1000).toFixed(1)}s`);
    lines.push('');

    // Suite details
    lines.push('Suites:');
    lines.push('-'.repeat(50));

    for (const suite of results.suites) {
      const suiteStatus = suite.success ? 'PASS' : 'FAIL';
      lines.push(`  ${suite.name}: ${suiteStatus}`);
      lines.push(`    Passed: ${suite.passed}, Failed: ${suite.failed}, Skipped: ${suite.skipped}`);
      lines.push(`    Duration: ${(suite.duration / 1000).toFixed(1)}s`);

      // List failures
      if (suite.failures.length > 0) {
        lines.push('    Failures:');
        for (const failure of suite.failures) {
          const hierarchy = this.formatHierarchy(failure.testName);
          lines.push(`      - ${hierarchy}`);
          lines.push(`        File: ${failure.filePath}`);
          if (failure.error) {
            // First line of error only
            const errorLine = failure.error.split('\n')[0]?.slice(0, 100);
            lines.push(`        Error: ${errorLine}`);
          }
        }
      }
      lines.push('');
    }

    await writeFile(this.outputPath, lines.join('\n'));
  }

  /**
   * Format test hierarchy for plain text display
   */
  private formatHierarchy(testName: string): string {
    const parts = testName.split(' > ');
    if (parts.length <= 1) return testName;
    // Use simple arrow for hierarchy
    return parts.join(' > ');
  }
}
