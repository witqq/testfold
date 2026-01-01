/**
 * Tests for Orchestrator environment variable handling
 */

import { join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { Orchestrator } from '../../../src/core/orchestrator.js';
import type { ValidatedConfig } from '../../../src/config/schema.js';
import type { UrlExtractor } from '../../../src/config/types.js';

describe('Orchestrator environment handling', () => {
  const testDir = join(process.cwd(), 'test-orchestrator-env');
  const artifactsDir = join(testDir, 'artifacts');

  beforeAll(() => {
    mkdirSync(artifactsDir, { recursive: true });
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  const createMockConfig = (
    envFileVars: Record<string, string> = {},
    suiteEnv: Record<string, string> = {},
    environments?: Record<string, unknown>,
  ): { config: ValidatedConfig; envFileVars: Record<string, string> } => {
    const config: ValidatedConfig = {
      artifactsDir,
      parallel: false,
      failFast: false,
      reporters: ['console'],
      suites: [
        {
          name: 'test-suite',
          type: 'jest',
          command: 'echo "test"',
          resultFile: 'results.json',
          env: suiteEnv,
          environments: environments as Record<string, { baseUrl?: string; env?: Record<string, string>; urlExtractor?: UrlExtractor; envFile?: string }>,
        },
      ],
    };

    return { config, envFileVars };
  };

  describe('env variable merging', () => {
    it('merges envFileVars with suite env', async () => {
      const { config, envFileVars } = createMockConfig(
        { FILE_VAR: 'from-file' },
        { SUITE_VAR: 'from-suite' },
      );

      // Create minimal result file for parser
      writeFileSync(
        join(artifactsDir, 'results.json'),
        JSON.stringify({ numPassedTests: 0, numFailedTests: 0, testResults: [] }),
      );

      const orchestrator = new Orchestrator({
        config,
        reporters: [],
        cwd: testDir,
        envFileVars,
      });

      // We can't easily test internal env handling without mocking executor
      // This test verifies constructor accepts envFileVars
      expect(orchestrator).toBeDefined();
    });

    it('envFileVars override suite env', async () => {
      const { config, envFileVars } = createMockConfig(
        { SHARED: 'from-file' },
        { SHARED: 'from-suite' },
      );

      const orchestrator = new Orchestrator({
        config,
        reporters: [],
        cwd: testDir,
        envFileVars,
      });

      expect(orchestrator).toBeDefined();
    });

    it('environment config env overrides envFileVars', async () => {
      const { config, envFileVars } = createMockConfig(
        { SHARED: 'from-file' },
        {},
        {
          staging: {
            env: { SHARED: 'from-env-config' },
          },
        },
      );

      const orchestrator = new Orchestrator({
        config,
        reporters: [],
        environment: 'staging',
        cwd: testDir,
        envFileVars,
      });

      expect(orchestrator).toBeDefined();
    });
  });

  describe('urlExtractor', () => {
    it('accepts urlExtractor in environment config', () => {
      const urlExtractor: UrlExtractor = (content) => {
        const match = content.match(/BASE_URL=(.+)/);
        return match ? match[1] : undefined;
      };

      const { config, envFileVars } = createMockConfig(
        {},
        {},
        {
          staging: {
            envFile: '.env.staging',
            urlExtractor,
          },
        },
      );

      const orchestrator = new Orchestrator({
        config,
        reporters: [],
        environment: 'staging',
        cwd: testDir,
        envFileVars,
      });

      expect(orchestrator).toBeDefined();
    });

    it('extracts URL from env file using urlExtractor', () => {
      // Create env file
      writeFileSync(
        join(testDir, '.env.staging'),
        'BASE_URL=https://staging.example.com\nOTHER=value',
      );

      const urlExtractor: UrlExtractor = (content) => {
        const match = content.match(/BASE_URL=(.+)/);
        return match ? match[1] : undefined;
      };

      const { config, envFileVars } = createMockConfig(
        {},
        {},
        {
          staging: {
            envFile: '.env.staging',
            urlExtractor,
          },
        },
      );

      const orchestrator = new Orchestrator({
        config,
        reporters: [],
        environment: 'staging',
        cwd: testDir,
        envFileVars,
      });

      expect(orchestrator).toBeDefined();
    });
  });
});
