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

# Pass-through to test framework
testfold -- --testNamePattern="auth"  # Args after -- passed to test command
testfold -- --verbose --coverage      # Multiple pass-through args

# Path prefix resolution (automatic)
testfold unit -- user                 # "user" resolved to tests/unit/user.test.ts
testfold unit -- auth                 # If unique match, resolved to full path
```

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
├── reporters/            # Console, JSON, Markdown, Timing, Text reporters
├── utils/                # ANSI strip, file ops, sanitization, path resolver
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
| `console` | Terminal output with colors and test hierarchy |
| `json` | `summary.json` with structured data |
| `markdown-failures` | Per-test failure reports in `failures/` |
| `timing` | `timing.json` with slowest tests sorted by duration |
| `text` | Plain text output for CI (no ANSI, no markdown) |

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
