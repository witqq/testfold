/**
 * Command Executor - runs test commands
 */

import { spawn } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Suite } from '../config/types.js';

export interface ExecuteOptions {
  cwd: string;
  env?: Record<string, string>;
  timeout?: number;
  logFile: string;
}

export interface ExecuteResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
}

const MAX_BUFFER = 50 * 1024 * 1024; // 50MB

export async function executeCommand(
  suite: Suite,
  options: ExecuteOptions,
): Promise<ExecuteResult> {
  const startTime = Date.now();

  return new Promise((resolve) => {
    const [cmd, ...args] = suite.command.split(' ');
    if (!cmd) {
      resolve({
        exitCode: 1,
        stdout: '',
        stderr: 'Empty command',
        duration: 0,
      });
      return;
    }

    const proc = spawn(cmd, args, {
      cwd: options.cwd,
      shell: true,
      env: {
        ...process.env,
        ...options.env,
        FORCE_COLOR: '1',
      },
    });

    let stdout = '';
    let stderr = '';
    let killed = false;

    // Timeout handler
    const timeoutId = options.timeout
      ? setTimeout(() => {
          killed = true;
          proc.kill('SIGTERM');
        }, options.timeout)
      : null;

    proc.stdout?.on('data', (data: Buffer) => {
      const chunk = data.toString();
      stdout += chunk;

      // Prevent unbounded memory growth
      if (stdout.length > MAX_BUFFER) {
        stdout = stdout.slice(-MAX_BUFFER);
      }
    });

    proc.stderr?.on('data', (data: Buffer) => {
      const chunk = data.toString();
      stderr += chunk;

      if (stderr.length > MAX_BUFFER) {
        stderr = stderr.slice(-MAX_BUFFER);
      }
    });

    proc.on('close', async (code) => {
      if (timeoutId) clearTimeout(timeoutId);

      const duration = Date.now() - startTime;

      // Write log file
      await mkdir(dirname(options.logFile), { recursive: true });
      const logContent = [
        `Command: ${suite.command}`,
        `Exit Code: ${code}`,
        `Duration: ${duration}ms`,
        killed ? 'Status: KILLED (timeout)' : '',
        '',
        '=== STDOUT ===',
        stdout,
        '',
        '=== STDERR ===',
        stderr,
      ]
        .filter(Boolean)
        .join('\n');

      await writeFile(options.logFile, logContent);

      resolve({
        exitCode: killed ? 124 : (code ?? 1),
        stdout,
        stderr,
        duration,
      });
    });

    proc.on('error', async (error) => {
      if (timeoutId) clearTimeout(timeoutId);

      const duration = Date.now() - startTime;

      await mkdir(dirname(options.logFile), { recursive: true });
      await writeFile(
        options.logFile,
        `Error: ${error.message}\n\n${stdout}\n${stderr}`,
      );

      resolve({
        exitCode: 1,
        stdout,
        stderr: error.message,
        duration,
      });
    });
  });
}
