import { resolve, join } from 'node:path';
import { writeFile, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { TestRunner } from '../../../src/core/runner.js';
import { appendShellArgs } from '../../../src/core/executor.js';
import { setupTestEnvironment, type TestEnvironment } from '../../helpers/test-environment.js';
import type { Suite } from '../../../src/config/types.js';

describe('framework completion and report outcomes', () => {
  let environment: TestEnvironment;
  let artifacts: string;
  beforeEach(() => {
    environment = setupTestEnvironment('process-outcomes');
    artifacts = resolve(environment.tempDir, 'artifacts');
  });
  afterEach(() => environment.cleanup());

  function jestReport(passed = 1, failed = 0, skipped = 0, success = failed === 0) {
    return {
      numPassedTests: passed,
      numFailedTests: failed,
      numPendingTests: skipped,
      success,
      testResults:
        failed > 0
          ? [
              {
                name: 'assertions.test.ts',
                status: 'failed',
                message: '',
                startTime: 0,
                endTime: 1,
                assertionResults: Array.from({ length: failed }, (_, index) => ({
                  title: `failure ${index}`,
                  ancestorTitles: [],
                  status: 'failed',
                  duration: 1,
                  failureMessages: ['assertion failed'],
                })),
              },
            ]
          : [],
    };
  }

  async function run(
    report: unknown,
    ending = 'process.exit(0)',
    overrides: Partial<Suite> = {},
    file?: string[],
  ) {
    const body = `require('node:fs').writeFileSync(${JSON.stringify(join(artifacts, 'result.json'))},${JSON.stringify(JSON.stringify(report))});${ending}`;
    const runner = new TestRunner({
      artifactsDir: artifacts,
      parallel: false,
      reporters: ['json'],
      suites: [
        {
          name: 'framework',
          type: 'jest',
          resultFile: 'result.json',
          command: appendShellArgs('node', ['-e', body]),
          ...overrides,
        },
      ],
    });
    return runner.run(undefined, { file });
  }

  it('rejects an all-pass report after nonzero process completion without inventing failed assertions', async () => {
    const result = await run(jestReport(3), 'process.exit(7)');
    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(2);
    expect(result.totals).toMatchObject({ passed: 3, failed: 0, skipped: 0 });
    expect(result.suites[0]?.failures).toEqual(
      expect.arrayContaining([expect.objectContaining({ error: expect.stringContaining('7') })]),
    );
    const summary = JSON.parse(await readFile(join(artifacts, '../summary.json'), 'utf8'));
    expect(summary.success).toBe(false);
  });

  it('keeps ordinary assertion failures counted once when their process exits nonzero', async () => {
    const result = await run(jestReport(2, 1), 'process.exit(1)');
    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.totals).toMatchObject({ passed: 2, failed: 1 });
    expect(result.suites[0]?.failures).toHaveLength(1);
    expect(result.suites[0]?.failures[0]?.error).toBe('assertion failed');
  });

  it('requires successful parser completion even when failed assertions are zero', async () => {
    const result = await run(jestReport(2, 0, 0, false));
    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(2);
    expect(result.totals.failed).toBe(0);
  });

  it.each([jestReport(0), jestReport(0, 0, 4)])(
    'rejects a report with no executed assertions',
    async (report) => {
      const result = await run(report);
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(2);
      expect(result.totals.failed).toBe(0);
    },
  );

  it('retains partial passing assertions but fails a process killed by the suite deadline', async () => {
    const result = await run(jestReport(2), 'setInterval(() => {}, 1000)', { timeout: 1000 });
    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(3);
    expect(result.totals).toMatchObject({ passed: 2, failed: 0 });
  });

  it('applies nonzero completion to custom parsers too', async () => {
    const parser = resolve(environment.tempDir, 'parser.mjs');
    await writeFile(
      parser,
      'export default { async parse() { return { passed: 1, failed: 0, skipped: 0, duration: 1, success: true, failures: [] }; } };',
    );
    const result = await run({}, 'process.exit(9)', { type: 'custom', parser });
    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(2);
    expect(result.totals).toMatchObject({ passed: 1, failed: 0 });
  });

  it('rejects invalid parser counters rather than returning a green NaN aggregate', async () => {
    const result = await run(jestReport(-1));
    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(2);
    expect(Number.isFinite(result.totals.passed)).toBe(true);
  });

  it('reports Playwright global failures separately from passing assertion statistics', async () => {
    const result = await run(
      {
        suites: [],
        stats: { expected: 2, unexpected: 0, skipped: 0, flaky: 0, duration: 1 },
        errors: [{ message: 'global teardown failed' }],
      },
      'process.exit(0)',
      { type: 'playwright' },
    );
    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(2);
    expect(result.totals).toMatchObject({ passed: 2, failed: 0 });
    expect(result.suites[0]?.failures).toEqual(
      expect.arrayContaining([expect.objectContaining({ error: 'global teardown failed' })]),
    );
  });

  it('accepts genuine successful completion with an executed passing report', async () => {
    const result = await run(jestReport(2));
    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.totals).toMatchObject({ passed: 2, failed: 0 });
  });

  it('exits the built CLI unsuccessfully when passing JSON hides a failed child', async () => {
    const configPath = resolve(environment.tempDir, 'test-runner.config.mjs');
    const body = `require('node:fs').writeFileSync(${JSON.stringify(join(artifacts, 'result.json'))},${JSON.stringify(JSON.stringify(jestReport(1)))});process.exit(7)`;
    await writeFile(
      configPath,
      `export default ${JSON.stringify({ artifactsDir: artifacts, reporters: ['json'], suites: [{ name: 'framework', type: 'jest', resultFile: 'result.json', command: appendShellArgs('node', ['-e', body]) }] })};`,
    );
    const child = spawnSync(process.execPath, [resolve('dist/cli/index.js'), '-c', configPath], {
      encoding: 'utf8',
    });
    expect(child.status).toBe(2);
    const summary = JSON.parse(await readFile(join(artifacts, '../summary.json'), 'utf8'));
    expect(summary.success).toBe(false);
    expect(summary.totals).toMatchObject({ passed: 1, failed: 0 });
  });

  it('rejects a framework interrupted by a signal even when failed assertions exist', async () => {
    const body = `require('node:fs').writeFileSync(${JSON.stringify(join(artifacts, 'result.json'))},${JSON.stringify(JSON.stringify(jestReport(1, 1)))});process.kill(process.pid,'SIGTERM')`;
    const result = await run(jestReport(), 'process.exit(0)', {
      command: appendShellArgs('exec node', ['-e', body]),
    });
    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(2);
    expect(result.totals).toMatchObject({ passed: 1, failed: 1 });
    expect(result.suites[0]?.testFiles).toBeUndefined();
    expect(result.suites[0]?.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ error: expect.stringContaining('SIGTERM') }),
      ]),
    );
  });

  it('distinguishes a framework exit code 124 from an executor-enforced timeout', async () => {
    const result = await run(jestReport(1), 'process.exit(124)');
    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(2);
    expect(result.suites[0]?.errorCategory).toBe('infra_error');
  });

  it.each([0, 1])(
    'preserves assertion failure for a neutral custom category and process exit %i',
    async (exit) => {
      const parser = resolve(environment.tempDir, 'neutral-parser.mjs');
      await writeFile(
        parser,
        `export default { async parse() { return ${JSON.stringify({ passed: 2, failed: 1, skipped: 0, duration: 1, success: false, errorCategory: 'none', failures: [{ testName: 'actual assertion', filePath: 'native.swift', error: 'assertion failed' }] })}; } };`,
      );
      const result = await run({}, `process.exit(${exit})`, { type: 'custom', parser });
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.suites[0]?.errorCategory).toBe('test_failure');
      expect(result.totals).toMatchObject({ passed: 2, failed: 1 });
      expect(result.suites[0]?.failures).toHaveLength(1);
      expect(result.suites[0]?.failures[0]?.error).toBe('assertion failed');
    },
  );

  it('diagnoses an invalid JavaScript parser category as malformed infrastructure output', async () => {
    const parser = resolve(environment.tempDir, 'unknown-parser.mjs');
    await writeFile(
      parser,
      `export default { async parse() { return ${JSON.stringify({ passed: 1, failed: 0, skipped: 0, duration: 1, success: true, errorCategory: 'unknown', failures: [] })}; } };`,
    );
    const result = await run({}, 'process.exit(0)', { type: 'custom', parser });
    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(2);
    expect(result.suites[0]?.errorCategory).toBe('infra_error');
    expect(result.suites[0]?.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ error: expect.stringContaining('category') }),
      ]),
    );
  });

  it('does not infer an unmatched filter from a passing partial inventory after failed completion', async () => {
    const parser = resolve(environment.tempDir, 'partial-files-parser.mjs');
    await writeFile(
      parser,
      `export default { async parse() { return ${JSON.stringify({ passed: 1, failed: 0, skipped: 0, duration: 1, success: true, failures: [], testFiles: ['observed.test.ts'] })}; } };`,
    );
    const result = await run({}, 'process.exit(7)', { type: 'custom', parser }, [
      'observed.test.ts',
      'not-yet-run.test.ts',
    ]);
    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(2);
    expect(result.totals).toMatchObject({ passed: 1, failed: 0 });
    expect(result.suites[0]?.testFiles).toBeUndefined();
    expect(result.suites[0]?.failures.map((failure) => failure.testName)).toEqual([
      'Framework Completion',
    ]);
  });

  it.each([
    { testFiles: ['observed.test.ts'] },
    {
      testResults: [{ name: 'observed', file: 'observed.test.ts', status: 'passed', duration: 1 }],
    },
  ])('keeps parser-declared timeout inventory unknown for metadata %j', async (metadata) => {
    const parser = resolve(environment.tempDir, 'timeout-files-parser.mjs');
    await writeFile(
      parser,
      `export default { async parse() { return ${JSON.stringify({ passed: 1, failed: 0, skipped: 0, duration: 1, success: false, errorCategory: 'timeout', failures: [], ...metadata })}; } };`,
    );
    const result = await run({}, 'process.exit(0)', { type: 'custom', parser }, [
      'observed.test.ts',
      'not-yet-run.test.ts',
    ]);
    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(3);
    expect(result.totals).toMatchObject({ passed: 1, failed: 0 });
    expect(result.suites[0]?.testFiles).toBeUndefined();
    expect(result.suites[0]?.failures.map((failure) => failure.testName)).not.toContain(
      'Unmatched File Filter',
    );
  });

  it.each([{ testFiles: 'observed.test.ts' }, { testFiles: [7] }, { testResults: {} }])(
    'rejects malformed custom file metadata %j with an infrastructure diagnostic',
    async (metadata) => {
      const parser = resolve(environment.tempDir, 'malformed-files-parser.mjs');
      await writeFile(
        parser,
        `export default { async parse() { return ${JSON.stringify({ passed: 1, failed: 0, skipped: 0, duration: 1, success: true, failures: [], ...metadata })}; } };`,
      );
      const result = await run({}, 'process.exit(0)', { type: 'custom', parser });
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(2);
      expect(result.suites[0]?.failures).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ error: expect.stringContaining('file metadata') }),
        ]),
      );
    },
  );
});
