import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JestParser } from '../../../src/parsers/jest.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('JestParser', () => {
  const parser = new JestParser();
  const fixturesDir = resolve(__dirname, '../../fixtures/jest');

  describe('parse success results', () => {
    it('should correctly count passed, failed, skipped tests', async () => {
      const result = await parser.parse(resolve(fixturesDir, 'success.json'));

      expect(result.passed).toBe(5);
      expect(result.failed).toBe(0);
      expect(result.skipped).toBe(1);
      expect(result.success).toBe(true);
    });

    it('should extract test duration', async () => {
      const result = await parser.parse(resolve(fixturesDir, 'success.json'));

      expect(result.duration).toBeGreaterThan(0);
    });

    it('should have no failures', async () => {
      const result = await parser.parse(resolve(fixturesDir, 'success.json'));

      expect(result.failures).toHaveLength(0);
    });

    it('should extract individual test results', async () => {
      const result = await parser.parse(resolve(fixturesDir, 'success.json'));

      expect(result.testResults).toBeDefined();
      expect(result.testResults?.length).toBe(6);

      const firstTest = result.testResults?.[0];
      expect(firstTest?.name).toBe('stripAnsi > should remove ANSI codes');
      expect(firstTest?.status).toBe('passed');
    });
  });

  describe('parse failure results', () => {
    it('should correctly count passed and failed tests', async () => {
      const result = await parser.parse(resolve(fixturesDir, 'failures.json'));

      expect(result.passed).toBe(3);
      expect(result.failed).toBe(2);
      expect(result.success).toBe(false);
    });

    it('should extract failure details', async () => {
      const result = await parser.parse(resolve(fixturesDir, 'failures.json'));

      expect(result.failures).toHaveLength(2);

      const firstFailure = result.failures[0];
      expect(firstFailure?.testName).toContain('should extract failure details');
      expect(firstFailure?.error).toContain('expect(received).toBe(expected)');
    });

    it('should preserve ANSI codes in error messages', async () => {
      const result = await parser.parse(resolve(fixturesDir, 'failures.json'));

      const secondFailure = result.failures[1];
      expect(secondFailure?.error).toContain('\u001b[31m');
    });
  });

  describe('handle missing file', () => {
    it('should return empty success result for missing file', async () => {
      const result = await parser.parse('/nonexistent/path.json');

      expect(result.passed).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.success).toBe(true);
      expect(result.failures).toHaveLength(0);
    });
  });

  describe('handle crashed test suite', () => {
    it('should count crashed suite as failed', async () => {
      const result = await parser.parse(
        resolve(fixturesDir, 'crashed-suite.json'),
      );

      expect(result.passed).toBe(3);
      expect(result.failed).toBe(1);
      expect(result.success).toBe(false);
    });

    it('should extract crash error message', async () => {
      const result = await parser.parse(
        resolve(fixturesDir, 'crashed-suite.json'),
      );

      expect(result.failures).toHaveLength(1);
      expect(result.failures[0].testName).toBe('Test Suite Crash');
      expect(result.failures[0].error).toContain('ReferenceError');
      expect(result.failures[0].error).toContain('__dirname is not defined');
    });

    it('should include crashed suite file path', async () => {
      const result = await parser.parse(
        resolve(fixturesDir, 'crashed-suite.json'),
      );

      expect(result.failures[0].filePath).toBe('/path/to/crashed.test.ts');
    });

    it('should still parse passing tests from other suites', async () => {
      const result = await parser.parse(
        resolve(fixturesDir, 'crashed-suite.json'),
      );

      expect(result.testResults).toBeDefined();
      expect(result.testResults?.length).toBe(3);
      expect(result.testResults?.[0].status).toBe('passed');
    });
  });
});
