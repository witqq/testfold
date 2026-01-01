import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadCustomParser,
  CustomParserLoader,
} from '../../../src/parsers/custom.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, '../../fixtures/custom-parsers');

describe('loadCustomParser', () => {
  describe('valid parsers', () => {
    it('should load parser exported as default class', async () => {
      const parserPath = resolve(fixturesDir, 'valid-class.ts');
      const parser = await loadCustomParser(parserPath, __dirname);

      expect(parser).toBeDefined();
      expect(typeof parser.parse).toBe('function');

      const result = await parser.parse('/test/path.json');
      expect(result.passed).toBe(5);
      expect(result.failed).toBe(1);
      expect(result.skipped).toBe(2);
    });

    it('should load parser exported as default object', async () => {
      const parserPath = resolve(fixturesDir, 'valid-object.ts');
      const parser = await loadCustomParser(parserPath, __dirname);

      expect(parser).toBeDefined();
      expect(typeof parser.parse).toBe('function');

      const result = await parser.parse('/test/path.json');
      expect(result.passed).toBe(10);
      expect(result.failed).toBe(0);
      expect(result.success).toBe(true);
    });

    it('should load parser from named export', async () => {
      const parserPath = resolve(fixturesDir, 'named-export.ts');
      const parser = await loadCustomParser(parserPath, __dirname);

      expect(parser).toBeDefined();
      expect(typeof parser.parse).toBe('function');

      const result = await parser.parse('/test/path.json');
      expect(result.passed).toBe(3);
      expect(result.failed).toBe(2);
      expect(result.failures).toHaveLength(2);
    });

    it('should resolve relative paths from cwd', async () => {
      const relativePath = './valid-class.ts';
      const parser = await loadCustomParser(relativePath, fixturesDir);

      expect(parser).toBeDefined();
      const result = await parser.parse('/test/path.json');
      expect(result.passed).toBe(5);
    });
  });

  describe('invalid parsers', () => {
    it('should throw for non-existent file', async () => {
      await expect(
        loadCustomParser('/non/existent/parser.ts', __dirname),
      ).rejects.toThrow('Failed to load custom parser');
    });

    it('should throw for parser without parse method', async () => {
      const parserPath = resolve(fixturesDir, 'invalid-no-parse.ts');

      await expect(loadCustomParser(parserPath, __dirname)).rejects.toThrow(
        'does not export a valid Parser interface',
      );
    });
  });
});

describe('CustomParserLoader', () => {
  it('should lazily load parser on first parse call', async () => {
    const parserPath = resolve(fixturesDir, 'valid-class.ts');
    const loader = new CustomParserLoader(parserPath, __dirname);

    // Parser not loaded yet - no error
    expect(loader).toBeDefined();

    // First parse triggers load
    const result = await loader.parse('/test/path.json');
    expect(result.passed).toBe(5);

    // Second parse uses cached parser
    const result2 = await loader.parse('/test/path2.json');
    expect(result2.passed).toBe(5);
  });

  it('should throw descriptive error for invalid parser path', async () => {
    const loader = new CustomParserLoader('/invalid/path.ts', __dirname);

    await expect(loader.parse('/test/path.json')).rejects.toThrow(
      'Failed to load custom parser',
    );
  });
});
