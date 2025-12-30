import { sanitizeFilename } from '../../../src/utils/sanitize.js';

describe('sanitizeFilename', () => {
  it('should convert to lowercase', () => {
    expect(sanitizeFilename('HelloWorld')).toBe('helloworld');
  });

  it('should replace spaces with hyphens', () => {
    expect(sanitizeFilename('hello world test')).toBe('hello-world-test');
  });

  it('should remove special characters', () => {
    expect(sanitizeFilename('test@#$%file!')).toBe('testfile');
  });

  it('should handle multiple spaces', () => {
    expect(sanitizeFilename('hello   world')).toBe('hello-world');
  });

  it('should remove leading/trailing hyphens', () => {
    expect(sanitizeFilename('  hello  ')).toBe('hello');
  });

  it('should truncate to max length', () => {
    const longName = 'a'.repeat(150);
    expect(sanitizeFilename(longName, 100).length).toBe(100);
  });

  it('should handle test name with describe blocks', () => {
    const testName = 'JestParser > should parse success results > counts tests';
    const result = sanitizeFilename(testName);

    expect(result).toBe('jestparser-should-parse-success-results-counts-tests');
  });

  it('should handle empty string', () => {
    expect(sanitizeFilename('')).toBe('');
  });

  it('should handle only special characters', () => {
    expect(sanitizeFilename('@#$%^&')).toBe('');
  });
});
