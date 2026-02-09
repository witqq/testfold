import { parseArgs } from '../../../src/cli/args.js';
import { buildFilterArgs } from '../../../src/core/executor.js';

describe('CLI filtering flags', () => {
  describe('parseArgs --grep', () => {
    it('should parse --grep flag', () => {
      const args = parseArgs(['--grep', 'auth']);
      expect(args.grep).toBe('auth');
    });

    it('should parse -g alias', () => {
      const args = parseArgs(['-g', 'login']);
      expect(args.grep).toBe('login');
    });

    it('should be undefined when not specified', () => {
      const args = parseArgs([]);
      expect(args.grep).toBeUndefined();
    });
  });

  describe('parseArgs --grep-invert', () => {
    it('should parse --grep-invert flag', () => {
      const args = parseArgs(['--grep-invert', 'slow']);
      expect(args.grepInvert).toBe('slow');
    });

    it('should be undefined when not specified', () => {
      const args = parseArgs([]);
      expect(args.grepInvert).toBeUndefined();
    });
  });

  describe('parseArgs --file', () => {
    it('should parse --file flag', () => {
      const args = parseArgs(['--file', 'auth.test.ts']);
      expect(args.file).toBe('auth.test.ts');
    });

    it('should parse -f alias', () => {
      const args = parseArgs(['-f', 'login.test.ts']);
      expect(args.file).toBe('login.test.ts');
    });

    it('should be undefined when not specified', () => {
      const args = parseArgs([]);
      expect(args.file).toBeUndefined();
    });
  });

  describe('parseArgs combined with other flags', () => {
    it('should handle grep + suite names + env', () => {
      const args = parseArgs(['unit', '-e', 'staging', '--grep', 'auth']);
      expect(args.suites).toEqual(['unit']);
      expect(args.env).toBe('staging');
      expect(args.grep).toBe('auth');
    });

    it('should handle all filter flags together', () => {
      const args = parseArgs([
        'unit',
        '--grep',
        'auth',
        '--grep-invert',
        'slow',
        '--file',
        'user.test.ts',
      ]);
      expect(args.suites).toEqual(['unit']);
      expect(args.grep).toBe('auth');
      expect(args.grepInvert).toBe('slow');
      expect(args.file).toBe('user.test.ts');
    });

    it('should not conflict with pass-through args', () => {
      const args = parseArgs([
        '--grep',
        'auth',
        '--',
        '--verbose',
      ]);
      expect(args.grep).toBe('auth');
      expect(args.passThrough).toEqual(['--verbose']);
    });
  });
});

describe('buildFilterArgs', () => {
  describe('Jest suite type', () => {
    it('should transform --grep to --testNamePattern', () => {
      const result = buildFilterArgs('jest', { grep: 'auth' });
      expect(result).toEqual(['--testNamePattern=auth']);
    });

    it('should pass --grep-invert as-is for Jest', () => {
      const result = buildFilterArgs('jest', { grepInvert: 'slow' });
      expect(result).toEqual(['--grep-invert=slow']);
    });

    it('should append file filter directly', () => {
      const result = buildFilterArgs('jest', { file: 'auth.test.ts' });
      expect(result).toEqual(['auth.test.ts']);
    });

    it('should combine all filters', () => {
      const result = buildFilterArgs('jest', {
        grep: 'auth',
        grepInvert: 'slow',
        file: 'user.test.ts',
      });
      expect(result).toEqual([
        '--testNamePattern=auth',
        '--grep-invert=slow',
        'user.test.ts',
      ]);
    });
  });

  describe('Playwright suite type', () => {
    it('should pass --grep as --grep for Playwright', () => {
      const result = buildFilterArgs('playwright', { grep: 'login' });
      expect(result).toEqual(['--grep=login']);
    });

    it('should pass --grep-invert as --grep-invert for Playwright', () => {
      const result = buildFilterArgs('playwright', { grepInvert: 'flaky' });
      expect(result).toEqual(['--grep-invert=flaky']);
    });

    it('should append file filter directly', () => {
      const result = buildFilterArgs('playwright', { file: 'e2e/login.spec.ts' });
      expect(result).toEqual(['e2e/login.spec.ts']);
    });
  });

  describe('Custom suite type', () => {
    it('should pass --grep as-is', () => {
      const result = buildFilterArgs('custom', { grep: 'test' });
      expect(result).toEqual(['--grep=test']);
    });
  });

  describe('No filters', () => {
    it('should return empty array when no filters specified', () => {
      const result = buildFilterArgs('jest', {});
      expect(result).toEqual([]);
    });

    it('should return empty array with undefined values', () => {
      const result = buildFilterArgs('playwright', {
        grep: undefined,
        grepInvert: undefined,
        file: undefined,
      });
      expect(result).toEqual([]);
    });
  });
});
