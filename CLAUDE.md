# Project Memory: claude-test-runner

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
├── parsers/              # Jest, Playwright parsers
├── reporters/            # Console, JSON, Markdown reporters
├── utils/                # ANSI strip, file ops, sanitization
└── cli/                  # CLI entry point
```

## Key Patterns

### Config Schema (Zod)

```typescript
const SuiteSchema = z.object({
  name: z.string(),
  type: z.enum(['jest', 'playwright', 'custom']),
  command: z.string(),
  resultFile: z.string(),
  timeout: z.number().optional(),
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

### Reporter Interface

```typescript
interface Reporter {
  onStart(suites: string[]): void;
  onSuiteComplete(suite: string, result: SuiteResult): void;
  onComplete(results: AggregatedResults): void;
}
```

## Requirements

Полные требования: `/Users/mike/WebstormProjects/claude-test-runner/REQUIREMENTS.md`
