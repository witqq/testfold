#!/usr/bin/env node

/**
 * Self-testing script
 * Uses the module's own TestRunner to run its tests
 */

import { TestRunner } from '../../dist/core/runner.js';

async function main() {
  try {
    const runner = await TestRunner.fromConfigFile();
    const results = await runner.run();
    process.exit(results.success ? 0 : 1);
  } catch (error) {
    console.error('Test runner failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
