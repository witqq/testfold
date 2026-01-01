/**
 * Tests for Path Prefix Resolver
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolvePathPrefix, resolvePathPrefixes } from '../../../src/utils/path-resolver.js';

describe('Path Prefix Resolver', () => {
  const testDir = join(process.cwd(), 'test-path-resolver');

  beforeAll(() => {
    // Create test directory structure
    mkdirSync(join(testDir, 'unit'), { recursive: true });
    mkdirSync(join(testDir, 'integration'), { recursive: true });
    mkdirSync(join(testDir, 'e2e'), { recursive: true });

    // Create test files
    writeFileSync(join(testDir, 'unit', 'auth.test.ts'), '');
    writeFileSync(join(testDir, 'unit', 'auth-service.test.ts'), '');
    writeFileSync(join(testDir, 'unit', 'user.test.ts'), '');
    writeFileSync(join(testDir, 'unit', 'user-profile.test.ts'), '');
    writeFileSync(join(testDir, 'integration', 'api.test.ts'), '');
    writeFileSync(join(testDir, 'integration', 'auth-flow.test.ts'), '');
    writeFileSync(join(testDir, 'e2e', 'login.spec.ts'), '');
    writeFileSync(join(testDir, 'e2e', 'login-flow.spec.ts'), '');
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('resolvePathPrefix', () => {
    it('resolves exact prefix match', () => {
      const matches = resolvePathPrefix('auth', { baseDir: testDir });

      expect(matches).toHaveLength(3);
      expect(matches.some(m => m.includes('auth.test.ts'))).toBe(true);
      expect(matches.some(m => m.includes('auth-service.test.ts'))).toBe(true);
      expect(matches.some(m => m.includes('auth-flow.test.ts'))).toBe(true);
    });

    it('resolves hyphenated prefix', () => {
      const matches = resolvePathPrefix('user-profile', { baseDir: testDir });

      expect(matches).toHaveLength(1);
      expect(matches[0]).toContain('user-profile.test.ts');
    });

    it('is case-insensitive', () => {
      const matchesLower = resolvePathPrefix('auth', { baseDir: testDir });
      const matchesUpper = resolvePathPrefix('AUTH', { baseDir: testDir });
      const matchesMixed = resolvePathPrefix('Auth', { baseDir: testDir });

      expect(matchesLower).toHaveLength(3);
      expect(matchesUpper).toHaveLength(3);
      expect(matchesMixed).toHaveLength(3);
    });

    it('returns empty array for no matches', () => {
      const matches = resolvePathPrefix('nonexistent', { baseDir: testDir });

      expect(matches).toEqual([]);
    });

    it('matches .spec.ts files', () => {
      const matches = resolvePathPrefix('login', { baseDir: testDir });

      expect(matches).toHaveLength(2);
      expect(matches.some(m => m.includes('login.spec.ts'))).toBe(true);
      expect(matches.some(m => m.includes('login-flow.spec.ts'))).toBe(true);
    });

    it('searches recursively in subdirectories', () => {
      const matches = resolvePathPrefix('api', { baseDir: testDir });

      expect(matches).toHaveLength(1);
      expect(matches[0]).toContain('integration');
      expect(matches[0]).toContain('api.test.ts');
    });

    it('supports custom extensions', () => {
      const matches = resolvePathPrefix('auth', {
        baseDir: testDir,
        extensions: ['.test.ts'],
      });

      // Should only match .test.ts, not .spec.ts
      expect(matches).toHaveLength(3);
      expect(matches.every(m => m.endsWith('.test.ts'))).toBe(true);
    });

    it('handles non-existent directory gracefully', () => {
      const matches = resolvePathPrefix('test', {
        baseDir: '/nonexistent/path',
      });

      expect(matches).toEqual([]);
    });
  });

  describe('resolvePathPrefixes', () => {
    it('resolves multiple prefixes', () => {
      const matches = resolvePathPrefixes(['auth', 'user'], { baseDir: testDir });

      // auth: 3 matches, user: 2 matches
      expect(matches.length).toBeGreaterThanOrEqual(5);
    });

    it('returns unique paths (no duplicates)', () => {
      const matches = resolvePathPrefixes(['auth', 'auth-service'], { baseDir: testDir });

      // auth-service matches auth too, but should be unique
      const uniqueMatches = new Set(matches);
      expect(matches.length).toBe(uniqueMatches.size);
    });

    it('handles empty prefix array', () => {
      const matches = resolvePathPrefixes([], { baseDir: testDir });

      expect(matches).toEqual([]);
    });
  });
});
