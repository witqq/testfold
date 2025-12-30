/**
 * Markdown Reporter - generates failure reports
 */

import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { Reporter } from './types.js';
import type {
  AggregatedResults,
  Suite,
  SuiteResult,
  FailureDetail,
} from '../config/types.js';
import { stripAnsi } from '../utils/ansi.js';
import { sanitizeFilename } from '../utils/sanitize.js';

export class MarkdownReporter implements Reporter {
  constructor(private artifactsDir: string) {}

  onStart(_suites: Suite[]): void {
    // Nothing to do
  }

  onSuiteComplete(_suite: Suite, _result: SuiteResult): void {
    // Nothing to do - we write all at once in onComplete
  }

  async onComplete(results: AggregatedResults): Promise<void> {
    for (const suite of results.suites) {
      if (suite.failures.length === 0) continue;

      const failuresDir = join(
        this.artifactsDir,
        'failures',
        suite.name.toLowerCase().replace(/\s+/g, '-'),
      );

      // Clean and recreate directory
      await rm(failuresDir, { recursive: true, force: true });
      await mkdir(failuresDir, { recursive: true });

      // Write failure reports
      for (let i = 0; i < suite.failures.length; i++) {
        const failure = suite.failures[i];
        if (!failure) continue;

        const index = String(i + 1).padStart(2, '0');
        const filename = `${index}-${sanitizeFilename(failure.testName)}.md`;
        const filepath = join(failuresDir, filename);

        const content = this.formatFailure(failure);
        await writeFile(filepath, content);
      }
    }
  }

  private formatFailure(failure: FailureDetail): string {
    const lines: string[] = [
      '# Test Failure Report',
      '',
      `**Test:** ${failure.testName}`,
      `**File:** ${failure.filePath}`,
    ];

    if (failure.duration !== undefined) {
      lines.push(`**Duration:** ${failure.duration}ms`);
    }

    lines.push('', '---', '', '## Error', '', '```');
    lines.push(stripAnsi(failure.error));
    lines.push('```');

    if (failure.stack) {
      lines.push('', '## Stack Trace', '', '```');
      lines.push(stripAnsi(failure.stack));
      lines.push('```');
    }

    if (failure.stdout) {
      lines.push('', '## Stdout', '', '```');
      lines.push(stripAnsi(failure.stdout));
      lines.push('```');
    }

    if (failure.stderr) {
      lines.push('', '## Stderr', '', '```');
      lines.push(stripAnsi(failure.stderr));
      lines.push('```');
    }

    if (failure.attachments && failure.attachments.length > 0) {
      lines.push('', '## Attachments', '');
      for (const attachment of failure.attachments) {
        lines.push(`- **${attachment.name}:** ${attachment.path}`);
      }
    }

    return lines.join('\n');
  }
}
