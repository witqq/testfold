# Testing Guide

## Test Categories

| Category | Location | Purpose |
|----------|----------|---------|
| Unit | `tests/unit/` | Test individual functions/classes in isolation |
| Integration | `tests/integration/` | Test module integration, parser/reporter combinations |

## Running Tests

```bash
# All tests (self-testing via TestRunner)
npm test

# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration
```

## Self-Testing

The module tests itself using its own `TestRunner`:

```bash
npm test
```

This runs `tests/scripts/run-all-tests.js` which:
1. Loads `test-runner.config.ts`
2. Creates `TestRunner.fromConfigFile()`
3. Executes configured suites
4. Outputs console summary table
5. Generates `summary.json`

### Configuration

`test-runner.config.ts`:
```typescript
const config: Config = {
  artifactsDir: './test-results',
  reporters: ['console', 'json'],
  suites: [
    {
      name: 'Unit',
      type: 'jest',
      command: 'node --experimental-vm-modules node_modules/jest/bin/jest.js ...',
      resultFile: 'unit.json',
    },
  ],
};
```

### Output

Console summary:
```
Suite                Passed  Failed  Skipped    Time
───────────────────────────────────────────────────────
Unit                    37      0       0    0.4s
───────────────────────────────────────────────────────
TOTAL                   37      0       0    1.2s

✓ ALL TESTS PASSED
```

JSON summary (`summary.json`):
```json
{
  "success": true,
  "passRate": 100,
  "totals": { "passed": 37, "failed": 0, "skipped": 0 }
}
```

## Test Structure

```
tests/
├── unit/                     # Unit tests
│   ├── parsers/
│   │   ├── jest.test.ts      # Jest parser tests
│   │   └── playwright.test.ts # Playwright parser tests
│   ├── reporters/
│   │   └── console.test.ts   # Console reporter tests
│   └── utils/
│       ├── ansi.test.ts      # ANSI stripping tests
│       └── sanitize.test.ts  # Filename sanitization tests
├── integration/              # Integration tests
│   └── runner.test.ts        # Full runner tests
├── fixtures/                 # Test data
│   ├── jest/
│   │   ├── success.json      # Jest success output
│   │   └── failures.json     # Jest failure output
│   └── playwright/
│       ├── success.json      # Playwright success output
│       └── failures.json     # Playwright failure output
├── helpers/                  # Test utilities
│   └── test-environment.ts   # Environment setup/cleanup
├── utils/
│   └── test-config.ts        # Test configuration
└── scripts/
    ├── run-all-tests.js      # Unified test runner
    ├── run-unit-tests.js     # Unit test runner
    └── run-integration-tests.js # Integration test runner
```

## Writing Tests

### Unit Test Example

```typescript
// tests/unit/parsers/jest.test.ts
import { JestParser } from '../../../src/parsers/jest.js';
import { resolve } from 'path';

describe('JestParser', () => {
  const parser = new JestParser();
  const fixturesDir = resolve(__dirname, '../../fixtures/jest');

  it('should parse successful test results', async () => {
    const result = await parser.parse(
      resolve(fixturesDir, 'success.json'),
      resolve(fixturesDir, 'success.log')
    );

    expect(result.passed).toBeGreaterThan(0);
    expect(result.failed).toBe(0);
    expect(result.success).toBe(true);
  });

  it('should extract failures', async () => {
    const result = await parser.parse(
      resolve(fixturesDir, 'failures.json'),
      resolve(fixturesDir, 'failures.log')
    );

    expect(result.failed).toBeGreaterThan(0);
    expect(result.failures.length).toBeGreaterThan(0);
    expect(result.failures[0]).toHaveProperty('name');
    expect(result.failures[0]).toHaveProperty('message');
  });
});
```

### Integration Test Example

```typescript
// tests/integration/runner.test.ts
import { TestRunner } from '../../src/index.js';

describe('TestRunner', () => {
  it('should run configured suites', async () => {
    const runner = new TestRunner({
      artifactsDir: './test-results/artifacts',
      suites: [
        {
          name: 'Unit',
          type: 'jest',
          command: 'echo "mock"',
          resultFile: 'unit.json',
        }
      ],
      reporters: ['json'],
    });

    // Test runner initialization
    expect(runner).toBeDefined();
  });
});
```

## Test Configuration

### No Hardcoded URLs

Always use `tests/utils/test-config.ts`:

```typescript
// tests/utils/test-config.ts
export function getTestArtifactsDir(): string {
  return process.env.TEST_ARTIFACTS_DIR || './test-results/artifacts';
}

export function getTestTimeout(): number {
  return parseInt(process.env.TEST_TIMEOUT || '30000', 10);
}
```

### Test Fixtures

Place test data in `tests/fixtures/`:

- `jest/` - Jest JSON output samples
- `playwright/` - Playwright JSON output samples

Fixtures should represent real-world outputs from the respective test frameworks.

## Test Artifacts

Test runs produce artifacts in `test-results/`:

```
test-results/
├── unit.json           # Unit test results
├── unit.log            # Unit test output
├── integration.json    # Integration test results
├── integration.log     # Integration test output
└── summary.json        # Aggregated results
```

## Debugging Tests

### Run single test file

```bash
npx jest tests/unit/parsers/jest.test.ts
```

### Verbose output

```bash
npm run test:unit -- --verbose
```

### Watch mode

```bash
npx jest --watch
```
