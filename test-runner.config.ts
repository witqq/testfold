/**
 * Self-testing configuration for testfold
 * The module tests itself using its own TestRunner
 */

import type { Config } from './src/config/types.js';

const config: Config = {
  artifactsDir: './test-results',
  parallel: false,
  failFast: false,
  reporters: ['console', 'json', 'markdown-failures'],
  suites: [
    {
      name: 'Unit',
      type: 'jest',
      command:
        'node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.js --testPathPattern tests/unit --json --outputFile test-results/unit.json',
      resultFile: 'unit.json',
      timeout: 120000,
    },
  ],
};

export default config;
