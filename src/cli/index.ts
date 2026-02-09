#!/usr/bin/env node

/**
 * CLI entry point for testfold
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from './args.js';
import { TestRunner } from '../core/runner.js';
import { loadConfig } from '../config/loader.js';
import { buildFilterArgs, buildWorkersArg } from '../core/executor.js';

function getVersion(): string {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const pkgPath = join(__dirname, '..', '..', 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  return pkg.version;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (args.version) {
    console.log(`testfold v${getVersion()}`);
    process.exit(0);
  }

  try {
    // Load config
    const config = await loadConfig(args.config);

    // Dry-run mode: print planned commands without executing
    if (args.dryRun) {
      printDryRun(config, args);
      process.exit(0);
    }

    // Create runner
    const runner = new TestRunner(config);

    // Run tests
    const results = await runner.run(args.suites, {
      env: args.env,
      reporter: args.reporter.length > 0 ? args.reporter : undefined,
      passThrough: args.passThrough,
      grep: args.grep,
      grepInvert: args.grepInvert,
      file: args.file,
    });

    // Exit with semantic exit code
    process.exit(results.exitCode);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(2); // Infrastructure error
  }
}

function printDryRun(
  config: Awaited<ReturnType<typeof loadConfig>>,
  args: ReturnType<typeof parseArgs>,
): void {
  // Filter suites if specific ones requested
  const suitesToRun = args.suites.length > 0
    ? config.suites.filter(
        (s) =>
          args.suites.includes(s.name) ||
          args.suites.includes(s.name.toLowerCase()),
      )
    : config.suites;

  if (suitesToRun.length === 0) {
    console.log('No matching suites found.');
    return;
  }

  console.log(`\nDry Run: ${suitesToRun.length} suite(s) would execute\n`);

  for (const suite of suitesToRun) {
    const filterArgs = buildFilterArgs(suite.type, {
      grep: args.grep,
      grepInvert: args.grepInvert,
      file: args.file,
    });

    const workersArg = suite.workers
      ? buildWorkersArg(suite.type, suite.workers)
      : null;

    const fullCommand = [
      suite.command,
      ...filterArgs,
      ...(workersArg ? [workersArg] : []),
      ...args.passThrough,
    ].join(' ');

    console.log(`  ${suite.name} (${suite.type}):`);
    console.log(`    $ ${fullCommand}`);

    if (suite.env && Object.keys(suite.env).length > 0) {
      console.log(`    env: ${Object.keys(suite.env).join(', ')}`);
    }

    if (suite.timeout) {
      console.log(`    timeout: ${suite.timeout}ms`);
    }

    console.log();
  }

  console.log(`Parallel: ${config.parallel !== false}`);
  console.log(`Artifacts: ${config.artifactsDir}`);
}

function printHelp(): void {
  console.log(`
testfold - Unified test runner for Jest and Playwright

Usage:
  testfold [suites...] [options] [-- pass-through-args]

Options:
  --config, -c <path>     Config file path (default: test-runner.config.ts)
  --env, -e <name>        Environment name (local, staging, prod)
  --reporter, -r <name>   Override config reporters (comma-separated or repeated)
                          Built-in: console, json, markdown-failures, timing,
                          timing-text, text, summary-log
                          Custom: path to reporter module (e.g., ./my-reporter.ts)
  --grep, -g <pattern>    Filter tests by name pattern
  --grep-invert <pattern> Exclude tests matching pattern
  --file, -f <path>       Filter by test file
  --dry-run               Print planned commands without executing
  --no-parallel           Run suites sequentially
  --fail-fast             Stop on first failure
  --help, -h              Show this help
  --version, -v           Show version

Exit Codes:
  0   All tests passed
  1   One or more tests failed
  2   Infrastructure error (config, parse, spawn failure)
  3   Suite killed by timeout

Pass-through Arguments:
  Arguments after -- are passed directly to test frameworks.

Examples:
  testfold                              Run all suites
  testfold unit integration             Run specific suites
  testfold --env staging                Run with staging environment
  testfold -c custom.config.ts          Use custom config
  testfold -r json                      Use only JSON reporter
  testfold -r console,json,timing-text  Multiple reporters
  testfold -r ./my-reporter.ts          Custom reporter from file
  testfold --dry-run                    Preview commands without running
  testfold -- --testNamePattern="auth"  Pass args to test framework
`);
}

main();
