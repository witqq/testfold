/**
 * Integration tests for per-suite artifact cleanup
 *
 * Tests the full workflow: TestRunner preserves artifacts from other suites
 */

import { join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { TestRunner } from '../../src/core/runner.js';
import type { Config } from '../../src/config/types.js';

describe('Artifact Cleanup Integration', () => {
  const testDir = join(process.cwd(), 'test-integration-cleanup');
  const artifactsDir = join(testDir, 'test-results');

  beforeAll(() => {
    mkdirSync(artifactsDir, { recursive: true });
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    // Reset artifacts directory
    rmSync(artifactsDir, { recursive: true, force: true });
    mkdirSync(artifactsDir, { recursive: true });
  });

  it('preserves artifacts from other suites when running specific suite', async () => {
    // Setup: Create pre-existing artifacts for "integration" suite
    const integrationJson = join(artifactsDir, 'integration.json');
    const integrationLog = join(artifactsDir, 'integration.log');
    const integrationFailures = join(artifactsDir, 'failures', 'integration');

    mkdirSync(integrationFailures, { recursive: true });
    writeFileSync(integrationJson, '{"numPassedTests": 5}');
    writeFileSync(integrationLog, 'Previous integration run logs');
    writeFileSync(join(integrationFailures, 'test-1.md'), '# Previous failure');

    // Config with two suites
    const config: Config = {
      artifactsDir: './test-results',
      suites: [
        {
          name: 'Unit',
          type: 'jest',
          command: 'echo "unit tests" && echo \'{"numPassedTests":1,"numFailedTests":0,"testResults":[]}\'',
          resultFile: 'unit.json',
        },
        {
          name: 'Integration',
          type: 'jest',
          command: 'echo "integration"',
          resultFile: 'integration.json',
        },
      ],
    };

    const runner = new TestRunner(config, testDir);

    // Run ONLY the "Unit" suite
    try {
      await runner.run(['Unit']);
    } catch {
      // Expected - echo command won't produce valid JSON
    }

    // Integration artifacts should be PRESERVED
    expect(existsSync(integrationJson)).toBe(true);
    expect(existsSync(integrationLog)).toBe(true);
    expect(existsSync(integrationFailures)).toBe(true);
    expect(readFileSync(integrationJson, 'utf-8')).toBe('{"numPassedTests": 5}');
  });

  it('cleans only the specified suite artifacts', async () => {
    // Setup: Create pre-existing artifacts for both suites
    writeFileSync(join(artifactsDir, 'unit.json'), '{"old": true}');
    writeFileSync(join(artifactsDir, 'unit.log'), 'Old unit logs');
    writeFileSync(join(artifactsDir, 'integration.json'), '{"old": true}');
    writeFileSync(join(artifactsDir, 'integration.log'), 'Old integration logs');

    const config: Config = {
      artifactsDir: './test-results',
      suites: [
        {
          name: 'Unit',
          type: 'jest',
          command: 'echo \'{"numPassedTests":1,"numFailedTests":0,"testResults":[]}\'',
          resultFile: 'unit.json',
        },
        {
          name: 'Integration',
          type: 'jest',
          command: 'echo "integration"',
          resultFile: 'integration.json',
        },
      ],
    };

    const runner = new TestRunner(config, testDir);

    // Run ONLY "Unit" suite
    try {
      await runner.run(['Unit']);
    } catch {
      // May fail due to command issues
    }

    // Integration artifacts should still have OLD content
    expect(readFileSync(join(artifactsDir, 'integration.json'), 'utf-8')).toBe('{"old": true}');
    expect(readFileSync(join(artifactsDir, 'integration.log'), 'utf-8')).toBe('Old integration logs');
  });
});
