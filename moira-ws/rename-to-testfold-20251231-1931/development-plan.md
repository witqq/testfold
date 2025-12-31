# Rename Project to testfold

## Problem Statement

Проект называется claude-test-runner, но название содержит "claude" что нежелательно для публикации в npm. Нужно переименовать в testfold и опубликовать как независимый npm-пакет.

## Business Value

Нейтральное название позволит публиковать пакет в npm registry без привязки к бренду Claude. Другие проекты смогут использовать testfold как зависимость через package.json.

## Expected Outcome

- Репозиторий на GitHub называется testfold
- npm-пакет публикуется под именем testfold
- CLI команда называется testfold
- Все упоминания claude-test-runner заменены
- Пакет можно установить через `npm install testfold`

## Architecture

Изменения затрагивают только метаданные и документацию:

```
GitHub Repo: mike/claude-test-runner → mike/testfold
    ↓
Git Remote: origin URL обновляется
    ↓
package.json: name, bin, repository
    ↓
Документация: README, CLAUDE.md
    ↓
CLI: help text, version output
    ↓
npm publish: публикация в registry
```

Код приложения не меняется. Все экспорты, интерфейсы и функциональность остаются прежними.

## Step 1: Переименовать репозиторий на GitHub и обновить git remote

Переименовать репозиторий claude-test-runner в testfold через GitHub CLI. Обновить локальный git remote origin на новый URL.

Проверка: `git remote -v` показывает URL с testfold, `git fetch` работает без ошибок.

## Step 2: Обновить package.json и CLI

Изменить в package.json:
- name: claude-test-runner → testfold
- bin: test-runner → testfold
- repository.url на новый GitHub URL

Обновить CLI help text и version output чтобы отображали testfold.

Проверка: `npm run build` успешен, `node dist/cli/index.js --version` показывает testfold, `--help` показывает testfold.

## Step 3: Обновить документацию

Заменить все упоминания claude-test-runner на testfold в README.md и CLAUDE.md. Обновить примеры установки и использования.

Проверка: grep по проекту не находит claude-test-runner (кроме node_modules).

## Step 4: Настроить и выполнить npm publish

Убедиться что package.json содержит все необходимые поля для npm (author, license, keywords). Выполнить npm publish для публикации в registry.

Проверка: пакет виден на npmjs.com/package/testfold, `npm info testfold` возвращает данные.
