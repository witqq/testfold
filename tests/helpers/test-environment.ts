/**
 * Test environment setup and cleanup utilities
 */

import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const TEST_TEMP_DIR = './test-results/temp';

export interface TestEnvironment {
  tempDir: string;
  cleanup: () => void;
}

/**
 * Setup isolated test environment
 */
export function setupTestEnvironment(testName: string): TestEnvironment {
  const tempDir = join(TEST_TEMP_DIR, testName, Date.now().toString());

  mkdirSync(tempDir, { recursive: true });

  return {
    tempDir,
    cleanup: () => {
      if (existsSync(tempDir)) {
        rmSync(tempDir, { recursive: true, force: true });
      }
    },
  };
}

/**
 * Cleanup all test temp directories
 */
export function cleanupTestEnvironment(): void {
  if (existsSync(TEST_TEMP_DIR)) {
    rmSync(TEST_TEMP_DIR, { recursive: true, force: true });
  }
}

/**
 * Performance monitoring for tests
 */
export class TestPerformanceMonitor {
  private startTime: number = 0;
  private startMemory: number = 0;

  start(): void {
    this.startTime = Date.now();
    this.startMemory = process.memoryUsage().heapUsed;
  }

  stop(): { duration: number; memoryDelta: number } {
    const duration = Date.now() - this.startTime;
    const memoryDelta = process.memoryUsage().heapUsed - this.startMemory;
    return { duration, memoryDelta };
  }
}
