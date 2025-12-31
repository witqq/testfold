# Development Guide

## Prerequisites

- Node.js 20+
- npm 10+

## Setup

```bash
# Clone repository
git clone <repo-url>
cd testfold

# Install dependencies
npm install

# Build
npm run build
```

## Development Workflow

### Watch mode

```bash
npm run dev
```

Runs `tsx watch src/cli/index.ts` for hot reload during development.

### Build

```bash
npm run build
```

Compiles TypeScript to `dist/`.

### Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Watch mode for CLI development |
| `npm run build` | Build TypeScript |
| `npm test` | Run all tests |
| `npm run test:unit` | Unit tests only |
| `npm run test:integration` | Integration tests only |
| `npm run lint` | Run ESLint |
| `npm run format` | Format code with Prettier |
| `npm run format:check` | Check formatting |

## Project Structure

```
src/
├── index.ts              # Public exports
├── config/               # Configuration loading and validation
│   ├── types.ts          # TypeScript types
│   ├── schema.ts         # Zod schemas
│   ├── loader.ts         # Config file loader
│   └── index.ts          # Exports
├── core/                 # Core runner logic
│   ├── runner.ts         # TestRunner class
│   ├── orchestrator.ts   # Suite orchestration
│   ├── executor.ts       # Command execution
│   └── index.ts          # Exports
├── parsers/              # Test result parsers
│   ├── types.ts          # Parser interfaces
│   ├── jest.ts           # Jest JSON parser
│   ├── playwright.ts     # Playwright JSON parser
│   └── index.ts          # Exports
├── reporters/            # Output reporters
│   ├── types.ts          # Reporter interfaces
│   ├── console.ts        # Console reporter
│   ├── json.ts           # JSON summary reporter
│   ├── markdown.ts       # Failure markdown reporter
│   └── index.ts          # Exports
├── utils/                # Utilities
│   ├── ansi.ts           # ANSI code stripping
│   ├── sanitize.ts       # Filename sanitization
│   ├── files.ts          # File operations
│   └── index.ts          # Exports
└── cli/                  # CLI entry point
    ├── index.ts          # Main entry
    └── args.ts           # Argument parsing
```

## Testing During Development

Run tests against the module:

```bash
# Unit tests
npm run test:unit

# Integration tests (requires built module)
npm run build && npm run test:integration
```

## Local Testing in Another Project

```bash
# Build the module
npm run build

# Link globally
npm link

# In target project
npm link testfold
```

## Migration from Local Test Scripts

Projects with custom `tests/scripts/run-all-tests.js` can migrate to testfold:

### 1. Install

```bash
npm link testfold
```

### 2. Create config

`testfold.config.ts`:
```typescript
import type { Config } from 'testfold';

const config: Config = {
  artifactsDir: './test-results',
  reporters: ['console', 'json', 'markdown-failures'],
  suites: [
    {
      name: 'Unit',
      type: 'jest',
      command: 'node --experimental-vm-modules node_modules/jest/bin/jest.js --json --outputFile test-results/unit.json',
      resultFile: 'unit.json',
    },
    {
      name: 'E2E',
      type: 'playwright',
      command: 'npx playwright test --reporter=json',
      resultFile: 'playwright-report.json',
    },
  ],
};

export default config;
```

### 3. Update npm scripts

```json
{
  "scripts": {
    "test": "node --import tsx tests/scripts/run-all-tests.js"
  }
}
```

### 4. Replace run-all-tests.js

```javascript
import { TestRunner } from 'testfold';

const runner = await TestRunner.fromConfigFile();
const results = await runner.run();
process.exit(results.success ? 0 : 1);
```

### 5. Artifacts

After migration:
- `summary.json` - aggregated results
- `test-results/*.json` - raw parser output
- `test-results/*.log` - stdout/stderr
- `test-results/failures/*.md` - failure reports per test

## Code Style

- ESLint for linting
- Prettier for formatting
- TypeScript strict mode enabled

Pre-commit hook runs linting automatically.
