import { parseArgs } from '../../../src/cli/args.js';

describe('parseArgs', () => {
  describe('basic arguments', () => {
    it('should parse suite names', () => {
      const args = parseArgs(['unit', 'integration']);

      expect(args.suites).toEqual(['unit', 'integration']);
    });

    it('should parse config flag', () => {
      const args = parseArgs(['-c', 'custom.config.ts']);

      expect(args.config).toBe('custom.config.ts');
    });

    it('should parse env flag', () => {
      const args = parseArgs(['-e', 'staging']);

      expect(args.env).toBe('staging');
    });

    it('should default parallel to true', () => {
      const args = parseArgs([]);

      expect(args.parallel).toBe(true);
    });

    it('should handle --no-parallel', () => {
      const args = parseArgs(['--no-parallel']);

      expect(args.parallel).toBe(false);
    });
  });

  describe('reporter override', () => {
    it('should parse --reporter flag', () => {
      const args = parseArgs(['--reporter', 'json']);

      expect(args.reporter).toEqual(['json']);
    });

    it('should parse -r alias', () => {
      const args = parseArgs(['-r', 'console']);

      expect(args.reporter).toEqual(['console']);
    });

    it('should return empty array when not specified', () => {
      const args = parseArgs([]);

      expect(args.reporter).toEqual([]);
    });
  });

  describe('pass-through arguments', () => {
    it('should capture arguments after -- separator', () => {
      const args = parseArgs(['unit', '--', '--testNamePattern=auth']);

      expect(args.suites).toEqual(['unit']);
      expect(args.passThrough).toEqual(['--testNamePattern=auth']);
    });

    it('should capture multiple pass-through arguments', () => {
      const args = parseArgs(['--', '--verbose', '--coverage', '--bail']);

      expect(args.passThrough).toEqual(['--verbose', '--coverage', '--bail']);
    });

    it('should return empty array when no separator', () => {
      const args = parseArgs(['unit', 'integration']);

      expect(args.passThrough).toEqual([]);
    });

    it('should handle separator at the end', () => {
      const args = parseArgs(['unit', '--']);

      expect(args.suites).toEqual(['unit']);
      expect(args.passThrough).toEqual([]);
    });

    it('should not parse pass-through as CLI flags', () => {
      const args = parseArgs(['--reporter', 'json', '--', '-r', 'console']);

      expect(args.reporter).toEqual(['json']);
      expect(args.passThrough).toEqual(['-r', 'console']);
    });
  });

  describe('combined arguments', () => {
    it('should handle all argument types together', () => {
      const args = parseArgs([
        'unit',
        '-c',
        'custom.config.ts',
        '-e',
        'staging',
        '-r',
        'json',
        '--fail-fast',
        '--',
        '--testNamePattern=auth',
        '--verbose',
      ]);

      expect(args.suites).toEqual(['unit']);
      expect(args.config).toBe('custom.config.ts');
      expect(args.env).toBe('staging');
      expect(args.reporter).toEqual(['json']);
      expect(args.failFast).toBe(true);
      expect(args.passThrough).toEqual(['--testNamePattern=auth', '--verbose']);
    });
  });
});
