/**
 * JSON Reporter - writes summary.json
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Reporter } from './types.js';
import type { AggregatedResults, Suite, SuiteResult } from '../config/types.js';

export class JsonReporter implements Reporter {
  constructor(private outputPath: string) {}

  onStart(_suites: Suite[]): void {
    // Nothing to do
  }

  onSuiteComplete(_suite: Suite, _result: SuiteResult): void {
    // Nothing to do
  }

  async onComplete(results: AggregatedResults): Promise<void> {
    await mkdir(dirname(this.outputPath), { recursive: true });

    const output = {
      timestamp: new Date().toISOString(),
      success: results.success,
      passRate: results.passRate,
      totals: results.totals,
      suites: results.suites.map((s) => ({
        name: s.name,
        passed: s.passed,
        failed: s.failed,
        skipped: s.skipped,
        duration: s.duration,
        success: s.success,
        resultFile: s.resultFile,
        logFile: s.logFile,
      })),
    };

    await writeFile(this.outputPath, JSON.stringify(output, null, 2));
  }
}
