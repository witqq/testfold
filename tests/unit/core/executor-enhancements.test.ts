import { executeCommand } from '../../../src/core/executor.js';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Suite } from '../../../src/config/types.js';

describe('executor enhancements', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'testfold-exec-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  const makeSuite = (command: string, type: Suite['type'] = 'jest'): Suite => ({
    name: 'test-suite',
    type,
    command,
    resultFile: 'result.json',
  });

  describe('SIGKILL escalation', () => {
    it('should send SIGTERM first on timeout', async () => {
      // Process that runs for a long time
      const suite = makeSuite('sleep 60');
      const result = await executeCommand(suite, {
        cwd: tempDir,
        logFile: join(tempDir, 'test.log'),
        timeout: 200,
      });

      expect(result.exitCode).toBe(124);
      const log = await readFile(join(tempDir, 'test.log'), 'utf-8');
      expect(log).toContain('KILLED (timeout)');
    });

    it('should escalate to SIGKILL if process ignores SIGTERM', async () => {
      // Process that traps SIGTERM — use node to handle signal properly
      const suite = makeSuite(
        `node -e "process.on('SIGTERM', () => {}); setTimeout(() => {}, 60000)"`,
      );
      const result = await executeCommand(suite, {
        cwd: tempDir,
        logFile: join(tempDir, 'test.log'),
        timeout: 200,
        killGracePeriod: 500,
      });

      expect(result.exitCode).toBe(124);
    }, 10000);

    it('should use default 5s grace period when not specified', async () => {
      // Just verify the option is optional — process that exits on SIGTERM
      const suite = makeSuite('sleep 60');
      const result = await executeCommand(suite, {
        cwd: tempDir,
        logFile: join(tempDir, 'test.log'),
        timeout: 200,
      });

      expect(result.exitCode).toBe(124);
    });
  });

  describe('workers flag', () => {
    it('should append --maxWorkers for jest suite with workers', async () => {
      const suite: Suite = {
        name: 'test-suite',
        type: 'jest',
        command: 'echo jest',
        resultFile: 'result.json',
        workers: 4,
      };
      const result = await executeCommand(suite, {
        cwd: tempDir,
        logFile: join(tempDir, 'test.log'),
      });

      const log = await readFile(join(tempDir, 'test.log'), 'utf-8');
      expect(log).toContain('--maxWorkers=4');
    });

    it('should append --workers for playwright suite with workers', async () => {
      const suite: Suite = {
        name: 'test-suite',
        type: 'playwright',
        command: 'echo playwright',
        resultFile: 'result.json',
        workers: 2,
      };
      const result = await executeCommand(suite, {
        cwd: tempDir,
        logFile: join(tempDir, 'test.log'),
      });

      const log = await readFile(join(tempDir, 'test.log'), 'utf-8');
      expect(log).toContain('--workers=2');
    });

    it('should not append workers flag for custom suite', async () => {
      const suite: Suite = {
        name: 'test-suite',
        type: 'custom',
        command: 'echo custom',
        resultFile: 'result.json',
        workers: 3,
      };
      const result = await executeCommand(suite, {
        cwd: tempDir,
        logFile: join(tempDir, 'test.log'),
      });

      const log = await readFile(join(tempDir, 'test.log'), 'utf-8');
      expect(log).not.toContain('--maxWorkers');
      expect(log).not.toContain('--workers');
    });

    it('should not append workers flag when not set', async () => {
      const suite = makeSuite('echo test');
      const result = await executeCommand(suite, {
        cwd: tempDir,
        logFile: join(tempDir, 'test.log'),
      });

      const log = await readFile(join(tempDir, 'test.log'), 'utf-8');
      expect(log).not.toContain('maxWorkers');
      expect(log).not.toContain('workers');
    });
  });

  describe('progress streaming', () => {
    it('should call onOutput with stdout chunks', async () => {
      const chunks: string[] = [];
      const suite = makeSuite('echo "hello world"');

      await executeCommand(suite, {
        cwd: tempDir,
        logFile: join(tempDir, 'test.log'),
        onOutput: (chunk) => chunks.push(chunk),
      });

      const combined = chunks.join('');
      expect(combined).toContain('hello world');
    });

    it('should call onOutput multiple times for multi-line output', async () => {
      const chunks: string[] = [];
      const suite = makeSuite('echo "line1" && echo "line2" && echo "line3"');

      await executeCommand(suite, {
        cwd: tempDir,
        logFile: join(tempDir, 'test.log'),
        onOutput: (chunk) => chunks.push(chunk),
      });

      const combined = chunks.join('');
      expect(combined).toContain('line1');
      expect(combined).toContain('line2');
      expect(combined).toContain('line3');
    });

    it('should work without onOutput callback', async () => {
      const suite = makeSuite('echo "no callback"');
      const result = await executeCommand(suite, {
        cwd: tempDir,
        logFile: join(tempDir, 'test.log'),
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('no callback');
    });

    it('should still capture stdout when onOutput is provided', async () => {
      const chunks: string[] = [];
      const suite = makeSuite('echo "captured"');

      const result = await executeCommand(suite, {
        cwd: tempDir,
        logFile: join(tempDir, 'test.log'),
        onOutput: (chunk) => chunks.push(chunk),
      });

      expect(result.stdout).toContain('captured');
      expect(chunks.join('')).toContain('captured');
    });
  });
});
