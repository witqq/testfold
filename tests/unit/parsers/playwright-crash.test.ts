import { resolve } from 'node:path';
import { writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { PlaywrightParser } from '../../../src/parsers/playwright.js';

describe('PlaywrightParser crash detection', () => {
  const parser = new PlaywrightParser();
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(resolve(tmpdir(), 'pw-crash-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('should detect Error: in log when JSON is missing', async () => {
    const logPath = resolve(tempDir, 'test.log');
    await writeFile(logPath, 'Starting tests...\nError: Cannot find module "missing"\nStack trace here');
    const jsonPath = resolve(tempDir, 'nonexistent.json');

    const result = await parser.parse(jsonPath, logPath);

    expect(result.success).toBe(false);
    expect(result.failed).toBe(1);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]!.testName).toBe('Framework Crash');
    expect(result.failures[0]!.error).toContain('Error: Cannot find module');
  });

  it('should detect ReferenceError', async () => {
    const logPath = resolve(tempDir, 'test.log');
    await writeFile(logPath, 'ReferenceError: foo is not defined\n    at Object.<anonymous>');
    const jsonPath = resolve(tempDir, 'nonexistent.json');

    const result = await parser.parse(jsonPath, logPath);

    expect(result.success).toBe(false);
    expect(result.failures[0]!.error).toContain('ReferenceError');
  });

  it('should detect SyntaxError', async () => {
    const logPath = resolve(tempDir, 'test.log');
    await writeFile(logPath, 'SyntaxError: Unexpected token }');
    const jsonPath = resolve(tempDir, 'nonexistent.json');

    const result = await parser.parse(jsonPath, logPath);

    expect(result.success).toBe(false);
  });

  it('should detect TypeError', async () => {
    const logPath = resolve(tempDir, 'test.log');
    await writeFile(logPath, 'TypeError: Cannot read properties of undefined');
    const jsonPath = resolve(tempDir, 'nonexistent.json');

    const result = await parser.parse(jsonPath, logPath);

    expect(result.success).toBe(false);
  });

  it('should detect ECONNREFUSED', async () => {
    const logPath = resolve(tempDir, 'test.log');
    await writeFile(logPath, 'connect ECONNREFUSED 127.0.0.1:3000');
    const jsonPath = resolve(tempDir, 'nonexistent.json');

    const result = await parser.parse(jsonPath, logPath);

    expect(result.success).toBe(false);
  });

  it('should detect Timed out', async () => {
    const logPath = resolve(tempDir, 'test.log');
    await writeFile(logPath, 'Timed out waiting for server to start');
    const jsonPath = resolve(tempDir, 'nonexistent.json');

    const result = await parser.parse(jsonPath, logPath);

    expect(result.success).toBe(false);
  });

  it('should detect globalSetup failure', async () => {
    const logPath = resolve(tempDir, 'test.log');
    await writeFile(logPath, 'Error in globalSetup: Database not available');
    const jsonPath = resolve(tempDir, 'nonexistent.json');

    const result = await parser.parse(jsonPath, logPath);

    expect(result.success).toBe(false);
    expect(result.failures[0]!.error).toContain('globalSetup');
  });

  it('should detect "Cannot find module"', async () => {
    const logPath = resolve(tempDir, 'test.log');
    await writeFile(logPath, 'Cannot find module \'@playwright/test\'');
    const jsonPath = resolve(tempDir, 'nonexistent.json');

    const result = await parser.parse(jsonPath, logPath);

    expect(result.success).toBe(false);
  });

  it('should return success when no log and no JSON', async () => {
    const jsonPath = resolve(tempDir, 'nonexistent.json');

    const result = await parser.parse(jsonPath);

    expect(result.success).toBe(true);
    expect(result.passed).toBe(0);
    expect(result.failed).toBe(0);
  });

  it('should return success when log has no error patterns', async () => {
    const logPath = resolve(tempDir, 'test.log');
    await writeFile(logPath, 'Running 0 tests using 0 workers\nAll good');
    const jsonPath = resolve(tempDir, 'nonexistent.json');

    const result = await parser.parse(jsonPath, logPath);

    expect(result.success).toBe(true);
  });

  it('should extract error snippet with context lines', async () => {
    const logPath = resolve(tempDir, 'test.log');
    const lines = [
      'Line 1: Starting...',
      'Line 2: Loading config...',
      'Line 3: Setting up...',
      'Error: Something went wrong',
      'Line 5: at module.js:1',
      'Line 6: at runner.js:2',
      'Line 7: cleanup',
    ];
    await writeFile(logPath, lines.join('\n'));
    const jsonPath = resolve(tempDir, 'nonexistent.json');

    const result = await parser.parse(jsonPath, logPath);

    expect(result.failures[0]!.error).toContain('Line 2: Loading config...');
    expect(result.failures[0]!.error).toContain('Error: Something went wrong');
  });

  it('should detect "failed to run"', async () => {
    const logPath = resolve(tempDir, 'test.log');
    await writeFile(logPath, 'Playwright failed to run tests');
    const jsonPath = resolve(tempDir, 'nonexistent.json');

    const result = await parser.parse(jsonPath, logPath);

    expect(result.success).toBe(false);
  });

  it('should detect crash when JSON file exists but is empty', async () => {
    const jsonPath = resolve(tempDir, 'results.json');
    const logPath = resolve(tempDir, 'test.log');
    await writeFile(jsonPath, '');
    await writeFile(logPath, 'Error: globalSetup failed\n    at setup.ts:10');

    const result = await parser.parse(jsonPath, logPath);

    expect(result.success).toBe(false);
    expect(result.failed).toBe(1);
    expect(result.failures[0]!.testName).toBe('Framework Crash');
    expect(result.failures[0]!.error).toContain('globalSetup');
  });

  it('should detect crash when JSON file is truncated/corrupted', async () => {
    const jsonPath = resolve(tempDir, 'results.json');
    const logPath = resolve(tempDir, 'test.log');
    await writeFile(jsonPath, '{"suites": [{"title": "test"');
    await writeFile(logPath, 'TypeError: Cannot read properties of undefined\n    at runner.js:5');

    const result = await parser.parse(jsonPath, logPath);

    expect(result.success).toBe(false);
    expect(result.failed).toBe(1);
    expect(result.failures[0]!.testName).toBe('Framework Crash');
    expect(result.failures[0]!.error).toContain('TypeError');
  });

  it('should return parse error when JSON is corrupted and no error in log', async () => {
    const jsonPath = resolve(tempDir, 'results.json');
    const logPath = resolve(tempDir, 'test.log');
    await writeFile(jsonPath, '{"broken');
    await writeFile(logPath, 'No errors here, just normal output');

    const result = await parser.parse(jsonPath, logPath);

    expect(result.success).toBe(false);
    expect(result.failures[0]!.testName).toBe('Result Parse Error');
    expect(result.failures[0]!.error).toContain('corrupted or truncated');
  });
});
