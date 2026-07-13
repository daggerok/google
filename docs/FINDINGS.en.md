# Deep Architecture Review — `daggerok/google`

Review date: 2026-07-13  
Reviewer role: Solution / Software Architect

## Scope

This review covers the repository with focus on:

- application architecture
- Google Sheets integration model
- consistency and concurrency behavior
- security / privacy posture
- maintainability and delivery quality
- CI / DX maturity

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

## Architectural context / accepted constraints

The repository intentionally keeps the main application self-contained in a single `src/main.tsx` file. That is an explicit project requirement and is therefore treated as an accepted design constraint, not an open finding.

During this review cycle the following issues were also addressed and are **not** repeated below as unresolved findings:

- README completeness / correctness
- oversized dependency surface
- incomplete visible i18n coverage called out in the initial review

## Executive summary

This repository is a useful **local-first record store with optional Google Sheets backend**. The product direction is practical and coherent:

- localStorage works without Google
- Google Sheets is optional
- the app remains a static SPA and deploys well to GitHub Pages

From an architectural perspective, I would classify the codebase as:

- **strong prototype / useful personal tool**
- **not yet a robust collaborative production datastore**

The most important remaining concerns are:

1. Google Sheets destructive operations rewrite the entire sheet
2. there is still no automated test coverage for the highest-risk behavior
3. locally persisted Google configuration has no explicit retention / privacy model
4. OAuth scope usage should still be reviewed under least-privilege principles

## Overall rating

| Dimension | Rating | Notes |
|---|---:|---|
| Product usefulness | 8/10 | Clear and useful concept for lightweight storage with Google Sheets fallback |
| Architectural maturity | 6/10 | Good prototype with a practical UX, but backend consistency risks remain |
| Maintainability | 6/10 | Single-file by design, but repository hygiene is now better aligned |
| Correctness confidence | 5/10 | Build passes, but critical flows still lack automated tests |
| Google integration design | 5/10 | Works conceptually, but destructive operations are still fragile |
| Security/privacy posture | 6/10 | Tokens are memory-only, but config retention and scope breadth deserve review |

## Key strengths

### 1. Clear local-first product model
The fallback strategy is good:

- localStorage works immediately
- Google Sheets is optional
- backend switching is part of the product UX

### 2. Strong prototype UX
The app already includes:

- en / ru UI
- light / dark / system theme
- search and add modes in one input bar
- pagination
- settings-driven Google setup guidance
- toasts and loading feedback

### 3. Good token handling direction
Google access tokens are kept in memory rather than persisted to localStorage.

### 4. Build and dependency hygiene are now in better shape
The project builds successfully, the Pages build works, TypeScript compile passes, and the dependency audit is clean.

---

# Findings

## F-01 — Google Sheets delete / clear model is not concurrency-safe
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

This is fragile in multi-session or multi-user scenarios.

Potential failure modes:

- one user overwrites another user’s recent changes
- manual edits in Google Sheets can be lost
- performance degrades as row count grows
- no optimistic concurrency / version check exists

### Recommendation

Priority improvements:

1. map record identity to actual row references where possible
2. use row-level updates / deletes instead of full-sheet rewrites
3. add conflict awareness or last-read version checks
4. document current Google backend as best suited to low-concurrency usage
5. add integration tests for concurrent mutation scenarios

---

## F-02 — Quality gates remain weak
**Severity:** High

### Evidence

- `package.json` still defines `"test": "jest src"`: `package.json:17`
- `npm test -- --runInBand` fails because no tests exist
- CI builds the app and checks upgrade viability, but does not run a real automated test suite or explicit typecheck gate: `.github/workflows/ci.yaml:21-44`

### Why it matters

The most failure-prone parts of the app still lack repeatable verification:

- Google auth flow
- spreadsheet attach/create flows
- serialization / deserialization of rows
- backend switching behavior
- destructive rewrite logic

### Recommendation

Minimum next step:

1. add unit tests for utility functions and local store behavior
2. add mocked integration tests for Google Sheets API helpers
3. add CI gates for:
   - tests
   - typecheck
   - build

Optional next step: browser E2E smoke tests.

---

## F-03 — Local persistence stores Google/project configuration without an explicit retention model
**Severity:** Medium

### Evidence

- config includes `clientId`, `spreadsheetId`, `spreadsheetUrl`, `sheetName`, `lastAccountEmail`: `src/main.tsx:58`, `238`
- config is persisted to localStorage: `src/main.tsx:241-253`
- silent auth boot logic depends on the stored config: `src/main.tsx:1054-1078`

### Why it matters

This does **not** store the access token, which is good. However, it still preserves meaningful local metadata:

- last account email
- spreadsheet identifier / URL
- project configuration

On shared devices, that may be more retention than some users expect.

### Recommendation

1. document exactly what is persisted locally
2. consider making `lastAccountEmail` optional or easy to clear
3. add a visible “clear Google config” control
4. keep a short privacy note in the README and settings UX

---

## F-04 — OAuth / API scope strategy should still be reviewed under least-privilege principles
**Severity:** Medium

### Evidence

- OAuth scopes include full spreadsheets access: `src/main.tsx:176`
- the app can create spreadsheets and write records through Sheets API: `src/main.tsx:347-389`, `401-425`

### Why it matters

The chosen scope may be valid for the current feature set, but it should still be explicitly justified as the minimum required access model.

### Recommendation

Review whether the current scopes are the minimum necessary for:

- attaching an existing sheet
- creating a new sheet
- writing records
- reading user identity metadata

If full Sheets scope is required, document why.

---

# Recommended roadmap

## Phase 1 — Quick wins (1–2 weeks)

- add a real test baseline or redefine test policy explicitly
- add a clear “reset Google config” UX path
- document local retention behavior in UI and README more explicitly

## Phase 2 — Correctness hardening (2–4 weeks)

- add mocked integration tests for Google API helpers
- add typecheck / test gates to CI
- document Google backend concurrency limitations clearly

## Phase 3 — Data consistency hardening (4–8 weeks)

- redesign delete/update behavior away from full-sheet rewrites
- add conflict awareness for concurrent clients
- define operational row-count / collaboration limits for this backend model

---

# Final architectural verdict

I would **approve this repository as a useful prototype / personal productivity tool**.

I would **not yet approve it as a stable collaborative production datastore** until the Google Sheets mutation model and automated correctness coverage are strengthened.

In short:

> Good product direction and a practical implementation, with the remaining architectural risk concentrated mostly in backend consistency and lack of automated verification.
