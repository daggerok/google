# Глубокий архитектурный обзор — `daggerok/google`

Дата обзора: 2026-07-13  
Роль ревьюера: Solution / Software Architect

## Область обзора

В этом ревью я проверил текущее состояние репозитория с упором на:

- архитектуру приложения
- модель интеграции с Google Sheets
- consistency и concurrency behavior
- security / privacy posture
- maintainability и delivery quality
- зрелость CI / DX / документации

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

## Executive summary

Этот репозиторий выглядит как перспективное **client-side хранилище записей с опциональным Google Sheets backend**. Продуктовая идея понятна: local-first поведение, graceful switch на Google Sheets, отсутствие собственного backend-сервера и практичный CRUD-интерфейс для лёгких записей.

С архитектурной точки зрения я бы классифицировал кодовую базу так:

- **сильный прототип / полезный personal tool**
- **пока не надёжная production-база**

Самые важные проблемы:

1. **основная логика сосредоточена в одном большом файле**
2. **delete / clear для Google Sheets переписывают весь лист и не являются concurrency-safe**
3. **документация неполная и местами некорректная**
4. **слабые quality gates**
5. **toolchain и dependency surface больше, чем реально нужно текущей реализации**
6. **i18n реализован не полностью, хотя приложение заявлено как bilingual**
7. **часть пользовательской / проектной конфигурации сохраняется локально без явной retention-модели**

## Общая оценка

| Направление | Оценка | Комментарий |
|---|---:|---|
| Product usefulness | 8/10 | Понятная и полезная идея для lightweight storage с Google Sheets fallback |
| Architectural maturity | 5/10 | Хороший prototype, но ряд решений будет мешать масштабированию и корректности |
| Maintainability | 4/10 | Single-file архитектура и смешение обязанностей повышают риск изменений |
| Correctness confidence | 5/10 | Сборка проходит, но automated coverage для самых рискованных flows отсутствует |
| Google integration design | 5/10 | Идея рабочая, но delete/concurrency модель хрупкая |
| Security/privacy posture | 6/10 | Токены только в памяти — плюс, но local config retention и scopes стоит пересмотреть |

## Сильные стороны

### 1. Хорошая local-first продуктовая модель
У приложения удачная fallback-стратегия:

- localStorage работает без Google
- Google Sheets — опционален
- переключение backend встроено в сам UX

Это очень практичная форма продукта.

### 2. Хорошее внимание к UX для прототипа
В приложении уже есть полезные UX-фичи:

- light / dark / system theme
- en / ru UI
- toasts и loading states
- search mode и add mode в одном input bar
- pagination с configurable page size
- settings panel с подробным guided setup для Google

### 3. Неплохое направление по token handling
Google access token хранится в памяти через `tokRef`, а не в localStorage, и это хорошее security-решение.

### 4. Сборка сейчас здорова
Приложение успешно собирается и в обычном режиме, и в режиме GitHub Pages, а audit по зависимостям чистый.

---

# Findings

## F-01 — Монолитная архитектура с высокой связностью изменений
**Severity:** High

### Evidence

- `src/main.tsx` содержит ~1,299 строк и внутри него находятся:
  - i18n dictionaries
  - localStorage persistence
  - Google OAuth bootstrapping
  - Google Sheets API helpers
  - datastore abstraction
  - settings UI
  - record list UI
  - keyboard shortcuts
  - app bootstrap
- См. `src/main.tsx:19-41`, `170-445`, `946-1299`.

### Почему это важно

Репозиторий всё ещё находится в фазе “single giant file”. Для первого релиза это ускоряет поставку, но потом сильно бьёт по стоимости изменений:

- domain logic и UI review жёстко связаны
- Google API behavior трудно тестировать изолированно
- любой рефакторинг становится рискованным
- onboarding cost быстро растёт

### Recommendation

Разделить приложение на модули вроде:

- `domain/google-sheets.ts`
- `domain/local-store.ts`
- `domain/auth.ts`
- `domain/i18n.ts`
- `components/SettingsPanel.tsx`
- `components/ToastContainer.tsx`
- `App.tsx`

Поведение продукта можно оставить тем же, но API-логику нужно отделить от rendering слоя.

---

## F-02 — Delete / clear для Google Sheets не являются concurrency-safe
**Severity:** High

### Evidence

- list читает весь лист в память: `src/main.tsx:390-400`
- add просто append'ит новую строку: `src/main.tsx:401-408`
- delete/clear переписывают весь лист: `src/main.tsx:409-425`, `440-443`
- UI delete напрямую завязан на этот flow: `src/main.tsx:1166`

### Почему это важно

Backend-модель асимметрична:

- **create** = append одной строки
- **delete** = прочитать всё → удалить одну запись в памяти → очистить лист → переписать весь dataset
- **clear** = очистить лист

Это очень хрупко в multi-session / multi-user сценариях.

Возможные проблемы:

- два пользователя редактируют одновременно → один может перезаписать изменения другого
- ручные правки прямо в Google Sheets могут потеряться
- на больших листах delete станет дорогой операцией
- нет optimistic concurrency / version check

### Архитектурное влияние

Снаружи приложение выглядит как datastore на базе Google Sheets, но по факту destructive operations ведут себя скорее как rewrite shared CSV-файла.

### Recommendation

Приоритетные улучшения:

1. связать record identity с реальными row references в sheet
2. использовать row-level update/delete, где это возможно, вместо full rewrite
3. добавить conflict detection или хотя бы last-read version awareness
4. явно документировать, что текущий Google backend фактически single-writer / low-concurrency
5. добавить integration tests для concurrent mutation scenarios

---

## F-03 — Документация неполная и частично неправильная
**Severity:** High

### Evidence

- `README.md` фактически пустой: `README.md:1-3`
- badge в README указывает на **csv** repository badge URL, а не на google: `README.md:1`
- header в исходнике говорит, что environment — `Bun, Vite, React, TypeScript, TailwindCSS v4`: `src/main.tsx:20`
- реальные scripts используют **Parcel**: `package.json:10-18`

### Почему это важно

Для приложения с Google integration documentation quality особенно важна, потому что setup не тривиален:

- Cloud Console configuration
- OAuth consent screen
- test users
- scopes
- Pages origin setup
- spreadsheet attach / create flow

Сейчас in-app setup guide намного лучше, чем repository README. Это создаёт governance drift.

### Recommendation

Нужно расширить README и добавить:

- реальный stack и build tool
- инструкции для local run
- Pages deployment instructions
- walkthrough по Google Cloud setup
- security notes
- known limitations Google Sheets backend

И отдельно исправить неправильный CI badge URL.

---

## F-04 — Слабые quality gates: тестов нет, CI проверяет поведение только частично
**Severity:** High

### Evidence

- `package.json` содержит `"test": "jest src"`: `package.json:17`
- `npm test -- --runInBand` падает, потому что тестов нет
- CI гоняет build и `npm-check-updates`, но нет реального test suite или typecheck gate: `.github/workflows/ci.yaml:21-44`

### Почему это важно

Самые рискованные части приложения как раз не имеют repeatable coverage:

- Google auth flow
- spreadsheet attach/create flows
- row serialization / deserialization
- full-sheet rewrite logic
- backend switching behavior
- i18n regressions

### Recommendation

Минимальный test plan:

1. unit tests для utility-функций (`nid`, serialization, pluralization, date formatting guardrails)
2. datastore tests для local backend
3. integration tests для Google Sheets API wrapper через mocked fetch responses
4. CI gates на:
   - tests
   - typecheck
   - build

Опционально следующим шагом — browser E2E smoke tests для connect/switch/add/delete flows.

---

## F-05 — Dependency и toolchain surface больше, чем нужно текущей реализации
**Severity:** Medium

### Evidence

- по source review direct dependencies выглядят неиспользуемыми:
  - `clsx`
  - `lucide-react`
  - `recharts`
  - `tailwind-merge`
- среди dev dependencies тоже есть признаки лишнего:
  - `papaparse`
  - `@types/papaparse`
  - Sass-related packages
- package scripts содержат PM2 management commands, хотя repo по сути статический SPA: `package.json:13-18`

### Почему это важно

Лишний dependency surface увеличивает:

- maintenance cost
- шум при upgrade'ах
- сложность toolchain
- cognitive load для будущих изменений

### Recommendation

1. удалить unused runtime dependencies
2. удалить unused dev dependencies
3. оставить только реально используемые build/runtime tools
4. честно задокументировать текущий toolchain

---

## F-06 — i18n реализован не полностью и местами leaking English в runtime UI
**Severity:** Medium

### Evidence

- приложение заявляет bilingual support в architecture header: `src/main.tsx:24`
- в search result count используется hardcoded English `found`: `src/main.tsx:1257`
- README — только placeholder и не даёт даже базовой bilingual guidance: `README.md:1-3`

### Почему это важно

Это не критичный баг, но снижает product polish. Приложение явно позиционируется как en/ru, поэтому partial localization создаёт ощущение незавершённости.

### Recommendation

1. вынести все user-facing literals в dictionaries
2. добавить маленькую проверку на i18n completeness для common UI strings
3. привести README / setup instructions хотя бы к declared language strategy

---

## F-07 — Локальная persistence хранит пользовательскую / проектную конфигурацию без явной retention-модели
**Severity:** Medium

### Evidence

- config включает `clientId`, `spreadsheetId`, `spreadsheetUrl`, `sheetName`, `lastAccountEmail`: `src/main.tsx:58`, `238`
- config сохраняется в localStorage: `src/main.tsx:241-253`
- silent auth на boot опирается на этот локально сохранённый config: `src/main.tsx:1054-1078`

### Почему это важно

Access token не сохраняется — и это хорошо. Но локальный след всё равно остаётся:

- last email пользователя
- spreadsheet identifiers / URLs
- project configuration

На shared devices это может быть больше retention, чем ожидает пользователь.

### Recommendation

1. явно документировать, что именно сохраняется локально
2. сделать `lastAccountEmail` optional или easy-to-clear
3. добавить visible control для “clear Google config”
4. добавить короткий privacy note в README и settings UI

---

## F-08 — OAuth / API scope strategy стоит пересмотреть с точки зрения least privilege
**Severity:** Medium

### Evidence

- OAuth scopes включают полный доступ к spreadsheets: `src/main.tsx:176`
- приложение умеет создавать spreadsheets и писать записи через Sheets API: `src/main.tsx:347-389`, `401-425`

### Почему это важно

Текущий scope может быть функционально оправдан, но это решение нужно явно перепроверить: действительно ли для всех сценариев нужен именно такой уровень доступа.

### Recommendation

Нужно отдельно проверить, какие минимальные scopes действительно необходимы для:

- attach existing sheet
- create new sheet
- write rows
- read user identity metadata

Если полный Sheets scope действительно нужен, это стоит прямо объяснить в документации.

---

# Recommended roadmap

## Phase 1 — Quick wins (1–2 недели)

- исправить README
- исправить неправильный CI badge URL
- добавить реальные тесты или переопределить `npm test` под текущую политику
- удалить unused dependencies
- довести i18n coverage до конца
- задокументировать local persistence behavior

## Phase 2 — Structural hardening (2–4 недели)

- разделить `main.tsx` на domain/state/UI modules
- добавить unit + integration tests
- добавить явные typecheck/test gates в CI
- улучшить границы абстракций вокруг Google backend

## Phase 3 — Data consistency hardening (4–8 недель)

- переделать delete/update behavior, уйти от full-sheet rewrites
- добавить conflict awareness для concurrent clients
- определить operational limits по row counts и shared editing
- пересмотреть, подходит ли Google Sheets как primary multi-user backend

---

# Финальный архитектурный вердикт

Я бы **одобрил этот репозиторий как полезный prototype / personal productivity tool**.

Но я бы **не утверждал его как stable production-grade collaborative datastore**, пока не решены следующие вопросы:

- full-sheet rewrite semantics для destructive operations
- модульная декомпозиция
- тестовое покрытие
- зрелость документации
- полнота i18n
- dependency hygiene

Коротко:

> Хорошее продуктовое направление, практичная реализация, но следующий этап должен быть про correctness, documentation и backend consistency, а не про добавление новых UI-фич.
