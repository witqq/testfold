/**
 * Tests for guard-aware hooks and testsDir in Config interface
 */

import type { GuardResult, Suite, SuiteResult, Config } from '../../../src/config/types.js';
import { ConfigSchema } from '../../../src/config/schema.js';

// --- GuardResult type tests ---

describe('GuardResult interface', () => {
  it('represents success with ok: true', () => {
    const result: GuardResult = { ok: true };
    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('represents failure with ok: false and error message', () => {
    const result: GuardResult = { ok: false, error: 'Leak detected' };
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Leak detected');
  });

  it('allows failure without error message', () => {
    const result: GuardResult = { ok: false };
    expect(result.ok).toBe(false);
    expect(result.error).toBeUndefined();
  });
});

// --- HooksConfig guard-aware type tests ---

describe('HooksConfig guard-aware hooks', () => {
  it('beforeSuite can return void (backward compat)', async () => {
    const hook = async (_suite: Suite): Promise<void> => {
      // void return — existing behavior
    };
    const result = await hook({} as Suite);
    expect(result).toBeUndefined();
  });

  it('beforeSuite can return GuardResult success', async () => {
    const hook = async (_suite: Suite): Promise<GuardResult> => {
      return { ok: true };
    };
    const result = await hook({} as Suite);
    expect(result).toEqual({ ok: true });
  });

  it('beforeSuite can return GuardResult failure', async () => {
    const hook = async (_suite: Suite): Promise<GuardResult> => {
      return { ok: false, error: 'Setup check failed' };
    };
    const result = await hook({} as Suite);
    expect(result).toEqual({ ok: false, error: 'Setup check failed' });
  });

  it('afterSuite can return void (backward compat)', async () => {
    const hook = async (_suite: Suite, _result: SuiteResult): Promise<void> => {
      // void return — existing behavior
    };
    const result = await hook({} as Suite, {} as SuiteResult);
    expect(result).toBeUndefined();
  });

  it('afterSuite can return GuardResult failure', async () => {
    const hook = async (_suite: Suite, _result: SuiteResult): Promise<GuardResult> => {
      return { ok: false, error: 'Telegram stats leaked' };
    };
    const result = await hook({} as Suite, {} as SuiteResult);
    expect(result).toEqual({ ok: false, error: 'Telegram stats leaked' });
  });
});

// --- Zod schema accepts guard-aware hooks ---

describe('HooksSchema accepts guard-aware hooks', () => {
  it('validates config with guard-returning beforeSuite', () => {
    const config = {
      artifactsDir: 'test-results',
      suites: [{ name: 'unit', type: 'jest', command: 'jest', resultFile: 'results.json' }],
      hooks: {
        beforeSuite: async () => ({ ok: true }),
      },
    };
    const result = ConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('validates config with guard-returning afterSuite', () => {
    const config = {
      artifactsDir: 'test-results',
      suites: [{ name: 'unit', type: 'jest', command: 'jest', resultFile: 'results.json' }],
      hooks: {
        afterSuite: async () => ({ ok: false, error: 'leak detected' }),
      },
    };
    const result = ConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('validates config with void-returning hooks (backward compat)', () => {
    const config = {
      artifactsDir: 'test-results',
      suites: [{ name: 'unit', type: 'jest', command: 'jest', resultFile: 'results.json' }],
      hooks: {
        beforeSuite: async () => {},
        afterSuite: async () => {},
      },
    };
    const result = ConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });
});

// --- testsDir in Config interface ---

describe('Config.testsDir field', () => {
  it('accepts testsDir in config', () => {
    const config: Config = {
      artifactsDir: 'test-results',
      testsDir: './tests',
      suites: [{ name: 'unit', type: 'jest', command: 'jest', resultFile: 'r.json' }],
    };
    expect(config.testsDir).toBe('./tests');
  });

  it('testsDir is optional', () => {
    const config: Config = {
      artifactsDir: 'test-results',
      suites: [{ name: 'unit', type: 'jest', command: 'jest', resultFile: 'r.json' }],
    };
    expect(config.testsDir).toBeUndefined();
  });

  it('Zod schema defaults testsDir to ./tests', () => {
    const config = {
      artifactsDir: 'test-results',
      suites: [{ name: 'unit', type: 'jest', command: 'jest', resultFile: 'results.json' }],
    };
    const result = ConfigSchema.parse(config);
    expect(result.testsDir).toBe('./tests');
  });

  it('Zod schema accepts custom testsDir', () => {
    const config = {
      artifactsDir: 'test-results',
      testsDir: './spec',
      suites: [{ name: 'unit', type: 'jest', command: 'jest', resultFile: 'results.json' }],
    };
    const result = ConfigSchema.parse(config);
    expect(result.testsDir).toBe('./spec');
  });
});
