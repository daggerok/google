# Глубокий архитектурный обзор — `daggerok/google`

Дата обзора: 2026-07-13  
Роль ревьюера: Solution / Software Architect

## Область обзора

В этом ревью я проверил репозиторий с упором на:

- архитектуру приложения
- модель интеграции с Google Sheets
- consistency и concurrency behavior
- security / privacy posture
- maintainability и delivery quality
- зрелость CI / DX

## Что было провалидировано

Я выполнил следующие проверки:

- ревью исходников `README.md`, `package.json`, `src/main.tsx`, `src/index.css`, `.github/workflows/ci.yaml`, `.github/workflows/github-pages.yml`
- `npm install --ignore-scripts`
- `npm run build` ✅
- `npm run build-github-pages` ✅
- ad-hoc TypeScript compile для `src/main.tsx` через `tsc --noEmit` ✅
- `npm test -- --runInBand` ❌ — падает, потому что тестов нет
- `npm audit --json` ✅ — уязвимостей не найдено
- `npm audit --omit=dev --json` ✅ — production dependency graph чистый

## Архитектурный контекст / принятые ограничения

В этом проекте основное приложение намеренно хранится в одном self-contained файле `src/main.tsx`. Это явное проектное требование, поэтому такой подход рассматривается как **принятое ограничение дизайна**, а не как открытая проблема.

В рамках текущего цикла ревью также были исправлены и поэтому **не повторяются ниже как незакрытые findings**:

- полнота / корректность README
- избыточный dependency surface
- неполное покрытие видимого i18n, отмеченное в первой версии ревью

## Executive summary

Этот репозиторий — полезное **local-first хранилище записей с опциональным Google Sheets backend**. Продуктовая форма практична и понятна:

- localStorage работает сразу
- Google Sheets подключается по желанию
- приложение остаётся статическим SPA и хорошо подходит для GitHub Pages

С архитектурной точки зрения я бы классифицировал кодовую базу так:

- **сильный prototype / полезный personal tool**
- **пока не надёжный collaborative production datastore**

Главные оставшиеся риски:

1. destructive operations в Google Sheets переписывают весь лист
2. по-прежнему нет automated test coverage для самых рискованных сценариев
3. локально сохраняемая Google/project конфигурация не имеет явной retention-модели
4. OAuth scope model всё ещё стоит перепроверить с точки зрения least privilege

## Общая оценка

| Направление | Оценка | Комментарий |
|---|---:|---|
| Product usefulness | 8/10 | Понятная и полезная идея для lightweight storage с Google Sheets fallback |
| Architectural maturity | 6/10 | Хороший prototype с удобным UX, но остаются backend consistency risks |
| Maintainability | 6/10 | Single-file по требованию, но repository hygiene теперь лучше согласован |
| Correctness confidence | 5/10 | Сборка проходит, но критические flows всё ещё без automated tests |
| Google integration design | 5/10 | Идея рабочая, но destructive operations по-прежнему хрупкие |
| Security/privacy posture | 6/10 | Токены только в памяти, но config retention и ширина scopes требуют review |

## Сильные стороны

### 1. Хорошая local-first продуктовая модель
Fallback-стратегия удачная:

- localStorage работает сразу
- Google Sheets опционален
- backend switching встроен в сам UX продукта

### 2. Сильный prototype UX
В приложении уже есть:

- en / ru UI
- light / dark / system theme
- search и add modes в одном input bar
- pagination
- settings-driven guide для Google setup
- toasts и loading feedback

### 3. Хорошее направление по token handling
Google access token хранится в памяти, а не в localStorage.

### 4. Build и dependency hygiene стали лучше
Проект успешно собирается, Pages build работает, TypeScript compile проходит, dependency audit чистый.

---

# Findings

## F-01 — Delete / clear для Google Sheets не являются concurrency-safe
**Severity:** High

### Evidence

- list читает весь лист в память: `src/main.tsx:390-400`
- add appends одну строку: `src/main.tsx:401-408`
- delete/clear переписывают весь лист: `src/main.tsx:409-425`, `440-443`
- UI delete напрямую использует этот flow: `src/main.tsx:1166`

### Почему это важно

Backend-модель асимметрична:

- **create** = append одной строки
- **delete** = прочитать всё → удалить одну запись в памяти → очистить лист → переписать весь dataset
- **clear** = очистить лист

Это хрупко для multi-session и multi-user сценариев.

Потенциальные проблемы:

- один пользователь может затереть недавние изменения другого
- ручные правки прямо в Google Sheets могут потеряться
- по мере роста числа строк performance будет деградировать
- нет optimistic concurrency / version check

### Recommendation

Приоритетные улучшения:

1. привязать record identity к реальным row references, где это возможно
2. использовать row-level update/delete вместо full-sheet rewrites
3. добавить conflict awareness или last-read version checks
4. явно документировать, что текущий Google backend лучше подходит для low-concurrency usage
5. добавить integration tests для concurrent mutation scenarios

---

## F-02 — Quality gates всё ещё слабые
**Severity:** High

### Evidence

- `package.json` всё ещё содержит `"test": "jest src"`: `package.json:17`
- `npm test -- --runInBand` падает, потому что тестов нет
- CI собирает приложение и проверяет upgrade viability, но не запускает реальный automated test suite и явный typecheck gate: `.github/workflows/ci.yaml:21-44`

### Почему это важно

Самые рискованные части приложения всё ещё без repeatable verification:

- Google auth flow
- spreadsheet attach/create flows
- serialization / deserialization записей
- backend switching behavior
- destructive rewrite logic

### Recommendation

Минимальный следующий шаг:

1. добавить unit tests для utility-функций и local store behavior
2. добавить mocked integration tests для Google Sheets API helpers
3. добавить CI gates на:
   - tests
   - typecheck
   - build

Опционально следующим шагом — browser E2E smoke tests.

---

## F-03 — Локальная persistence сохраняет Google/project конфигурацию без явной retention-модели
**Severity:** Medium

### Evidence

- config включает `clientId`, `spreadsheetId`, `spreadsheetUrl`, `sheetName`, `lastAccountEmail`: `src/main.tsx:58`, `238`
- config сохраняется в localStorage: `src/main.tsx:241-253`
- silent auth boot logic зависит от сохранённого config: `src/main.tsx:1054-1078`

### Почему это важно

Access token **не** сохраняется, и это хорошо. Но локально всё равно остаётся meaningful metadata:

- last account email
- spreadsheet identifier / URL
- project configuration

На shared devices это может быть больше retention, чем пользователь ожидает.

### Recommendation

1. явно документировать, что именно сохраняется локально
2. сделать `lastAccountEmail` optional или easy-to-clear
3. добавить visible control для “clear Google config”
4. сохранить короткий privacy note в README и settings UX

---

## F-04 — OAuth / API scope strategy всё ещё стоит перепроверить с точки зрения least privilege
**Severity:** Medium

### Evidence

- OAuth scopes включают полный доступ к spreadsheets: `src/main.tsx:176`
- приложение умеет создавать spreadsheets и писать записи через Sheets API: `src/main.tsx:347-389`, `401-425`

### Почему это важно

Выбранный scope может быть оправдан функционально, но его всё равно стоит явно проверить как минимально необходимую модель доступа.

### Recommendation

Нужно перепроверить, являются ли текущие scopes минимально достаточными для:

- attach existing sheet
- create new sheet
- write records
- read user identity metadata

Если полный Sheets scope действительно необходим, это стоит прямо документировать.

---

# Recommended roadmap

## Phase 1 — Quick wins (1–2 недели)

- добавить реальную test baseline или явно зафиксировать test policy
- добавить понятный “reset Google config” UX path
- более явно задокументировать local retention behavior в UI и README

## Phase 2 — Correctness hardening (2–4 недели)

- добавить mocked integration tests для Google API helpers
- добавить typecheck / test gates в CI
- явно задокументировать concurrency limits Google backend

## Phase 3 — Data consistency hardening (4–8 недель)

- переделать delete/update behavior, уйти от full-sheet rewrites
- добавить conflict awareness для concurrent clients
- определить operational limits по row-count / collaboration model

---

# Финальный архитектурный вердикт

Я бы **одобрил этот репозиторий как полезный prototype / personal productivity tool**.

Но я бы **не утверждал его как stable collaborative production datastore**, пока не усилены Google Sheets mutation model и automated correctness coverage.

Коротко:

> Хорошее продуктовое направление и практичная реализация, а основной оставшийся архитектурный риск сосредоточен в backend consistency и отсутствии automated verification.
