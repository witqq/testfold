/**
 * Timing Text Reporter - writes per-suite timing .txt files
 * with top N slowest tests and suite-level overhead stats
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { Reporter } from './types.js';
import type { AggregatedResults, Suite, SuiteResult } from '../config/types.js';

export interface TimingTextOptions {
  /** Directory for timing files */
  outputDir: string;
  /** Number of slowest tests to show (default: 30) */
  topTests?: number;
  /** Number of suites by overhead to show (default: 15) */
  topSuites?: number;
}

export class TimingTextReporter implements Reporter {
  private outputDir: string;
  private topTests: number;
  private topSuites: number;
  private suiteResults: Map<string, SuiteResult> = new Map();

  constructor(options: TimingTextOptions) {
    this.outputDir = options.outputDir;
    this.topTests = options.topTests ?? 30;
    this.topSuites = options.topSuites ?? 15;
  }

  onStart(_suites: Suite[]): void {
    // Nothing to do
  }

  onSuiteComplete(suite: Suite, result: SuiteResult): void {
    this.suiteResults.set(suite.name, result);
  }

  async onComplete(_results: AggregatedResults): Promise<void> {
    await mkdir(this.outputDir, { recursive: true });

    for (const [suiteName, result] of this.suiteResults) {
      const content = this.formatSuiteTiming(suiteName, result);
      const fileName = `${suiteName.toLowerCase().replace(/\s+/g, '-')}-timing.txt`;
      const filePath = join(this.outputDir, fileName);
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, content);
    }
  }

  private formatSuiteTiming(suiteName: string, result: SuiteResult): string {
    const lines: string[] = [];

    lines.push(`Timing Report: ${suiteName}`);
    lines.push(`Total Duration: ${this.formatDuration(result.duration)}`);
    lines.push('');

    // Top N slowest tests
    if (result.testResults && result.testResults.length > 0) {
      const sorted = [...result.testResults].sort((a, b) => b.duration - a.duration);
      const top = sorted.slice(0, this.topTests);

      lines.push(`Top ${Math.min(this.topTests, top.length)} Slowest Tests`);
      lines.push('─'.repeat(60));

      for (let i = 0; i < top.length; i++) {
        const test = top[i]!;
        lines.push(`  ${String(i + 1).padStart(2)}. ${this.formatDuration(test.duration).padStart(8)}  ${test.name}`);
        if (test.file) {
          lines.push(`      ${test.file}`);
        }
      }

      lines.push('');

      // File-level overhead: group tests by file, sum test durations,
      // compare with total suite duration to estimate overhead
      const fileGroups = new Map<string, { testDuration: number; count: number }>();
      for (const test of result.testResults) {
        const existing = fileGroups.get(test.file) ?? { testDuration: 0, count: 0 };
        existing.testDuration += test.duration;
        existing.count++;
        fileGroups.set(test.file, existing);
      }

      const fileOverhead = [...fileGroups.entries()]
        .map(([file, data]) => ({
          file,
          testDuration: data.testDuration,
          count: data.count,
        }))
        .sort((a, b) => b.testDuration - a.testDuration)
        .slice(0, this.topSuites);

      if (fileOverhead.length > 0) {
        lines.push(`Top ${Math.min(this.topSuites, fileOverhead.length)} Files by Test Duration`);
        lines.push('─'.repeat(60));

        for (let i = 0; i < fileOverhead.length; i++) {
          const entry = fileOverhead[i]!;
          lines.push(`  ${String(i + 1).padStart(2)}. ${this.formatDuration(entry.testDuration).padStart(8)}  (${entry.count} tests)  ${entry.file}`);
        }

        lines.push('');

        // Summary: total test time vs suite time (overhead)
        const totalTestTime = result.testResults.reduce((sum, t) => sum + t.duration, 0);
        const overhead = result.duration - totalTestTime;
        if (overhead > 0) {
          lines.push(`Setup/Teardown Overhead: ${this.formatDuration(overhead)} (suite: ${this.formatDuration(result.duration)}, tests: ${this.formatDuration(totalTestTime)})`);
        }
      }
    } else {
      lines.push('No individual test results available for timing analysis.');
    }

    lines.push('');
    return lines.join('\n');
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) {
      return `${ms}ms`;
    }
    return `${(ms / 1000).toFixed(1)}s`;
  }
}
