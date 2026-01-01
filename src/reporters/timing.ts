/**
 * Timing Reporter - writes timing.json with slowest tests
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Reporter } from './types.js';
import type { AggregatedResults, Suite, SuiteResult } from '../config/types.js';

export interface TimingEntry {
  name: string;
  file: string;
  suite: string;
  duration: number;
  status: 'passed' | 'failed' | 'skipped';
}

export interface TimingOutput {
  timestamp: string;
  totalDuration: number;
  tests: TimingEntry[];
}

export class TimingReporter implements Reporter {
  constructor(private outputPath: string) {}

  onStart(_suites: Suite[]): void {
    // Nothing to do
  }

  onSuiteComplete(_suite: Suite, _result: SuiteResult): void {
    // Nothing to do
  }

  async onComplete(results: AggregatedResults): Promise<void> {
    await mkdir(dirname(this.outputPath), { recursive: true });

    // Collect all test results across suites
    const allTests: TimingEntry[] = [];

    for (const suite of results.suites) {
      if (suite.testResults) {
        for (const test of suite.testResults) {
          allTests.push({
            name: test.name,
            file: test.file,
            suite: suite.name,
            duration: test.duration,
            status: test.status,
          });
        }
      }
    }

    // Sort by duration descending (slowest first)
    allTests.sort((a, b) => b.duration - a.duration);

    const output: TimingOutput = {
      timestamp: new Date().toISOString(),
      totalDuration: results.totals.duration,
      tests: allTests,
    };

    await writeFile(this.outputPath, JSON.stringify(output, null, 2));
  }
}
