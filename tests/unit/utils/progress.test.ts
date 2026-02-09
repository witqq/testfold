/**
 * Tests for progress formatting utility
 */

import { createProgressCallback } from '../../../src/utils/progress.js';

describe('Progress formatter', () => {
  let stderrWrites: string[];
  let originalWrite: typeof process.stderr.write;

  beforeAll(() => {
    originalWrite = process.stderr.write;
  });

  afterAll(() => {
    process.stderr.write = originalWrite;
  });

  beforeEach(() => {
    stderrWrites = [];
    process.stderr.write = ((chunk: string) => {
      stderrWrites.push(chunk);
      return true;
    }) as typeof process.stderr.write;
  });

  afterEach(() => {
    process.stderr.write = originalWrite;
  });

  describe('Jest pattern detection', () => {
    it('should count Jest pass markers', () => {
      const { onOutput, getState } = createProgressCallback('unit', 'jest');
      onOutput('  ✓ should work\n  ✓ should pass\n');
      expect(getState().passed).toBe(2);
      expect(getState().failed).toBe(0);
    });

    it('should count Jest fail markers', () => {
      const { onOutput, getState } = createProgressCallback('unit', 'jest');
      onOutput('  ✕ should fail\n');
      expect(getState().failed).toBe(1);
    });

    it('should count mixed pass and fail', () => {
      const { onOutput, getState } = createProgressCallback('unit', 'jest');
      onOutput('  ✓ test1\n  ✕ test2\n  ✓ test3\n');
      expect(getState().passed).toBe(2);
      expect(getState().failed).toBe(1);
    });

    it('should handle ANSI codes in output', () => {
      const { onOutput, getState } = createProgressCallback('unit', 'jest');
      onOutput('\x1b[32m  ✓\x1b[0m test passes\n');
      expect(getState().passed).toBe(1);
    });
  });

  describe('Playwright pattern detection', () => {
    it('should count Playwright pass markers', () => {
      const { onOutput, getState } = createProgressCallback('e2e', 'playwright');
      onOutput('  ✓ test passes\n');
      expect(getState().passed).toBe(1);
    });

    it('should parse summary line with counts', () => {
      const { onOutput, getState } = createProgressCallback('e2e', 'playwright');
      onOutput('  10 passed\n');
      expect(getState().passed).toBe(10);
    });

    it('should parse failed count from summary', () => {
      const { onOutput, getState } = createProgressCallback('e2e', 'playwright');
      onOutput('  3 failed\n');
      expect(getState().failed).toBe(3);
    });
  });

  describe('Progress emission', () => {
    it('should emit progress to stderr every 10 tests', () => {
      const { onOutput } = createProgressCallback('unit', 'jest');
      // Feed 10 passing tests
      for (let i = 0; i < 10; i++) {
        onOutput(`  ✓ test ${i}\n`);
      }
      expect(stderrWrites.length).toBe(1);
      expect(stderrWrites[0]).toContain('[unit]');
      expect(stderrWrites[0]).toContain('10 tests');
      expect(stderrWrites[0]).toContain('10 passed');
    });

    it('should not emit progress before 10 tests', () => {
      const { onOutput } = createProgressCallback('unit', 'jest');
      for (let i = 0; i < 9; i++) {
        onOutput(`  ✓ test ${i}\n`);
      }
      expect(stderrWrites.length).toBe(0);
    });

    it('should show warning indicator when failures present', () => {
      const { onOutput } = createProgressCallback('unit', 'jest');
      onOutput('  ✕ fail1\n');
      for (let i = 0; i < 9; i++) {
        onOutput(`  ✓ test ${i}\n`);
      }
      expect(stderrWrites.length).toBe(1);
      expect(stderrWrites[0]).toContain('⚠');
    });

    it('should emit multiple progress reports', () => {
      const { onOutput } = createProgressCallback('unit', 'jest');
      for (let i = 0; i < 25; i++) {
        onOutput(`  ✓ test ${i}\n`);
      }
      expect(stderrWrites.length).toBe(2);
    });
  });

  describe('State tracking', () => {
    it('should return suite name in state', () => {
      const { getState } = createProgressCallback('integration', 'jest');
      expect(getState().suiteName).toBe('integration');
    });

    it('should return a copy of state', () => {
      const { getState } = createProgressCallback('unit', 'jest');
      const state1 = getState();
      const state2 = getState();
      expect(state1).not.toBe(state2);
      expect(state1).toEqual(state2);
    });

    it('should handle chunked output across buffer boundaries', () => {
      const { onOutput, getState } = createProgressCallback('unit', 'jest');
      onOutput('  ✓ te');
      onOutput('st1\n  ✓ test2\n');
      expect(getState().passed).toBe(2);
    });
  });

  describe('Unknown framework', () => {
    it('should not count anything for unknown framework type', () => {
      const { onOutput, getState } = createProgressCallback('custom', 'custom');
      onOutput('  ✓ test passes\n  PASS suite\n');
      expect(getState().passed).toBe(0);
      expect(getState().failed).toBe(0);
    });
  });
});
