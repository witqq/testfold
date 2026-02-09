/**
 * Summary Log Reporter - writes ANSI-stripped test-summary.log
 * Same summary table as console reporter but in plain text
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Reporter } from './types.js';
import type { AggregatedResults, Suite, SuiteResult } from '../config/types.js';

export class SummaryLogReporter implements Reporter {
  private startTime = 0;

  constructor(private outputPath: string) {}

  onStart(_suites: Suite[]): void {
    this.startTime = Date.now();
  }

  onSuiteComplete(_suite: Suite, _result: SuiteResult): void {
    // Written all at once in onComplete
  }

  async onComplete(results: AggregatedResults): Promise<void> {
    await mkdir(dirname(this.outputPath), { recursive: true });

    const totalTime = Date.now() - this.startTime;
    const lines: string[] = [];

    lines.push('SUMMARY');
    lines.push('─'.repeat(55));
    lines.push('');

    // Table header
    lines.push('Suite                Passed  Failed  Skipped    Time');
    lines.push('─'.repeat(55));

    // Suite rows
    for (const suite of results.suites) {
      const name = suite.name.padEnd(20);
      const passed = String(suite.passed).padStart(6);
      const failed = String(suite.failed).padStart(7);
      const skipped = String(suite.skipped).padStart(8);
      const time = `${(suite.duration / 1000).toFixed(1)}s`.padStart(8);
      lines.push(`${name}${passed}${failed}${skipped}${time}`);
    }

    lines.push('─'.repeat(55));

    // Totals
    const { totals } = results;
    const totalRow = [
      'TOTAL'.padEnd(20),
      String(totals.passed).padStart(6),
      String(totals.failed).padStart(7),
      String(totals.skipped).padStart(8),
      `${(totalTime / 1000).toFixed(1)}s`.padStart(8),
    ].join('');
    lines.push(totalRow);
    lines.push('');

    // Status
    if (results.success) {
      lines.push('ALL TESTS PASSED');
    } else {
      lines.push('TESTS FAILED');
    }
    lines.push('');

    lines.push(`Pass Rate: ${results.passRate.toFixed(1)}% | Total: ${totals.passed + totals.failed + totals.skipped}`);
    lines.push('');

    await writeFile(this.outputPath, lines.join('\n'));
  }
}
