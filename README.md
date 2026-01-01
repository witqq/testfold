# testfold

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
- Supports Jest, Playwright, and custom parser modules
- Graceful error recovery - partial results extracted from failed runs

## Output

```
summary.json                    # Read first: {"success": false, "failed": 2, ...}
test-results/
  timing.json                   # Slowest tests sorted by duration
  unit.json                     # Raw Jest/Playwright results
  unit.log                      # Full command output
  failures/
    unit/
      01-user-service-login.md  # Individual failure report
      02-auth-middleware.md
```

Agent reads `summary.json` (50 tokens) instead of scrolling through 2000 lines of test output. For performance analysis, check `timing.json` to identify slow tests.

## Setup

```bash
npm install testfold
```

Create `testfold.config.ts`:
```typescript
import type { Config } from 'testfold';

export default {
  artifactsDir: './test-results',
  testsDir: './tests',  // For path prefix resolution
  reporters: ['console', 'json', 'markdown-failures', 'timing', 'text'],
  suites: [
    { name: 'Unit', type: 'jest', command: 'npx jest --json', resultFile: 'unit.json' },
    { name: 'E2E', type: 'playwright', command: 'npx playwright test', resultFile: 'results.json' },
  ],
} satisfies Config;
```

## Usage

```bash
testfold                              # Run all suites
testfold unit integration             # Run specific suites
testfold -e staging                   # Use staging environment
testfold -r json                      # Override reporters
testfold -- --testNamePattern="auth"  # Pass args to test framework
testfold -- user                      # Path prefix resolution: "user" -> tests/unit/user.test.ts
```

### Reporters

| Reporter | Output |
|----------|--------|
| `console` | Terminal output with colors and hierarchy |
| `json` | `summary.json` with structured data |
| `markdown-failures` | Per-test failure reports in `failures/` |
| `timing` | `timing.json` with slowest tests |
| `text` | Plain text output for CI (no ANSI, no markdown) |

### Environment Support

Load environment-specific `.env` files:

```typescript
export default {
  suites: [{
    name: 'E2E',
    type: 'playwright',
    command: 'npx playwright test',
    resultFile: 'results.json',
    environments: {
      staging: {
        baseUrl: 'https://staging.example.com',
      },
      production: {
        envFile: '.env.prod',
        urlExtractor: (content) => content.match(/APP_URL=(.+)/)?.[1],
      },
    },
  }],
} satisfies Config;
```

Run with: `testfold -e staging`

### Custom Parsers

For test frameworks beyond Jest/Playwright:

```typescript
// testfold.config.ts
export default {
  suites: [{
    name: 'Custom',
    type: 'custom',
    command: 'my-test-runner',
    resultFile: 'results.json',
    parser: './parsers/my-parser.ts',  // Path to custom parser
  }],
} satisfies Config;

// parsers/my-parser.ts
import type { Parser, ParseResult } from 'testfold';

export default class MyParser implements Parser {
  async parse(jsonPath: string, logPath?: string): Promise<ParseResult> {
    // Parse your test framework's output
    return { passed: 10, failed: 0, skipped: 0, duration: 1000, success: true, failures: [] };
  }
}
```

### Path Prefix Resolution

Pass partial test file names and testfold resolves them to full paths:

```bash
testfold unit -- auth              # Resolves to tests/unit/auth.test.ts (if unique match)
testfold unit -- user-service      # Resolves to tests/unit/user-service.test.ts
```

Configure the search directory:
```typescript
export default {
  testsDir: './tests',  // Default: './tests'
  // ...
} satisfies Config;
```

### Graceful Error Recovery

Even when tests crash or timeout, testfold attempts to parse partial results. Non-zero exit codes don't prevent result extraction.

### Per-Suite Artifact Cleanup

Running a single suite only cleans that suite's artifacts, preserving results from previous runs of other suites.

## Docs

- [Architecture](docs/ARCHITECTURE.md)
