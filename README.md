# Google Sheets Store [![CI](https://github.com/daggerok/google/actions/workflows/ci.yaml/badge.svg)](https://github.com/daggerok/google/actions/workflows/ci.yaml)

A local-first single-page React application for storing short records in either:

- **browser localStorage**, or
- **Google Sheets** as a lightweight cloud-backed datastore.

The app is built as a static client-side SPA and can be deployed to GitHub Pages.

## Features

- local-first storage with optional Google Sheets backend
- English / Russian UI
- light / dark / system theme
- animated settings panel with guided Google setup notes
- add mode and search mode in a single input bar
- pagination with configurable page size
- toast notifications and loading indicators
- keyboard shortcuts for escape / refresh flows
- GitHub Pages-ready build

## Actual tech stack

- **Frontend:** React 19 + TypeScript
- **Bundler:** Parcel 2
- **Styling:** Tailwind CSS v4
- **Runtime in CI / Pages builds:** Bun
- **Optional cloud backend:** Google Sheets API + Google Identity Services

> Note: the project currently uses **Parcel**, not Vite.

## Local development

### Option A — npm

```bash
npm install
npm run serve
```

Parcel starts the local dev server, typically on:

- `http://localhost:1234`

### Option B — Bun

```bash
bun install -E
bun run serve
```

## Production build

### Regular build

```bash
npm run build
```

### GitHub Pages build

```bash
npm run build-github-pages
```

The GitHub Pages build uses the correct public path for this repository:

- `/google/`

## How storage works

### localStorage mode

- works without any Google setup
- keeps records only in the current browser
- clearing browser storage removes the records
- useful as the default / fallback backend

### Google Sheets mode

- requires a Google Cloud OAuth Client ID
- can attach an existing spreadsheet or create a new one
- stores records in a sheet tab with these headers:

```text
id | text | createdAt | updatedAt
```

## Google setup

### 1. Create a Google Cloud project
Open:

- `https://console.cloud.google.com/`

### 2. Enable Google Sheets API
Enable **Google Sheets API** for the project.

### 3. Configure OAuth consent screen
Use an **External** app configuration.

Important:

- add your own Google account under **Test users**
- otherwise Google can reject the auth flow with 403 during testing

### 4. Configure scopes
The app currently uses Google Sheets access plus identity scopes.

### 5. Create a Web OAuth Client ID
Add JavaScript origins for both local development and GitHub Pages.

Typical origins:

```text
http://localhost:1234
https://YOUR-USERNAME.github.io
```

### 6. Connect the app
In the app settings:

- paste the **OAuth Client ID**
- provide a **Spreadsheet ID** or full spreadsheet URL
- choose the target sheet tab name
- or create a new spreadsheet directly from the app

## Security notes

- **Client ID is public** and safe to place in the browser app
- **Do not use a Client Secret** in this project
- access tokens are kept **in memory only**
- app configuration such as spreadsheet ID / URL is persisted locally in browser storage
- each user authenticates with their own Google account

## Known limitations

- the app is intentionally implemented as a **single-file main application** by project design
- automated unit / integration tests are not implemented yet
- Google Sheets destructive operations are better suited to low-concurrency usage than heavy collaborative editing

## GitHub Pages

This repository is configured to build and deploy as a static site with GitHub Actions.

Repository settings requirement:

- **Settings → Pages → Build and deployment → GitHub Actions**

Published site:

- `https://daggerok.github.io/google/`

## CI

Current workflows cover:

- regular app build
- GitHub Pages build
- dependency update verification via `npm-check-updates`

## License

MIT
