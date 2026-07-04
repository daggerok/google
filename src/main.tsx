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
 * - All user-facing strings are stored in a flat dictionary keyed by locale.
 * - `useT()` hook returns a `t(key)` function resolved against current locale.
 * - Language preference is persisted in AppConfig → localStorage.
 * - Dictionary keys use dot-notation grouping:
 *     • `header.*`      — header UI
 *     • `settings.*`    — settings panel
 *     • `data.*`        — data table & CRUD
 *     • `backend.*`     — backend badges
 *     • `google.*`      — Google Sheets tab content
 *     • `local.*`       — Local Storage tab content
 *
 * 2. [Theme System]
 * - Supports 'light', 'dark', and 'system' (auto-detect from browser).
 * - Persisted to localStorage under app config key.
 * - Applied by toggling `.dark` class on <html> element.
 * - Listens to `prefers-color-scheme` media query for 'system' mode changes.
 * - Quick-access toggle in header; full selection in Settings → General.
 *
 * 3. [Settings Panel with Open/Close Animation]
 * - Toggled from header gear icon.
 * - Open: `animate-slide-down` (slide + fade in).
 * - Close: `animate-slide-up` (slide + fade out), unmounts after animation ends.
 * - Contains sections:
 *     • General: theme selector, language selector, active backend display.
 *     • Tab "Local Storage": localStorage info, record count, clear action.
 *     • Tab "Google Sheets": full setup documentation, OAuth Client ID,
 *       spreadsheet config. Placeholder until auth is wired.
 * - All settings persisted to localStorage (never secrets, never tokens).
 *
 * 4. [Unified Data Layer — Backend-Agnostic CRUD Interface]
 * - `DataStore` interface: list(), add(text), remove(id), clear()
 * - `LocalStorageDataStore` implements the interface using localStorage.
 * - `GoogleSheetsDataStore` (placeholder) will implement the same interface.
 * - App components interact ONLY through the interface.
 *
 * 5. [Google OAuth SPA Token Flow — Prepared but Not Yet Active]
 * - Configuration fields (client ID, spreadsheet ID, sheet name) are in Settings.
 * - Full setup guide is embedded in the Google Sheets tab.
 * - Access tokens will be kept memory-only, never in localStorage.
 *
 * 6. [Debug Mode]
 * - Activated via `?debug=true` URL query parameter.
 * - Enables verbose console logging, prefixed with `[DBG]`.
 * - Shows debug info panel at bottom of page.
 *
 * DESIGN PATTERNS:
 * - Single File Application: Everything self-contained for easy maintenance.
 * - Public Static Hosting Safe-by-Design: only public OAuth identifiers stored.
 * - Custom SVGs inline to avoid dependency bloat.
 * - Backend-agnostic data layer: all CRUD goes through unified interface.
 * - All UI text goes through i18n dictionary — no hardcoded user-facing strings.
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

/** Google-specific configuration persisted in localStorage */
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
        'google.security.1': 'Client ID is a public identifier. It is safe to store in code and localStorage.',
        'google.security.2': 'Client Secret — NEVER enter or store here. It is not needed for browser-only apps.',
        'google.security.3': 'Access token is kept in memory only and is never written to localStorage.',
        'google.security.4': 'Each user works with their own Google account and can only access their own spreadsheets.',
        'google.clientId': 'Google OAuth Client ID',
        'google.clientId.placeholder': '1234567890-xxxxxxxx.apps.googleusercontent.com',
        'google.clientId.hint': 'Public identifier. NOT to be confused with Client Secret.',
        'google.spreadsheetId': 'Spreadsheet ID or full URL',
        'google.spreadsheetId.placeholder': 'https://docs.google.com/spreadsheets/d/... or ID',
        'google.sheetName': 'Sheet tab name',
        'google.connectedDoc': 'Connected document',
        'google.headers.info': 'The first row of the selected tab is reserved for headers:',
        'google.notYet': '⏳ Google authorization and Sheets connection will be implemented in the next step. Settings are saved locally so you don\'t have to re-enter them.',

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
        'google.security.1': 'Client ID — это публичный идентификатор. Его безопасно хранить в коде и localStorage.',
        'google.security.2': 'Client Secret — НИКОГДА не вводите и не храните здесь. Он не нужен для browser-only приложений.',
        'google.security.3': 'Access token хранится только в оперативной памяти и никогда не записывается в localStorage.',
        'google.security.4': 'Каждый пользователь работает со своим Google аккаунтом и имеет доступ только к своим таблицам.',
        'google.clientId': 'Google OAuth Client ID',
        'google.clientId.placeholder': '1234567890-xxxxxxxx.apps.googleusercontent.com',
        'google.clientId.hint': 'Публичный идентификатор. НЕ путать с Client Secret.',
        'google.spreadsheetId': 'Spreadsheet ID или полная ссылка',
        'google.spreadsheetId.placeholder': 'https://docs.google.com/spreadsheets/d/... или ID',
        'google.sheetName': 'Имя вкладки (sheet tab)',
        'google.connectedDoc': 'Подключённый документ',
        'google.headers.info': 'Первая строка выбранной вкладки зарезервирована под заголовки:',
        'google.notYet': '⏳ Google авторизация и подключение к Sheets будут реализованы на следующем шаге. Настройки сохраняются локально, чтобы не вводить их повторно.',

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
const GOOGLE_SHEETS_HEADERS = ['id', 'text', 'createdAt', 'updatedAt'] as const;

const DEBUG =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('debug') === 'true';

// ============================================================================
// DEBUG UTILITY
// ============================================================================

const dbg = (...args: unknown[]) => {
    if (DEBUG) console.log('[DBG]', ...args);
};

// ============================================================================
// i18n HOOK
// ============================================================================

/**
 * Returns a `t(key)` translation function for the given locale.
 * Falls back to key itself if not found in dictionary.
 */
const useT = (locale: Locale) => {
    return useMemo(() => {
        const dict = DICTIONARIES[locale] ?? DICTIONARIES.en;
        return (key: string): string => dict[key] ?? DICTIONARIES.en[key] ?? key;
    }, [locale]);
};

/**
 * Pluralizes record count for display.
 * Uses locale-aware rules (Russian has complex plural forms).
 */
const pluralizeRecords = (count: number, t: (key: string) => string): string => {
    const abs = Math.abs(count);
    if (abs === 0) return `${count} ${t('data.records.0')}`;
    if (abs % 10 === 1 && abs % 100 !== 11) return `${count} ${t('data.records.1')}`;
    if (abs % 10 >= 2 && abs % 10 <= 4 && (abs % 100 < 10 || abs % 100 >= 20))
        return `${count} ${t('data.records.few')}`;
    return `${count} ${t('data.records.many')}`;
};

// ============================================================================
// GENERAL HELPERS
// ============================================================================

const createId = (): string => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const nowISO = (): string => new Date().toISOString();

const tryParseJson = <T,>(raw: string, fallback: T): T => {
    try {
        return JSON.parse(raw) as T;
    } catch {
        return fallback;
    }
};

const formatTimestamp = (value: string, locale: Locale): string => {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return new Intl.DateTimeFormat(locale === 'ru' ? 'ru-RU' : 'en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(d);
};

const normalizeSpreadsheetId = (value: string): string => {
    const trimmed = value.trim();
    if (!trimmed) return '';
    const m = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (m?.[1]) return m[1];
    return trimmed.replace(/\/edit.*$/, '');
};

const buildSpreadsheetUrl = (id: string): string =>
    `https://docs.google.com/spreadsheets/d/${id}/edit`;

// ============================================================================
// THEME ENGINE
// ============================================================================

const resolveTheme = (pref: ThemePreference): 'light' | 'dark' => {
    if (pref === 'light' || pref === 'dark') return pref;
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
    }
    return 'light';
};

const applyThemeToDOM = (resolved: 'light' | 'dark') => {
    const html = document.documentElement;
    if (resolved === 'dark') {
        html.classList.add('dark');
    } else {
        html.classList.remove('dark');
    }
};

// ============================================================================
// APP CONFIG PERSISTENCE
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
        const parsed = tryParseJson<Partial<AppConfig>>(raw, {});
        return {
            ...DEFAULT_CONFIG,
            ...parsed,
            google: { ...DEFAULT_CONFIG.google, ...(parsed.google ?? {}) },
        };
    } catch (e) {
        dbg('Config read failed', e);
        return { ...DEFAULT_CONFIG };
    }
};

const writeConfig = (cfg: AppConfig): void => {
    try {
        localStorage.setItem(APP_CONFIG_KEY, JSON.stringify(cfg));
    } catch (e) {
        dbg('Config write failed', e);
    }
};

// ============================================================================
// LOCAL STORAGE DATA STORE
// ============================================================================

const createLocalDataStore = (storageKey: string): DataStore => {
    const readAll = (): AppRecord[] => {
        try {
            const raw = localStorage.getItem(storageKey);
            if (!raw) return [];
            const parsed = tryParseJson<unknown[]>(raw, []);
            if (!Array.isArray(parsed)) return [];
            return parsed.filter(
                (item): item is AppRecord =>
                    !!item &&
                    typeof item === 'object' &&
                    typeof (item as AppRecord).id === 'string' &&
                    typeof (item as AppRecord).text === 'string',
            );
        } catch {
            return [];
        }
    };

    const writeAll = (records: AppRecord[]) => {
        try {
            localStorage.setItem(storageKey, JSON.stringify(records));
        } catch (e) {
            dbg('LocalStore write failed', e);
        }
    };

    return {
        list: async () => readAll(),
        add: async (text: string) => {
            const record: AppRecord = {
                id: createId(),
                text,
                createdAt: nowISO(),
                updatedAt: nowISO(),
            };
            const all = readAll();
            all.push(record);
            writeAll(all);
            return record;
        },
        remove: async (id: string) => {
            const all = readAll().filter((r) => r.id !== id);
            writeAll(all);
        },
        clear: async () => {
            writeAll([]);
        },
    };
};

// ============================================================================
// GOOGLE SHEETS DATA STORE — PLACEHOLDER
// ============================================================================

const createGoogleSheetsDataStore = (
    _accessTokenRef: React.MutableRefObject<string | null>,
    _spreadsheetId: string,
    _sheetName: string,
): DataStore => {
    const notReady = () =>
        Promise.reject(new Error('Google Sheets backend is not yet connected.'));
    return { list: notReady, add: notReady, remove: notReady, clear: notReady };
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
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" />
    </svg>
);

const IconMoon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
);

const IconMonitor: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect width="20" height="14" x="2" y="3" rx="2" /><line x1="8" x2="16" y1="21" y2="21" /><line x1="12" x2="12" y1="17" y2="21" />
    </svg>
);

const IconPlus: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12h14" /><path d="M12 5v14" />
    </svg>
);

const IconTrash: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /><line x1="10" x2="10" y1="11" y2="17" /><line x1="14" x2="14" y1="11" y2="17" />
    </svg>
);

const IconRefresh: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" /><path d="M16 16h5v5" />
    </svg>
);

const IconX: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 6 6 18" /><path d="m6 6 12 12" />
    </svg>
);

const IconDatabase: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5V19A9 3 0 0 0 21 19V5" /><path d="M3 12A9 3 0 0 0 21 12" />
    </svg>
);

const IconSheet: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" /><path d="M8 13h2" /><path d="M14 13h2" /><path d="M8 17h2" /><path d="M14 17h2" />
    </svg>
);

// ============================================================================
// SETTINGS PANEL — LOCAL STORAGE TAB
// ============================================================================

const SettingsLocalTab: React.FC<{
    config: AppConfig;
    recordCount: number;
    onClearData: () => void;
    isBusy: boolean;
    t: (key: string) => string;
}> = ({ config, recordCount, onClearData, isBusy, t }) => (
    <div className="space-y-4 animate-fade-in">
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2">{t('local.how.title')}</h3>
            <ul className="text-xs text-slate-600 dark:text-slate-400 space-y-1.5 list-disc pl-4">
                <li>{t('local.how.1')}</li>
                <li>{t('local.how.2')}</li>
                <li>{t('local.how.3')}</li>
                <li>{t('local.how.4')}</li>
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
        <button
            type="button"
            onClick={onClearData}
            disabled={isBusy || recordCount === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-rose-300 dark:border-rose-700 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium text-rose-700 dark:text-rose-400 transition hover:bg-rose-50 dark:hover:bg-rose-900/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
            <IconTrash />
            {t('local.clearAll')}
        </button>
    </div>
);

// ============================================================================
// SETTINGS PANEL — GOOGLE SHEETS TAB
// ============================================================================

const SettingsGoogleTab: React.FC<{
    config: AppConfig;
    onConfigChange: (patch: Partial<GoogleConfig>) => void;
    t: (key: string) => string;
}> = ({ config, onConfigChange, t }) => (
    <div className="space-y-4 animate-fade-in">
        {/* Setup guide */}
        <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-4">
            <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-2">{t('google.setup.title')}</h3>
            <ol className="text-xs text-blue-800 dark:text-blue-300 space-y-2 list-decimal pl-4">
                <li>
                    <strong>{t('google.setup.step1')}</strong><br />
                    {t('google.setup.step1.detail')}{' '}
                    <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer" className="underline hover:text-blue-600 dark:hover:text-blue-100">console.cloud.google.com</a>
                </li>
                <li>
                    <strong>{t('google.setup.step2')}</strong><br />
                    {t('google.setup.step2.detail')}
                </li>
                <li>
                    <strong>{t('google.setup.step3')}</strong><br />
                    {t('google.setup.step3.detail')}<br />
                    {t('google.setup.step3.scopes')}{' '}
                    <code className="rounded bg-blue-100 dark:bg-blue-800 px-1 py-0.5">.../auth/spreadsheets</code>,{' '}
                    <code className="rounded bg-blue-100 dark:bg-blue-800 px-1 py-0.5">openid</code>,{' '}
                    <code className="rounded bg-blue-100 dark:bg-blue-800 px-1 py-0.5">email</code>,{' '}
                    <code className="rounded bg-blue-100 dark:bg-blue-800 px-1 py-0.5">profile</code>.
                </li>
                <li>
                    <strong>{t('google.setup.step4')}</strong><br />
                    {t('google.setup.step4.detail')}<br />
                    {t('google.setup.step4.origins')}
                    <ul className="list-disc pl-4 mt-1 space-y-0.5">
                        <li><code className="rounded bg-blue-100 dark:bg-blue-800 px-1 py-0.5">http://localhost:5173</code> {t('google.setup.step4.origins.dev')}</li>
                        <li><code className="rounded bg-blue-100 dark:bg-blue-800 px-1 py-0.5">https://YOUR-USERNAME.github.io</code> {t('google.setup.step4.origins.prod')}</li>
                    </ul>
                </li>
                <li>
                    <strong>{t('google.setup.step5')}</strong><br />
                    {t('google.setup.step5.detail')}
                </li>
            </ol>
        </div>

        {/* Security notice */}
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4">
            <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200 mb-1">{t('google.security.title')}</h3>
            <ul className="text-xs text-amber-800 dark:text-amber-300 space-y-1 list-disc pl-4">
                <li>{t('google.security.1')}</li>
                <li>{t('google.security.2')}</li>
                <li>{t('google.security.3')}</li>
                <li>{t('google.security.4')}</li>
            </ul>
        </div>

        {/* Client ID */}
        <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">{t('google.clientId')}</span>
            <input
                type="text"
                value={config.google.clientId}
                onChange={(e) => onConfigChange({ clientId: e.target.value })}
                placeholder={t('google.clientId.placeholder')}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 outline-none transition focus:border-slate-500 dark:focus:border-slate-400"
            />
            <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{t('google.clientId.hint')}</span>
        </label>

        {/* Spreadsheet ID */}
        <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">{t('google.spreadsheetId')}</span>
            <input
                type="text"
                value={config.google.spreadsheetId}
                onChange={(e) => onConfigChange({ spreadsheetId: e.target.value })}
                placeholder={t('google.spreadsheetId.placeholder')}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 outline-none transition focus:border-slate-500 dark:focus:border-slate-400"
            />
        </label>

        {/* Sheet name */}
        <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">{t('google.sheetName')}</span>
            <input
                type="text"
                value={config.google.sheetName}
                onChange={(e) => onConfigChange({ sheetName: e.target.value })}
                placeholder={DEFAULT_GOOGLE_SHEET_NAME}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 outline-none transition focus:border-slate-500 dark:focus:border-slate-400"
            />
        </label>

        {/* Connected doc link */}
        {normalizeSpreadsheetId(config.google.spreadsheetId) && (
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-4 text-sm">
                <div className="font-medium text-emerald-800 dark:text-emerald-200 mb-1">{t('google.connectedDoc')}</div>
                <a
                    href={buildSpreadsheetUrl(normalizeSpreadsheetId(config.google.spreadsheetId))}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-emerald-700 dark:text-emerald-300 underline break-all"
                >
                    {buildSpreadsheetUrl(normalizeSpreadsheetId(config.google.spreadsheetId))}
                </a>
            </div>
        )}

        {/* Headers info */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4 text-xs text-slate-600 dark:text-slate-400">
            {t('google.headers.info')}{' '}
            <code className="rounded bg-slate-200 dark:bg-slate-700 px-1 py-0.5">
                {GOOGLE_SHEETS_HEADERS.join(' | ')}
            </code>
        </div>

        {/* Not yet active */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">{t('google.notYet')}</p>
        </div>
    </div>
);

// ============================================================================
// SETTINGS PANEL — MAIN COMPONENT
// ============================================================================

const SettingsPanel: React.FC<{
    config: AppConfig;
    setConfig: React.Dispatch<React.SetStateAction<AppConfig>>;
    recordCount: number;
    onClearData: () => void;
    isBusy: boolean;
    isClosing: boolean;
    onCloseAnimEnd: () => void;
    t: (key: string) => string;
}> = ({ config, setConfig, recordCount, onClearData, isBusy, isClosing, onCloseAnimEnd, t }) => {
    const activeTab = config.settingsTab;

    const setActiveTab = (tab: 'local' | 'google') => {
        setConfig((prev) => ({ ...prev, settingsTab: tab }));
    };

    const handleGoogleConfigChange = useCallback(
        (patch: Partial<GoogleConfig>) => {
            setConfig((prev) => ({ ...prev, google: { ...prev.google, ...patch } }));
        },
        [setConfig],
    );

    const handleClose = () => {
        setConfig((prev) => ({ ...prev, settingsOpen: false }));
    };

    const themeOptions: { value: ThemePreference; label: string; icon: React.ReactNode }[] = [
        { value: 'light', label: t('settings.theme.light'), icon: <IconSun className="w-4 h-4" /> },
        { value: 'dark', label: t('settings.theme.dark'), icon: <IconMoon className="w-4 h-4" /> },
        { value: 'system', label: t('settings.theme.system'), icon: <IconMonitor className="w-4 h-4" /> },
    ];

    const langOptions: { value: Locale; label: string }[] = [
        { value: 'en', label: t('settings.language.en') },
        { value: 'ru', label: t('settings.language.ru') },
    ];

    return (
        <div
            className={`mb-6 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg overflow-hidden ${
                isClosing ? 'animate-slide-up' : 'animate-slide-down'
            }`}
            onAnimationEnd={() => {
                if (isClosing) onCloseAnimEnd();
            }}
        >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 px-5 py-3">
                <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">{t('settings.title')}</h2>
                <button
                    type="button"
                    onClick={handleClose}
                    className="rounded-lg p-1.5 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                    aria-label="Close settings"
                >
                    <IconX />
                </button>
            </div>

            {/* General section */}
            <div className="border-b border-slate-200 dark:border-slate-700 px-5 py-4 space-y-4">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">{t('settings.general')}</h3>

                {/* Theme selector */}
                <div>
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">{t('settings.theme')}</div>
                    <div className="flex gap-2">
                        {themeOptions.map((opt) => (
                            <button
                                key={opt.value}
                                type="button"
                                onClick={() => setConfig((prev) => ({ ...prev, theme: opt.value }))}
                                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition ${
                                    config.theme === opt.value
                                        ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                                        : 'border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                                }`}
                            >
                                {opt.icon}
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Language selector */}
                <div>
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">{t('settings.language')}</div>
                    <div className="flex gap-2">
                        {langOptions.map((opt) => (
                            <button
                                key={opt.value}
                                type="button"
                                onClick={() => setConfig((prev) => ({ ...prev, locale: opt.value }))}
                                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition ${
                                    config.locale === opt.value
                                        ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                                        : 'border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                                }`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Active backend display */}
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

            {/* Backend tabs */}
            <div className="border-b border-slate-200 dark:border-slate-700">
                <div className="flex themed-scroll overflow-x-auto">
                    <button
                        type="button"
                        onClick={() => setActiveTab('local')}
                        className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition whitespace-nowrap ${
                            activeTab === 'local'
                                ? 'border-slate-900 dark:border-slate-100 text-slate-900 dark:text-slate-100'
                                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600'
                        }`}
                    >
                        <IconDatabase className="shrink-0" />
                        {t('settings.tab.local')}
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('google')}
                        className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition whitespace-nowrap ${
                            activeTab === 'google'
                                ? 'border-slate-900 dark:border-slate-100 text-slate-900 dark:text-slate-100'
                                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600'
                        }`}
                    >
                        <IconSheet className="shrink-0" />
                        {t('settings.tab.google')}
                    </button>
                </div>
            </div>

            {/* Tab content */}
            <div className="px-5 py-4 themed-scroll max-h-[60vh] overflow-y-auto">
                {activeTab === 'local' ? (
                    <SettingsLocalTab config={config} recordCount={recordCount} onClearData={onClearData} isBusy={isBusy} t={t} />
                ) : (
                    <SettingsGoogleTab config={config} onConfigChange={handleGoogleConfigChange} t={t} />
                )}
            </div>
        </div>
    );
};

// ============================================================================
// THEME TOGGLE (Header quick-access)
// ============================================================================

const ThemeToggle: React.FC<{ theme: ThemePreference; onCycle: () => void; t: (key: string) => string }> = ({ theme, onCycle, t }) => {
    const resolvedTheme = resolveTheme(theme);
    const titles: Record<ThemePreference, string> = {
        light: t('settings.theme.light'),
        dark: t('settings.theme.dark'),
        system: t('settings.theme.system'),
    };

    return (
        <button
            type="button"
            onClick={onCycle}
            className="rounded-lg p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            aria-label={`${t('header.theme')}: ${titles[theme]}`}
            title={`${t('header.theme')}: ${titles[theme]}`}
        >
            {theme === 'system' ? <IconMonitor /> : resolvedTheme === 'dark' ? <IconMoon /> : <IconSun />}
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

    /**
     * Settings panel open/close animation state.
     * `settingsVisible` controls whether the DOM node exists.
     * `settingsClosing` triggers the close animation before unmount.
     */
    const [settingsVisible, setSettingsVisible] = useState(config.settingsOpen);
    const [settingsClosing, setSettingsClosing] = useState(false);

    const bootDone = useRef(false);

    const t = useT(config.locale);
    const resolvedTheme = useMemo(() => resolveTheme(config.theme), [config.theme]);

    /**
     * Active backend mode.
     * Typed explicitly as BackendMode so TypeScript does not narrow
     * the literal to just 'local', which would make comparisons with
     * 'google' a TS2367 error. When Google auth is wired, the memo
     * body will evaluate config.preferredBackend + auth state.
     */
    const activeBackend = useMemo<BackendMode>(() => {
        // TODO: return 'google' when Google auth is connected and config.preferredBackend === 'google'
        return config.preferredBackend === 'google' ? 'local' : 'local';
    }, [config.preferredBackend]);

    const dataStore: DataStore = useMemo(
        () => createLocalDataStore(config.localStorageKey),
        [config.localStorageKey],
    );

    const sortedRecords = useMemo(
        () => [...records].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
        [records],
    );

    /* ── Theme sync ─────────────────────────────────────────────────────── */

    useEffect(() => {
        applyThemeToDOM(resolvedTheme);
    }, [resolvedTheme]);

    useEffect(() => {
        if (config.theme !== 'system') return;
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        const handler = () => applyThemeToDOM(resolveTheme('system'));
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, [config.theme]);

    /* ── Config persistence ─────────────────────────────────────────────── */

    useEffect(() => {
        writeConfig(config);
    }, [config]);

    /* ── Settings open/close animation bridge ───────────────────────────── */

    useEffect(() => {
        if (config.settingsOpen) {
            setSettingsClosing(false);
            setSettingsVisible(true);
        } else if (settingsVisible) {
            setSettingsClosing(true);
        }
    }, [config.settingsOpen, settingsVisible]);

    const handleSettingsCloseAnimEnd = useCallback(() => {
        setSettingsVisible(false);
        setSettingsClosing(false);
    }, []);

    /* ── Boot ───────────────────────────────────────────────────────────── */

    useEffect(() => {
        if (bootDone.current) return;
        bootDone.current = true;
        void (async () => {
            setIsBusy(true);
            try {
                const loaded = await dataStore.list();
                setRecords(loaded);
                dbg('Boot: loaded', loaded.length, 'records');
            } catch (e) {
                setError(String(e));
            } finally {
                setIsBusy(false);
            }
        })();
    }, [dataStore]);

    /* ── Theme cycling: light → dark → system → light ───────────────────── */

    const cycleTheme = useCallback(() => {
        setConfig((prev) => {
            const order: ThemePreference[] = ['light', 'dark', 'system'];
            const idx = order.indexOf(prev.theme);
            return { ...prev, theme: order[(idx + 1) % order.length] };
        });
    }, []);

    /* ── Settings toggle ────────────────────────────────────────────────── */

    const toggleSettings = useCallback(() => {
        setConfig((prev) => ({ ...prev, settingsOpen: !prev.settingsOpen }));
    }, []);

    /* ── CRUD handlers ──────────────────────────────────────────────────── */

    const handleAdd = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const text = draftText.trim();
        if (!text) return;
        setIsBusy(true);
        setError('');
        try {
            await dataStore.add(text);
            const updated = await dataStore.list();
            setRecords(updated);
            setDraftText('');
        } catch (err) {
            setError(String(err));
        } finally {
            setIsBusy(false);
        }
    }, [dataStore, draftText]);

    const handleDelete = useCallback(async (id: string) => {
        setIsBusy(true);
        setError('');
        try {
            await dataStore.remove(id);
            const updated = await dataStore.list();
            setRecords(updated);
        } catch (err) {
            setError(String(err));
        } finally {
            setIsBusy(false);
        }
    }, [dataStore]);

    const handleClearAll = useCallback(async () => {
        setIsBusy(true);
        setError('');
        try {
            await dataStore.clear();
            setRecords([]);
        } catch (err) {
            setError(String(err));
        } finally {
            setIsBusy(false);
        }
    }, [dataStore]);

    const handleReload = useCallback(async () => {
        setIsBusy(true);
        setError('');
        try {
            const loaded = await dataStore.list();
            setRecords(loaded);
        } catch (err) {
            setError(String(err));
        } finally {
            setIsBusy(false);
        }
    }, [dataStore]);

    /* ── Render ─────────────────────────────────────────────────────────── */

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
            {/* ── Header ─────────────────────────────────────────────────── */}
            <header className="sticky top-0 z-30 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md">
                <div className="mx-auto max-w-6xl flex items-center justify-between px-4 py-3">
                    <h1 className="text-lg font-bold tracking-tight">{t('header.title')}</h1>
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            onClick={toggleSettings}
                            className={`rounded-lg p-2 transition ${
                                config.settingsOpen
                                    ? 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-100'
                                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`}
                            aria-label={t('header.settings')}
                            title={t('header.settings')}
                        >
                            <IconSettings />
                        </button>
                        <ThemeToggle theme={config.theme} onCycle={cycleTheme} t={t} />
                    </div>
                </div>
            </header>

            {/* ── Main ───────────────────────────────────────────────────── */}
            <main className="mx-auto max-w-6xl px-4 py-6">
                {/* Settings panel (animated open/close) */}
                {settingsVisible && (
                    <SettingsPanel
                        config={config}
                        setConfig={setConfig}
                        recordCount={records.length}
                        onClearData={handleClearAll}
                        isBusy={isBusy}
                        isClosing={settingsClosing}
                        onCloseAnimEnd={handleSettingsCloseAnimEnd}
                        t={t}
                    />
                )}

                {/* Error */}
                {error && (
                    <div className="mb-4 rounded-2xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20 p-4 text-sm text-rose-700 dark:text-rose-300 animate-fade-in">
                        {error}
                    </div>
                )}

                {/* Backend badge */}
                <div className="mb-4 flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-200 dark:bg-slate-800 px-3 py-1 text-xs font-medium text-slate-700 dark:text-slate-300">
                        {activeBackend === 'google' ? <IconSheet className="w-3.5 h-3.5" /> : <IconDatabase className="w-3.5 h-3.5" />}
                        {activeBackend === 'google' ? t('backend.badge.google') : t('backend.badge.local')}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                        {pluralizeRecords(sortedRecords.length, t)}
                    </span>
                </div>

                {/* Add record form */}
                <form onSubmit={handleAdd} className="mb-5">
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={draftText}
                            onChange={(e) => setDraftText(e.target.value)}
                            placeholder={t('data.placeholder')}
                            className="flex-1 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 outline-none transition focus:border-slate-500 dark:focus:border-slate-400"
                        />
                        <button
                            type="submit"
                            disabled={isBusy || !draftText.trim()}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 dark:bg-slate-100 px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 transition hover:bg-slate-800 dark:hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <IconPlus />
                            {t('data.add')}
                        </button>
                        <button
                            type="button"
                            onClick={handleReload}
                            disabled={isBusy}
                            className="rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 p-2.5 text-slate-600 dark:text-slate-300 transition hover:bg-slate-50 dark:hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                            title={t('data.reload')}
                        >
                            <IconRefresh />
                        </button>
                    </div>
                </form>

                {/* Records table */}
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
                            <tr>
                                <td colSpan={4} className="px-4 py-16 text-center text-slate-400 dark:text-slate-500">
                                    <div className="flex flex-col items-center gap-2">
                                        <IconDatabase className="w-8 h-8 opacity-40" />
                                        <span>{t('data.empty')}</span>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            sortedRecords.map((record, index) => (
                                <tr key={record.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                                    <td className="px-4 py-3 align-top text-slate-400 dark:text-slate-500 tabular-nums">{index + 1}</td>
                                    <td className="px-4 py-3 align-top">
                                        <div className="text-slate-800 dark:text-slate-200 break-words whitespace-pre-wrap">{record.text}</div>
                                        <div className="mt-1 text-[11px] text-slate-400 dark:text-slate-500 font-mono">{record.id}</div>
                                    </td>
                                    <td className="px-4 py-3 align-top text-slate-500 dark:text-slate-400 whitespace-nowrap">
                                        {formatTimestamp(record.createdAt, config.locale)}
                                    </td>
                                    <td className="px-4 py-3 align-top text-right">
                                        <button
                                            type="button"
                                            onClick={() => handleDelete(record.id)}
                                            disabled={isBusy}
                                            className="inline-flex items-center gap-1 rounded-lg border border-rose-200 dark:border-rose-800 px-2.5 py-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 transition hover:bg-rose-50 dark:hover:bg-rose-900/20 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            <IconTrash />
                                            {t('data.delete')}
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                        </tbody>
                    </table>
                </div>

                {/* Debug */}
                {DEBUG && (
                    <details className="mt-6 rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4">
                        <summary className="cursor-pointer text-sm font-medium text-amber-800 dark:text-amber-200">{t('debug.title')}</summary>
                        <pre className="mt-3 text-xs text-amber-700 dark:text-amber-300 overflow-x-auto">
                            {JSON.stringify({ config, recordCount: records.length, activeBackend, resolvedTheme }, null, 2)}
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
    createRoot(rootElement).render(<React.StrictMode><App /></React.StrictMode>);
} else {
    console.error('Failed to find root element.');
}
