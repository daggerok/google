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
 * 1. [Theme System]
 * - Supports 'light', 'dark', and 'system' (auto-detect from browser).
 * - Persisted to localStorage under app config key.
 * - Applied by toggling `.dark` class on <html> element.
 * - Listens to `prefers-color-scheme` media query for 'system' mode changes.
 *
 * 2. [Settings Panel]
 * - Toggled from header gear icon.
 * - Contains shared settings section (applicable to all backends).
 * - Two tabs for backend-specific configuration:
 *     • "Local Storage" tab — shows localStorage DB key, record count, clear action.
 *     • "Google Sheets" tab — full setup guide, OAuth Client ID input, spreadsheet
 *       configuration, connect/disconnect/create/attach actions.
 * - All settings persisted to localStorage (never secrets, never tokens).
 *
 * 3. [Unified Data Layer — Backend-Agnostic CRUD Interface]
 * - `DataStore` interface: list(), add(text), remove(id), clear()
 * - `LocalStorageDataStore` implements the interface using localStorage.
 * - `GoogleSheetsDataStore` (placeholder) will implement the same interface
 *   using Google Sheets API — to be activated after Google auth is wired.
 * - App components interact ONLY through the interface, never directly
 *   with localStorage or Google API.
 *
 * 4. [Google OAuth SPA Token Flow — Prepared but Not Yet Active]
 * - Uses Google Identity Services (GIS) token client directly in the browser.
 * - Designed for public static hosting (e.g. GitHub Pages).
 * - Stores NO client secret, NO service account key, NO refresh token.
 * - Access tokens are kept memory-only and are never persisted to localStorage.
 * - Configuration (client ID, spreadsheet ID, sheet name) IS persisted.
 *
 * 5. [Debug Mode]
 * - Activated via `?debug=true` URL query parameter.
 * - Enables verbose console logging throughout auth, boot restore, and API requests.
 * - All debug logs are prefixed with `[DBG]` for easy filtering.
 * - When `?debug=true` is not present, all debug logging is completely inert (no-op).
 *
 * DESIGN PATTERNS:
 * - Single File Application: Everything is self-contained for easy maintenance.
 * - Public Static Hosting Safe-by-Design: only public OAuth identifiers stored.
 * - Custom SVGs inline to avoid dependency bloat.
 * - Backend-agnostic data layer: all CRUD goes through a unified interface.
 * ============================================================================
 */

// @ts-ignore
import React, { useState, useEffect, useRef, useMemo, useCallback, ChangeEvent } from 'react';
import { createRoot } from 'react-dom/client';

// ============================================================================
// TYPES
// ============================================================================

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
 * App components NEVER call storage APIs directly — only through this interface.
 */
type DataStore = {
    list: () => Promise<AppRecord[]>;
    add: (text: string) => Promise<AppRecord>;
    remove: (id: string) => Promise<void>;
    clear: () => Promise<void>;
};

// ============================================================================
// CONSTANTS
// ============================================================================

const APP_CONFIG_KEY = 'gsd.config.v1';
const DEFAULT_LOCAL_STORAGE_DB_KEY = 'gsd.records.v1';
const DEFAULT_GOOGLE_SHEET_NAME = 'Records';

/**
 * SECURITY NOTE:
 * OAuth Client ID is NOT a secret. It is a public identifier by Google's design.
 * It is safe to commit to a public repo.
 * NEVER place Client Secret, service account keys, or refresh tokens here.
 */
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

const formatTimestamp = (value: string): string => {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
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

/**
 * Resolves 'system' preference to actual 'light' or 'dark'
 * based on browser's prefers-color-scheme media query.
 */
const resolveTheme = (pref: ThemePreference): 'light' | 'dark' => {
    if (pref === 'light' || pref === 'dark') return pref;
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
    }
    return 'light';
};

/**
 * Applies resolved theme to <html> element by toggling .dark class.
 */
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
// LOCAL STORAGE DATA STORE IMPLEMENTATION
// ============================================================================

/**
 * Creates a DataStore backed by localStorage.
 * All operations are sync but wrapped in Promises to match the unified interface
 * that Google Sheets backend will also implement.
 */
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

/**
 * Placeholder for Google Sheets DataStore.
 * Will be implemented when Google auth flow is wired up.
 * Conforms to the same DataStore interface.
 */
const createGoogleSheetsDataStore = (
    _accessTokenRef: React.MutableRefObject<string | null>,
    _spreadsheetId: string,
    _sheetName: string,
): DataStore => {
    const notReady = () =>
        Promise.reject(new Error('Google Sheets backend is not yet connected.'));

    return {
        list: notReady,
        add: notReady,
        remove: notReady,
        clear: notReady,
    };
};

// ============================================================================
// SVG ICONS (inline to avoid dependency bloat)
// ============================================================================

/** Gear / cog icon for Settings button */
const IconSettings: React.FC<{ className?: string }> = ({ className }) => (
    <svg
        className={className}
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
        <circle cx="12" cy="12" r="3" />
    </svg>
);

/** Sun icon for light theme indicator */
const IconSun: React.FC<{ className?: string }> = ({ className }) => (
    <svg
        className={className}
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2" />
        <path d="M12 20v2" />
        <path d="m4.93 4.93 1.41 1.41" />
        <path d="m17.66 17.66 1.41 1.41" />
        <path d="M2 12h2" />
        <path d="M20 12h2" />
        <path d="m6.34 17.66-1.41 1.41" />
        <path d="m19.07 4.93-1.41 1.41" />
    </svg>
);

/** Moon icon for dark theme indicator */
const IconMoon: React.FC<{ className?: string }> = ({ className }) => (
    <svg
        className={className}
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
);

/** Monitor icon for system/auto theme indicator */
const IconMonitor: React.FC<{ className?: string }> = ({ className }) => (
    <svg
        className={className}
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <rect width="20" height="14" x="2" y="3" rx="2" />
        <line x1="8" x2="16" y1="21" y2="21" />
        <line x1="12" x2="12" y1="17" y2="21" />
    </svg>
);

/** Plus icon for add actions */
const IconPlus: React.FC<{ className?: string }> = ({ className }) => (
    <svg
        className={className}
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <path d="M5 12h14" />
        <path d="M12 5v14" />
    </svg>
);

/** Trash icon for delete actions */
const IconTrash: React.FC<{ className?: string }> = ({ className }) => (
    <svg
        className={className}
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <path d="M3 6h18" />
        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
        <line x1="10" x2="10" y1="11" y2="17" />
        <line x1="14" x2="14" y1="11" y2="17" />
    </svg>
);

/** Refresh icon for reload/sync actions */
const IconRefresh: React.FC<{ className?: string }> = ({ className }) => (
    <svg
        className={className}
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
        <path d="M3 3v5h5" />
        <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
        <path d="M16 16h5v5" />
    </svg>
);

/** Chevron down icon for collapsible sections */
const IconChevronDown: React.FC<{ className?: string }> = ({ className }) => (
    <svg
        className={className}
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <path d="m6 9 6 6 6-6" />
    </svg>
);

/** X / close icon */
const IconX: React.FC<{ className?: string }> = ({ className }) => (
    <svg
        className={className}
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <path d="M18 6 6 18" />
        <path d="m6 6 12 12" />
    </svg>
);

/** Database / storage icon */
const IconDatabase: React.FC<{ className?: string }> = ({ className }) => (
    <svg
        className={className}
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <ellipse cx="12" cy="5" rx="9" ry="3" />
        <path d="M3 5V19A9 3 0 0 0 21 19V5" />
        <path d="M3 12A9 3 0 0 0 21 12" />
    </svg>
);

/** Sheet / table icon for Google Sheets */
const IconSheet: React.FC<{ className?: string }> = ({ className }) => (
    <svg
        className={className}
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
        <path d="M14 2v4a2 2 0 0 0 2 2h4" />
        <path d="M8 13h2" />
        <path d="M14 13h2" />
        <path d="M8 17h2" />
        <path d="M14 17h2" />
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
}> = ({ config, recordCount, onClearData, isBusy }) => {
    return (
        <div className="space-y-4 animate-fade-in">
            {/* Info card */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4">
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2">
                    Как это работает
                </h3>
                <ul className="text-xs text-slate-600 dark:text-slate-400 space-y-1.5 list-disc pl-4">
                    <li>Все данные хранятся в <code className="rounded bg-slate-200 dark:bg-slate-700 px-1 py-0.5">localStorage</code> вашего браузера.</li>
                    <li>Данные не покидают ваше устройство и не синхронизируются между браузерами.</li>
                    <li>При очистке данных браузера записи будут потеряны.</li>
                    <li>Лимит хранилища обычно ~5–10 МБ (зависит от браузера).</li>
                </ul>
            </div>

            {/* Stats */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">Ключ хранилища</div>
                        <code className="text-xs text-slate-700 dark:text-slate-300">{config.localStorageKey}</code>
                    </div>
                    <div className="text-right">
                        <div className="text-xs text-slate-500 dark:text-slate-400">Записей</div>
                        <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">{recordCount}</div>
                    </div>
                </div>
            </div>

            {/* Clear */}
            <button
                type="button"
                onClick={onClearData}
                disabled={isBusy || recordCount === 0}
                className="inline-flex items-center gap-2 rounded-lg border border-rose-300 dark:border-rose-700 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium text-rose-700 dark:text-rose-400 transition hover:bg-rose-50 dark:hover:bg-rose-900/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
                <IconTrash />
                Очистить все записи
            </button>
        </div>
    );
};

// ============================================================================
// SETTINGS PANEL — GOOGLE SHEETS TAB
// ============================================================================

const SettingsGoogleTab: React.FC<{
    config: AppConfig;
    onConfigChange: (patch: Partial<GoogleConfig>) => void;
}> = ({ config, onConfigChange }) => {
    return (
        <div className="space-y-4 animate-fade-in">
            {/* Documentation / setup guide */}
            <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-4">
                <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-2">
                    📋 Как настроить Google Sheets как хранилище
                </h3>
                <ol className="text-xs text-blue-800 dark:text-blue-300 space-y-2 list-decimal pl-4">
                    <li>
                        <strong>Создайте проект в Google Cloud Console</strong>
                        <br />
                        Перейдите на{' '}
                        <a
                            href="https://console.cloud.google.com/"
                            target="_blank"
                            rel="noreferrer"
                            className="underline hover:text-blue-600 dark:hover:text-blue-100"
                        >
                            console.cloud.google.com
                        </a>
                        {' '}→ создайте новый проект (любое имя).
                    </li>
                    <li>
                        <strong>Включите Google Sheets API</strong>
                        <br />
                        APIs & Services → Library → найдите <em>Google Sheets API</em> → Enable.
                    </li>
                    <li>
                        <strong>Настройте OAuth consent screen</strong>
                        <br />
                        APIs & Services → OAuth consent screen → тип <em>External</em>.
                        <br />
                        Заполните: App name, Support email, Developer contact.
                        <br />
                        Scopes: добавьте <code className="rounded bg-blue-100 dark:bg-blue-800 px-1 py-0.5">.../auth/spreadsheets</code>,{' '}
                        <code className="rounded bg-blue-100 dark:bg-blue-800 px-1 py-0.5">openid</code>,{' '}
                        <code className="rounded bg-blue-100 dark:bg-blue-800 px-1 py-0.5">email</code>,{' '}
                        <code className="rounded bg-blue-100 dark:bg-blue-800 px-1 py-0.5">profile</code>.
                    </li>
                    <li>
                        <strong>Создайте OAuth Client ID</strong>
                        <br />
                        APIs & Services → Credentials → Create Credentials → OAuth client ID.
                        <br />
                        Тип: <em>Web application</em>.
                        <br />
                        Authorized JavaScript origins — добавьте:
                        <ul className="list-disc pl-4 mt-1 space-y-0.5">
                            <li><code className="rounded bg-blue-100 dark:bg-blue-800 px-1 py-0.5">http://localhost:5173</code> (для разработки)</li>
                            <li><code className="rounded bg-blue-100 dark:bg-blue-800 px-1 py-0.5">https://YOUR-USERNAME.github.io</code> (для GitHub Pages)</li>
                        </ul>
                    </li>
                    <li>
                        <strong>Скопируйте Client ID</strong> (выглядит как <code className="rounded bg-blue-100 dark:bg-blue-800 px-1 py-0.5">123...apps.googleusercontent.com</code>)
                        <br />
                        и вставьте в поле ниже.
                    </li>
                </ol>
            </div>

            {/* Security notice */}
            <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4">
                <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200 mb-1">
                    🔒 Безопасность
                </h3>
                <ul className="text-xs text-amber-800 dark:text-amber-300 space-y-1 list-disc pl-4">
                    <li><strong>Client ID</strong> — это публичный идентификатор. Его безопасно хранить в коде и localStorage.</li>
                    <li><strong>Client Secret</strong> — НИКОГДА не вводите и не храните здесь. Он не нужен для browser-only приложений.</li>
                    <li><strong>Access token</strong> хранится только в оперативной памяти и никогда не записывается в localStorage.</li>
                    <li>Каждый пользователь работает со своим Google аккаунтом и имеет доступ только к своим таблицам.</li>
                </ul>
            </div>

            {/* Client ID input */}
            <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Google OAuth Client ID
                </span>
                <input
                    type="text"
                    value={config.google.clientId}
                    onChange={(e) => onConfigChange({ clientId: e.target.value })}
                    placeholder="1234567890-xxxxxxxx.apps.googleusercontent.com"
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 outline-none transition focus:border-slate-500 dark:focus:border-slate-400"
                />
                <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                    Публичный идентификатор. НЕ путать с Client Secret.
                </span>
            </label>

            {/* Spreadsheet configuration */}
            <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Spreadsheet ID или полная ссылка
                </span>
                <input
                    type="text"
                    value={config.google.spreadsheetId}
                    onChange={(e) => onConfigChange({ spreadsheetId: e.target.value })}
                    placeholder="https://docs.google.com/spreadsheets/d/... или ID"
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 outline-none transition focus:border-slate-500 dark:focus:border-slate-400"
                />
            </label>

            <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Имя вкладки (sheet tab)
                </span>
                <input
                    type="text"
                    value={config.google.sheetName}
                    onChange={(e) => onConfigChange({ sheetName: e.target.value })}
                    placeholder={DEFAULT_GOOGLE_SHEET_NAME}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 outline-none transition focus:border-slate-500 dark:focus:border-slate-400"
                />
            </label>

            {/* Spreadsheet link if configured */}
            {normalizeSpreadsheetId(config.google.spreadsheetId) && (
                <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-4 text-sm">
                    <div className="font-medium text-emerald-800 dark:text-emerald-200 mb-1">Подключённый документ</div>
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

            {/* Schema info */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4 text-xs text-slate-600 dark:text-slate-400">
                Первая строка выбранной вкладки будет зарезервирована под заголовки:
                <code className="mx-1 rounded bg-slate-200 dark:bg-slate-700 px-1 py-0.5">
                    {GOOGLE_SHEETS_HEADERS.join(' | ')}
                </code>
            </div>

            {/* Not yet active notice */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                    ⏳ Google авторизация и подключение к Sheets будут реализованы на следующем шаге.
                    Пока что настройки сохраняются локально, чтобы не вводить их повторно.
                </p>
            </div>
        </div>
    );
};

// ============================================================================
// SETTINGS PANEL — MAIN COMPONENT
// ============================================================================

const SettingsPanel: React.FC<{
    config: AppConfig;
    setConfig: React.Dispatch<React.SetStateAction<AppConfig>>;
    recordCount: number;
    onClearData: () => void;
    isBusy: boolean;
}> = ({ config, setConfig, recordCount, onClearData, isBusy }) => {
    const activeTab = config.settingsTab;

    const setActiveTab = (tab: 'local' | 'google') => {
        setConfig((prev) => ({ ...prev, settingsTab: tab }));
    };

    const handleGoogleConfigChange = useCallback(
        (patch: Partial<GoogleConfig>) => {
            setConfig((prev) => ({
                ...prev,
                google: { ...prev.google, ...patch },
            }));
        },
        [setConfig],
    );

    return (
        <div className="animate-slide-down mb-6 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg overflow-hidden">
            {/* Settings header */}
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 px-5 py-3">
                <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Настройки</h2>
                <button
                    type="button"
                    onClick={() => setConfig((prev) => ({ ...prev, settingsOpen: false }))}
                    className="rounded-lg p-1.5 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                    aria-label="Close settings"
                >
                    <IconX />
                </button>
            </div>

            {/* Common settings */}
            <div className="border-b border-slate-200 dark:border-slate-700 px-5 py-4">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Общие</h3>
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="text-sm font-medium text-slate-700 dark:text-slate-300">Активный backend</div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                {config.preferredBackend === 'google'
                                    ? 'Google Sheets (если подключён)'
                                    : 'localStorage (локальное хранилище)'}
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
                        Local Storage
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
                        Google Sheets
                    </button>
                </div>
            </div>

            {/* Tab content */}
            <div className="px-5 py-4 themed-scroll max-h-[60vh] overflow-y-auto">
                {activeTab === 'local' ? (
                    <SettingsLocalTab
                        config={config}
                        recordCount={recordCount}
                        onClearData={onClearData}
                        isBusy={isBusy}
                    />
                ) : (
                    <SettingsGoogleTab
                        config={config}
                        onConfigChange={handleGoogleConfigChange}
                    />
                )}
            </div>
        </div>
    );
};

// ============================================================================
// THEME TOGGLE BUTTON
// ============================================================================

const ThemeToggle: React.FC<{
    theme: ThemePreference;
    onCycle: () => void;
}> = ({ theme, onCycle }) => {
    const resolvedTheme = resolveTheme(theme);

    return (
        <button
            type="button"
            onClick={onCycle}
            className="rounded-lg p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            aria-label={`Current theme: ${theme}. Click to cycle.`}
            title={`Тема: ${theme === 'system' ? 'системная' : theme === 'dark' ? 'тёмная' : 'светлая'}`}
        >
            {theme === 'system' ? (
                <IconMonitor />
            ) : resolvedTheme === 'dark' ? (
                <IconMoon />
            ) : (
                <IconSun />
            )}
        </button>
    );
};

// ============================================================================
// MAIN APPLICATION COMPONENT
// ============================================================================

const App: React.FC = () => {
    // ── State ──────────────────────────────────────────────────────────────
    const [config, setConfig] = useState<AppConfig>(() => readConfig());
    const [records, setRecords] = useState<AppRecord[]>([]);
    const [draftText, setDraftText] = useState('');
    const [isBusy, setIsBusy] = useState(false);
    const [error, setError] = useState('');

    const bootDone = useRef(false);

    // ── Derived ────────────────────────────────────────────────────────────
    const resolvedTheme = useMemo(() => resolveTheme(config.theme), [config.theme]);

    const activeBackend: BackendMode = useMemo(() => {
        // Google backend will be activatable after auth is wired
        return 'local';
    }, []);

    const dataStore: DataStore = useMemo(
        () => createLocalDataStore(config.localStorageKey),
        [config.localStorageKey],
    );

    const sortedRecords = useMemo(
        () => [...records].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
        [records],
    );

    // ── Theme sync ─────────────────────────────────────────────────────────
    useEffect(() => {
        applyThemeToDOM(resolvedTheme);
    }, [resolvedTheme]);

    /**
     * Listen to OS theme changes when preference is 'system'.
     * This ensures live updates if user changes system dark/light mode
     * while the app is open.
     */
    useEffect(() => {
        if (config.theme !== 'system') return;

        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        const handler = () => applyThemeToDOM(resolveTheme('system'));
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, [config.theme]);

    // ── Config persistence ─────────────────────────────────────────────────
    useEffect(() => {
        writeConfig(config);
    }, [config]);

    // ── Boot ───────────────────────────────────────────────────────────────
    useEffect(() => {
        if (bootDone.current) return;
        bootDone.current = true;

        void (async () => {
            setIsBusy(true);
            try {
                const loaded = await dataStore.list();
                setRecords(loaded);
                dbg('Boot: loaded', loaded.length, 'records from localStorage');
            } catch (e) {
                setError(String(e));
            } finally {
                setIsBusy(false);
            }
        })();
    }, [dataStore]);

    // ── Theme cycling: light → dark → system → light ───────────────────────
    const cycleTheme = useCallback(() => {
        setConfig((prev) => {
            const order: ThemePreference[] = ['light', 'dark', 'system'];
            const idx = order.indexOf(prev.theme);
            const next = order[(idx + 1) % order.length];
            return { ...prev, theme: next };
        });
    }, []);

    // ── Settings toggle ────────────────────────────────────────────────────
    const toggleSettings = useCallback(() => {
        setConfig((prev) => ({ ...prev, settingsOpen: !prev.settingsOpen }));
    }, []);

    // ── CRUD handlers ──────────────────────────────────────────────────────

    const handleAdd = useCallback(
        async (e: React.FormEvent<HTMLFormElement>) => {
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
        },
        [dataStore, draftText],
    );

    const handleDelete = useCallback(
        async (id: string) => {
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
        },
        [dataStore],
    );

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

    // ── Render ─────────────────────────────────────────────────────────────

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
            {/* ── Header ─────────────────────────────────────────────────── */}
            <header className="sticky top-0 z-30 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md">
                <div className="mx-auto max-w-6xl flex items-center justify-between px-4 py-3">
                    <h1 className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">
                        Google Sheets Store
                    </h1>
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            onClick={toggleSettings}
                            className={`rounded-lg p-2 transition ${
                                config.settingsOpen
                                    ? 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-100'
                                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`}
                            aria-label="Toggle settings"
                            title="Настройки"
                        >
                            <IconSettings />
                        </button>
                        <ThemeToggle theme={config.theme} onCycle={cycleTheme} />
                    </div>
                </div>
            </header>

            {/* ── Main ───────────────────────────────────────────────────── */}
            <main className="mx-auto max-w-6xl px-4 py-6">
                {/* Settings panel (collapsible) */}
                {config.settingsOpen && (
                    <SettingsPanel
                        config={config}
                        setConfig={setConfig}
                        recordCount={records.length}
                        onClearData={handleClearAll}
                        isBusy={isBusy}
                    />
                )}

                {/* Error message */}
                {error && (
                    <div className="mb-4 rounded-2xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20 p-4 text-sm text-rose-700 dark:text-rose-300 animate-fade-in">
                        {error}
                    </div>
                )}

                {/* Backend badge */}
                <div className="mb-4 flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-200 dark:bg-slate-800 px-3 py-1 text-xs font-medium text-slate-700 dark:text-slate-300">
                        {activeBackend === 'google' ? <IconSheet className="w-3.5 h-3.5" /> : <IconDatabase className="w-3.5 h-3.5" />}
                        {activeBackend === 'google' ? 'Google Sheets' : 'localStorage'}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                        {sortedRecords.length} {sortedRecords.length === 1 ? 'запись' : sortedRecords.length >= 2 && sortedRecords.length <= 4 ? 'записи' : 'записей'}
                    </span>
                </div>

                {/* Add record form */}
                <form onSubmit={handleAdd} className="mb-5">
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={draftText}
                            onChange={(e) => setDraftText(e.target.value)}
                            placeholder="Новая запись..."
                            className="flex-1 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 outline-none transition focus:border-slate-500 dark:focus:border-slate-400"
                        />
                        <button
                            type="submit"
                            disabled={isBusy || !draftText.trim()}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 dark:bg-slate-100 px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 transition hover:bg-slate-800 dark:hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <IconPlus />
                            Добавить
                        </button>
                        <button
                            type="button"
                            onClick={handleReload}
                            disabled={isBusy}
                            className="rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 p-2.5 text-slate-600 dark:text-slate-300 transition hover:bg-slate-50 dark:hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                            title="Обновить"
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
                            <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-400 w-12">#</th>
                            <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-400">Текст</th>
                            <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-400 w-44">Создано</th>
                            <th className="px-4 py-3 text-right font-semibold text-slate-600 dark:text-slate-400 w-24"></th>
                        </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {sortedRecords.length === 0 ? (
                            <tr>
                                <td colSpan={4} className="px-4 py-16 text-center text-slate-400 dark:text-slate-500">
                                    <div className="flex flex-col items-center gap-2">
                                        <IconDatabase className="w-8 h-8 opacity-40" />
                                        <span>Пока пусто. Добавь первую запись.</span>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            sortedRecords.map((record, index) => (
                                <tr
                                    key={record.id}
                                    className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
                                >
                                    <td className="px-4 py-3 align-top text-slate-400 dark:text-slate-500 tabular-nums">
                                        {index + 1}
                                    </td>
                                    <td className="px-4 py-3 align-top">
                                        <div className="text-slate-800 dark:text-slate-200 break-words whitespace-pre-wrap">
                                            {record.text}
                                        </div>
                                        <div className="mt-1 text-[11px] text-slate-400 dark:text-slate-500 font-mono">
                                            {record.id}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 align-top text-slate-500 dark:text-slate-400 whitespace-nowrap">
                                        {formatTimestamp(record.createdAt)}
                                    </td>
                                    <td className="px-4 py-3 align-top text-right">
                                        <button
                                            type="button"
                                            onClick={() => handleDelete(record.id)}
                                            disabled={isBusy}
                                            className="inline-flex items-center gap-1 rounded-lg border border-rose-200 dark:border-rose-800 px-2.5 py-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 transition hover:bg-rose-50 dark:hover:bg-rose-900/20 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            <IconTrash />
                                            Удалить
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                        </tbody>
                    </table>
                </div>

                {/* Debug panel */}
                {DEBUG && (
                    <details className="mt-6 rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4">
                        <summary className="cursor-pointer text-sm font-medium text-amber-800 dark:text-amber-200">
                            🐛 Debug info
                        </summary>
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
    createRoot(rootElement).render(
        <React.StrictMode>
            <App />
        </React.StrictMode>,
    );
} else {
    console.error('Failed to find root element.');
}
