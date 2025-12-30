import { stripAnsi, hasAnsi } from '../../../src/utils/ansi.js';

describe('stripAnsi', () => {
  it('should remove color codes', () => {
    const input = '\x1b[31mError\x1b[0m: Something failed';
    const result = stripAnsi(input);

    expect(result).toBe('Error: Something failed');
  });

  it('should remove bold/dim codes', () => {
    const input = '\x1b[1mBold\x1b[0m and \x1b[2mDim\x1b[0m';
    const result = stripAnsi(input);

    expect(result).toBe('Bold and Dim');
  });

  it('should handle multiple codes', () => {
    const input = '\x1b[31m\x1b[1mRed Bold\x1b[0m\x1b[0m';
    const result = stripAnsi(input);

    expect(result).toBe('Red Bold');
  });

  it('should handle empty string', () => {
    expect(stripAnsi('')).toBe('');
  });

  it('should return unchanged text without ANSI codes', () => {
    const input = 'Plain text without codes';
    expect(stripAnsi(input)).toBe(input);
  });

  it('should handle multiline text', () => {
    const input = '\x1b[32mLine 1\x1b[0m\n\x1b[33mLine 2\x1b[0m';
    const result = stripAnsi(input);

    expect(result).toBe('Line 1\nLine 2');
  });
});

describe('hasAnsi', () => {
  it('should detect ANSI codes', () => {
    expect(hasAnsi('\x1b[31mRed\x1b[0m')).toBe(true);
  });

  it('should return false for plain text', () => {
    expect(hasAnsi('Plain text')).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(hasAnsi('')).toBe(false);
  });
});
