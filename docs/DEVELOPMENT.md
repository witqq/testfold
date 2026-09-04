# Development Guide

## Prerequisites

- Node.js 22.18.0+
- npm 10+

## Setup

```bash
git clone https://github.com/witqq/testfold.git
cd testfold
npm ci --no-audit --no-fund
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

| Script                     | Description                                     |
| -------------------------- | ----------------------------------------------- |
| `npm run dev`              | Watch mode for CLI development                  |
| `npm run build`            | Build TypeScript                                |
| `npm test`                 | Run the self-hosted unit suite through Testfold |
| `npm run test:unit`        | Run the Jest unit suite directly                |
| `npm run test:integration` | Run repository integration tests                |
| `npm run typecheck`        | Check strict TypeScript without emitting files  |
| `npm run lint`             | Run ESLint                                      |
| `npm run format`           | Format code with Prettier                       |
| `npm run format:check`     | Check formatting                                |
| `npm run check:workflows`  | Validate GitHub Actions release contracts       |
| `npm run pack:check`       | Build and inspect an isolated npm candidate     |
| `npm run verify`           | Run the complete local release gate             |

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

Run the smallest relevant suite while developing, then the complete gate before handoff:

```bash
npm run test:unit
npm run test:integration
npm run verify
```

## Local package testing

```bash
npm run pack:check
```

The package check creates a tarball below `test-results/package/`, installs that exact file in a clean isolated consumer, and verifies package metadata, ESM imports, TypeScript declarations, and the CLI. It does not use the published registry version or a global link.

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
      command:
        'node --experimental-vm-modules node_modules/jest/bin/jest.js --json --outputFile test-results/unit.json',
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

## Contribution and release contracts

- Work on a feature branch; do not commit directly to `master`.
- Keep TypeScript strict and run ESLint on source, tests, and release-support scripts.
- Use Prettier for files you change; repository-wide legacy formatting is not rewritten as part of unrelated work.
- Do not commit `dist/`, test results, npm candidates, caches, or Moira workspaces.
- Follow [../CONTRIBUTING.md](../CONTRIBUTING.md) for contributions and [RELEASE.md](RELEASE.md) for releases.

Pushes, pull requests, tags, GitHub Releases, and npm publication are separate operator actions.
