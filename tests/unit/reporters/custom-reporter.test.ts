import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isReporterPath, loadCustomReporter } from '../../../src/reporters/custom.js';
import { parseArgs } from '../../../src/cli/args.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, '../../fixtures/custom-reporters');

describe('isReporterPath', () => {
  it('should detect relative paths with ./', () => {
    expect(isReporterPath('./my-reporter.ts')).toBe(true);
  });

  it('should detect relative paths with ../', () => {
    expect(isReporterPath('../reporters/custom.ts')).toBe(true);
  });

  it('should detect absolute paths', () => {
    expect(isReporterPath('/Users/mike/reporter.js')).toBe(true);
  });

  it('should detect .ts files', () => {
    expect(isReporterPath('reporters/my-reporter.ts')).toBe(true);
  });

  it('should detect .js files', () => {
    expect(isReporterPath('reporters/my-reporter.js')).toBe(true);
  });

  it('should detect .mjs files', () => {
    expect(isReporterPath('reporters/my-reporter.mjs')).toBe(true);
  });

  it('should not detect built-in names', () => {
    expect(isReporterPath('console')).toBe(false);
    expect(isReporterPath('json')).toBe(false);
    expect(isReporterPath('timing-text')).toBe(false);
  });
});

describe('loadCustomReporter', () => {
  describe('valid reporters', () => {
    it('should load reporter exported as default class', async () => {
      const reporterPath = resolve(fixturesDir, 'valid-class.ts');
      const reporter = await loadCustomReporter(reporterPath, __dirname);

      expect(reporter).toBeDefined();
      expect(typeof reporter.onStart).toBe('function');
      expect(typeof reporter.onSuiteComplete).toBe('function');
      expect(typeof reporter.onComplete).toBe('function');
    });

    it('should load reporter exported as default object', async () => {
      const reporterPath = resolve(fixturesDir, 'valid-object.ts');
      const reporter = await loadCustomReporter(reporterPath, __dirname);

      expect(reporter).toBeDefined();
      expect(typeof reporter.onStart).toBe('function');
      expect(typeof reporter.onSuiteComplete).toBe('function');
      expect(typeof reporter.onComplete).toBe('function');
    });

    it('should load reporter from named export', async () => {
      const reporterPath = resolve(fixturesDir, 'named-export.ts');
      const reporter = await loadCustomReporter(reporterPath, __dirname);

      expect(reporter).toBeDefined();
      expect(typeof reporter.onStart).toBe('function');
      expect(typeof reporter.onSuiteComplete).toBe('function');
      expect(typeof reporter.onComplete).toBe('function');
    });

    it('should resolve relative paths from cwd', async () => {
      const relativePath = './valid-class.ts';
      const reporter = await loadCustomReporter(relativePath, fixturesDir);

      expect(reporter).toBeDefined();
      expect(typeof reporter.onStart).toBe('function');
    });

    it('should invoke loaded reporter lifecycle methods', async () => {
      const reporterPath = resolve(fixturesDir, 'valid-class.ts');
      const reporter = await loadCustomReporter(reporterPath, __dirname);

      reporter.onStart([]);
      reporter.onSuiteComplete(
        { name: 'test', type: 'jest', command: 'echo' },
        { passed: 1, failed: 0, skipped: 0, duration: 100, success: true, failures: [] },
      );
      await reporter.onComplete({
        passed: 1, failed: 0, skipped: 0, duration: 100, success: true,
        suites: [], failedSuites: [],
      });

      expect((reporter as { calls: string[] }).calls).toEqual([
        'onStart', 'onSuiteComplete', 'onComplete',
      ]);
    });
  });

  describe('invalid reporters', () => {
    it('should throw for non-existent file', async () => {
      await expect(
        loadCustomReporter('/non/existent/reporter.ts', __dirname),
      ).rejects.toThrow('Failed to load custom reporter');
    });

    it('should throw for reporter without required methods', async () => {
      const reporterPath = resolve(fixturesDir, 'invalid-no-methods.ts');

      await expect(loadCustomReporter(reporterPath, __dirname)).rejects.toThrow(
        'does not export a valid Reporter interface',
      );
    });
  });
});

describe('parseArgs multi-reporter', () => {
  it('should parse single reporter flag', () => {
    const result = parseArgs(['-r', 'json']);
    expect(result.reporter).toEqual(['json']);
  });

  it('should parse comma-separated reporters', () => {
    const result = parseArgs(['-r', 'console,json,timing-text']);
    expect(result.reporter).toEqual(['console', 'json', 'timing-text']);
  });

  it('should parse repeated reporter flags', () => {
    const result = parseArgs(['-r', 'console', '-r', 'json']);
    expect(result.reporter).toEqual(['console', 'json']);
  });

  it('should return empty array when no reporter specified', () => {
    const result = parseArgs([]);
    expect(result.reporter).toEqual([]);
  });

  it('should handle mixed comma and repeated flags', () => {
    const result = parseArgs(['-r', 'console,json', '-r', 'timing']);
    expect(result.reporter).toEqual(['console', 'json', 'timing']);
  });

  it('should trim whitespace around commas', () => {
    const result = parseArgs(['-r', 'console , json']);
    expect(result.reporter).toEqual(['console', 'json']);
  });

  it('should handle custom reporter path in multi-reporter', () => {
    const result = parseArgs(['-r', 'console,./my-reporter.ts']);
    expect(result.reporter).toEqual(['console', './my-reporter.ts']);
  });
});
