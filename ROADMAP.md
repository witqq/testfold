# testfold Roadmap

Анализ test runners из MCP Moira и Claude Supervisor выявил функции для миграции.

## Высокий приоритет

### 1. Custom Parser API
**Статус:** Схема есть, реализация отсутствует

```typescript
// Текущая схема в config/schema.ts
type: z.enum(['jest', 'playwright', 'custom'])
parser: z.string().optional() // путь к кастомному парсеру
```

**Задача:** Реализовать загрузку и вызов custom parser в orchestrator.ts

### 2. Retry-Aware Playwright Parsing
**Проблема:** Playwright parser берёт первый результат, а не последний (после retries)

```typescript
// Текущий код (неправильно)
const result = test.results[0];

// Нужно (правильно - последняя попытка)
const result = test.results[test.results.length - 1];
```

### 3. Framework Crash Detection
**Проблема:** Если Jest/Playwright крашится до запуска тестов, testfold показывает "0 passed, 0 failed"

**Решение из Moira:**
```typescript
const errorPatterns = [
  "Error:", "failed to run", "ReferenceError", "SyntaxError",
  "TypeError", "Timed out", "ECONNREFUSED"
];
if (totalTests === 0 && errorPatterns.some(p => logContent.includes(p))) {
  // Framework crashed - report as failure
}
```

### 4. Graceful Error Recovery
**Проблема:** При non-zero exit code executor не парсит результаты

**Нужно:** Парсить результаты даже при ошибке (тесты могли пройти частично)

### 5. CLI Argument Pass-Through
**Проблема:** Нет способа передать аргументы в Jest/Playwright

**Решение:**
```bash
testfold unit -- --testNamePattern="auth"
testfold e2e -- --grep "login"
```

## Средний приоритет

### 6. Multi-Environment с Env File Routing
**Фича из Moira:**
```typescript
const ENV_CONFIG = {
  local: {
    envFile: ".env.local",
    getUrl: (content) => {
      const port = content.match(/PORT=(\d+)/)?.[1];
      return `http://localhost:${port}`;
    }
  },
  staging: { envFile: ".env.staging", getUrl: () => "https://staging.example.com" }
};
```

**Задача:** Добавить в конфиг environments с envFile и getUrl

### 7. Per-Suite Artifact Cleanup
**Проблема:** Удаляются все артефакты, а не только текущего suite

**Решение:** Удалять только `{suite-name}.json`, `{suite-name}.log`, `failures/{suite-name}/`

### 8. Timing Statistics Export
**Фича из Moira:** Генерация файла с топ-30 самых медленных тестов

```
e2e-timing.txt:
1. user-login.spec.ts (45.2s)
2. checkout-flow.spec.ts (38.7s)
...
```

### 9. Test Hierarchy in Failures
**Проблема:** Markdown reporter не показывает иерархию теста

**Решение:** Использовать `ancestorTitles.join(' > ')` из Jest output

### 10. Artifact Inventory Display
**Фича:** В конце console output показать список сгенерированных файлов

```
Artifacts:
  test-results/unit.json
  test-results/unit.log
  test-results/failures/unit/auth-service.md
```

## Низкий приоритет

### 11. Reporter CLI Override
```bash
testfold --reporter json  # вместо из конфига
```

### 12. Path Prefix Resolution
```bash
testfold unit auth.test.ts
# Автоматически → tests/unit/auth.test.ts
```

### 13. Plain Text Reporter
Для интеграции с другими инструментами (не markdown, не json)

### 14. STDOUT/STDERR в Failure Reports
Добавить captured output в markdown failure reports

## Сравнение текущего состояния

| Feature | Moira | Supervisor | testfold |
|---------|-------|------------|----------|
| Jest parser | ✅ | ✅ | ✅ |
| Playwright parser | ✅ | ✅ | ✅ |
| Custom parser | ❌ | ❌ | 🔸 схема есть |
| Crashed suite detection | ✅ | ❌ | ✅ (v0.1.1) |
| Retry-aware parsing | ✅ | ✅ | ❌ |
| Framework crash detection | ✅ | ❌ | ❌ |
| Multi-environment | ✅ | ❌ | 🔸 partial |
| Env file routing | ✅ | ❌ | ❌ |
| Fail-fast | ✅ | ✅ | ✅ |
| Parallel execution | ✅ | ❌ | ✅ |
| Hooks lifecycle | ❌ | ❌ | ✅ |
| CLI arg pass-through | ✅ | ✅ | ❌ |
| Timing statistics | ✅ | ❌ | ❌ |
| Per-suite cleanup | ✅ | ❌ | ❌ |
| Artifact inventory | ✅ | ✅ | ❌ |
| JSON reporter | ✅ | ❌ | ✅ |
| Markdown reporter | ✅ | ❌ | ✅ |
| Console reporter | ✅ | ✅ | ✅ |
| Config-driven | ❌ | ❌ | ✅ |
| TypeScript types | ❌ | ❌ | ✅ |
| Programmatic API | ❌ | ❌ | ✅ |

## Архитектурные преимущества testfold

1. **Config-driven** - не hardcoded suites
2. **TypeScript** - полная типизация
3. **Programmatic API** - можно использовать как библиотеку
4. **Hooks** - beforeAll/afterAll/beforeSuite/afterSuite
5. **Extensible** - плагины для parsers/reporters

