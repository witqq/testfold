#!/usr/bin/env node

/**
 * Integration test runner
 */

import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const jestArgs = ['--config', 'jest.config.js', '--testPathPattern', 'tests/integration', ...args];

const proc = spawn('npx', ['jest', ...jestArgs], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, FORCE_COLOR: '1' },
});

proc.on('close', (code) => {
  process.exit(code ?? 1);
});
