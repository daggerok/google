# Deep Architecture Review — `daggerok/google`

Review date: 2026-07-13  
Reviewer role: Solution / Software Architect

## Scope

This review covers the current state of the repository with focus on:

- application architecture
- Google Sheets integration model
- consistency and concurrency behavior
- security / privacy posture
- maintainability and delivery quality
- CI / DX / documentation maturity

## Validation performed

I validated the repository with the following checks:

- source review of `README.md`, `package.json`, `src/main.tsx`, `src/index.css`, `.github/workflows/ci.yaml`, `.github/workflows/github-pages.yml`
- `npm install --ignore-scripts`
- `npm run build` ✅
- `npm run build-github-pages` ✅
- ad-hoc TypeScript compile of `src/main.tsx` with `tsc --noEmit` ✅
- `npm test -- --runInBand` ❌ — fails because no tests exist
- `npm audit --json` ✅ — no vulnerabilities reported
- `npm audit --omit=dev --json` ✅ — production dependency graph is clean

## Executive summary

This repository is a promising **client-side record store with optional Google Sheets backend**. The product direction is clear: local-first behavior, graceful switch to Google Sheets, no backend server, and a practical CRUD interface for lightweight records.

From an architectural perspective, I would classify the codebase as:

- **strong prototype / useful personal tool**
- **not yet a durable production baseline**

The most important issues are:

1. **core logic is concentrated in one large file**
2. **Google Sheets delete / clear operations rewrite the full sheet and are not concurrency-safe**
3. **documentation is incomplete and partially incorrect**
4. **test / quality gates are weak**
5. **toolchain and dependency surface are larger than current implementation needs**
6. **i18n is incomplete despite claiming bilingual support**
7. **sensitive-ish user/project configuration is persisted locally without an explicit retention model**

## Overall rating

| Dimension | Rating | Notes |
|---|---:|---|
| Product usefulness | 8/10 | Clear and useful concept for lightweight storage with Google Sheets fallback |
| Architectural maturity | 5/10 | Good prototype, but several design choices will hurt scale and correctness |
| Maintainability | 4/10 | Single-file architecture and mixed concerns increase change risk |
| Correctness confidence | 5/10 | Build passes, but no automated tests for highest-risk flows |
| Google integration design | 5/10 | Works conceptually, but deletion/concurrency model is fragile |
| Security/privacy posture | 6/10 | Tokens are memory-only, but local config retention and broad scopes deserve review |

## Key strengths

### 1. Clear local-first product model
The application has a good fallback strategy:

- localStorage works without Google
- Google Sheets is optional
- switching backend is built into the product experience

That is a pragmatic product shape.

### 2. Good UX attention for a prototype
The app already includes valuable UX features:

- light / dark / system theme
- en / ru UI support
- toasts and loading states
- search mode and add mode in one input bar
- pagination with configurable page size
- settings panel with guided Google setup

### 3. Sensible token handling direction
Google access tokens are kept in memory via `tokRef` rather than persisted to localStorage, which is a good security decision.

### 4. Build health is currently good
The app builds successfully in both normal and GitHub Pages modes, and the dependency audit is clean.

---

# Findings

## F-01 — Monolithic architecture with high change coupling
**Severity:** High

### Evidence

- `src/main.tsx` is ~1,299 lines and contains:
  - i18n dictionaries
  - localStorage persistence
  - Google OAuth bootstrapping
  - Google Sheets API helpers
  - datastore abstraction
  - settings UI
  - record list UI
  - keyboard shortcuts
  - app bootstrap
- See `src/main.tsx:19-41`, `170-445`, `946-1299`.

### Why it matters

The repository is still in a “single giant file” phase. That speeds up initial delivery, but it increases long-term cost:

- domain logic and UI reviews are tightly coupled
- Google API behavior is hard to test independently
- refactors become risky because one file owns nearly everything
- onboarding cost rises quickly as the file grows

### Recommendation

Split into modules such as:

- `domain/google-sheets.ts`
- `domain/local-store.ts`
- `domain/auth.ts`
- `domain/i18n.ts`
- `components/SettingsPanel.tsx`
- `components/ToastContainer.tsx`
- `App.tsx`

Keep the product behavior unchanged, but decouple API logic from rendering.

---

## F-02 — Google Sheets delete / clear model is not concurrency-safe
**Severity:** High

### Evidence

- list reads the whole sheet into memory: `src/main.tsx:390-400`
- add appends a new row: `src/main.tsx:401-408`
- delete/clear rewrite the entire sheet: `src/main.tsx:409-425`, `440-443`
- UI delete delegates directly to this flow: `src/main.tsx:1166`

### Why it matters

The backend model is asymmetric:

- **create** = append one row
- **delete** = read all rows → remove one in memory → clear sheet → rewrite full dataset
- **clear** = clear sheet

That is fragile in multi-session or multi-user cases.

Failure modes:

- two users edit at the same time → one can overwrite the other
- manual edits in Google Sheets can be lost
- large sheets will degrade badly because every delete becomes a full rewrite
- no optimistic concurrency / version check exists

### Architectural impact

The repository presents Google Sheets as a datastore, but operationally it behaves more like a shared CSV with whole-file rewrites for destructive operations.

### Recommendation

Preferred improvements:

1. track row identity to actual sheet row references
2. use row-level updates / deletes where possible instead of full rewrites
3. add conflict detection or at least last-read version awareness
4. document that current Google backend is effectively single-writer / low-concurrency
5. add integration tests for concurrent mutation scenarios

---

## F-03 — Documentation is incomplete and partially incorrect
**Severity:** High

### Evidence

- `README.md` is effectively empty: `README.md:1-3`
- README badge image points to the **csv** repository badge URL, not google: `README.md:1`
- source header claims environment is `Bun, Vite, React, TypeScript, TailwindCSS v4`: `src/main.tsx:20`
- actual scripts use **Parcel**: `package.json:10-18`

### Why it matters

For a Google-integrated app, documentation quality matters more than usual because setup is non-trivial:

- Cloud Console configuration
- OAuth consent screen
- test users
- scopes
- Pages origin setup
- spreadsheet attachment / creation flow

Right now the in-app setup guide is much better than the repository README. That creates governance drift.

### Recommendation

Expand README with:

- actual stack and build tool
- local run instructions
- Pages deployment instructions
- Google Cloud setup walkthrough
- security notes
- known limitations of the Google Sheets backend

Also fix the incorrect CI badge URL.

---

## F-04 — Quality gates are weak: tests absent, CI only partially verifies behavior
**Severity:** High

### Evidence

- `package.json` defines `"test": "jest src"`: `package.json:17`
- `npm test -- --runInBand` fails because no tests exist
- CI runs build and `npm-check-updates`, but no actual test suite or typecheck gate: `.github/workflows/ci.yaml:21-44`

### Why it matters

The most failure-prone areas are exactly the parts without repeatable coverage:

- Google auth flow
- spreadsheet attach/create flows
- row serialization / deserialization
- full-sheet rewrite logic
- backend switching behavior
- i18n regressions

### Recommendation

Minimum test plan:

1. unit tests for utility functions (`nid`, serialization, pluralization, date formatting guardrails)
2. datastore tests for local backend
3. integration tests for Google Sheets API wrapper using mocked fetch responses
4. CI gates for:
   - tests
   - typecheck
   - build

Optional next step: browser E2E smoke tests for connect/switch/add/delete flows.

---

## F-05 — Dependency and toolchain surface is larger than the implementation needs
**Severity:** Medium

### Evidence

- direct dependencies appear unused in source review:
  - `clsx`
  - `lucide-react`
  - `recharts`
  - `tailwind-merge`
- dev dependencies appear unused as well:
  - `papaparse`
  - `@types/papaparse`
  - Sass-related packages
- package scripts include PM2 management commands although the repo is primarily a static SPA: `package.json:13-18`

### Why it matters

Unnecessary dependency surface increases:

- maintenance cost
- upgrade noise
- bundle/toolchain complexity
- cognitive load for future contributors

### Recommendation

1. remove unused runtime dependencies
2. remove unused dev dependencies
3. keep only the build/runtime tools actually used by the app
4. document the chosen toolchain clearly

---

## F-06 — i18n is incomplete and leaks English into runtime UI
**Severity:** Medium

### Evidence

- app claims bilingual support in architecture header: `src/main.tsx:24`
- search result count uses hardcoded English `found`: `src/main.tsx:1257`
- README is only a placeholder and provides no bilingual guidance: `README.md:1-3`

### Why it matters

This is not a catastrophic bug, but it weakens product polish. The app is explicitly presented as en/ru, so partial localization creates inconsistency.

### Recommendation

1. move all user-facing literals into dictionaries
2. add a tiny i18n completeness check for common UI strings
3. ensure README / setup instructions are at least consistent with the declared product languages

---

## F-07 — Local persistence stores user/project configuration without explicit retention model
**Severity:** Medium

### Evidence

- config includes `clientId`, `spreadsheetId`, `spreadsheetUrl`, `sheetName`, `lastAccountEmail`: `src/main.tsx:58`, `238`
- config is persisted to localStorage: `src/main.tsx:241-253`
- Google auth silently attempts restore based on stored config: `src/main.tsx:1054-1078`

### Why it matters

This is not storing the access token, which is good. But it still stores a meaningful local footprint:

- the user’s last email address
- spreadsheet identifiers / URLs
- project configuration

On shared devices, that may be more retention than some users expect.

### Recommendation

1. document exactly what is persisted locally
2. consider making `lastAccountEmail` optional or clearable
3. add a visible “clear Google config” control
4. add a small privacy note in README and settings UI

---

## F-08 — OAuth / API scope strategy should be reviewed under least-privilege principle
**Severity:** Medium

### Evidence

- OAuth scopes include full spreadsheets access: `src/main.tsx:176`
- the app can create spreadsheets and write records through the Sheets API: `src/main.tsx:347-389`, `401-425`

### Why it matters

The current scope may be functionally valid, but the review should explicitly ask whether the app needs the broadest possible access model for all scenarios.

### Recommendation

Review whether the chosen scope set is the minimum required for:

- attaching an existing sheet
- creating a new sheet
- writing rows
- reading user identity metadata

If full Sheets scope is necessary, document why.

---

# Recommended roadmap

## Phase 1 — Quick wins (1–2 weeks)

- fix README
- fix incorrect CI badge URL
- add real test or redefine `npm test` to reflect current policy
- remove unused dependencies
- finish i18n coverage for visible strings
- document local persistence behavior

## Phase 2 — Structural hardening (2–4 weeks)

- split `main.tsx` into domain/state/UI modules
- add unit + integration tests
- add explicit typecheck/test gates in CI
- improve Google backend abstraction boundaries

## Phase 3 — Data consistency hardening (4–8 weeks)

- redesign delete/update behavior away from full-sheet rewrites
- add conflict awareness for concurrent clients
- define operational limits for row counts and shared editing
- evaluate whether Google Sheets remains the right primary multi-user backend

---

# Final architectural verdict

I would **approve this repository as a useful prototype / personal productivity tool**.

I would **not yet approve it as a stable production-grade collaborative datastore** without first addressing:

- full-sheet rewrite delete semantics
- modularization
- test coverage
- documentation maturity
- i18n completeness
- dependency hygiene

In short:

> Good product direction, practical implementation, but the next stage should focus on correctness, documentation, and backend consistency rather than adding more UI features.
