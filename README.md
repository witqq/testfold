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
summary.json                    # Read first: {"success": false, "failed": 2, "failedTests": [...], "errors": [...]}
test-results/
  timing.json                   # Slowest tests sorted by duration
  unit-timing.txt               # Per-suite timing (top slowest tests, file grouping)
  test-summary.log              # ANSI-free summary table
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
testfold -r console,json,timing-text  # Multiple reporters (comma-separated)
testfold -r console -r json           # Multiple reporters (repeated flag)
testfold -r ./my-reporter.ts          # Custom reporter from file
testfold -g "auth"                    # Filter tests by name pattern
testfold --grep "login" unit          # grep maps to --testNamePattern (Jest) or --grep (Playwright)
testfold --grep-invert "slow"         # Exclude tests matching pattern
testfold -f auth.test.ts              # Run specific test file
testfold -- --testNamePattern="auth"  # Pass args to test framework
testfold -- user                      # Path prefix resolution: "user" -> tests/unit/user.test.ts
testfold --dry-run                    # Preview commands without executing
```

### Reporters

| Reporter | Output |
|----------|--------|
| `console` | Terminal output with colors, hierarchy, agent-friendly failure sections, JSON summary line |
| `json` | `summary.json` with structured data, failedTests[], errors[] |
| `markdown-failures` | Per-test failure reports in `failures/` |
| `timing` | `timing.json` with slowest tests |
| `timing-text` | Per-suite `.txt` files with top slowest tests and file grouping |
| `text` | Plain text output for CI (no ANSI, no markdown) |
| `summary-log` | ANSI-free `test-summary.log` with summary table |
| Custom path | `./my-reporter.ts` — load Reporter from file |

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

### Custom Reporters

Load reporters from file paths:

```typescript
import type { Reporter } from 'testfold';

export default class SlackReporter implements Reporter {
  onStart(suites) { /* notify start */ }
  onSuiteComplete(suite, result) { /* notify per suite */ }
  async onComplete(results) { /* send summary */ }
}
```

Use via CLI: `testfold -r ./reporters/slack.ts` or in config `reporters: ['console', './reporters/slack.ts']`.

### Guard Hooks

Hooks can return a `GuardResult` to fail a suite even when all tests pass (e.g., leak detection):

```typescript
import type { Config, GuardResult } from 'testfold';

export default {
  hooks: {
    beforeSuite: async (suite) => {
      const stats = await getResourceStats();
      return { ok: true }; // or { ok: false, error: 'Resource leak detected' }
    },
    afterSuite: async (suite, result) => {
      const leaks = await checkForLeaks();
      if (leaks.length > 0) return { ok: false, error: `${leaks.length} leaks found` };
    },
  },
  // ...
} satisfies Config;
```

Returning `void` or `undefined` is treated as success (backward compatible).

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

### Agent-Friendly Output

When tests fail, the console reporter outputs:
- **Consolidated failures** — all failing tests across suites in one section
- **Re-run instructions** — exact CLI commands to re-run just the failed tests
- **Agent instructions block** — structured `=== AGENT INSTRUCTIONS ===` section with error patterns and suggested actions
- **JSON summary line** — `TESTFOLD_RESULT:{json}` as the last line (always, success or failure)
- **Coverage detection** — prints path to `coverage/` directory when present
- **Real-time progress** — emits `[SuiteName] … N tests` to stderr during long-running suites

Semantic exit codes: `0` = pass, `1` = test failures, `2` = infrastructure error, `3` = timeout.

Use `--dry-run` to preview resolved commands without execution.

## Docs

- [Architecture](docs/ARCHITECTURE.md)
