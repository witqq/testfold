# Test Runner — Требования

## Цель проекта

Выделить наработки по test runners из проектов Moira и Supervisor в отдельный переиспользуемый npm-модуль.

## Источники паттернов

| Проект | Путь | Что взять |
|--------|------|-----------|
| MCP Moira | `/Users/mike/WebstormProjects/mcp-moira-dev2` | Параллельный запуск, multi-env, failure reports, timing stats |
| Claude Supervisor | `/Users/mike/WebstormProjects/claude-supervisor-dev` | Структура runners, unified reporting |

## Функциональные требования

### FR-1: Конфигурация test suites

- Декларативное определение suites через конфиг файл
- Каждый suite содержит:
  - `name` — отображаемое имя
  - `type` — `jest` | `playwright` | `custom`
  - `command` — команда запуска
  - `resultFile` — путь к JSON результатам
  - `logFile` — путь к лог файлу (опционально, генерируется автоматически)
  - `timeout` — таймаут выполнения (ms)
  - `workers` — количество воркеров (для Jest)
  - `environments` — конфигурация для разных окружений (опционально)

### FR-2: Orchestrator (главный runner)

- Запуск всех или выбранных suites
- Параллельный режим (по умолчанию) и последовательный (`--no-parallel`)
- Fail-fast режим (`--fail-fast`) — остановка при первой ошибке
- Агрегация результатов со всех suites
- Exit code: 0 если все прошли, 1 если есть failures

### FR-3: Result Parsers

**Jest parser:**
- Парсинг стандартного Jest JSON output
- Извлечение: passed, failed, skipped, duration
- Извлечение failure messages и stack traces
- Определение framework crash (0 тестов + ошибки в логах)

**Playwright parser:**
- Парсинг Playwright JSON reporter output
- Поддержка nested suites structure
- Извлечение: expected, unexpected, skipped, duration
- Учёт retries (берётся последний результат)
- Сбор attachments (screenshots, traces)

**Custom parser:**
- Возможность подключить свой парсер через конфиг

### FR-4: Failure Reporting

- Генерация отдельного MD файла на каждый упавший тест
- Формат имени: `{index}-{sanitized-test-name}.md`
- Содержимое:
  - Test name и file path
  - Error message и stack trace
  - Stdout/stderr (для Playwright)
  - Пути к attachments
- ANSI codes stripping для чистых логов
- Директория: `{artifactsDir}/failures/{suiteName}/`

### FR-5: Console Reporter

- Цветной вывод (green/red/yellow)
- Progress indicator для каждого suite
- Итоговая таблица:
  ```
  Suite            Passed  Failed  Skipped    Time
  ────────────────────────────────────────────────
  Unit              1057       0        0   97.6s
  Integration        327       0        0   77.5s
  E2E                372       0        5  202.6s
  ────────────────────────────────────────────────
  TOTAL             1756       0        5  350.9s

  Pass Rate: 99.7%
  ```
- Error snippets при failures (первые N строк ошибки)

### FR-6: Artifacts Management

- Структура директорий:
  ```
  test-results/
  ├── artifacts/
  │   ├── {suite}.json
  │   ├── {suite}.log
  │   └── failures/
  │       └── {suite}/
  │           ├── 01-test-name.md
  │           └── 02-test-name.md
  └── summary.json
  ```
- Cleanup старых artifacts перед запуском
- Summary JSON с агрегированными данными

### FR-7: Multi-Environment Support

- Конфигурация environments в suite:
  ```typescript
  environments: {
    local: { baseUrl: 'http://localhost:3000' },
    staging: { baseUrl: 'https://staging.example.com' },
    prod: { baseUrl: 'https://example.com' }
  }
  ```
- CLI flag: `--env staging`
- Передача TEST_BASE_URL в env процесса

### FR-8: Timing Statistics (опционально)

- Сбор времени выполнения каждого теста
- Генерация `{suite}-timing.txt` с топ N slowest tests
- Полезно для оптимизации E2E тестов

## Нефункциональные требования

### NFR-1: Простота интеграции

- Установка: `npm install claude-test-runner`
- Минимальная конфигурация для старта
- Совместимость с существующими Jest/Playwright проектами

### NFR-2: Производительность

- Параллельный запуск suites без блокировки
- Buffer для stdout/stderr (до 50MB)
- Streaming логов в файл

### NFR-3: Расширяемость

- Plugin система для custom parsers
- Custom reporters
- Hooks: beforeAll, afterAll, beforeSuite, afterSuite

### NFR-4: TypeScript

- Полная типизация конфига
- Strict mode
- Экспорт типов для потребителей

## API

### Конфигурационный файл

```typescript
// test-runner.config.ts
import { defineConfig } from 'claude-test-runner';

export default defineConfig({
  // Директория для artifacts
  artifactsDir: 'test-results/artifacts',

  // Test suites
  suites: [
    {
      name: 'Unit',
      type: 'jest',
      command: 'npx jest --config jest.unit.config.js',
      resultFile: 'unit.json',
      timeout: 60000,
    },
    {
      name: 'Integration',
      type: 'jest',
      command: 'npx jest --config jest.integration.config.js',
      resultFile: 'integration.json',
      timeout: 120000,
      env: {
        DB_PATH: './data/test.db'
      }
    },
    {
      name: 'E2E',
      type: 'playwright',
      command: 'npx playwright test',
      resultFile: 'e2e.json',
      timeout: 300000,
      environments: {
        local: {
          baseUrl: 'http://localhost:3000',
          envFile: '.env.local'
        },
        staging: {
          baseUrl: 'https://staging.example.com',
          envFile: '.env.staging'
        }
      }
    }
  ],

  // Execution options
  parallel: true,
  failFast: false,

  // Reporters
  reporters: [
    'console',           // Colored console output
    'json',              // summary.json
    'markdown-failures'  // Individual failure reports
  ],

  // Hooks (optional)
  hooks: {
    beforeAll: async () => { /* setup */ },
    afterAll: async (results) => { /* cleanup */ }
  }
});
```

### CLI

```bash
# Запуск всех suites
npx test-runner

# Запуск конкретного suite
npx test-runner unit
npx test-runner "Unit" "Integration"

# Multi-environment
npx test-runner --env staging
npx test-runner e2e --env prod

# Execution modes
npx test-runner --no-parallel    # Последовательно
npx test-runner --fail-fast      # Остановка при ошибке

# Specific test file (передаётся в команду suite)
npx test-runner unit -- path/to/test.ts

# Config file
npx test-runner --config ./custom-config.ts
```

### Programmatic API

```typescript
import { TestRunner, defineConfig } from 'claude-test-runner';

const config = defineConfig({ /* ... */ });
const runner = new TestRunner(config);

// Run all
const results = await runner.run();

// Run specific suites
const results = await runner.run(['unit', 'integration']);

// Run with environment
const results = await runner.run(['e2e'], { env: 'staging' });

// Access results
console.log(results.totals);      // { passed, failed, skipped, duration }
console.log(results.suites);      // Per-suite results
console.log(results.failures);    // Failed test details
```

## Структура проекта

```
test-runner/
├── src/
│   ├── index.ts              # Public exports
│   ├── config/
│   │   ├── schema.ts         # Config validation (Zod)
│   │   ├── loader.ts         # Config file loader
│   │   └── types.ts          # TypeScript types
│   ├── core/
│   │   ├── runner.ts         # Main TestRunner class
│   │   ├── orchestrator.ts   # Suite orchestration
│   │   └── executor.ts       # Command execution
│   ├── parsers/
│   │   ├── index.ts          # Parser registry
│   │   ├── jest.ts           # Jest JSON parser
│   │   ├── playwright.ts     # Playwright JSON parser
│   │   └── types.ts          # Parser interfaces
│   ├── reporters/
│   │   ├── index.ts          # Reporter registry
│   │   ├── console.ts        # Console reporter
│   │   ├── json.ts           # JSON summary reporter
│   │   └── markdown.ts       # Failure markdown reporter
│   ├── utils/
│   │   ├── ansi.ts           # ANSI code stripping
│   │   ├── files.ts          # File operations
│   │   └── sanitize.ts       # Filename sanitization
│   └── cli/
│       ├── index.ts          # CLI entry point
│       └── args.ts           # Argument parsing
├── tests/
│   ├── unit/
│   ├── integration/
│   └── fixtures/             # Sample Jest/Playwright outputs
├── docs/
│   ├── USAGE.md
│   └── API.md
├── package.json
├── tsconfig.json
├── CLAUDE.md
└── README.md
```

## Приоритеты реализации

### Phase 1: MVP
1. Config loader с базовой схемой
2. Jest parser
3. Playwright parser
4. Console reporter
5. CLI с базовыми командами
6. Параллельный запуск

### Phase 2: Enhanced
1. Markdown failure reports
2. Multi-environment support
3. JSON summary reporter
4. Timing statistics
5. Error snippets

### Phase 3: Advanced
1. Custom parsers API
2. Custom reporters API
3. Hooks system
4. Watch mode (опционально)

## Совместимость

- Node.js: 20+
- Jest: 29+
- Playwright: 1.40+
- TypeScript: 5.0+
- Package manager: npm (основной), pnpm совместим
