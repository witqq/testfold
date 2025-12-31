/**
 * Integration test: verify testfold package from npm registry
 * Installs package in subproject and verifies it works
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const npmTestDir = join(__dirname, '..', 'integration-npm');

describe('npm package integration', () => {
  beforeAll(() => {
    // Install testfold from npm registry
    execSync('npm install --silent', { cwd: npmTestDir, stdio: 'pipe' });
  }, 60000);

  describe('ESM imports', () => {
    it('should import TestRunner', async () => {
      const result = execSync(
        `node -e "import('testfold').then(m => console.log(typeof m.TestRunner))"`,
        { cwd: npmTestDir, encoding: 'utf-8' }
      );
      expect(result.trim()).toBe('function');
    });

    it('should import defineConfig', async () => {
      const result = execSync(
        `node -e "import('testfold').then(m => console.log(typeof m.defineConfig))"`,
        { cwd: npmTestDir, encoding: 'utf-8' }
      );
      expect(result.trim()).toBe('function');
    });

    it('should import JestParser', async () => {
      const result = execSync(
        `node -e "import('testfold').then(m => console.log(typeof m.JestParser))"`,
        { cwd: npmTestDir, encoding: 'utf-8' }
      );
      expect(result.trim()).toBe('function');
    });

    it('should import PlaywrightParser', async () => {
      const result = execSync(
        `node -e "import('testfold').then(m => console.log(typeof m.PlaywrightParser))"`,
        { cwd: npmTestDir, encoding: 'utf-8' }
      );
      expect(result.trim()).toBe('function');
    });

    it('should import ConsoleReporter', async () => {
      const result = execSync(
        `node -e "import('testfold').then(m => console.log(typeof m.ConsoleReporter))"`,
        { cwd: npmTestDir, encoding: 'utf-8' }
      );
      expect(result.trim()).toBe('function');
    });

    it('should import JsonReporter', async () => {
      const result = execSync(
        `node -e "import('testfold').then(m => console.log(typeof m.JsonReporter))"`,
        { cwd: npmTestDir, encoding: 'utf-8' }
      );
      expect(result.trim()).toBe('function');
    });

    it('should import MarkdownReporter', async () => {
      const result = execSync(
        `node -e "import('testfold').then(m => console.log(typeof m.MarkdownReporter))"`,
        { cwd: npmTestDir, encoding: 'utf-8' }
      );
      expect(result.trim()).toBe('function');
    });
  });

  describe('CLI', () => {
    it('should have CLI binary in node_modules/.bin', () => {
      const binPath = join(npmTestDir, 'node_modules', '.bin', 'testfold');
      expect(existsSync(binPath)).toBe(true);
    });

    it('should output version with --version', () => {
      const result = execSync('npx testfold --version', {
        cwd: npmTestDir,
        encoding: 'utf-8',
      });
      expect(result).toContain('testfold');
      expect(result).toContain('0.1.0');
    });

    it('should output help with --help', () => {
      const result = execSync('npx testfold --help', {
        cwd: npmTestDir,
        encoding: 'utf-8',
      });
      expect(result).toContain('Usage');
      expect(result).toContain('--config');
    });
  });

  describe('TypeScript types', () => {
    it('should include declaration files', () => {
      const dtsPath = join(npmTestDir, 'node_modules', 'testfold', 'dist', 'index.d.ts');
      expect(existsSync(dtsPath)).toBe(true);
    });
  });

  describe('functionality', () => {
    it('should create TestRunner instance', () => {
      const script = `
        import('testfold').then(m => {
          const config = m.defineConfig({
            artifactsDir: './test-results',
            suites: [{ name: 'Test', type: 'jest', command: 'echo', resultFile: 't.json' }]
          });
          const runner = new m.TestRunner(config);
          console.log(typeof runner.run);
        });
      `;
      const result = execSync(`node -e "${script.replace(/\n/g, ' ')}"`, {
        cwd: npmTestDir,
        encoding: 'utf-8',
      });
      expect(result.trim()).toBe('function');
    });
  });
});
