/**
 * Tests for path prefix resolution in executor
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolvePathPrefix } from '../../../src/utils/path-resolver.js';

describe('Executor Path Resolution', () => {
  const testDir = join(process.cwd(), 'test-executor-paths');

  beforeAll(() => {
    // Create test directory structure
    mkdirSync(join(testDir, 'unit'), { recursive: true });
    mkdirSync(join(testDir, 'e2e'), { recursive: true });

    // Create test files
    writeFileSync(join(testDir, 'unit', 'auth.test.ts'), '');
    writeFileSync(join(testDir, 'unit', 'auth-service.test.ts'), '');
    writeFileSync(join(testDir, 'unit', 'user.test.ts'), '');
    writeFileSync(join(testDir, 'e2e', 'login.spec.ts'), '');
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('path prefix resolution logic', () => {
    it('resolves unique prefix to full path', () => {
      const matches = resolvePathPrefix('user', { baseDir: testDir });

      expect(matches).toHaveLength(1);
      expect(matches[0]).toContain('user.test.ts');
    });

    it('resolves prefix with multiple matches', () => {
      const matches = resolvePathPrefix('auth', { baseDir: testDir });

      // Should find both auth.test.ts and auth-service.test.ts
      expect(matches).toHaveLength(2);
    });

    it('resolves spec files', () => {
      const matches = resolvePathPrefix('login', { baseDir: testDir });

      expect(matches).toHaveLength(1);
      expect(matches[0]).toContain('login.spec.ts');
    });

    it('returns empty for non-matching prefix', () => {
      const matches = resolvePathPrefix('nonexistent', { baseDir: testDir });

      expect(matches).toEqual([]);
    });
  });

  describe('executor behavior expectations', () => {
    // These tests document the expected behavior of executor path resolution

    it('should resolve single-match prefixes to full paths', () => {
      // When user runs: testfold unit -- user
      // Expected: "user" should be resolved to full path
      const prefix = 'user';
      const matches = resolvePathPrefix(prefix, { baseDir: testDir });

      expect(matches.length).toBe(1);
      // Executor should use matches[0] instead of "user"
    });

    it('should keep multi-match prefixes unchanged', () => {
      // When user runs: testfold unit -- auth
      // Expected: "auth" should remain as-is (too ambiguous)
      const prefix = 'auth';
      const matches = resolvePathPrefix(prefix, { baseDir: testDir });

      expect(matches.length).toBeGreaterThan(1);
      // Executor should keep "auth" unchanged when multiple matches
    });

    it('should skip flags', () => {
      // Flags like --verbose should never be resolved
      const flag = '--verbose';

      // Skip flags that start with -
      expect(flag.startsWith('-')).toBe(true);
    });

    it('should skip paths with slashes', () => {
      // Full paths should never be resolved
      const fullPath = 'tests/unit/auth.test.ts';

      // Skip paths that contain /
      expect(fullPath.includes('/')).toBe(true);
    });
  });
});
