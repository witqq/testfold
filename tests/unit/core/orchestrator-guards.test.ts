/**
 * Tests for guard-aware hooks in Orchestrator
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { Orchestrator } from '../../../src/core/orchestrator.js';
import type { ValidatedConfig } from '../../../src/config/schema.js';
import type { Reporter } from '../../../src/reporters/types.js';
import type { GuardResult, Suite, SuiteResult } from '../../../src/config/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const createNoopReporter = (): Reporter => ({
  onStart: () => {},
  onSuiteComplete: () => {},
  onComplete: async () => {},
});

const VALID_JEST_JSON = JSON.stringify({
  numPassedTests: 3,
  numFailedTests: 0,
  numPendingTests: 0,
  testResults: [],
});

describe('Orchestrator guard-aware hooks', () => {
  const tempDir = resolve(__dirname, '../../fixtures/temp-guard-hooks');

  beforeAll(async () => {
    await mkdir(tempDir, { recursive: true });
  });

  beforeEach(async () => {
    // Pre-create valid result file so JestParser can parse it
    await writeFile(resolve(tempDir, 'guard-test.json'), VALID_JEST_JSON);
  });

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  function makeConfig(hooks: ValidatedConfig['hooks'] = {}): ValidatedConfig {
    return {
      suites: [{
        name: 'test-suite',
        type: 'jest',
        command: 'echo done',
        resultFile: 'guard-test.json',
      }],
      artifactsDir: tempDir,
      parallel: false,
      failFast: false,
      hooks,
    };
  }

  it('beforeSuite returning void allows suite to run normally', async () => {
    const config = makeConfig({
      beforeSuite: async (_suite: Suite): Promise<void> => {
        // void return — backward compatible
      },
    });

    const orchestrator = new Orchestrator({
      config,
      reporters: [createNoopReporter()],
      cwd: process.cwd(),
    });

    const results = await orchestrator.run();
    expect(results.success).toBe(true);
    expect(results.totals.passed).toBe(3);
  });

  it('beforeSuite returning { ok: true } allows suite to run normally', async () => {
    const config = makeConfig({
      beforeSuite: async (): Promise<GuardResult> => ({ ok: true }),
    });

    const orchestrator = new Orchestrator({
      config,
      reporters: [createNoopReporter()],
      cwd: process.cwd(),
    });

    const results = await orchestrator.run();
    expect(results.success).toBe(true);
    expect(results.totals.passed).toBe(3);
  });

  it('beforeSuite returning { ok: false } fails suite without running tests', async () => {
    const config = makeConfig({
      beforeSuite: async (): Promise<GuardResult> => ({
        ok: false,
        error: 'Pre-check: agent stats leak detected',
      }),
    });

    const orchestrator = new Orchestrator({
      config,
      reporters: [createNoopReporter()],
      cwd: process.cwd(),
    });

    const results = await orchestrator.run();
    expect(results.success).toBe(false);
    expect(results.totals.failed).toBe(1);
    expect(results.suites[0]?.failures[0]?.testName).toBe('beforeSuite Guard');
    expect(results.suites[0]?.failures[0]?.error).toBe('Pre-check: agent stats leak detected');
  });

  it('beforeSuite guard failure uses default error when none provided', async () => {
    const config = makeConfig({
      beforeSuite: async (): Promise<GuardResult> => ({ ok: false }),
    });

    const orchestrator = new Orchestrator({
      config,
      reporters: [createNoopReporter()],
      cwd: process.cwd(),
    });

    const results = await orchestrator.run();
    expect(results.success).toBe(false);
    expect(results.suites[0]?.failures[0]?.error).toBe('beforeSuite guard failed');
  });

  it('afterSuite returning void does not affect suite result', async () => {
    const config = makeConfig({
      afterSuite: async (_suite: Suite, _result: SuiteResult): Promise<void> => {
        // void return — backward compatible
      },
    });

    const orchestrator = new Orchestrator({
      config,
      reporters: [createNoopReporter()],
      cwd: process.cwd(),
    });

    const results = await orchestrator.run();
    expect(results.success).toBe(true);
    expect(results.totals.passed).toBe(3);
  });

  it('afterSuite returning { ok: false } fails suite even when tests pass', async () => {
    const config = makeConfig({
      afterSuite: async (): Promise<GuardResult> => ({
        ok: false,
        error: 'Post-check: telegram stats leaked',
      }),
    });

    const orchestrator = new Orchestrator({
      config,
      reporters: [createNoopReporter()],
      cwd: process.cwd(),
    });

    const results = await orchestrator.run();
    expect(results.success).toBe(false);
    // Original 3 passed + 1 guard failure
    expect(results.totals.passed).toBe(3);
    expect(results.totals.failed).toBe(1);
    expect(results.suites[0]?.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          testName: 'afterSuite Guard',
          error: 'Post-check: telegram stats leaked',
        }),
      ]),
    );
  });

  it('afterSuite returning { ok: true } does not affect suite result', async () => {
    const config = makeConfig({
      afterSuite: async (): Promise<GuardResult> => ({ ok: true }),
    });

    const orchestrator = new Orchestrator({
      config,
      reporters: [createNoopReporter()],
      cwd: process.cwd(),
    });

    const results = await orchestrator.run();
    expect(results.success).toBe(true);
    expect(results.totals.passed).toBe(3);
  });

  it('both beforeSuite and afterSuite guards work together', async () => {
    const config = makeConfig({
      beforeSuite: async (): Promise<GuardResult> => ({ ok: true }),
      afterSuite: async (): Promise<GuardResult> => ({
        ok: false,
        error: 'Cleanup verification failed',
      }),
    });

    const orchestrator = new Orchestrator({
      config,
      reporters: [createNoopReporter()],
      cwd: process.cwd(),
    });

    const results = await orchestrator.run();
    expect(results.success).toBe(false);
    expect(results.suites[0]?.failures[0]?.error).toBe('Cleanup verification failed');
  });

  it('beforeSuite guard failure produces INFRA_ERROR exit code', async () => {
    const config = makeConfig({
      beforeSuite: async (): Promise<GuardResult> => ({
        ok: false,
        error: 'Guard: stats leak detected',
      }),
    });

    const orchestrator = new Orchestrator({
      config,
      reporters: [createNoopReporter()],
      cwd: process.cwd(),
    });

    const results = await orchestrator.run();
    expect(results.exitCode).toBe(2); // ExitCode.INFRA_ERROR
    expect(results.suites[0]?.errorCategory).toBe('infra_error');
  });

  it('afterSuite guard failure produces INFRA_ERROR exit code', async () => {
    const config = makeConfig({
      afterSuite: async (): Promise<GuardResult> => ({
        ok: false,
        error: 'Guard: cleanup failed',
      }),
    });

    const orchestrator = new Orchestrator({
      config,
      reporters: [createNoopReporter()],
      cwd: process.cwd(),
    });

    const results = await orchestrator.run();
    expect(results.exitCode).toBe(2); // ExitCode.INFRA_ERROR
    expect(results.suites[0]?.errorCategory).toBe('infra_error');
  });
});
