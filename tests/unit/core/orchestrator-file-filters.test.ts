import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { Orchestrator } from '../../../src/core/orchestrator.js';
import type { ValidatedConfig } from '../../../src/config/schema.js';
import type { Suite, SuiteResult } from '../../../src/config/types.js';
import type { Reporter } from '../../../src/reporters/types.js';
import { matchesFileFilter } from '../../../src/utils/file-filters.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const tempDir = resolve(__dirname, '../../fixtures/temp-file-filters');
const projectDir = resolve(tempDir, 'project');

function jestResult(files: string[]): string {
  return JSON.stringify({
    numPassedTests: files.length,
    numFailedTests: 0,
    numFailedTestSuites: 0,
    numPendingTests: 0,
    numTotalTests: files.length,
    success: true,
    testResults: files.map((file) => ({
      name: resolve(projectDir, file),
      status: 'passed',
      message: '',
      startTime: 0,
      endTime: 10,
      assertionResults: [
        {
          ancestorTitles: ['suite'],
          title: 'works',
          status: 'passed',
          duration: 1,
          failureMessages: [],
        },
      ],
    })),
  });
}

function jestSuite(name: string, resultFile: string): Suite {
  return { name, type: 'jest', command: 'echo ran', resultFile };
}

function createRecordingReporter(): Reporter & { completed: SuiteResult[] } {
  const completed: SuiteResult[] = [];
  return {
    completed,
    onStart: () => {},
    onSuiteComplete: (_suite, result) => {
      completed.push({ ...result, failures: [...result.failures] });
    },
    onComplete: async () => {},
  };
}

async function run(suites: Suite[], file: string[]) {
  const reporter = createRecordingReporter();
  const config: ValidatedConfig = {
    suites,
    artifactsDir: tempDir,
    parallel: false,
    failFast: false,
  };
  const orchestrator = new Orchestrator({ config, reporters: [reporter], cwd: projectDir, file });
  const results = await orchestrator.run();
  return { results, reporter };
}

describe('--file filter coverage', () => {
  beforeAll(async () => {
    await mkdir(projectDir, { recursive: true });
    await writeFile(resolve(tempDir, 'unit.json'), jestResult(['tests/unit/labels.test.ts']));
    await writeFile(
      resolve(tempDir, 'integration.json'),
      jestResult(['tests/integration/api.test.ts']),
    );
    await writeFile(
      resolve(tempDir, 'e2e.json'),
      JSON.stringify({
        config: { rootDir: resolve(projectDir, 'tests/e2e') },
        stats: { startTime: '', duration: 5, expected: 1, unexpected: 0, skipped: 0, flaky: 0 },
        suites: [
          {
            title: 'login.spec.ts',
            file: 'login.spec.ts',
            specs: [
              {
                title: 'logs in',
                ok: true,
                tests: [{ title: 'logs in', results: [{ status: 'passed', duration: 5 }] }],
              },
            ],
          },
        ],
      }),
    );
  });

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('fails and names a requested file that matched no test while another file passed', async () => {
    const { results, reporter } = await run(
      [jestSuite('unit', 'unit.json')],
      ['tests/unit/labels.test.ts', 'tests/unit/does-not-exist.test.ts'],
    );

    expect(results.success).toBe(false);
    expect(results.exitCode).toBe(2);
    expect(results.totals.passed).toBe(1);
    expect(results.totals.failed).toBe(1);
    const unit = results.suites[0];
    expect(unit?.errorCategory).toBe('infra_error');
    expect(unit?.failures.map((f) => f.testName)).toEqual([
      'Unmatched File Filter: tests/unit/does-not-exist.test.ts',
    ]);
    expect(unit?.failures[0]?.error).toContain('tests/unit/does-not-exist.test.ts');
    // Reporters receive the suite only after the check, so no suite is shown as passed.
    expect(reporter.completed).toHaveLength(1);
    expect(reporter.completed[0]?.success).toBe(false);
  });

  it('passes when every requested file matched a test', async () => {
    const { results, reporter } = await run(
      [jestSuite('unit', 'unit.json')],
      ['tests/unit/labels.test.ts', 'labels'],
    );

    expect(results.success).toBe(true);
    expect(results.exitCode).toBe(0);
    expect(reporter.completed[0]?.success).toBe(true);
  });

  it('accepts a file that belongs to another selected suite', async () => {
    const { results } = await run(
      [jestSuite('unit', 'unit.json'), jestSuite('integration', 'integration.json')],
      ['tests/unit/labels.test.ts', 'tests/integration/api.test.ts'],
    );

    expect(results.success).toBe(true);
    expect(results.exitCode).toBe(0);
  });

  it('reports a file missing from every selected suite once, naming the searched suites', async () => {
    const { results } = await run(
      [jestSuite('unit', 'unit.json'), jestSuite('integration', 'integration.json')],
      ['tests/unit/labels.test.ts', 'tests/unit/typo.test.ts'],
    );

    expect(results.exitCode).toBe(2);
    expect(results.totals.failed).toBe(1);
    expect(results.suites[0]?.failures[0]?.error).toContain('(unit, integration)');
    expect(results.suites[1]?.failures).toEqual([]);
  });

  it('matches Playwright spec files reported relative to rootDir, including line suffixes', async () => {
    const { results } = await run(
      [{ name: 'e2e', type: 'playwright', command: 'echo ran', resultFile: 'e2e.json' }],
      ['tests/e2e/login.spec.ts:12'],
    );

    expect(results.success).toBe(true);
    expect(results.exitCode).toBe(0);
  });

  it('does not claim a missing file when a selected suite reported no file inventory', async () => {
    const { results } = await run(
      [jestSuite('unit', 'unit.json'), jestSuite('broken', 'absent.json')],
      ['tests/unit/labels.test.ts', 'tests/broken/some.test.ts'],
    );

    expect(results.exitCode).toBe(2);
    const testNames = results.suites.flatMap((s) => s.failures.map((f) => f.testName));
    expect(testNames).toEqual(['Missing Result File']);
  });
});

describe('matchesFileFilter', () => {
  const cwd = '/repo';

  it.each([
    ['tests/unit/a.test.ts', '/repo/tests/unit/a.test.ts', true],
    ['./tests/unit/a.test.ts', '/repo/tests/unit/a.test.ts', true],
    ['/repo/tests/unit/a.test.ts', '/repo/tests/unit/a.test.ts', true],
    ['a.test', '/repo/tests/unit/a.test.ts', true],
    ['tests/unit/b.test.ts', '/repo/tests/unit/a.test.ts', false],
    ['tests/unit/a.test.ts:10:2', '/repo/tests/unit/a.test.ts', true],
    ['tests/e2e/login.spec.ts', 'login.spec.ts', true],
    ['tests/(unclosed', '/repo/tests/(unclosed.test.ts', true],
  ])('%s against %s -> %s', (filter, file, expected) => {
    expect(matchesFileFilter(filter, file, cwd)).toBe(expected);
  });
});
