/**
 * Command Executor - runs test commands
 */

import { spawn } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Suite } from '../config/types.js';
import { resolvePathPrefix } from '../utils/path-resolver.js';

export interface ExecuteOptions {
  cwd: string;
  env?: Record<string, string>;
  timeout?: number;
  logFile: string;
  /** Pass-through arguments appended to command */
  passThrough?: string[];
  /** Base directory for resolving path prefixes (defaults to cwd) */
  testsDir?: string;
}

export interface ExecuteResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
}

const MAX_BUFFER = 50 * 1024 * 1024; // 50MB

/**
 * Resolve path prefixes in pass-through arguments
 * Arguments that look like test file prefixes are resolved to full paths
 */
function resolvePassThroughPaths(
  args: string[],
  testsDir: string,
): string[] {
  return args.map((arg) => {
    // Skip flags (starts with -)
    if (arg.startsWith('-')) {
      return arg;
    }

    // Skip if already looks like a full path (contains / or \)
    if (arg.includes('/') || arg.includes('\\')) {
      return arg;
    }

    // Skip if it's clearly not a file prefix (no letters, just numbers, etc.)
    if (!/[a-zA-Z]/.test(arg)) {
      return arg;
    }

    // Try to resolve as a path prefix
    const matches = resolvePathPrefix(arg, { baseDir: testsDir });

    // If exactly one match, use it; otherwise keep original
    if (matches.length === 1 && matches[0]) {
      return matches[0];
    }

    return arg;
  });
}

export async function executeCommand(
  suite: Suite,
  options: ExecuteOptions,
): Promise<ExecuteResult> {
  const startTime = Date.now();

  return new Promise((resolve) => {
    // Build command with pass-through arguments
    const commandParts = suite.command.split(' ');
    const passThrough = options.passThrough ?? [];

    // Resolve path prefixes in pass-through arguments
    const testsDir = options.testsDir ?? options.cwd;
    const resolvedPassThrough = resolvePassThroughPaths(passThrough, testsDir);

    const fullCommand = [...commandParts, ...resolvedPassThrough];

    const [cmd, ...args] = fullCommand;
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
      const actualCommand = fullCommand.join(' ');
      const logContent = [
        `Command: ${actualCommand}`,
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
