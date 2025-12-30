#!/usr/bin/env node

/**
 * Unified test runner script
 * Runs unit and integration tests with unified reporting
 */

import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ARTIFACTS_DIR = './test-results';

// Ensure artifacts directory exists
if (!existsSync(ARTIFACTS_DIR)) {
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
}

const suites = [
  { name: 'unit', script: 'test:unit' },
  { name: 'integration', script: 'test:integration' },
];

async function runSuite(suite) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    let stdout = '';
    let stderr = '';

    const proc = spawn('npm', ['run', suite.script], {
      shell: true,
      env: { ...process.env, FORCE_COLOR: '1' },
    });

    proc.stdout?.on('data', (data) => {
      const chunk = data.toString();
      stdout += chunk;
      process.stdout.write(chunk);
    });

    proc.stderr?.on('data', (data) => {
      const chunk = data.toString();
      stderr += chunk;
      process.stderr.write(chunk);
    });

    proc.on('close', (code) => {
      const duration = Date.now() - startTime;

      // Write log file
      const logPath = join(ARTIFACTS_DIR, `${suite.name}.log`);
      writeFileSync(logPath, `${stdout}\n${stderr}`);

      resolve({
        name: suite.name,
        exitCode: code ?? 1,
        duration,
        success: code === 0,
      });
    });
  });
}

async function main() {
  console.log('Running all test suites...\n');

  const results = [];

  for (const suite of suites) {
    console.log(`\n=== ${suite.name.toUpperCase()} ===\n`);
    const result = await runSuite(suite);
    results.push(result);
  }

  // Write summary
  const summary = {
    timestamp: new Date().toISOString(),
    suites: results,
    success: results.every((r) => r.success),
    totalDuration: results.reduce((sum, r) => sum + r.duration, 0),
  };

  writeFileSync(
    join(ARTIFACTS_DIR, 'summary.json'),
    JSON.stringify(summary, null, 2)
  );

  // Print summary
  console.log('\n=== SUMMARY ===\n');
  for (const result of results) {
    const status = result.success ? '✓' : '✗';
    console.log(`${status} ${result.name}: ${result.duration}ms`);
  }

  const exitCode = summary.success ? 0 : 1;
  console.log(`\nTotal: ${summary.totalDuration}ms`);
  console.log(`Status: ${summary.success ? 'PASSED' : 'FAILED'}`);

  process.exit(exitCode);
}

main().catch((error) => {
  console.error('Test runner failed:', error);
  process.exit(1);
});
