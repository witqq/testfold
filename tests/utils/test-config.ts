/**
 * Test configuration utilities
 * NO hardcoded values - all from environment
 */

export function getTestArtifactsDir(): string {
  return process.env.TEST_ARTIFACTS_DIR || './test-results/artifacts';
}

export function getTestTimeout(): number {
  return parseInt(process.env.TEST_TIMEOUT || '30000', 10);
}

export function getFixturesDir(): string {
  return process.env.TEST_FIXTURES_DIR || './tests/fixtures';
}
