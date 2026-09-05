#!/usr/bin/env node

/**
 * Unit test runner
 */

import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const hasExplicitTestFile = args.some(
  (arg) => arg.startsWith('tests/') || /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(arg),
);
const testSelection = hasExplicitTestFile ? [] : ['--testPathPatterns', 'tests/unit'];
const jestArgs = ['--config', 'jest.config.js', ...testSelection, ...args];
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
