# Project Memory: testfold

## Project Type

npm-модуль для унифицированного запуска тестов с поддержкой Jest и Playwright.

## Tech Stack

- **Runtime:** Node.js 20+
- **Language:** TypeScript (strict mode)
- **Package Manager:** npm
- **Testing:** Jest
- **Validation:** Zod

## Источники паттернов

Модуль основан на наработках из:
- MCP Moira: `/Users/mike/WebstormProjects/mcp-moira-dev2/tests/scripts/`
- Claude Supervisor: `/Users/mike/WebstormProjects/claude-supervisor-dev/tests/scripts/`

## Git Rules

**FORBIDDEN:**
- Direct commits to `master` branch
- Amend commits in `master`

**ALWAYS:**
1. Create feature branch from master
2. Make commits in feature branch
3. Create PR
4. Merge via GitHub after approval

## Development

### Quick Start

```bash
npm install
npm run dev
```

### Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Watch mode for CLI |
| `npm run build` | Build TypeScript |
| `npm test` | Run all tests |
| `npm run test:unit` | Unit tests only |
| `npm run lint` | Run ESLint |
| `npm run format` | Run Prettier |

## CLI Usage

```bash
# Basic usage
testfold                              # Run all suites
testfold unit integration             # Run specific suites

# Options
testfold -c custom.config.ts          # Custom config
testfold -e staging                   # Environment
testfold -r json                      # Override reporter
testfold -r console,json,timing-text  # Multiple reporters
testfold -r ./my-reporter.ts          # Custom reporter from file
testfold -g "auth"                    # Filter by test name
testfold --grep-invert "slow"         # Exclude tests by pattern
testfold -f auth.test.ts              # Filter by file
testfold --dry-run                    # Preview commands without running
testfold --dry-run unit               # Preview only unit suite

# Pass-through to test framework
testfold -- --testNamePattern="auth"  # Args after -- passed to test command
testfold -- --verbose --coverage      # Multiple pass-through args

# Path prefix resolution (automatic)
testfold unit -- user                 # "user" resolved to tests/unit/user.test.ts
testfold unit -- auth                 # If unique match, resolved to full path
```

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | All tests passed |
| 1 | One or more tests failed |
| 2 | Infrastructure error (config, parse, spawn failure) |
| 3 | Suite killed by timeout |

## Testing

### Run tests ONLY via npm scripts:
```bash
npm test                    # All tests
npm run test:unit [file]    # Unit only
npm run test:integration    # Integration only
```

### Test artifacts in `test-results/`:
- `{category}.json` - structured results
- `{category}.log` - full output
- `failures/{category}/` - individual failure reports

## Temporary Files

**ALWAYS use project temp directory:**
```bash
./claude-temp-files/script.ts
./claude-temp-files/analysis.json
```

**FORBIDDEN:**
```bash
/tmp/file.ts
./tmp/file.ts
```

## Architecture

```
src/
├── index.ts              # Public exports
├── config/               # Config loading & validation
├── core/                 # Runner, orchestrator, executor
├── parsers/              # Jest, Playwright, Custom parsers
├── reporters/            # Console, JSON, Markdown, Timing, Timing-Text, Text, Summary-Log, Custom reporters
├── utils/                # ANSI strip, file ops, sanitization, path resolver, progress formatter
└── cli/                  # CLI entry point
```

## Key Patterns

### Config Schema (Zod)

```typescript
const ConfigSchema = z.object({
  artifactsDir: z.string(),
  testsDir: z.string().optional().default('./tests'),  // For path prefix resolution
  suites: z.array(SuiteSchema),
  parallel: z.boolean().optional().default(true),
  failFast: z.boolean().optional().default(false),
  reporters: z.array(z.string()).optional(),
});
```

### Parser Interface

```typescript
interface Parser {
  parse(jsonPath: string, logPath: string): Promise<ParseResult>;
}

interface ParseResult {
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  failures: FailureDetail[];
}
```

### Custom Parser

```typescript
// Suite config with custom parser
{
  name: 'my-suite',
  type: 'custom',
  command: 'my-test-runner',
  resultFile: 'results.json',
  parser: './parsers/my-parser.ts'  // Path to custom parser
}

// Custom parser module (supports default class, default object, or named 'parser' export)
import type { Parser, ParseResult } from 'testfold';

export default class MyParser implements Parser {
  async parse(jsonPath: string, logPath?: string): Promise<ParseResult> {
    // Parse logic
    return { passed: 0, failed: 0, skipped: 0, duration: 0, success: true, failures: [] };
  }
}
```

### Reporter Interface

```typescript
interface Reporter {
  onStart(suites: string[]): void;
  onSuiteComplete(suite: string, result: SuiteResult): void;
  onComplete(results: AggregatedResults): void;
}
```

### Available Reporters

| Reporter | Output |
|----------|--------|
| `console` | Terminal output with colors, test hierarchy, consolidated failures, re-run instructions, agent block, JSON summary line, coverage hint. Progress to stderr |
| `json` | `summary.json` with failedTests[], errors[], per-suite testResults[] |
| `markdown-failures` | Per-test failure reports in `failures/` |
| `timing` | `timing.json` with slowest tests sorted by duration |
| `timing-text` | Per-suite `.txt` files with top slowest tests and file grouping |
| `text` | Plain text output for CI (no ANSI, no markdown) |
| `summary-log` | ANSI-free `test-summary.log` with summary table |
| Custom path | `./my-reporter.ts` — custom Reporter loaded from file |

## v0.2.0 Features

### Graceful Error Recovery
Orchestrator attempts to parse test results even when executor returns non-zero exit code. Partial results extracted from failed runs.

### Environment Routing
Load environment-specific `.env` files via CLI flag `-e`. Supports static baseUrl or dynamic URL extraction via `urlExtractor` function.

### Per-Suite Artifact Cleanup
Running a single suite only cleans that suite's artifacts. Previous runs of other suites are preserved.

### Path Prefix Resolution
Pass-through arguments that look like file prefixes are resolved to full paths. Single-match prefixes resolved automatically, multi-match kept unchanged.

## Notes

Локальная папка проекта временно называется `claude-test-runner`, но пакет и репозиторий переименованы в `testfold`.

## Agent-Friendly Features

### Semantic Exit Codes
Exit codes 0-3 instead of boolean. See exit codes table above. `ErrorCategory` on SuiteResult enables categorization.

### Dry-Run Mode
`--dry-run` prints resolved commands for each suite without execution.

### Consolidated Failure Summary
On failure, all failing tests across all suites shown in one section with suite name, test name, file path, truncated error.

### Re-Run Instructions
Exact CLI commands to re-run failed tests. Framework-appropriate flags, grouped by suite, per-file commands (≤5 unique files).

### Agent Instructions Block
`=== AGENT INSTRUCTIONS ===` delimited block with failure count, affected suites, top error patterns, suggested actions. Only on failure.

### JSON Summary Line
`TESTFOLD_RESULT:{json}` as the very last line of console output. Always printed. Contains success, passed, failed, skipped, duration, exitCode.

### Coverage Detection
Checks for `coverage/` directory in project root. Prints path when found.

### Real-Time Progress
Orchestrator streams executor output through progress formatter. Emits `[SuiteName] … N tests (X passed, Y failed) Ns` to stderr every 10 tests. Supports Jest and Playwright patterns.
