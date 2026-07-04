// main.tsx
/**
 * ============================================================================
 * AGENTIC AI ENFORCED SPECIFICATION & GUIDELINES (CRITICAL)
 * ============================================================================
 * 1. PERSIST ALL COMMENTS: Under no circumstances should ANY code comments,
 * system design docs, or type descriptors be removed or truncated.
 * 2. AGENT READ-WRITE RULE: If a future deployment or agent updates the code,
 * this header section and related documentation blocks MUST be kept accurate,
 * expanded, and dynamically synchronized with the feature upgrades.
 * 3. SINGLE-FILE CONTINUITY: Keep the core architecture completely self-contained
 * within this file to maximize maintainability for automated development pipelines.
 * ============================================================================
 *
 * ============================================================================
 * AGENTIC AI DOCUMENTATION & SYSTEM ARCHITECTURE
 * ============================================================================
 *
 * PROJECT: Google Sheets Store
 * ENVIRONMENT: Bun, Vite, React, TypeScript, TailwindCSS v4
 *
 * MODULES & FEATURES:
 *
 * 1. [i18n — Internationalization System]
 * - Two supported locales: 'en' (default) and 'ru'.
 * - All user-facing strings stored in flat dictionary keyed by locale.
 * - `useT()` hook returns a `t(key)` function resolved against current locale.
 * - Language preference persisted in AppConfig → localStorage.
 *
 * 2. [Theme System]
 * - Supports 'light', 'dark', and 'system' (auto-detect from browser).
 * - Persisted to localStorage under app config key.
 * - Applied by toggling `.dark` class on <html> element.
 * - Quick-access toggle in header; full selection in Settings → General.
 *
 * 3. [Settings Panel with Open/Close Animation]
 * - Toggled from header gear icon.
 * - Open: `animate-slide-down`. Close: `animate-slide-up` then unmount.
 * - Sections: General (theme, language, backend), Local Storage tab, Google Sheets tab.
 *
 * 4. [Unified Data Layer — Backend-Agnostic CRUD Interface]
 * - `DataStore` interface: list(), add(text), remove(id), clear()
 * - `createLocalDataStore` — localStorage implementation.
 * - `createGoogleSheetsDataStore` — Google Sheets API implementation.
 * - App components interact ONLY through the DataStore interface.
 * - Active DataStore is selected based on auth state + config.
 *
 * 5. [Google OAuth SPA Token Flow]
 * - Uses Google Identity Services (GIS) token client in the browser.
 * - Access tokens kept memory-only (useRef), NEVER persisted to localStorage.
 * - Config (client ID, spreadsheet ID, sheet name) IS persisted.
 * - On boot: attempts silent re-auth if config.preferredBackend === 'google'.
 * - Interactive auth triggered from Settings → Google Sheets → Connect.
 *
 * 6. [Google Sheets API Operations]
 * - ensureSheet: verifies/creates target tab, writes header row.
 * - list: reads A2:D from sheet, parses into AppRecord[].
 * - add: appends row via values:append.
 * - remove/clear: rewrites all rows (clear A2:D then PUT remaining).
 * - createSpreadsheet: creates new spreadsheet + initializes schema.
 *
 * 7. [Debug Mode]
 * - Activated via `?debug=true` URL query parameter.
 * - Verbose console logging prefixed with `[DBG]`.
 *
 * DESIGN PATTERNS:
 * - Single File Application: Everything self-contained.
 * - Public Static Hosting Safe-by-Design: only public OAuth identifiers stored.
 * - Custom SVGs inline to avoid dependency bloat.
 * - Backend-agnostic data layer: all CRUD through unified interface.
 * - All UI text through i18n dictionary.
 * ============================================================================
 */

// @ts-ignore
import React, { useState, useEffect, useRef, useMemo, useCallback, ChangeEvent } from 'react';
import { createRoot } from 'react-dom/client';

// ============================================================================
// TYPES
// ============================================================================

/** Supported locales for i18n */
type Locale = 'en' | 'ru';

/** Theme preference: explicit light/dark or follow browser */
type ThemePreference = 'light' | 'dark' | 'system';

/** Which storage backend is active */
type BackendMode = 'local' | 'google';

/** A single data record — schema is intentionally generic */
type AppRecord = {
    id: string;
    text: string;
    createdAt: string;
    updatedAt: string;
};

type GoogleConfig = {
    clientId: string;
    spreadsheetId: string;
    spreadsheetUrl: string;
    sheetName: string;
    lastAccountEmail: string;
};

/** Full app configuration persisted in localStorage */
type AppConfig = {
    locale: Locale;
    theme: ThemePreference;
    preferredBackend: BackendMode;
    localStorageKey: string;
    settingsOpen: boolean;
    settingsTab: 'local' | 'google';
    google: GoogleConfig;
};

/**
 * Unified data store interface.
 * Both localStorage and Google Sheets backends must conform to this contract.
 */
type DataStore = {
    list: () => Promise<AppRecord[]>;
    add: (text: string) => Promise<AppRecord>;
    remove: (id: string) => Promise<void>;
    clear: () => Promise<void>;
};

/** Google Identity Services types */
type GisTokenResponse = {
    access_token?: string;
    error?: string;
    expires_in?: number;
};

type GisErrorResponse = {
    type?: string;
    message?: string;
};

type GisTokenClient = {
    requestAccessToken: (opts?: { prompt?: string }) => void;
};

type GisNamespace = {
    accounts: {
        oauth2: {
            initTokenClient: (cfg: {
                client_id: string;
                scope: string;
                callback: (r: GisTokenResponse) => void;
                error_callback?: (e: GisErrorResponse) => void;
            }) => GisTokenClient;
            revoke: (token: string, cb?: () => void) => void;
        };
    };
};

declare global {
    interface Window {
        google?: GisNamespace;
    }
}

// ============================================================================
// i18n DICTIONARY
// ============================================================================

/**
 * All user-facing strings keyed by dot-notation.
 * Every key must exist in BOTH locales.
 */
const DICTIONARIES: Record<Locale, Record<string, string>> = {
    en: {
        /* Header */
        'header.title': 'Google Sheets Store',
        'header.settings': 'Settings',
        'header.theme': 'Theme',

        /* Settings panel */
        'settings.title': 'Settings',
        'settings.general': 'General',
        'settings.theme': 'Theme',
        'settings.theme.light': 'Light',
        'settings.theme.dark': 'Dark',
        'settings.theme.system': 'System',
        'settings.language': 'Language',
        'settings.language.en': 'English',
        'settings.language.ru': 'Русский',
        'settings.backend': 'Active backend',
        'settings.backend.local': 'localStorage (local storage)',
        'settings.backend.google': 'Google Sheets (if connected)',

        /* Settings tabs */
        'settings.tab.local': 'Local Storage',
        'settings.tab.google': 'Google Sheets',

        /* Local storage tab */
        'local.how.title': 'How it works',
        'local.how.1': 'All data is stored in your browser\'s localStorage.',
        'local.how.2': 'Data never leaves your device and is not synced across browsers.',
        'local.how.3': 'Clearing browser data will delete all records.',
        'local.how.4': 'Storage limit is typically ~5–10 MB (depends on browser).',
        'local.storageKey': 'Storage key',
        'local.recordCount': 'Records',
        'local.clearAll': 'Clear all records',

        /* Google Sheets tab */
        'google.setup.title': '📋 How to set up Google Sheets as a datastore',
        'google.setup.step1': 'Create a project in Google Cloud Console',
        'google.setup.step1.detail': 'Go to console.cloud.google.com → create a new project (any name).',
        'google.setup.step2': 'Enable Google Sheets API',
        'google.setup.step2.detail': 'APIs & Services → Library → find "Google Sheets API" → Enable.',
        'google.setup.step3': 'Configure OAuth consent screen',
        'google.setup.step3.detail': 'APIs & Services → OAuth consent screen → type "External". Fill in: App name, Support email, Developer contact.',
        'google.setup.step3.scopes': 'Scopes: add',
        'google.setup.step4': 'Create OAuth Client ID',
        'google.setup.step4.detail': 'APIs & Services → Credentials → Create Credentials → OAuth client ID. Type: Web application.',
        'google.setup.step4.origins': 'Authorized JavaScript origins — add:',
        'google.setup.step4.origins.dev': '(for development)',
        'google.setup.step4.origins.prod': '(for GitHub Pages)',
        'google.setup.step5': 'Copy the Client ID',
        'google.setup.step5.detail': '(looks like 123...apps.googleusercontent.com) and paste it below.',
        'google.security.title': '🔒 Security',
        'google.security.1': 'Client ID is a public identifier. Safe to store in code and localStorage.',
        'google.security.2': 'Client Secret — NEVER enter or store here. Not needed for browser-only apps.',
        'google.security.3': 'Access token is kept in memory only, never written to localStorage.',
        'google.security.4': 'Each user works with their own Google account and spreadsheets.',
        'google.clientId': 'Google OAuth Client ID',
        'google.clientId.placeholder': '1234567890-xxxxxxxx.apps.googleusercontent.com',
        'google.clientId.hint': 'Public identifier. NOT to be confused with Client Secret.',
        'google.spreadsheetId': 'Spreadsheet ID or full URL',
        'google.spreadsheetId.placeholder': 'https://docs.google.com/spreadsheets/d/... or ID',
        'google.sheetName': 'Sheet tab name',
        'google.connectedDoc': 'Connected document',
        'google.headers.info': 'The first row of the selected tab is reserved for headers:',
        'google.status.notConnected': 'Not connected to Google',
        'google.status.connected': 'Connected as',
        'google.btn.connect': 'Connect Google',
        'google.btn.reconnect': 'Reconnect',
        'google.btn.disconnect': 'Disconnect',
        'google.btn.attachSheet': 'Attach this spreadsheet',
        'google.btn.createSheet': 'Create new spreadsheet',
        'google.btn.switchToGoogle': 'Use Google Sheets as backend',
        'google.btn.switchToLocal': 'Switch back to localStorage',
        'google.newSheetTitle': 'New spreadsheet title',
        'google.newSheetTitle.placeholder': 'My Data Store',
        'google.error.noClientId': 'Enter Google OAuth Client ID first.',
        'google.error.noSpreadsheet': 'Enter Spreadsheet ID or URL, or create a new spreadsheet.',
        'google.msg.connecting': 'Connecting to Google...',
        'google.msg.connected': 'Connected to Google.',
        'google.msg.disconnected': 'Disconnected from Google. Using localStorage.',
        'google.msg.sheetAttached': 'Spreadsheet attached and ready.',
        'google.msg.sheetCreated': 'New spreadsheet created and attached.',
        'google.msg.switchedToGoogle': 'Switched to Google Sheets backend.',
        'google.msg.switchedToLocal': 'Switched to localStorage backend.',

        /* Data section */
        'data.placeholder': 'New record...',
        'data.add': 'Add',
        'data.reload': 'Reload',
        'data.col.index': '#',
        'data.col.text': 'Text',
        'data.col.created': 'Created',
        'data.col.actions': '',
        'data.empty': 'Nothing here yet. Add your first record.',
        'data.delete': 'Delete',

        /* Backend badge */
        'backend.badge.local': 'localStorage',
        'backend.badge.google': 'Google Sheets',

        /* Pluralization helper for record count */
        'data.records.0': 'records',
        'data.records.1': 'record',
        'data.records.few': 'records',
        'data.records.many': 'records',

        /* Debug */
        'debug.title': '🐛 Debug info',
    },
    ru: {
        /* Header */
        'header.title': 'Google Sheets Store',
        'header.settings': 'Настройки',
        'header.theme': 'Тема',

        /* Settings panel */
        'settings.title': 'Настройки',
        'settings.general': 'Общие',
        'settings.theme': 'Тема',
        'settings.theme.light': 'Светлая',
        'settings.theme.dark': 'Тёмная',
        'settings.theme.system': 'Системная',
        'settings.language': 'Язык',
        'settings.language.en': 'English',
        'settings.language.ru': 'Русский',
        'settings.backend': 'Активный backend',
        'settings.backend.local': 'localStorage (локальное хранилище)',
        'settings.backend.google': 'Google Sheets (если подключён)',

        /* Settings tabs */
        'settings.tab.local': 'Local Storage',
        'settings.tab.google': 'Google Sheets',

        /* Local storage tab */
        'local.how.title': 'Как это работает',
        'local.how.1': 'Все данные хранятся в localStorage вашего браузера.',
        'local.how.2': 'Данные не покидают ваше устройство и не синхронизируются между браузерами.',
        'local.how.3': 'При очистке данных браузера записи будут потеряны.',
        'local.how.4': 'Лимит хранилища обычно ~5–10 МБ (зависит от браузера).',
        'local.storageKey': 'Ключ хранилища',
        'local.recordCount': 'Записей',
        'local.clearAll': 'Очистить все записи',

        /* Google Sheets tab */
        'google.setup.title': '📋 Как настроить Google Sheets как хранилище',
        'google.setup.step1': 'Создайте проект в Google Cloud Console',
        'google.setup.step1.detail': 'Перейдите на console.cloud.google.com → создайте новый проект (любое имя).',
        'google.setup.step2': 'Включите Google Sheets API',
        'google.setup.step2.detail': 'APIs & Services → Library → найдите «Google Sheets API» → Enable.',
        'google.setup.step3': 'Настройте OAuth consent screen',
        'google.setup.step3.detail': 'APIs & Services → OAuth consent screen → тип «External». Заполните: App name, Support email, Developer contact.',
        'google.setup.step3.scopes': 'Scopes: добавьте',
        'google.setup.step4': 'Создайте OAuth Client ID',
        'google.setup.step4.detail': 'APIs & Services → Credentials → Create Credentials → OAuth client ID. Тип: Web application.',
        'google.setup.step4.origins': 'Authorized JavaScript origins — добавьте:',
        'google.setup.step4.origins.dev': '(для разработки)',
        'google.setup.step4.origins.prod': '(для GitHub Pages)',
        'google.setup.step5': 'Скопируйте Client ID',
        'google.setup.step5.detail': '(выглядит как 123...apps.googleusercontent.com) и вставьте в поле ниже.',
        'google.security.title': '🔒 Безопасность',
        'google.security.1': 'Client ID — публичный идентификатор. Безопасно хранить в коде и localStorage.',
        'google.security.2': 'Client Secret — НИКОГДА не вводите здесь. Не нужен для browser-only приложений.',
        'google.security.3': 'Access token хранится только в памяти, никогда не записывается в localStorage.',
        'google.security.4': 'Каждый пользователь работает со своим Google аккаунтом и таблицами.',
        'google.clientId': 'Google OAuth Client ID',
        'google.clientId.placeholder': '1234567890-xxxxxxxx.apps.googleusercontent.com',
        'google.clientId.hint': 'Публичный идентификатор. НЕ путать с Client Secret.',
        'google.spreadsheetId': 'Spreadsheet ID или полная ссылка',
        'google.spreadsheetId.placeholder': 'https://docs.google.com/spreadsheets/d/... или ID',
        'google.sheetName': 'Имя вкладки (sheet tab)',
        'google.connectedDoc': 'Подключённый документ',
        'google.headers.info': 'Первая строка выбранной вкладки зарезервирована под заголовки:',
        'google.status.notConnected': 'Не подключён к Google',
        'google.status.connected': 'Подключён как',
        'google.btn.connect': 'Подключить Google',
        'google.btn.reconnect': 'Переподключить',
        'google.btn.disconnect': 'Отключить',
        'google.btn.attachSheet': 'Подключить этот документ',
        'google.btn.createSheet': 'Создать новый документ',
        'google.btn.switchToGoogle': 'Использовать Google Sheets',
        'google.btn.switchToLocal': 'Вернуться на localStorage',
        'google.newSheetTitle': 'Название нового документа',
        'google.newSheetTitle.placeholder': 'Моё хранилище',
        'google.error.noClientId': 'Сначала введите Google OAuth Client ID.',
        'google.error.noSpreadsheet': 'Введите Spreadsheet ID / URL или создайте новый документ.',
        'google.msg.connecting': 'Подключение к Google...',
        'google.msg.connected': 'Подключён к Google.',
        'google.msg.disconnected': 'Отключён от Google. Используется localStorage.',
        'google.msg.sheetAttached': 'Документ подключён и готов к использованию.',
        'google.msg.sheetCreated': 'Новый документ создан и подключён.',
        'google.msg.switchedToGoogle': 'Переключено на Google Sheets.',
        'google.msg.switchedToLocal': 'Переключено на localStorage.',

        /* Data section */
        'data.placeholder': 'Новая запись...',
        'data.add': 'Добавить',
        'data.reload': 'Обновить',
        'data.col.index': '#',
        'data.col.text': 'Текст',
        'data.col.created': 'Создано',
        'data.col.actions': '',
        'data.empty': 'Пока пусто. Добавь первую запись.',
        'data.delete': 'Удалить',

        /* Backend badge */
        'backend.badge.local': 'localStorage',
        'backend.badge.google': 'Google Sheets',

        /* Pluralization helper for record count */
        'data.records.0': 'записей',
        'data.records.1': 'запись',
        'data.records.few': 'записи',
        'data.records.many': 'записей',

        /* Debug */
        'debug.title': '🐛 Debug info',
    },
};

// ============================================================================
// CONSTANTS
// ============================================================================

const APP_CONFIG_KEY = 'gsd.config.v1';
const DEFAULT_LOCAL_STORAGE_DB_KEY = 'gsd.records.v1';
const DEFAULT_GOOGLE_SHEET_NAME = 'Records';
const DEFAULT_GOOGLE_OAUTH_CLIENT_ID = '';
const SHEET_HEADERS = ['id', 'text', 'createdAt', 'updatedAt'] as const;

const GOOGLE_SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'openid', 'email', 'profile',
].join(' ');

const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
const SHEETS_API = 'https://sheets.googleapis.com/v4';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

const DEBUG =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('debug') === 'true';

// ============================================================================
// DEBUG
// ============================================================================

const dbg = (...args: unknown[]) => {
    if (DEBUG) console.log('[DBG]', ...args);
};

// ============================================================================
// i18n
// ============================================================================

const useT = (locale: Locale) =>
    useMemo(() => {
        const dict = DICTIONARIES[locale] ?? DICTIONARIES.en;
        return (key: string): string => dict[key] ?? DICTIONARIES.en[key] ?? key;
    }, [locale]);

const pluralizeRecords = (count: number, t: (k: string) => string): string => {
    const a = Math.abs(count);
    if (a === 0) return `${count} ${t('data.records.0')}`;
    if (a % 10 === 1 && a % 100 !== 11) return `${count} ${t('data.records.1')}`;
    if (a % 10 >= 2 && a % 10 <= 4 && (a % 100 < 10 || a % 100 >= 20))
        return `${count} ${t('data.records.few')}`;
    return `${count} ${t('data.records.many')}`;
};

// ============================================================================
// HELPERS
// ============================================================================

const createId = (): string =>
    typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const nowISO = (): string => new Date().toISOString();

const tryJson = <T,>(raw: string, fb: T): T => {
    try { return JSON.parse(raw) as T; } catch { return fb; }
};

const fmtTime = (v: string, locale: Locale): string => {
    if (!v) return '—';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return v;
    return new Intl.DateTimeFormat(locale === 'ru' ? 'ru-RU' : 'en-US', {
        dateStyle: 'medium', timeStyle: 'short',
    }).format(d);
};

const normSheetId = (v: string): string => {
    const t = v.trim();
    if (!t) return '';
    const m = t.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return m?.[1] ?? t.replace(/\/edit.*$/, '');
};

const sheetUrl = (id: string): string =>
    `https://docs.google.com/spreadsheets/d/${id}/edit`;

const quoteTab = (name: string): string => {
    const n = name.trim() || DEFAULT_GOOGLE_SHEET_NAME;
    return /^[A-Za-z0-9_]+$/.test(n) ? n : `'${n.replace(/'/g, "''")}'`;
};

const sheetRange = (tab: string, cells: string) => `${quoteTab(tab)}!${cells}`;

// ============================================================================
// THEME ENGINE
// ============================================================================

const resolveTheme = (p: ThemePreference): 'light' | 'dark' => {
    if (p === 'light' || p === 'dark') return p;
    return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark' : 'light';
};

const applyTheme = (r: 'light' | 'dark') => {
    if (r === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
};

// ============================================================================
// APP CONFIG
// ============================================================================

const DEFAULT_CONFIG: AppConfig = {
    locale: 'en',
    theme: 'system',
    preferredBackend: 'local',
    localStorageKey: DEFAULT_LOCAL_STORAGE_DB_KEY,
    settingsOpen: false,
    settingsTab: 'local',
    google: {
        clientId: DEFAULT_GOOGLE_OAUTH_CLIENT_ID,
        spreadsheetId: '',
        spreadsheetUrl: '',
        sheetName: DEFAULT_GOOGLE_SHEET_NAME,
        lastAccountEmail: '',
    },
};

const readConfig = (): AppConfig => {
    try {
        const raw = localStorage.getItem(APP_CONFIG_KEY);
        if (!raw) return { ...DEFAULT_CONFIG };
        const p = tryJson<Partial<AppConfig>>(raw, {});
        return { ...DEFAULT_CONFIG, ...p, google: { ...DEFAULT_CONFIG.google, ...(p.google ?? {}) } };
    } catch { return { ...DEFAULT_CONFIG }; }
};

const writeConfig = (c: AppConfig) => {
    try { localStorage.setItem(APP_CONFIG_KEY, JSON.stringify(c)); } catch {}
};

// ============================================================================
// LOCAL STORAGE DATA STORE
// ============================================================================

const createLocalDataStore = (key: string): DataStore => {
    const readAll = (): AppRecord[] => {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return [];
            const arr = tryJson<unknown[]>(raw, []);
            if (!Array.isArray(arr)) return [];
            return arr.filter((x): x is AppRecord =>
                !!x && typeof x === 'object' &&
                typeof (x as AppRecord).id === 'string' &&
                typeof (x as AppRecord).text === 'string');
        } catch { return []; }
    };
    const writeAll = (recs: AppRecord[]) => {
        try { localStorage.setItem(key, JSON.stringify(recs)); } catch {}
    };
    return {
        list: async () => readAll(),
        add: async (text) => {
            const r: AppRecord = { id: createId(), text, createdAt: nowISO(), updatedAt: nowISO() };
            const all = readAll(); all.push(r); writeAll(all); return r;
        },
        remove: async (id) => writeAll(readAll().filter(r => r.id !== id)),
        clear: async () => writeAll([]),
    };
};

// ============================================================================
// GOOGLE IDENTITY SERVICES — SCRIPT LOADER & TOKEN CLIENT
// ============================================================================

let gisLoadPromise: Promise<void> | null = null;

const waitForGis = (timeout = 10000): Promise<void> =>
    new Promise((ok, fail) => {
        const t0 = Date.now();
        const tick = () => {
            if (window.google?.accounts?.oauth2) return ok();
            if (Date.now() - t0 > timeout) return fail(new Error('GIS load timeout'));
            setTimeout(tick, 50);
        };
        tick();
    });

const loadGis = async (): Promise<void> => {
    if (window.google?.accounts?.oauth2) return;
    if (!gisLoadPromise) {
        gisLoadPromise = new Promise((ok, fail) => {
            if (document.querySelector('script[data-gis]')) {
                waitForGis().then(ok).catch(e => { gisLoadPromise = null; fail(e); });
                return;
            }
            const s = document.createElement('script');
            s.src = GIS_SCRIPT_SRC; s.async = true; s.defer = true; s.dataset.gis = '1';
            s.onload = () => waitForGis().then(ok).catch(e => { gisLoadPromise = null; fail(e); });
            s.onerror = () => { gisLoadPromise = null; fail(new Error('Failed to load GIS script')); };
            document.head.appendChild(s);
        });
    }
    await gisLoadPromise;
};

const requestToken = async (clientId: string, interactive: boolean): Promise<string> => {
    await loadGis();
    if (!window.google?.accounts?.oauth2) throw new Error('GIS not available');
    return new Promise<string>((ok, fail) => {
        const tc = window.google!.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: GOOGLE_SCOPES,
            callback: (r) => {
                if (r.error) return fail(new Error(r.error));
                if (!r.access_token) return fail(new Error('No access token'));
                ok(r.access_token);
            },
            error_callback: (e) => fail(new Error(e?.type || e?.message || 'GIS error')),
        });
        tc.requestAccessToken({ prompt: interactive ? 'consent' : '' });
    });
};

// ============================================================================
// GOOGLE API HELPERS
// ============================================================================

const gFetch = async <T,>(url: string, token: string, init: RequestInit = {}): Promise<T> => {
    dbg('gFetch', init.method ?? 'GET', url);
    const h = new Headers(init.headers);
    h.set('Authorization', `Bearer ${token}`);
    if (init.body && !h.has('Content-Type')) h.set('Content-Type', 'application/json');
    const res = await fetch(url, { ...init, headers: h });
    const txt = await res.text();
    const json = txt ? tryJson<unknown>(txt, null) : null;
    if (!res.ok) {
        let msg = txt || res.statusText || `HTTP ${res.status}`;
        if (json && typeof json === 'object' && 'error' in json) {
            const e = (json as { error?: { message?: string } }).error;
            if (e?.message) msg = e.message;
        }
        throw new Error(`Google API ${res.status}: ${msg}`);
    }
    return json as T;
};

const sheetsApi = <T,>(path: string, token: string, init?: RequestInit) =>
    gFetch<T>(`${SHEETS_API}${path}`, token, init);

const fetchProfile = async (token: string) =>
    gFetch<{ email?: string; name?: string; picture?: string }>(USERINFO_URL, token);

// ============================================================================
// GOOGLE SHEETS OPERATIONS
// ============================================================================

const ensureSheet = async (token: string, spreadsheetId: string, tabName: string) => {
    const id = normSheetId(spreadsheetId);
    const tab = tabName.trim() || DEFAULT_GOOGLE_SHEET_NAME;
    if (!id) throw new Error('Missing spreadsheet ID');

    const meta = await sheetsApi<{
        sheets?: { properties?: { title?: string } }[];
    }>(`/spreadsheets/${id}`, token);

    const exists = (meta.sheets ?? []).some(s => s.properties?.title === tab);
    if (!exists) {
        await sheetsApi(`/spreadsheets/${id}:batchUpdate`, token, {
            method: 'POST',
            body: JSON.stringify({ requests: [{ addSheet: { properties: { title: tab } } }] }),
        });
    }

    const hRange = sheetRange(tab, 'A1:D1');
    await sheetsApi(`/spreadsheets/${id}/values/${encodeURIComponent(hRange)}?valueInputOption=RAW`, token, {
        method: 'PUT',
        body: JSON.stringify({ range: hRange, majorDimension: 'ROWS', values: [Array.from(SHEET_HEADERS)] }),
    });
};

const createSpreadsheet = async (token: string, title: string, tabName: string) => {
    const tab = tabName.trim() || DEFAULT_GOOGLE_SHEET_NAME;
    const res = await sheetsApi<{ spreadsheetId?: string; spreadsheetUrl?: string }>('/spreadsheets', token, {
        method: 'POST',
        body: JSON.stringify({
            properties: { title: title.trim() || 'Google Sheets Store' },
            sheets: [{ properties: { title: tab } }],
        }),
    });
    const id = res.spreadsheetId?.trim();
    if (!id) throw new Error('API did not return spreadsheetId');
    await ensureSheet(token, id, tab);
    return { spreadsheetId: id, spreadsheetUrl: res.spreadsheetUrl?.trim() || sheetUrl(id) };
};

const readSheetRecords = async (token: string, spreadsheetId: string, tabName: string): Promise<AppRecord[]> => {
    const id = normSheetId(spreadsheetId);
    const tab = tabName.trim() || DEFAULT_GOOGLE_SHEET_NAME;
    const range = sheetRange(tab, 'A2:D');
    const res = await sheetsApi<{ values?: string[][] }>(
        `/spreadsheets/${id}/values/${encodeURIComponent(range)}`, token);
    return (res.values ?? [])
        .map((row, i) => {
            const rid = (row[0] ?? '').trim() || `row-${i + 2}-${createId()}`;
            const text = row[1] ?? '';
            if (!rid && !text.trim()) return null;
            return { id: rid, text, createdAt: row[2] ?? '', updatedAt: row[3] ?? row[2] ?? '' } as AppRecord;
        })
        .filter((x): x is AppRecord => !!x);
};

const appendSheetRecord = async (token: string, spreadsheetId: string, tabName: string, rec: AppRecord) => {
    const id = normSheetId(spreadsheetId);
    const tab = tabName.trim() || DEFAULT_GOOGLE_SHEET_NAME;
    const range = sheetRange(tab, 'A:D');
    await sheetsApi(
        `/spreadsheets/${id}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
        token, { method: 'POST', body: JSON.stringify({ values: [[rec.id, rec.text, rec.createdAt, rec.updatedAt]] }) });
};

const rewriteSheetRecords = async (token: string, spreadsheetId: string, tabName: string, recs: AppRecord[]) => {
    const id = normSheetId(spreadsheetId);
    const tab = tabName.trim() || DEFAULT_GOOGLE_SHEET_NAME;
    const clearRange = sheetRange(tab, 'A2:D');
    await sheetsApi(`/spreadsheets/${id}/values/${encodeURIComponent(clearRange)}:clear`, token,
        { method: 'POST', body: '{}' });
    if (recs.length === 0) return;
    const putRange = sheetRange(tab, 'A2:D');
    await sheetsApi(`/spreadsheets/${id}/values/${encodeURIComponent(putRange)}?valueInputOption=RAW`, token, {
        method: 'PUT',
        body: JSON.stringify({
            range: putRange, majorDimension: 'ROWS',
            values: recs.map(r => [r.id, r.text, r.createdAt, r.updatedAt]),
        }),
    });
};

// ============================================================================
// GOOGLE SHEETS DATA STORE
// ============================================================================

const createGoogleSheetsDataStore = (
    tokenRef: React.MutableRefObject<string | null>,
    spreadsheetId: string,
    tabName: string,
): DataStore => {
    const getToken = () => {
        const t = tokenRef.current;
        if (!t) throw new Error('Google session expired. Please reconnect.');
        return t;
    };
    const sid = normSheetId(spreadsheetId);
    const tab = tabName.trim() || DEFAULT_GOOGLE_SHEET_NAME;

    return {
        list: async () => readSheetRecords(getToken(), sid, tab),
        add: async (text) => {
            const rec: AppRecord = { id: createId(), text, createdAt: nowISO(), updatedAt: nowISO() };
            await appendSheetRecord(getToken(), sid, tab, rec);
            return rec;
        },
        remove: async (id) => {
            const all = await readSheetRecords(getToken(), sid, tab);
            await rewriteSheetRecords(getToken(), sid, tab, all.filter(r => r.id !== id));
        },
        clear: async () => {
            await rewriteSheetRecords(getToken(), sid, tab, []);
        },
    };
};

// ============================================================================
// SVG ICONS
// ============================================================================

const IconSettings: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
        <circle cx="12" cy="12" r="3" />
    </svg>
);
const IconSun: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="4" /><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>
    </svg>
);
const IconMoon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
    </svg>
);
const IconMonitor: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>
    </svg>
);
const IconPlus: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12h14"/><path d="M12 5v14"/>
    </svg>
);
const IconTrash: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>
    </svg>
);
const IconRefresh: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/>
    </svg>
);
const IconX: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
    </svg>
);
const IconDatabase: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/>
    </svg>
);
const IconSheet: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M8 13h2"/><path d="M14 13h2"/><path d="M8 17h2"/><path d="M14 17h2"/>
    </svg>
);

// ============================================================================
// SETTINGS — LOCAL STORAGE TAB
// ============================================================================

const SettingsLocalTab: React.FC<{
    config: AppConfig; recordCount: number; onClearData: () => void; isBusy: boolean; t: (k: string) => string;
}> = ({ config, recordCount, onClearData, isBusy, t }) => (
    <div className="space-y-4 animate-fade-in">
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2">{t('local.how.title')}</h3>
            <ul className="text-xs text-slate-600 dark:text-slate-400 space-y-1.5 list-disc pl-4">
                <li>{t('local.how.1')}</li><li>{t('local.how.2')}</li><li>{t('local.how.3')}</li><li>{t('local.how.4')}</li>
            </ul>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4">
            <div className="flex items-center justify-between">
                <div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{t('local.storageKey')}</div>
                    <code className="text-xs text-slate-700 dark:text-slate-300">{config.localStorageKey}</code>
                </div>
                <div className="text-right">
                    <div className="text-xs text-slate-500 dark:text-slate-400">{t('local.recordCount')}</div>
                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">{recordCount}</div>
                </div>
            </div>
        </div>
        <button type="button" onClick={onClearData} disabled={isBusy || recordCount === 0}
                className="inline-flex items-center gap-2 rounded-lg border border-rose-300 dark:border-rose-700 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium text-rose-700 dark:text-rose-400 transition hover:bg-rose-50 dark:hover:bg-rose-900/20 disabled:cursor-not-allowed disabled:opacity-50">
            <IconTrash />{t('local.clearAll')}
        </button>
    </div>
);

// ============================================================================
// SETTINGS — GOOGLE SHEETS TAB
// ============================================================================

const SettingsGoogleTab: React.FC<{
    config: AppConfig;
    isGoogleAuthed: boolean;
    googleEmail: string;
    isBusy: boolean;
    onConfigChange: (p: Partial<GoogleConfig>) => void;
    onConnect: () => void;
    onDisconnect: () => void;
    onAttach: () => void;
    onCreate: () => void;
    onSwitchToGoogle: () => void;
    onSwitchToLocal: () => void;
    t: (k: string) => string;
}> = ({ config, isGoogleAuthed, googleEmail, isBusy, onConfigChange, onConnect, onDisconnect, onAttach, onCreate, onSwitchToGoogle, onSwitchToLocal, t }) => {
    const [newTitle, setNewTitle] = useState('Google Sheets Store');
    const hasClientId = Boolean(config.google.clientId.trim());
    const hasSheet = Boolean(normSheetId(config.google.spreadsheetId));

    const btnPrimary = 'inline-flex items-center gap-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 px-3 py-2 text-xs font-medium text-white dark:text-slate-900 transition hover:bg-slate-800 dark:hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50';
    const btnSecondary = 'inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 transition hover:bg-slate-50 dark:hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50';
    const btnDanger = 'inline-flex items-center gap-1.5 rounded-lg border border-rose-300 dark:border-rose-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-medium text-rose-700 dark:text-rose-400 transition hover:bg-rose-50 dark:hover:bg-rose-900/20 disabled:cursor-not-allowed disabled:opacity-50';

    return (
        <div className="space-y-4 animate-fade-in">
            {/* Setup guide */}
            <details className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-4">
                <summary className="cursor-pointer text-sm font-semibold text-blue-900 dark:text-blue-200">{t('google.setup.title')}</summary>
                <ol className="mt-2 text-xs text-blue-800 dark:text-blue-300 space-y-2 list-decimal pl-4">
                    <li><strong>{t('google.setup.step1')}</strong><br/>{t('google.setup.step1.detail')}{' '}<a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer" className="underline">console.cloud.google.com</a></li>
                    <li><strong>{t('google.setup.step2')}</strong><br/>{t('google.setup.step2.detail')}</li>
                    <li><strong>{t('google.setup.step3')}</strong><br/>{t('google.setup.step3.detail')}<br/>{t('google.setup.step3.scopes')}{' '}<code className="rounded bg-blue-100 dark:bg-blue-800 px-1 py-0.5">.../auth/spreadsheets</code>, <code className="rounded bg-blue-100 dark:bg-blue-800 px-1 py-0.5">openid</code>, <code className="rounded bg-blue-100 dark:bg-blue-800 px-1 py-0.5">email</code>, <code className="rounded bg-blue-100 dark:bg-blue-800 px-1 py-0.5">profile</code>.</li>
                    <li><strong>{t('google.setup.step4')}</strong><br/>{t('google.setup.step4.detail')}<br/>{t('google.setup.step4.origins')}<ul className="list-disc pl-4 mt-1 space-y-0.5"><li><code className="rounded bg-blue-100 dark:bg-blue-800 px-1 py-0.5">http://localhost:5173</code> {t('google.setup.step4.origins.dev')}</li><li><code className="rounded bg-blue-100 dark:bg-blue-800 px-1 py-0.5">https://YOUR-USERNAME.github.io</code> {t('google.setup.step4.origins.prod')}</li></ul></li>
                    <li><strong>{t('google.setup.step5')}</strong><br/>{t('google.setup.step5.detail')}</li>
                </ol>
            </details>

            {/* Security */}
            <details className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4">
                <summary className="cursor-pointer text-sm font-semibold text-amber-900 dark:text-amber-200">{t('google.security.title')}</summary>
                <ul className="mt-2 text-xs text-amber-800 dark:text-amber-300 space-y-1 list-disc pl-4">
                    <li>{t('google.security.1')}</li><li>{t('google.security.2')}</li><li>{t('google.security.3')}</li><li>{t('google.security.4')}</li>
                </ul>
            </details>

            {/* Auth status */}
            <div className={`rounded-xl border p-4 ${isGoogleAuthed
                ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20'
                : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50'}`}>
                <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    {isGoogleAuthed ? `${t('google.status.connected')} ${googleEmail}` : t('google.status.notConnected')}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" className={btnPrimary} disabled={isBusy || !hasClientId}
                            onClick={onConnect}>
                        {isGoogleAuthed ? t('google.btn.reconnect') : t('google.btn.connect')}
                    </button>
                    {isGoogleAuthed && (
                        <button type="button" className={btnDanger} disabled={isBusy} onClick={onDisconnect}>
                            {t('google.btn.disconnect')}
                        </button>
                    )}
                </div>
            </div>

            {/* Client ID */}
            <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">{t('google.clientId')}</span>
                <input type="text" value={config.google.clientId} onChange={e => onConfigChange({ clientId: e.target.value })} placeholder={t('google.clientId.placeholder')}
                       className="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 outline-none transition focus:border-slate-500 dark:focus:border-slate-400"/>
                <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{t('google.clientId.hint')}</span>
            </label>

            {/* Spreadsheet config */}
            <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">{t('google.spreadsheetId')}</span>
                <input type="text" value={config.google.spreadsheetId} onChange={e => onConfigChange({ spreadsheetId: e.target.value })} placeholder={t('google.spreadsheetId.placeholder')}
                       className="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 outline-none transition focus:border-slate-500 dark:focus:border-slate-400"/>
            </label>
            <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">{t('google.sheetName')}</span>
                <input type="text" value={config.google.sheetName} onChange={e => onConfigChange({ sheetName: e.target.value })} placeholder={DEFAULT_GOOGLE_SHEET_NAME}
                       className="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 outline-none transition focus:border-slate-500 dark:focus:border-slate-400"/>
            </label>

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
                <button type="button" className={btnPrimary} disabled={isBusy || !isGoogleAuthed || !hasSheet} onClick={onAttach}>
                    {t('google.btn.attachSheet')}
                </button>
                <label className="block">
                    <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">{t('google.newSheetTitle')}</span>
                    <div className="flex gap-2">
                        <input type="text" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder={t('google.newSheetTitle.placeholder')}
                               className="flex-1 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 outline-none transition focus:border-slate-500 dark:focus:border-slate-400"/>
                        <button type="button" className={btnSecondary} disabled={isBusy || !isGoogleAuthed}
                                onClick={() => { onConfigChange({ spreadsheetId: `__CREATE__${newTitle}` }); onCreate(); }}>
                            {t('google.btn.createSheet')}
                        </button>
                    </div>
                </label>
            </div>

            {/* Backend switch */}
            {isGoogleAuthed && hasSheet && (
                <div className="flex flex-wrap gap-2">
                    <button type="button" className={btnPrimary} disabled={isBusy} onClick={onSwitchToGoogle}>
                        {t('google.btn.switchToGoogle')}
                    </button>
                    <button type="button" className={btnSecondary} disabled={isBusy} onClick={onSwitchToLocal}>
                        {t('google.btn.switchToLocal')}
                    </button>
                </div>
            )}

            {/* Connected doc */}
            {normSheetId(config.google.spreadsheetId) && !config.google.spreadsheetId.startsWith('__CREATE__') && (
                <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-4 text-sm">
                    <div className="font-medium text-emerald-800 dark:text-emerald-200 mb-1">{t('google.connectedDoc')}</div>
                    <a href={sheetUrl(normSheetId(config.google.spreadsheetId))} target="_blank" rel="noreferrer" className="text-xs text-emerald-700 dark:text-emerald-300 underline break-all">
                        {sheetUrl(normSheetId(config.google.spreadsheetId))}
                    </a>
                </div>
            )}

            {/* Headers info */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4 text-xs text-slate-600 dark:text-slate-400">
                {t('google.headers.info')}{' '}
                <code className="rounded bg-slate-200 dark:bg-slate-700 px-1 py-0.5">{SHEET_HEADERS.join(' | ')}</code>
            </div>
        </div>
    );
};

// ============================================================================
// SETTINGS PANEL
// ============================================================================

const SettingsPanel: React.FC<{
    config: AppConfig;
    setConfig: React.Dispatch<React.SetStateAction<AppConfig>>;
    recordCount: number;
    onClearData: () => void;
    isBusy: boolean;
    isClosing: boolean;
    onCloseAnimEnd: () => void;
    isGoogleAuthed: boolean;
    googleEmail: string;
    onGoogleConnect: () => void;
    onGoogleDisconnect: () => void;
    onGoogleAttach: () => void;
    onGoogleCreate: () => void;
    onSwitchToGoogle: () => void;
    onSwitchToLocal: () => void;
    t: (k: string) => string;
}> = ({ config, setConfig, recordCount, onClearData, isBusy, isClosing, onCloseAnimEnd,
          isGoogleAuthed, googleEmail, onGoogleConnect, onGoogleDisconnect, onGoogleAttach, onGoogleCreate,
          onSwitchToGoogle, onSwitchToLocal, t }) => {

    const handleGoogleConfigChange = useCallback(
        (p: Partial<GoogleConfig>) => setConfig(prev => ({ ...prev, google: { ...prev.google, ...p } })),
        [setConfig]);

    const themeOpts: { value: ThemePreference; label: string; icon: React.ReactNode }[] = [
        { value: 'light', label: t('settings.theme.light'), icon: <IconSun className="w-4 h-4"/> },
        { value: 'dark', label: t('settings.theme.dark'), icon: <IconMoon className="w-4 h-4"/> },
        { value: 'system', label: t('settings.theme.system'), icon: <IconMonitor className="w-4 h-4"/> },
    ];
    const langOpts: { value: Locale; label: string }[] = [
        { value: 'en', label: t('settings.language.en') },
        { value: 'ru', label: t('settings.language.ru') },
    ];

    const btnActive = 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900';
    const btnInactive = 'border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800';

    return (
        <div className={`mb-6 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg overflow-hidden ${isClosing ? 'animate-slide-up' : 'animate-slide-down'}`}
             onAnimationEnd={() => { if (isClosing) onCloseAnimEnd(); }}>
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 px-5 py-3">
                <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">{t('settings.title')}</h2>
                <button type="button" onClick={() => setConfig(p => ({ ...p, settingsOpen: false }))}
                        className="rounded-lg p-1.5 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition" aria-label="Close">
                    <IconX/>
                </button>
            </div>
            {/* General */}
            <div className="border-b border-slate-200 dark:border-slate-700 px-5 py-4 space-y-4">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">{t('settings.general')}</h3>
                <div>
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">{t('settings.theme')}</div>
                    <div className="flex gap-2">
                        {themeOpts.map(o => (
                            <button key={o.value} type="button" onClick={() => setConfig(p => ({ ...p, theme: o.value }))}
                                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition ${config.theme === o.value ? btnActive : btnInactive}`}>
                                {o.icon}{o.label}
                            </button>
                        ))}
                    </div>
                </div>
                <div>
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">{t('settings.language')}</div>
                    <div className="flex gap-2">
                        {langOpts.map(o => (
                            <button key={o.value} type="button" onClick={() => setConfig(p => ({ ...p, locale: o.value }))}
                                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition ${config.locale === o.value ? btnActive : btnInactive}`}>
                                {o.label}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('settings.backend')}</div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                {config.preferredBackend === 'google' ? t('settings.backend.google') : t('settings.backend.local')}
                            </div>
                        </div>
                        <span className="rounded-full bg-slate-200 dark:bg-slate-700 px-3 py-1 text-xs font-medium text-slate-700 dark:text-slate-300">
                            {config.preferredBackend === 'google' ? 'Google' : 'Local'}
                        </span>
                    </div>
                </div>
            </div>
            {/* Tabs */}
            <div className="border-b border-slate-200 dark:border-slate-700">
                <div className="flex themed-scroll overflow-x-auto">
                    {(['local', 'google'] as const).map(tab => (
                        <button key={tab} type="button" onClick={() => setConfig(p => ({ ...p, settingsTab: tab }))}
                                className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition whitespace-nowrap ${
                                    config.settingsTab === tab
                                        ? 'border-slate-900 dark:border-slate-100 text-slate-900 dark:text-slate-100'
                                        : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600'
                                }`}>
                            {tab === 'local' ? <IconDatabase className="shrink-0"/> : <IconSheet className="shrink-0"/>}
                            {t(`settings.tab.${tab}`)}
                        </button>
                    ))}
                </div>
            </div>
            {/* Tab content */}
            <div className="px-5 py-4 themed-scroll max-h-[60vh] overflow-y-auto">
                {config.settingsTab === 'local'
                    ? <SettingsLocalTab config={config} recordCount={recordCount} onClearData={onClearData} isBusy={isBusy} t={t}/>
                    : <SettingsGoogleTab config={config} isGoogleAuthed={isGoogleAuthed} googleEmail={googleEmail} isBusy={isBusy}
                                         onConfigChange={handleGoogleConfigChange} onConnect={onGoogleConnect} onDisconnect={onGoogleDisconnect}
                                         onAttach={onGoogleAttach} onCreate={onGoogleCreate} onSwitchToGoogle={onSwitchToGoogle} onSwitchToLocal={onSwitchToLocal} t={t}/>}
            </div>
        </div>
    );
};

// ============================================================================
// THEME TOGGLE
// ============================================================================

const ThemeToggle: React.FC<{ theme: ThemePreference; onCycle: () => void; t: (k: string) => string }> = ({ theme, onCycle, t }) => {
    const resolved = resolveTheme(theme);
    const titles: Record<ThemePreference, string> = { light: t('settings.theme.light'), dark: t('settings.theme.dark'), system: t('settings.theme.system') };
    return (
        <button type="button" onClick={onCycle} className="rounded-lg p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                aria-label={`${t('header.theme')}: ${titles[theme]}`} title={`${t('header.theme')}: ${titles[theme]}`}>
            {theme === 'system' ? <IconMonitor/> : resolved === 'dark' ? <IconMoon/> : <IconSun/>}
        </button>
    );
};

// ============================================================================
// MAIN APPLICATION COMPONENT
// ============================================================================

const App: React.FC = () => {
    const [config, setConfig] = useState<AppConfig>(() => readConfig());
    const [records, setRecords] = useState<AppRecord[]>([]);
    const [draftText, setDraftText] = useState('');
    const [isBusy, setIsBusy] = useState(false);
    const [error, setError] = useState('');
    const [statusMsg, setStatusMsg] = useState('');
    const [settingsVisible, setSettingsVisible] = useState(config.settingsOpen);
    const [settingsClosing, setSettingsClosing] = useState(false);

    /** Google auth state — token in memory only */
    const [isGoogleAuthed, setIsGoogleAuthed] = useState(false);
    const [googleEmail, setGoogleEmail] = useState('');
    const tokenRef = useRef<string | null>(null);

    const bootDone = useRef(false);
    const t = useT(config.locale);
    const resolvedTheme = useMemo(() => resolveTheme(config.theme), [config.theme]);

    const normalizedSheetId = useMemo(() => normSheetId(config.google.spreadsheetId), [config.google.spreadsheetId]);
    const effectiveTab = useMemo(() => config.google.sheetName.trim() || DEFAULT_GOOGLE_SHEET_NAME, [config.google.sheetName]);

    /**
     * Active backend. Resolves to 'google' only when:
     * 1. User prefers google backend
     * 2. Google auth is active (token in memory)
     * 3. Spreadsheet is configured
     */
    const activeBackend = useMemo<BackendMode>(() => {
        if (config.preferredBackend === 'google' && isGoogleAuthed && normalizedSheetId) return 'google';
        return 'local';
    }, [config.preferredBackend, isGoogleAuthed, normalizedSheetId]);

    /**
     * Active DataStore — selected based on activeBackend.
     * When google: creates a Google Sheets DataStore with current token ref.
     * When local: creates a localStorage DataStore.
     */
    const dataStore: DataStore = useMemo(() => {
        if (activeBackend === 'google') {
            return createGoogleSheetsDataStore(tokenRef, normalizedSheetId, effectiveTab);
        }
        return createLocalDataStore(config.localStorageKey);
    }, [activeBackend, config.localStorageKey, normalizedSheetId, effectiveTab]);

    const sortedRecords = useMemo(
        () => [...records].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
        [records]);

    /* ── Theme ──────────────────────────────────────────────────────────── */
    useEffect(() => { applyTheme(resolvedTheme); }, [resolvedTheme]);
    useEffect(() => {
        if (config.theme !== 'system') return;
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        const h = () => applyTheme(resolveTheme('system'));
        mq.addEventListener('change', h);
        return () => mq.removeEventListener('change', h);
    }, [config.theme]);

    /* ── Config persistence ─────────────────────────────────────────────── */
    useEffect(() => { writeConfig(config); }, [config]);

    /* ── Settings animation ─────────────────────────────────────────────── */
    useEffect(() => {
        if (config.settingsOpen) { setSettingsClosing(false); setSettingsVisible(true); }
        else if (settingsVisible) setSettingsClosing(true);
    }, [config.settingsOpen, settingsVisible]);

    const handleSettingsCloseAnimEnd = useCallback(() => {
        setSettingsVisible(false); setSettingsClosing(false);
    }, []);

    /* ── Google auth helpers ────────────────────────────────────────────── */

    const doGoogleAuth = useCallback(async (interactive: boolean): Promise<string> => {
        const clientId = config.google.clientId.trim();
        if (!clientId) throw new Error(t('google.error.noClientId'));
        const token = await requestToken(clientId, interactive);
        tokenRef.current = token;
        setIsGoogleAuthed(true);
        try {
            const profile = await fetchProfile(token);
            const email = profile.email?.trim() || '';
            setGoogleEmail(email);
            setConfig(prev => ({ ...prev, google: { ...prev.google, lastAccountEmail: email } }));
        } catch (e) {
            dbg('Profile fetch failed', e);
            setGoogleEmail(config.google.lastAccountEmail);
        }
        return token;
    }, [config.google.clientId, config.google.lastAccountEmail, t]);

    const invalidateGoogle = useCallback(() => {
        if (tokenRef.current && window.google?.accounts?.oauth2?.revoke) {
            window.google.accounts.oauth2.revoke(tokenRef.current, () => dbg('Token revoked'));
        }
        tokenRef.current = null;
        setIsGoogleAuthed(false);
        setGoogleEmail('');
    }, []);

    /* ── Boot ───────────────────────────────────────────────────────────── */
    useEffect(() => {
        if (bootDone.current) return;
        bootDone.current = true;
        void (async () => {
            setIsBusy(true);
            try {
                /* Always load local records first as fallback */
                const localStore = createLocalDataStore(config.localStorageKey);
                const localRecs = await localStore.list();
                setRecords(localRecs);
                dbg('Boot: local records', localRecs.length);

                /* If preferred backend is google, attempt silent restore */
                if (config.preferredBackend === 'google' && config.google.clientId.trim() && normalizedSheetId) {
                    setStatusMsg(t('google.msg.connecting'));
                    try {
                        await doGoogleAuth(false);
                        const gStore = createGoogleSheetsDataStore(tokenRef, normalizedSheetId, effectiveTab);
                        const gRecs = await gStore.list();
                        setRecords(gRecs);
                        setStatusMsg(t('google.msg.connected'));
                        dbg('Boot: google records', gRecs.length);
                    } catch (e) {
                        dbg('Silent google restore failed', e);
                        setStatusMsg('');
                    }
                }
            } catch (e) {
                setError(String(e));
            } finally {
                setIsBusy(false);
            }
        })();
    }, [config.google.clientId, config.localStorageKey, config.preferredBackend, doGoogleAuth, effectiveTab, normalizedSheetId, t]);

    /* ── Reload records from current active store ───────────────────────── */
    const reloadRecords = useCallback(async () => {
        setIsBusy(true); setError('');
        try {
            const loaded = await dataStore.list();
            setRecords(loaded);
        } catch (e) { setError(String(e)); }
        finally { setIsBusy(false); }
    }, [dataStore]);

    /* ── Google settings actions ────────────────────────────────────────── */

    const handleGoogleConnect = useCallback(async () => {
        setIsBusy(true); setError(''); setStatusMsg('');
        try {
            await doGoogleAuth(true);
            setStatusMsg(t('google.msg.connected'));
        } catch (e) { setError(String(e)); }
        finally { setIsBusy(false); }
    }, [doGoogleAuth, t]);

    const handleGoogleDisconnect = useCallback(() => {
        invalidateGoogle();
        setConfig(prev => ({ ...prev, preferredBackend: 'local' }));
        const localStore = createLocalDataStore(config.localStorageKey);
        localStore.list().then(r => setRecords(r));
        setStatusMsg(t('google.msg.disconnected'));
        setError('');
    }, [config.localStorageKey, invalidateGoogle, t]);

    const handleGoogleAttach = useCallback(async () => {
        setIsBusy(true); setError(''); setStatusMsg('');
        try {
            if (!normalizedSheetId) throw new Error(t('google.error.noSpreadsheet'));
            if (!tokenRef.current) await doGoogleAuth(true);
            await ensureSheet(tokenRef.current!, normalizedSheetId, effectiveTab);
            setConfig(prev => ({
                ...prev,
                preferredBackend: 'google',
                google: { ...prev.google, spreadsheetId: normalizedSheetId, spreadsheetUrl: sheetUrl(normalizedSheetId), sheetName: effectiveTab },
            }));
            const gStore = createGoogleSheetsDataStore(tokenRef, normalizedSheetId, effectiveTab);
            const recs = await gStore.list();
            setRecords(recs);
            setStatusMsg(t('google.msg.sheetAttached'));
        } catch (e) { setError(String(e)); }
        finally { setIsBusy(false); }
    }, [doGoogleAuth, effectiveTab, normalizedSheetId, t]);

    const handleGoogleCreate = useCallback(async () => {
        setIsBusy(true); setError(''); setStatusMsg('');
        try {
            if (!tokenRef.current) await doGoogleAuth(true);
            /* Extract title from the __CREATE__ prefix hack */
            const titleFromConfig = config.google.spreadsheetId.startsWith('__CREATE__')
                ? config.google.spreadsheetId.replace('__CREATE__', '')
                : 'Google Sheets Store';
            const created = await createSpreadsheet(tokenRef.current!, titleFromConfig, effectiveTab);
            setConfig(prev => ({
                ...prev,
                preferredBackend: 'google',
                google: { ...prev.google, spreadsheetId: created.spreadsheetId, spreadsheetUrl: created.spreadsheetUrl, sheetName: effectiveTab },
            }));
            setRecords([]);
            setStatusMsg(t('google.msg.sheetCreated'));
        } catch (e) { setError(String(e)); }
        finally { setIsBusy(false); }
    }, [config.google.spreadsheetId, doGoogleAuth, effectiveTab, t]);

    const handleSwitchToGoogle = useCallback(async () => {
        setIsBusy(true); setError(''); setStatusMsg('');
        try {
            if (!normalizedSheetId) throw new Error(t('google.error.noSpreadsheet'));
            if (!tokenRef.current) await doGoogleAuth(true);
            await ensureSheet(tokenRef.current!, normalizedSheetId, effectiveTab);
            setConfig(prev => ({ ...prev, preferredBackend: 'google' }));
            const gStore = createGoogleSheetsDataStore(tokenRef, normalizedSheetId, effectiveTab);
            const recs = await gStore.list();
            setRecords(recs);
            setStatusMsg(t('google.msg.switchedToGoogle'));
        } catch (e) { setError(String(e)); }
        finally { setIsBusy(false); }
    }, [doGoogleAuth, effectiveTab, normalizedSheetId, t]);

    const handleSwitchToLocal = useCallback(() => {
        setConfig(prev => ({ ...prev, preferredBackend: 'local' }));
        const localStore = createLocalDataStore(config.localStorageKey);
        localStore.list().then(r => setRecords(r));
        setStatusMsg(t('google.msg.switchedToLocal'));
        setError('');
    }, [config.localStorageKey, t]);

    /* ── CRUD ───────────────────────────────────────────────────────────── */
    const handleAdd = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const text = draftText.trim();
        if (!text) return;
        setIsBusy(true); setError('');
        try {
            await dataStore.add(text);
            const updated = await dataStore.list();
            setRecords(updated);
            setDraftText('');
        } catch (err) { setError(String(err)); }
        finally { setIsBusy(false); }
    }, [dataStore, draftText]);

    const handleDelete = useCallback(async (id: string) => {
        setIsBusy(true); setError('');
        try {
            await dataStore.remove(id);
            const updated = await dataStore.list();
            setRecords(updated);
        } catch (err) { setError(String(err)); }
        finally { setIsBusy(false); }
    }, [dataStore]);

    const handleClearAll = useCallback(async () => {
        setIsBusy(true); setError('');
        try { await dataStore.clear(); setRecords([]); }
        catch (err) { setError(String(err)); }
        finally { setIsBusy(false); }
    }, [dataStore]);

    const cycleTheme = useCallback(() => {
        setConfig(prev => {
            const order: ThemePreference[] = ['light', 'dark', 'system'];
            return { ...prev, theme: order[(order.indexOf(prev.theme) + 1) % order.length] };
        });
    }, []);

    const toggleSettings = useCallback(() => {
        setConfig(prev => ({ ...prev, settingsOpen: !prev.settingsOpen }));
    }, []);

    /* ── Render ─────────────────────────────────────────────────────────── */
    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
            <header className="sticky top-0 z-30 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md">
                <div className="mx-auto max-w-6xl flex items-center justify-between px-4 py-3">
                    <h1 className="text-lg font-bold tracking-tight">{t('header.title')}</h1>
                    <div className="flex items-center gap-1">
                        <button type="button" onClick={toggleSettings}
                                className={`rounded-lg p-2 transition ${config.settingsOpen
                                    ? 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-100'
                                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                                aria-label={t('header.settings')} title={t('header.settings')}>
                            <IconSettings/>
                        </button>
                        <ThemeToggle theme={config.theme} onCycle={cycleTheme} t={t}/>
                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-6xl px-4 py-6">
                {settingsVisible && (
                    <SettingsPanel config={config} setConfig={setConfig} recordCount={records.length}
                                   onClearData={handleClearAll} isBusy={isBusy} isClosing={settingsClosing}
                                   onCloseAnimEnd={handleSettingsCloseAnimEnd}
                                   isGoogleAuthed={isGoogleAuthed} googleEmail={googleEmail}
                                   onGoogleConnect={handleGoogleConnect} onGoogleDisconnect={handleGoogleDisconnect}
                                   onGoogleAttach={handleGoogleAttach} onGoogleCreate={handleGoogleCreate}
                                   onSwitchToGoogle={handleSwitchToGoogle} onSwitchToLocal={handleSwitchToLocal} t={t}/>
                )}

                {statusMsg && (
                    <div className="mb-4 rounded-2xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-4 text-sm text-blue-700 dark:text-blue-300 animate-fade-in">
                        {statusMsg}
                    </div>
                )}
                {error && (
                    <div className="mb-4 rounded-2xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20 p-4 text-sm text-rose-700 dark:text-rose-300 animate-fade-in">
                        {error}
                    </div>
                )}

                <div className="mb-4 flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-200 dark:bg-slate-800 px-3 py-1 text-xs font-medium text-slate-700 dark:text-slate-300">
                        {activeBackend === 'google' ? <IconSheet className="w-3.5 h-3.5"/> : <IconDatabase className="w-3.5 h-3.5"/>}
                        {activeBackend === 'google' ? t('backend.badge.google') : t('backend.badge.local')}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                        {pluralizeRecords(sortedRecords.length, t)}
                    </span>
                </div>

                <form onSubmit={handleAdd} className="mb-5">
                    <div className="flex gap-2">
                        <input type="text" value={draftText} onChange={e => setDraftText(e.target.value)}
                               placeholder={t('data.placeholder')}
                               className="flex-1 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 outline-none transition focus:border-slate-500 dark:focus:border-slate-400"/>
                        <button type="submit" disabled={isBusy || !draftText.trim()}
                                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 dark:bg-slate-100 px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 transition hover:bg-slate-800 dark:hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50">
                            <IconPlus/>{t('data.add')}
                        </button>
                        <button type="button" onClick={reloadRecords} disabled={isBusy}
                                className="rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 p-2.5 text-slate-600 dark:text-slate-300 transition hover:bg-slate-50 dark:hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                                title={t('data.reload')}>
                            <IconRefresh/>
                        </button>
                    </div>
                </form>

                <div className="table-container overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
                    <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700 text-sm">
                        <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800/50">
                            <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-400 w-12">{t('data.col.index')}</th>
                            <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-400">{t('data.col.text')}</th>
                            <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-400 w-44">{t('data.col.created')}</th>
                            <th className="px-4 py-3 text-right font-semibold text-slate-600 dark:text-slate-400 w-24">{t('data.col.actions')}</th>
                        </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {sortedRecords.length === 0 ? (
                            <tr><td colSpan={4} className="px-4 py-16 text-center text-slate-400 dark:text-slate-500">
                                <div className="flex flex-col items-center gap-2">
                                    <IconDatabase className="w-8 h-8 opacity-40"/><span>{t('data.empty')}</span>
                                </div>
                            </td></tr>
                        ) : sortedRecords.map((rec, i) => (
                            <tr key={rec.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                                <td className="px-4 py-3 align-top text-slate-400 dark:text-slate-500 tabular-nums">{i + 1}</td>
                                <td className="px-4 py-3 align-top">
                                    <div className="text-slate-800 dark:text-slate-200 break-words whitespace-pre-wrap">{rec.text}</div>
                                    <div className="mt-1 text-[11px] text-slate-400 dark:text-slate-500 font-mono">{rec.id}</div>
                                </td>
                                <td className="px-4 py-3 align-top text-slate-500 dark:text-slate-400 whitespace-nowrap">
                                    {fmtTime(rec.createdAt, config.locale)}
                                </td>
                                <td className="px-4 py-3 align-top text-right">
                                    <button type="button" onClick={() => handleDelete(rec.id)} disabled={isBusy}
                                            className="inline-flex items-center gap-1 rounded-lg border border-rose-200 dark:border-rose-800 px-2.5 py-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 transition hover:bg-rose-50 dark:hover:bg-rose-900/20 disabled:cursor-not-allowed disabled:opacity-50">
                                        <IconTrash/>{t('data.delete')}
                                    </button>
                                </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>

                {DEBUG && (
                    <details className="mt-6 rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4">
                        <summary className="cursor-pointer text-sm font-medium text-amber-800 dark:text-amber-200">{t('debug.title')}</summary>
                        <pre className="mt-3 text-xs text-amber-700 dark:text-amber-300 overflow-x-auto">
                            {JSON.stringify({ config, recordCount: records.length, activeBackend, resolvedTheme, isGoogleAuthed, googleEmail }, null, 2)}
                        </pre>
                    </details>
                )}
            </main>
        </div>
    );
};

// ============================================================================
// BOOTSTRAP
// ============================================================================

const rootElement = document.getElementById('root');
if (rootElement) {
    createRoot(rootElement).render(<React.StrictMode><App/></React.StrictMode>);
} else {
    console.error('Failed to find root element.');
}
