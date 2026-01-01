/**
 * Tests for per-suite artifact cleanup
 */

import { join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { cleanSuiteArtifacts, type SuiteArtifacts } from '../../../src/utils/files.js';

describe('cleanSuiteArtifacts', () => {
  const testDir = join(process.cwd(), 'test-cleanup-artifacts');

  beforeAll(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    // Reset test directory
    rmSync(testDir, { recursive: true, force: true });
    mkdirSync(testDir, { recursive: true });
  });

  it('deletes only specified suite artifacts', async () => {
    // Setup: create artifacts for two suites
    writeFileSync(join(testDir, 'unit.json'), '{"tests":[]}');
    writeFileSync(join(testDir, 'unit.log'), 'unit logs');
    writeFileSync(join(testDir, 'integration.json'), '{"tests":[]}');
    writeFileSync(join(testDir, 'integration.log'), 'integration logs');

    // Clean only unit suite
    const suites: SuiteArtifacts[] = [
      { name: 'Unit', resultFile: 'unit.json', logFile: 'unit.log' },
    ];

    await cleanSuiteArtifacts(testDir, suites);

    // Unit artifacts should be deleted
    expect(existsSync(join(testDir, 'unit.json'))).toBe(false);
    expect(existsSync(join(testDir, 'unit.log'))).toBe(false);

    // Integration artifacts should be preserved
    expect(existsSync(join(testDir, 'integration.json'))).toBe(true);
    expect(existsSync(join(testDir, 'integration.log'))).toBe(true);
  });

  it('deletes failures directory for specified suites', async () => {
    // Setup: create failure directories
    const unitFailuresDir = join(testDir, 'failures', 'unit');
    const integrationFailuresDir = join(testDir, 'failures', 'integration');
    mkdirSync(unitFailuresDir, { recursive: true });
    mkdirSync(integrationFailuresDir, { recursive: true });
    writeFileSync(join(unitFailuresDir, 'test-1.md'), '# Failure');
    writeFileSync(join(integrationFailuresDir, 'test-2.md'), '# Failure');

    // Clean only unit suite
    const suites: SuiteArtifacts[] = [
      { name: 'Unit', resultFile: 'unit.json', logFile: 'unit.log' },
    ];

    await cleanSuiteArtifacts(testDir, suites);

    // Unit failures should be deleted
    expect(existsSync(unitFailuresDir)).toBe(false);

    // Integration failures should be preserved
    expect(existsSync(integrationFailuresDir)).toBe(true);
    expect(existsSync(join(integrationFailuresDir, 'test-2.md'))).toBe(true);
  });

  it('handles non-existent files gracefully', async () => {
    // No files exist yet
    const suites: SuiteArtifacts[] = [
      { name: 'Unit', resultFile: 'unit.json', logFile: 'unit.log' },
    ];

    // Should not throw
    await expect(cleanSuiteArtifacts(testDir, suites)).resolves.not.toThrow();
  });

  it('creates artifacts directory if not exists', async () => {
    rmSync(testDir, { recursive: true, force: true });

    const suites: SuiteArtifacts[] = [
      { name: 'Unit', resultFile: 'unit.json', logFile: 'unit.log' },
    ];

    await cleanSuiteArtifacts(testDir, suites);

    expect(existsSync(testDir)).toBe(true);
  });

  it('sanitizes suite name for failures directory (spaces to hyphens)', async () => {
    // Suite name with spaces - uses same sanitization as markdown.ts
    // markdown.ts:35: suite.name.toLowerCase().replace(/\s+/g, '-')
    const failuresDir = join(testDir, 'failures', 'e2e-tests');
    mkdirSync(failuresDir, { recursive: true });
    writeFileSync(join(failuresDir, 'test.md'), '# Failure');

    const suites: SuiteArtifacts[] = [
      { name: 'E2E Tests', resultFile: 'e2e.json', logFile: 'e2e.log' },
    ];

    await cleanSuiteArtifacts(testDir, suites);

    // Failures directory should be deleted (sanitized: "e2e-tests")
    expect(existsSync(failuresDir)).toBe(false);
  });

  it('preserves underscores in suite name (matching markdown.ts behavior)', async () => {
    // markdown.ts only replaces spaces, keeps underscores
    const failuresDir = join(testDir, 'failures', 'e2e_tests');
    mkdirSync(failuresDir, { recursive: true });
    writeFileSync(join(failuresDir, 'test.md'), '# Failure');

    const suites: SuiteArtifacts[] = [
      { name: 'E2E_Tests', resultFile: 'e2e.json', logFile: 'e2e.log' },
    ];

    await cleanSuiteArtifacts(testDir, suites);

    // Failures directory should be deleted (sanitized: "e2e_tests" - underscore preserved)
    expect(existsSync(failuresDir)).toBe(false);
  });

  it('cleans multiple suites at once', async () => {
    // Setup artifacts for three suites
    writeFileSync(join(testDir, 'unit.json'), '{}');
    writeFileSync(join(testDir, 'unit.log'), 'logs');
    writeFileSync(join(testDir, 'integration.json'), '{}');
    writeFileSync(join(testDir, 'integration.log'), 'logs');
    writeFileSync(join(testDir, 'e2e.json'), '{}');
    writeFileSync(join(testDir, 'e2e.log'), 'logs');

    // Clean unit and integration, preserve e2e
    const suites: SuiteArtifacts[] = [
      { name: 'Unit', resultFile: 'unit.json', logFile: 'unit.log' },
      { name: 'Integration', resultFile: 'integration.json', logFile: 'integration.log' },
    ];

    await cleanSuiteArtifacts(testDir, suites);

    // Unit and integration should be deleted
    expect(existsSync(join(testDir, 'unit.json'))).toBe(false);
    expect(existsSync(join(testDir, 'integration.json'))).toBe(false);

    // E2E should be preserved
    expect(existsSync(join(testDir, 'e2e.json'))).toBe(true);
    expect(existsSync(join(testDir, 'e2e.log'))).toBe(true);
  });
});
