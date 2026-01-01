/**
 * Tests for environment file loading
 */

import { join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import {
  loadEnvFile,
  loadEnvFileFromPath,
  readEnvFileContent,
  extractUrl,
} from '../../../src/config/env-loader.js';

describe('env-loader', () => {
  const testDir = join(process.cwd(), 'test-env-files');

  beforeAll(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('loadEnvFile', () => {
    it('loads .env.{environment} file', () => {
      writeFileSync(join(testDir, '.env.staging'), 'API_KEY=staging-key\nDEBUG=true');

      const result = loadEnvFile('staging', testDir);

      expect(result.env).toEqual({
        API_KEY: 'staging-key',
        DEBUG: 'true',
      });
      expect(result.loadedFile).toContain('.env.staging');
    });

    it('loads .env.{environment}.local file', () => {
      writeFileSync(join(testDir, '.env.prod.local'), 'SECRET=local-secret');

      const result = loadEnvFile('prod', testDir);

      expect(result.env).toEqual({
        SECRET: 'local-secret',
      });
      expect(result.loadedFile).toContain('.env.prod.local');
    });

    it('loads env/.env.{environment} file', () => {
      mkdirSync(join(testDir, 'env'), { recursive: true });
      writeFileSync(join(testDir, 'env/.env.dev'), 'ENV_VAR=from-env-dir');

      const result = loadEnvFile('dev', testDir);

      expect(result.env).toEqual({
        ENV_VAR: 'from-env-dir',
      });
    });

    it('returns empty when no file found', () => {
      const result = loadEnvFile('nonexistent', testDir);

      expect(result.env).toEqual({});
      expect(result.loadedFile).toBeUndefined();
    });

    it('prefers .env.{environment} over .env.{environment}.local', () => {
      writeFileSync(join(testDir, '.env.priority'), 'PRIORITY=first');
      writeFileSync(join(testDir, '.env.priority.local'), 'PRIORITY=second');

      const result = loadEnvFile('priority', testDir);

      expect(result.env.PRIORITY).toBe('first');
    });
  });

  describe('loadEnvFileFromPath', () => {
    it('loads env file from explicit path', () => {
      writeFileSync(join(testDir, 'custom.env'), 'CUSTOM=value');

      const result = loadEnvFileFromPath('custom.env', testDir);

      expect(result.env).toEqual({
        CUSTOM: 'value',
      });
    });

    it('returns empty for non-existent file', () => {
      const result = loadEnvFileFromPath('missing.env', testDir);

      expect(result.env).toEqual({});
    });
  });

  describe('readEnvFileContent', () => {
    it('reads file content', () => {
      const content = 'LINE1=value1\nLINE2=value2';
      writeFileSync(join(testDir, 'read-test.env'), content);

      const result = readEnvFileContent('read-test.env', testDir);

      expect(result).toBe(content);
    });

    it('returns empty string for missing file', () => {
      const result = readEnvFileContent('missing.env', testDir);

      expect(result).toBe('');
    });
  });

  describe('extractUrl', () => {
    it('extracts URL using extractor function', () => {
      const content = 'APP_URL=https://staging.example.com\nOTHER=value';
      writeFileSync(join(testDir, 'url-test.env'), content);

      const extractor = (envContent: string) => {
        const match = envContent.match(/APP_URL=(.+)/);
        return match ? match[1] : undefined;
      };

      const result = extractUrl('url-test.env', extractor, testDir);

      expect(result).toBe('https://staging.example.com');
    });

    it('returns undefined for missing file', () => {
      const extractor = () => 'http://test.com';

      const result = extractUrl('missing.env', extractor, testDir);

      expect(result).toBeUndefined();
    });

    it('returns undefined when extractor returns undefined', () => {
      writeFileSync(join(testDir, 'no-url.env'), 'OTHER=value');

      const extractor = (envContent: string) => {
        const match = envContent.match(/APP_URL=(.+)/);
        return match ? match[1] : undefined;
      };

      const result = extractUrl('no-url.env', extractor, testDir);

      expect(result).toBeUndefined();
    });
  });
});
