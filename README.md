# claude-test-runner

Test runner designed for AI agent workflows. Runs Jest/Playwright suites and generates structured reports optimized for LLM consumption.

## Why

When AI agents (Claude Code, Cursor, etc.) run tests, they face issues:

- **Token waste** - reading verbose logs with ANSI escape codes, duplicate stack traces, framework boilerplate
- **Parsing overhead** - different output formats from Jest vs Playwright vs other frameworks
- **Multiple commands** - running `npm run test:unit`, `npm run test:e2e` separately
- **Noise** - agents read full console output when they only need "what failed and why"

## What it does

- Runs all test suites with single `npm test` command
- Generates `summary.json` - structured pass/fail data agents can parse instantly
- Creates per-test markdown failure reports - clean error + stack trace, no ANSI codes
- Supports Jest and Playwright JSON output parsing

## Output

```
summary.json                    # Read this first: {"success": false, "failed": 2, ...}
test-results/
  failures/
    unit/
      user-service-login.md     # "Expected 200, got 401" + stack trace
      auth-middleware.md        # Individual failure details
```

Agent reads `summary.json` (50 tokens) instead of scrolling through 2000 lines of test output.

## Setup

```bash
npm install claude-test-runner
```

Create `test-runner.config.ts`:
```typescript
import type { Config } from 'claude-test-runner';

export default {
  artifactsDir: './test-results',
  reporters: ['console', 'json', 'markdown-failures'],
  suites: [
    { name: 'Unit', type: 'jest', command: 'npx jest --json', resultFile: 'unit.json' },
    { name: 'E2E', type: 'playwright', command: 'npx playwright test', resultFile: 'results.json' },
  ],
} satisfies Config;
```

## Usage

```bash
npm test
```

## Docs

- [Architecture](docs/ARCHITECTURE.md)
- [Development](docs/DEVELOPMENT.md)
- [Testing](docs/TESTING.md)
