#!/usr/bin/env node

/**
 * Integration test runner
 */

import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const jestArgs = ['--config', 'jest.config.js', '--testPathPatterns', 'tests/integration', ...args];
const childEnv = { ...process.env, FORCE_COLOR: '1' };
delete childEnv.NO_COLOR;

const proc = spawn(
  'node',
  ['--experimental-vm-modules', 'node_modules/jest/bin/jest.js', ...jestArgs],
  {
    stdio: 'inherit',
    env: childEnv,
  },
);

proc.on('close', (code) => {
  process.exit(code ?? 1);
});
