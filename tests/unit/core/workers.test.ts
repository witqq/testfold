import { buildWorkersArg } from '../../../src/core/executor.js';

describe('buildWorkersArg', () => {
  it('should return --maxWorkers for jest suites', () => {
    expect(buildWorkersArg('jest', 4)).toBe('--maxWorkers=4');
  });

  it('should return --workers for playwright suites', () => {
    expect(buildWorkersArg('playwright', 2)).toBe('--workers=2');
  });

  it('should return null for custom suites', () => {
    expect(buildWorkersArg('custom', 3)).toBeNull();
  });

  it('should handle workers=1', () => {
    expect(buildWorkersArg('jest', 1)).toBe('--maxWorkers=1');
  });
});
