import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PlaywrightParser } from '../../../src/parsers/playwright.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('PlaywrightParser', () => {
  const parser = new PlaywrightParser();
  const fixturesDir = resolve(__dirname, '../../fixtures/playwright');

  describe('parse success results', () => {
    it('should correctly count passed tests', async () => {
      const result = await parser.parse(resolve(fixturesDir, 'success.json'));

      expect(result.passed).toBe(3);
      expect(result.failed).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.success).toBe(true);
    });

    it('should extract duration from stats', async () => {
      const result = await parser.parse(resolve(fixturesDir, 'success.json'));

      expect(result.duration).toBe(4500);
    });

    it('should have no failures', async () => {
      const result = await parser.parse(resolve(fixturesDir, 'success.json'));

      expect(result.failures).toHaveLength(0);
    });

    it('should handle nested suites', async () => {
      const result = await parser.parse(resolve(fixturesDir, 'success.json'));

      expect(result.testResults).toBeDefined();
      expect(result.testResults?.length).toBe(3);

      // Check nested suite test
      const nestedTest = result.testResults?.find((t) =>
        t.name.includes('Password Reset'),
      );
      expect(nestedTest).toBeDefined();
      expect(nestedTest?.name).toContain('should send reset email');
    });
  });

  describe('parse failure results', () => {
    it('should correctly count passed, failed, skipped', async () => {
      const result = await parser.parse(resolve(fixturesDir, 'failures.json'));

      expect(result.passed).toBe(1);
      expect(result.failed).toBe(2);
      expect(result.skipped).toBe(1);
      expect(result.success).toBe(false);
    });

    it('should extract failure details with error and stack', async () => {
      const result = await parser.parse(resolve(fixturesDir, 'failures.json'));

      expect(result.failures.length).toBeGreaterThan(0);

      const failure = result.failures[0];
      expect(failure?.error).toContain('Timed out waiting for element');
      expect(failure?.stack).toContain('LoginPage.waitForError');
    });

    it('should extract stdout and stderr', async () => {
      const result = await parser.parse(resolve(fixturesDir, 'failures.json'));

      const failure = result.failures[0];
      expect(failure?.stdout).toContain('Attempting login');
      expect(failure?.stderr).toContain('Warning');
    });

    it('should extract attachments', async () => {
      const result = await parser.parse(resolve(fixturesDir, 'failures.json'));

      const failure = result.failures[0];
      expect(failure?.attachments).toBeDefined();
      expect(failure?.attachments?.length).toBe(2);
      expect(failure?.attachments?.[0]?.name).toBe('screenshot');
    });

    it('should take last result after retries', async () => {
      const result = await parser.parse(resolve(fixturesDir, 'failures.json'));

      // The test with retries should only appear once
      const invalidCredentialsTests = result.testResults?.filter((t) =>
        t.name.includes('invalid credentials'),
      );
      expect(invalidCredentialsTests?.length).toBe(1);
    });

    it('should handle timedOut status as failed', async () => {
      const result = await parser.parse(resolve(fixturesDir, 'failures.json'));

      const timedOutTest = result.testResults?.find((t) =>
        t.name.includes('load widgets'),
      );
      expect(timedOutTest?.status).toBe('failed');
    });
  });

  describe('handle missing file', () => {
    it('should return empty success result for missing file', async () => {
      const result = await parser.parse('/nonexistent/path.json');

      expect(result.passed).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.success).toBe(true);
    });
  });
});
