import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, rm, readFile } from 'node:fs/promises';
import { executeCommand } from '../../../src/core/executor.js';
import type { Suite } from '../../../src/config/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('executeCommand', () => {
  const tempDir = resolve(__dirname, '../../fixtures/temp-executor');

  beforeAll(async () => {
    await mkdir(tempDir, { recursive: true });
  });

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('pass-through arguments', () => {
    it('should append pass-through arguments to command', async () => {
      const suite: Suite = {
        name: 'test-suite',
        type: 'jest',
        command: 'echo base',
        resultFile: 'result.json',
      };

      const logFile = resolve(tempDir, 'passthrough.log');
      const result = await executeCommand(suite, {
        cwd: __dirname,
        logFile,
        passThrough: ['--verbose', '--coverage'],
      });

      expect(result.exitCode).toBe(0);
      // Echo outputs: base --verbose --coverage
      expect(result.stdout.trim()).toBe('base --verbose --coverage');
    });

    it('should work without pass-through arguments', async () => {
      const suite: Suite = {
        name: 'test-suite',
        type: 'jest',
        command: 'echo hello',
        resultFile: 'result.json',
      };

      const logFile = resolve(tempDir, 'no-passthrough.log');
      const result = await executeCommand(suite, {
        cwd: __dirname,
        logFile,
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('hello');
    });

    it('should log full command with pass-through in log file', async () => {
      const suite: Suite = {
        name: 'test-suite',
        type: 'jest',
        command: 'echo test',
        resultFile: 'result.json',
      };

      const logFile = resolve(tempDir, 'full-command.log');
      await executeCommand(suite, {
        cwd: __dirname,
        logFile,
        passThrough: ['--arg1', '--arg2'],
      });

      const logContent = await readFile(logFile, 'utf-8');
      expect(logContent).toContain('Command: echo test --arg1 --arg2');
    });

    it('should handle empty pass-through array', async () => {
      const suite: Suite = {
        name: 'test-suite',
        type: 'jest',
        command: 'echo empty',
        resultFile: 'result.json',
      };

      const logFile = resolve(tempDir, 'empty-passthrough.log');
      const result = await executeCommand(suite, {
        cwd: __dirname,
        logFile,
        passThrough: [],
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('empty');
    });
  });
});
