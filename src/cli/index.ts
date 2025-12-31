#!/usr/bin/env node

/**
 * CLI entry point for testfold
 */

import { parseArgs } from './args.js';
import { TestRunner } from '../core/runner.js';
import { loadConfig } from '../config/loader.js';

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (args.version) {
    console.log('testfold v0.1.0');
    process.exit(0);
  }

  try {
    // Load config
    const config = await loadConfig(args.config);

    // Create runner
    const runner = new TestRunner(config);

    // Run tests
    const results = await runner.run(args.suites, {
      env: args.env,
    });

    // Exit with appropriate code
    process.exit(results.success ? 0 : 1);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

function printHelp(): void {
  console.log(`
testfold - Unified test runner for Jest and Playwright

Usage:
  testfold [suites...] [options]

Options:
  --config, -c <path>   Config file path (default: test-runner.config.ts)
  --env, -e <name>      Environment name (local, staging, prod)
  --no-parallel         Run suites sequentially
  --fail-fast           Stop on first failure
  --help, -h            Show this help
  --version, -v         Show version

Examples:
  testfold                        Run all suites
  testfold unit integration       Run specific suites
  testfold --env staging          Run with staging environment
  testfold -c custom.config.ts    Use custom config
`);
}

main();
