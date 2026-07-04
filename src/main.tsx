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
 * 1. [i18n] Two locales: en (default), ru. All strings via `t(key)`.
 *
 * 2. [Theme] light/dark/system. Header toggle + Settings.
 *
 * 3. [Settings Panel] Animated open/close. General, Local Storage, Google Sheets tabs.
 *
 * 4. [Unified Data Layer]
 *    DataStore interface: list(), add(text), remove(id), clear().
 *    Implementations: localStorage, Google Sheets API.
 *
 * 5. [Eventually-Consistent Background Sync]
 *    - Mutations (add/remove/clear) are fired in background.
 *    - UI updates ONLY on success (not optimistic).
 *    - On failure: toast error, no UI change.
 *    - Non-blocking: user can continue interacting while sync runs.
 *    - Subtle progress bar indicates background activity.
 *
 * 6. [Loading States]
 *    - `isLoading`: initial boot load → full-page spinner overlay.
 *    - `syncCount`: number of in-flight background ops → progress bar.
 *    - UI is never fully blocked after initial load.
 *
 * 7. [Header Backend Toggle]
 *    💾 / ☁️ with 🔌 disconnect. Auto-loads data on switch.
 *
 * 8. [Toast Notifications] All feedback via dismissable toasts.
 *
 * 9. [Client-Side Search]
 *    - Text input filters records by `text` field (case-insensitive).
 *    - Filters applied in memory after full list is loaded.
 *    - Works identically for both backends.
 *
 * 10. [Pagination]
 *     - Records displayed in pages of configurable size.
 *     - "Load more" button appends next page.
 *     - Resets to page 1 on search/backend change.
 *
 * 11. [localStorage Safety]
 *     - QuotaExceededError caught on write → toast.
 *     - Approximate data size shown in Settings → Local Storage tab.
 *
 * 12. [Debug Mode] `?debug=true`.
 * ============================================================================
 */

// @ts-ignore
import React, {useState, useEffect, useRef, useMemo, useCallback} from 'react';
import {createRoot} from 'react-dom/client';

// ============================================================================
// TYPES
// ============================================================================

type Locale = 'en' | 'ru';
type ThemePreference = 'light' | 'dark' | 'system';
type BackendMode = 'local' | 'google';
type AppRecord = { id: string; text: string; createdAt: string; updatedAt: string };
type GoogleConfig = {
    clientId: string;
    spreadsheetId: string;
    spreadsheetUrl: string;
    sheetName: string;
    lastAccountEmail: string
};
type AppConfig = {
    locale: Locale;
    theme: ThemePreference;
    preferredBackend: BackendMode;
    localStorageKey: string;
    settingsOpen: boolean;
    settingsTab: 'local' | 'google';
    google: GoogleConfig;
    pageSize: number
};
type DataStore = {
    list: () => Promise<AppRecord[]>;
    add: (text: string) => Promise<AppRecord>;
    remove: (id: string) => Promise<void>;
    clear: () => Promise<void>
};
type Toast = {
    id: string;
    message: string;
    detail?: string;
    level: 'error' | 'info' | 'warn';
    expanded?: boolean;
    dismissing?: boolean
};
type GisTokenResponse = { access_token?: string; error?: string };
type GisErrorResponse = { type?: string; message?: string };
type GisTokenClient = { requestAccessToken: (opts?: { prompt?: string }) => void };
type GisNamespace = {
    accounts: {
        oauth2: {
            initTokenClient: (cfg: {
                client_id: string;
                scope: string;
                callback: (r: GisTokenResponse) => void;
                error_callback?: (e: GisErrorResponse) => void
            }) => GisTokenClient;
            revoke: (token: string, cb?: () => void) => void
        }
    }
};
declare global {
    interface Window {
        google?: GisNamespace
    }
}

// ============================================================================
// i18n
// ============================================================================

const DICTIONARIES: Record<Locale, Record<string, string>> = {
    en: {
        'header.title': 'Google Sheets Store',
        'header.settings': 'Settings',
        'header.theme': 'Theme',
        'header.backendToggle.toGoogle': 'Switch to Google Sheets',
        'header.backendToggle.toLocal': 'Switch to localStorage',
        'header.backendToggle.disconnect': 'Disconnect from Google',
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
        'settings.backend.local': 'localStorage',
        'settings.backend.google': 'Google Sheets (if connected)',
        'settings.tab.local': 'Local Storage',
        'settings.tab.google': 'Google Sheets',
        'settings.pageSize': 'Records per page',
        'local.how.title': 'How it works',
        'local.how.1': 'All data is stored in your browser\'s localStorage.',
        'local.how.2': 'Data never leaves your device and is not synced across browsers.',
        'local.how.3': 'Clearing browser data will delete all records.',
        'local.how.4': 'Storage limit is typically ~5–10 MB (depends on browser).',
        'local.storageKey': 'Storage key',
        'local.recordCount': 'Records',
        'local.dataSize': 'Data size',
        'local.clearAll': 'Clear all records',
        'local.quotaError': 'localStorage is full! Delete some records or switch to Google Sheets.',
        'google.setup.title': '📋 How to set up Google Sheets as a datastore',
        'google.setup.step1.title': '1. Create a project in Google Cloud Console',
        'google.setup.step1.text': 'Go to console.cloud.google.com and create a new project.',
        'google.setup.step2.title': '2. Enable Google Sheets API',
        'google.setup.step2.text': 'Search "Google Sheets API" and click Enable.',
        'google.setup.step2.fallback': 'If error, run in Cloud Shell:',
        'google.setup.step3.title': '3. Configure OAuth Consent Screen & Test Users',
        'google.setup.step3.text': 'Google Auth Platform → Audience → External.',
        'google.setup.step3.critical': 'Crucial:',
        'google.setup.step3.critical.text': 'Add your email under Test users or you\'ll get 403.',
        'google.setup.step4.title': '4. Configure Data Access (Scopes)',
        'google.setup.step4.text': 'Data Access → Add or remove scopes.',
        'google.setup.step4.manual': 'Manually add:',
        'google.setup.step4.save': 'Check, Update, then Save.',
        'google.setup.step5.title': '5. Create OAuth Client ID',
        'google.setup.step5.text': 'Clients → Create → OAuth client ID → Web application.',
        'google.setup.step5.origins': 'Add JavaScript origins:',
        'google.setup.step5.origins.dev': 'for dev (Parcel)',
        'google.setup.step5.origins.prod': 'for GitHub Pages',
        'google.setup.step6.title': '6. Connect the App',
        'google.setup.step6.text': 'Paste Client ID below.',
        'google.setup.step6.spreadsheet': 'Add Spreadsheet ID and tab name.',
        'google.setup.step6.reconnect': 'Disconnect then Reconnect.',
        'google.setup.step6.checkbox': 'Important: Check the Sheets permission box in Google popup.',
        'google.security.title': '🔒 Security',
        'google.security.1': 'Client ID is public.',
        'google.security.2': 'Never enter Client Secret.',
        'google.security.3': 'Token is memory-only.',
        'google.security.4': 'Each user uses own account.',
        'google.clientId': 'OAuth Client ID',
        'google.clientId.placeholder': '123...apps.googleusercontent.com',
        'google.clientId.hint': 'Public ID, not Secret.',
        'google.spreadsheetId': 'Spreadsheet ID or URL',
        'google.spreadsheetId.placeholder': 'https://docs.google.com/spreadsheets/d/...',
        'google.sheetName': 'Sheet tab name',
        'google.connectedDoc': 'Connected document',
        'google.headers.info': 'First row reserved for headers:',
        'google.status.notConnected': 'Not connected',
        'google.status.connected': 'Connected as',
        'google.btn.connect': 'Connect',
        'google.btn.reconnect': 'Reconnect',
        'google.btn.disconnect': 'Disconnect',
        'google.btn.attachSheet': 'Attach spreadsheet',
        'google.btn.createSheet': 'Create new',
        'google.btn.switchToGoogle': 'Use Google Sheets',
        'google.btn.switchToLocal': 'Use localStorage',
        'google.newSheetTitle': 'New spreadsheet title',
        'google.newSheetTitle.placeholder': 'My Store',
        'google.error.noClientId': 'Enter Client ID first.',
        'google.error.noSpreadsheet': 'Enter Spreadsheet ID first.',
        'google.msg.connected': 'Connected to Google.',
        'google.msg.disconnected': 'Disconnected. Using localStorage.',
        'google.msg.sheetAttached': 'Spreadsheet attached.',
        'google.msg.sheetCreated': 'New spreadsheet created.',
        'google.msg.switchedToGoogle': 'Using Google Sheets.',
        'google.msg.switchedToLocal': 'Using localStorage.',
        'toast.silentAuthFailed': 'Auto-login failed. Using localStorage. Reconnect in Settings.',
        'toast.details': 'Details',
        'data.placeholder': 'New record...',
        'data.add': 'Add',
        'data.reload': 'Reload',
        'data.col.index': '#',
        'data.col.text': 'Text',
        'data.col.created': 'Created',
        'data.col.actions': '',
        'data.empty': 'Nothing here yet. Add your first record.',
        'data.emptySearch': 'No records match your search.',
        'data.delete': 'Delete',
        'data.loadMore': 'Load more',
        'data.search': 'Search records...',
        'data.search.clear': 'Clear search',
        'backend.badge.local': 'localStorage',
        'backend.badge.google': 'Google Sheets',
        'data.records.0': 'records',
        'data.records.1': 'record',
        'data.records.few': 'records',
        'data.records.many': 'records',
        'loading': 'Loading...',
        'debug.title': '🐛 Debug info',
    },
    ru: {
        'header.title': 'Google Sheets Store',
        'header.settings': 'Настройки',
        'header.theme': 'Тема',
        'header.backendToggle.toGoogle': 'Переключить на Google Sheets',
        'header.backendToggle.toLocal': 'Переключить на localStorage',
        'header.backendToggle.disconnect': 'Отключиться от Google',
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
        'settings.backend.local': 'localStorage',
        'settings.backend.google': 'Google Sheets (если подключён)',
        'settings.tab.local': 'Local Storage',
        'settings.tab.google': 'Google Sheets',
        'settings.pageSize': 'Записей на странице',
        'local.how.title': 'Как это работает',
        'local.how.1': 'Данные хранятся в localStorage браузера.',
        'local.how.2': 'Данные не покидают устройство.',
        'local.how.3': 'Очистка браузера удалит записи.',
        'local.how.4': 'Лимит ~5–10 МБ.',
        'local.storageKey': 'Ключ',
        'local.recordCount': 'Записей',
        'local.dataSize': 'Размер данных',
        'local.clearAll': 'Очистить всё',
        'local.quotaError': 'localStorage переполнен! Удалите записи или переключитесь на Google Sheets.',
        'google.setup.title': '📋 Как настроить Google Sheets',
        'google.setup.step1.title': '1. Создайте проект в Google Cloud Console',
        'google.setup.step1.text': 'Перейдите на console.cloud.google.com.',
        'google.setup.step2.title': '2. Включите Google Sheets API',
        'google.setup.step2.text': 'Найдите "Google Sheets API" и включите.',
        'google.setup.step2.fallback': 'При ошибке выполните в Cloud Shell:',
        'google.setup.step3.title': '3. Настройте OAuth и тестовых пользователей',
        'google.setup.step3.text': 'Google Auth Platform → Audience → External.',
        'google.setup.step3.critical': 'Критично:',
        'google.setup.step3.critical.text': 'Добавьте свой email в Test users, иначе будет 403.',
        'google.setup.step4.title': '4. Настройте Scopes',
        'google.setup.step4.text': 'Data Access → Add or remove scopes.',
        'google.setup.step4.manual': 'Добавьте вручную:',
        'google.setup.step4.save': 'Отметьте, Update, затем Save.',
        'google.setup.step5.title': '5. Создайте OAuth Client ID',
        'google.setup.step5.text': 'Clients → Create → OAuth client ID → Web.',
        'google.setup.step5.origins': 'Добавьте origins:',
        'google.setup.step5.origins.dev': 'для разработки (Parcel)',
        'google.setup.step5.origins.prod': 'для GitHub Pages',
        'google.setup.step6.title': '6. Подключите',
        'google.setup.step6.text': 'Вставьте Client ID ниже.',
        'google.setup.step6.spreadsheet': 'Укажите Spreadsheet ID и вкладку.',
        'google.setup.step6.reconnect': 'Disconnect → Reconnect.',
        'google.setup.step6.checkbox': 'Важно: отметьте галочку доступа к Sheets в попапе Google.',
        'google.security.title': '🔒 Безопасность',
        'google.security.1': 'Client ID публичный.',
        'google.security.2': 'Не вводите Client Secret.',
        'google.security.3': 'Токен только в памяти.',
        'google.security.4': 'Каждый работает со своим аккаунтом.',
        'google.clientId': 'OAuth Client ID',
        'google.clientId.placeholder': '123...apps.googleusercontent.com',
        'google.clientId.hint': 'Публичный ID, не Secret.',
        'google.spreadsheetId': 'Spreadsheet ID или URL',
        'google.spreadsheetId.placeholder': 'https://docs.google.com/spreadsheets/d/...',
        'google.sheetName': 'Имя вкладки',
        'google.connectedDoc': 'Подключённый документ',
        'google.headers.info': 'Первая строка — заголовки:',
        'google.status.notConnected': 'Не подключён',
        'google.status.connected': 'Подключён как',
        'google.btn.connect': 'Подключить',
        'google.btn.reconnect': 'Переподключить',
        'google.btn.disconnect': 'Отключить',
        'google.btn.attachSheet': 'Подключить документ',
        'google.btn.createSheet': 'Создать новый',
        'google.btn.switchToGoogle': 'Использовать Google Sheets',
        'google.btn.switchToLocal': 'Использовать localStorage',
        'google.newSheetTitle': 'Название документа',
        'google.newSheetTitle.placeholder': 'Моё хранилище',
        'google.error.noClientId': 'Введите Client ID.',
        'google.error.noSpreadsheet': 'Введите Spreadsheet ID.',
        'google.msg.connected': 'Подключён к Google.',
        'google.msg.disconnected': 'Отключён. Используется localStorage.',
        'google.msg.sheetAttached': 'Документ подключён.',
        'google.msg.sheetCreated': 'Документ создан.',
        'google.msg.switchedToGoogle': 'Google Sheets.',
        'google.msg.switchedToLocal': 'localStorage.',
        'toast.silentAuthFailed': 'Автовход не удался. Переподключитесь в Настройках.',
        'toast.details': 'Подробности',
        'data.placeholder': 'Новая запись...',
        'data.add': 'Добавить',
        'data.reload': 'Обновить',
        'data.col.index': '#',
        'data.col.text': 'Текст',
        'data.col.created': 'Создано',
        'data.col.actions': '',
        'data.empty': 'Пока пусто. Добавь первую запись.',
        'data.emptySearch': 'По запросу ничего не найдено.',
        'data.delete': 'Удалить',
        'data.loadMore': 'Загрузить ещё',
        'data.search': 'Поиск записей...',
        'data.search.clear': 'Очистить поиск',
        'backend.badge.local': 'localStorage',
        'backend.badge.google': 'Google Sheets',
        'data.records.0': 'записей',
        'data.records.1': 'запись',
        'data.records.few': 'записи',
        'data.records.many': 'записей',
        'loading': 'Загрузка...',
        'debug.title': '🐛 Debug info',
    },
};

// ============================================================================
// CONSTANTS & HELPERS
// ============================================================================

const APP_CONFIG_KEY = 'gsd.config.v1';
const DEFAULT_DB_KEY = 'gsd.records.v1';
const DEFAULT_SHEET = 'Records';
const SHEET_HEADERS = ['id', 'text', 'createdAt', 'updatedAt'] as const;
const TOAST_MS = 8000;
const DEFAULT_PAGE_SIZE = 25;
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets', 'openid', 'email', 'profile'].join(' ');
const GIS_SRC = 'https://accounts.google.com/gsi/client';
const SHEETS_API = 'https://sheets.googleapis.com/v4';
const USERINFO = 'https://www.googleapis.com/oauth2/v3/userinfo';
const DEBUG = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === 'true';
const dbg = (...a: unknown[]) => {
    if (DEBUG) console.log('[DBG]', ...a);
};

const useT = (l: Locale) => useMemo(() => {
    const d = DICTIONARIES[l] ?? DICTIONARIES.en;
    return (k: string) => d[k] ?? DICTIONARIES.en[k] ?? k;
}, [l]);
const plur = (n: number, t: (k: string) => string) => {
    const a = Math.abs(n);
    if (!a) return `${n} ${t('data.records.0')}`;
    if (a % 10 === 1 && a % 100 !== 11) return `${n} ${t('data.records.1')}`;
    if (a % 10 >= 2 && a % 10 <= 4 && (a % 100 < 10 || a % 100 >= 20)) return `${n} ${t('data.records.few')}`;
    return `${n} ${t('data.records.many')}`;
};

const uid = () => crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const now = () => new Date().toISOString();
const jp = <T, >(s: string, f: T): T => {
    try {
        return JSON.parse(s);
    } catch {
        return f;
    }
};
const ft = (v: string, l: Locale) => {
    if (!v) return '—';
    const d = new Date(v);
    return isNaN(d.getTime()) ? v : new Intl.DateTimeFormat(l === 'ru' ? 'ru-RU' : 'en-US', {
        dateStyle: 'medium',
        timeStyle: 'short'
    }).format(d);
};
const nid = (v: string) => {
    const t = v.trim();
    if (!t) return '';
    const m = t.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return m?.[1] ?? t.replace(/\/edit.*$/, '');
};
const surl = (id: string) => `https://docs.google.com/spreadsheets/d/${id}/edit`;
const qt = (n: string) => {
    const s = n.trim() || DEFAULT_SHEET;
    return /^[A-Za-z0-9_]+$/.test(s) ? s : `'${s.replace(/'/g, "''")}'`;
};
const sr = (t: string, c: string) => `${qt(t)}!${c}`;
const em = (e: unknown): string => e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';

/** Estimate byte size of a string (for localStorage size display) */
const byteSize = (s: string) => new Blob([s]).size;
const fmtBytes = (b: number) => b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`;

const resolveTheme = (p: ThemePreference): 'light' | 'dark' => p === 'light' || p === 'dark' ? p : (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
const applyTheme = (r: 'light' | 'dark') => {
    document.documentElement.classList.toggle('dark', r === 'dark');
};

const DC: AppConfig = {
    locale: 'en',
    theme: 'system',
    preferredBackend: 'local',
    localStorageKey: DEFAULT_DB_KEY,
    settingsOpen: false,
    settingsTab: 'local',
    google: {clientId: '', spreadsheetId: '', spreadsheetUrl: '', sheetName: DEFAULT_SHEET, lastAccountEmail: ''},
    pageSize: DEFAULT_PAGE_SIZE
};
const rc = (): AppConfig => {
    try {
        const r = localStorage.getItem(APP_CONFIG_KEY);
        if (!r) return {...DC};
        const p = jp<Partial<AppConfig>>(r, {});
        return {...DC, ...p, google: {...DC.google, ...(p.google ?? {})}};
    } catch {
        return {...DC};
    }
};
const wc = (c: AppConfig) => {
    try {
        localStorage.setItem(APP_CONFIG_KEY, JSON.stringify(c));
    } catch {
    }
};

// ============================================================================
// LOCAL DATA STORE (with quota safety)
// ============================================================================

const createLocalDS = (key: string, onQuotaError?: () => void): DataStore => {
    const ra = (): AppRecord[] => {
        try {
            const r = localStorage.getItem(key);
            if (!r) return [];
            const a = jp<unknown[]>(r, []);
            return Array.isArray(a) ? a.filter((x): x is AppRecord => !!x && typeof x === 'object' && typeof (x as any).id === 'string' && typeof (x as any).text === 'string') : [];
        } catch {
            return [];
        }
    };
    const wa = (recs: AppRecord[]) => {
        try {
            localStorage.setItem(key, JSON.stringify(recs));
        } catch (e) {
            if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22)) {
                onQuotaError?.();
            }
            throw e;
        }
    };
    return {
        list: async () => ra(),
        add: async (text) => {
            const r: AppRecord = {id: uid(), text, createdAt: now(), updatedAt: now()};
            const all = ra();
            all.push(r);
            wa(all);
            return r;
        },
        remove: async (id) => wa(ra().filter(r => r.id !== id)),
        clear: async () => wa([]),
    };
};

// ============================================================================
// GIS + GOOGLE API + SHEETS (same as before, compact)
// ============================================================================

let gp: Promise<void> | null = null;
const wg = (to = 10000): Promise<void> => new Promise((ok, f) => {
    const t0 = Date.now();
    const tk = () => {
        if (window.google?.accounts?.oauth2) return ok();
        if (Date.now() - t0 > to) return f(new Error('GIS timeout'));
        setTimeout(tk, 50);
    };
    tk();
});
const lg = async () => {
    if (window.google?.accounts?.oauth2) return;
    if (!gp) {
        gp = new Promise((ok, f) => {
            if (document.querySelector('script[data-gis]')) {
                wg().then(ok).catch(e => {
                    gp = null;
                    f(e);
                });
                return;
            }
            const s = document.createElement('script');
            s.src = GIS_SRC;
            s.async = true;
            s.defer = true;
            s.dataset.gis = '1';
            s.onload = () => wg().then(ok).catch(e => {
                gp = null;
                f(e);
            });
            s.onerror = () => {
                gp = null;
                f(new Error('GIS load fail'));
            };
            document.head.appendChild(s);
        });
    }
    await gp;
};
const rt = async (cid: string, inter: boolean): Promise<string> => {
    await lg();
    if (!window.google?.accounts?.oauth2) throw new Error('GIS N/A');
    return new Promise((ok, f) => {
        const tc = window.google!.accounts.oauth2.initTokenClient({
            client_id: cid, scope: SCOPES, callback: r => {
                if (r.error) return f(new Error(r.error));
                if (!r.access_token) return f(new Error('No token'));
                ok(r.access_token);
            }, error_callback: e => f(new Error(e?.type || e?.message || 'GIS err'))
        });
        tc.requestAccessToken({prompt: inter ? 'consent' : ''});
    });
};

const gf = async <T, >(url: string, tok: string, init: RequestInit = {}): Promise<T> => {
    dbg('gf', init.method ?? 'GET', url);
    const h = new Headers(init.headers);
    h.set('Authorization', `Bearer ${tok}`);
    if (init.body && !h.has('Content-Type')) h.set('Content-Type', 'application/json');
    const res = await fetch(url, {...init, headers: h});
    const txt = await res.text();
    const json = txt ? jp<unknown>(txt, null) : null;
    if (!res.ok) {
        let msg = txt || `HTTP ${res.status}`;
        if (json && typeof json === 'object' && 'error' in json) {
            const e = (json as any).error;
            if (e?.message) msg = e.message;
        }
        throw new Error(`API ${res.status}: ${msg}`);
    }
    return json as T;
};
const sa = <T, >(p: string, tok: string, i?: RequestInit) => gf<T>(`${SHEETS_API}${p}`, tok, i);
const fp = async (tok: string) => gf<{ email?: string }>(USERINFO, tok);

const es = async (tok: string, sid: string, tab: string) => {
    const id = nid(sid);
    const t = tab.trim() || DEFAULT_SHEET;
    if (!id) throw new Error('No sheet ID');
    const m = await sa<{ sheets?: { properties?: { title?: string } }[] }>(`/spreadsheets/${id}`, tok);
    if (!(m.sheets ?? []).some(s => s.properties?.title === t)) await sa(`/spreadsheets/${id}:batchUpdate`, tok, {
        method: 'POST',
        body: JSON.stringify({requests: [{addSheet: {properties: {title: t}}}]})
    });
    const hr = sr(t, 'A1:D1');
    await sa(`/spreadsheets/${id}/values/${encodeURIComponent(hr)}?valueInputOption=RAW`, tok, {
        method: 'PUT',
        body: JSON.stringify({range: hr, majorDimension: 'ROWS', values: [Array.from(SHEET_HEADERS)]})
    });
};
const cs = async (tok: string, title: string, tab: string) => {
    const t = tab.trim() || DEFAULT_SHEET;
    const r = await sa<{ spreadsheetId?: string; spreadsheetUrl?: string }>('/spreadsheets', tok, {
        method: 'POST',
        body: JSON.stringify({
            properties: {title: title.trim() || 'Google Sheets Store'},
            sheets: [{properties: {title: t}}]
        })
    });
    const id = r.spreadsheetId?.trim();
    if (!id) throw new Error('No ID returned');
    await es(tok, id, t);
    return {spreadsheetId: id, spreadsheetUrl: r.spreadsheetUrl?.trim() || surl(id)};
};
const rsr = async (tok: string, sid: string, tab: string): Promise<AppRecord[]> => {
    const id = nid(sid);
    const t = tab.trim() || DEFAULT_SHEET;
    const r = await sa<{ values?: string[][] }>(`/spreadsheets/${id}/values/${encodeURIComponent(sr(t, 'A2:D'))}`, tok);
    return (r.values ?? []).map((row, i) => {
        const rid = (row[0] ?? '').trim() || `r-${i + 2}-${uid()}`;
        const text = row[1] ?? '';
        if (!rid && !text.trim()) return null;
        return {id: rid, text, createdAt: row[2] ?? '', updatedAt: row[3] ?? row[2] ?? ''} as AppRecord;
    }).filter(Boolean) as AppRecord[];
};
const asr = async (tok: string, sid: string, tab: string, rec: AppRecord) => {
    const id = nid(sid);
    const t = tab.trim() || DEFAULT_SHEET;
    await sa(`/spreadsheets/${id}/values/${encodeURIComponent(sr(t, 'A:D'))}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, tok, {
        method: 'POST',
        body: JSON.stringify({values: [[rec.id, rec.text, rec.createdAt, rec.updatedAt]]})
    });
};
const wsr = async (tok: string, sid: string, tab: string, recs: AppRecord[]) => {
    const id = nid(sid);
    const t = tab.trim() || DEFAULT_SHEET;
    await sa(`/spreadsheets/${id}/values/${encodeURIComponent(sr(t, 'A2:D'))}:clear`, tok, {
        method: 'POST',
        body: '{}'
    });
    if (!recs.length) return;
    const pr = sr(t, 'A2:D');
    await sa(`/spreadsheets/${id}/values/${encodeURIComponent(pr)}?valueInputOption=RAW`, tok, {
        method: 'PUT',
        body: JSON.stringify({
            range: pr,
            majorDimension: 'ROWS',
            values: recs.map(r => [r.id, r.text, r.createdAt, r.updatedAt])
        })
    });
};

const createGoogleDS = (tRef: React.MutableRefObject<string | null>, sid: string, tab: string): DataStore => {
    const gt = () => {
        const t = tRef.current;
        if (!t) throw new Error('Session expired');
        return t;
    };
    const id = nid(sid);
    const t = tab.trim() || DEFAULT_SHEET;
    return {
        list: async () => rsr(gt(), id, t), add: async (text) => {
            const r: AppRecord = {id: uid(), text, createdAt: now(), updatedAt: now()};
            await asr(gt(), id, t, r);
            return r;
        }, remove: async (rid) => {
            const all = await rsr(gt(), id, t);
            await wsr(gt(), id, t, all.filter(r => r.id !== rid));
        }, clear: async () => wsr(gt(), id, t, [])
    };
};

// ============================================================================
// SVG ICONS (same as before)
// ============================================================================

const IconSettings: React.FC<{ className?: string }> = ({className}) => (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path
            d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
        <circle cx="12" cy="12" r="3"/>
    </svg>);
const IconSun: React.FC<{ className?: string }> = ({className}) => (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="4"/>
        <path d="M12 2v2"/>
        <path d="M12 20v2"/>
        <path d="m4.93 4.93 1.41 1.41"/>
        <path d="m17.66 17.66 1.41 1.41"/>
        <path d="M2 12h2"/>
        <path d="M20 12h2"/>
        <path d="m6.34 17.66-1.41 1.41"/>
        <path d="m19.07 4.93-1.41 1.41"/>
    </svg>);
const IconMoon: React.FC<{ className?: string }> = ({className}) => (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
    </svg>);
const IconMonitor: React.FC<{ className?: string }> = ({className}) => (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect width="20" height="14" x="2" y="3" rx="2"/>
        <line x1="8" x2="16" y1="21" y2="21"/>
        <line x1="12" x2="12" y1="17" y2="21"/>
    </svg>);
const IconPlus: React.FC<{ className?: string }> = ({className}) => (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12h14"/>
        <path d="M12 5v14"/>
    </svg>);
const IconTrash: React.FC<{ className?: string }> = ({className}) => (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 6h18"/>
        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
        <line x1="10" x2="10" y1="11" y2="17"/>
        <line x1="14" x2="14" y1="11" y2="17"/>
    </svg>);
const IconRefresh: React.FC<{ className?: string }> = ({className}) => (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
        <path d="M3 3v5h5"/>
        <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
        <path d="M16 16h5v5"/>
    </svg>);
const IconX: React.FC<{ className?: string }> = ({className}) => (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 6 6 18"/>
        <path d="m6 6 12 12"/>
    </svg>);
const IconDatabase: React.FC<{ className?: string }> = ({className}) => (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="12" cy="5" rx="9" ry="3"/>
        <path d="M3 5V19A9 3 0 0 0 21 19V5"/>
        <path d="M3 12A9 3 0 0 0 21 12"/>
    </svg>);
const IconSheet: React.FC<{ className?: string }> = ({className}) => (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/>
        <path d="M14 2v4a2 2 0 0 0 2 2h4"/>
        <path d="M8 13h2"/>
        <path d="M14 13h2"/>
        <path d="M8 17h2"/>
        <path d="M14 17h2"/>
    </svg>);
const IconSearch: React.FC<{ className?: string }> = ({className}) => (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8"/>
        <path d="m21 21-4.3-4.3"/>
    </svg>);

// ============================================================================
// PROGRESS BAR
// ============================================================================

const ProgressBar: React.FC<{ visible: boolean }> = ({visible}) => {
    if (!visible) return null;
    return (
        <div className="fixed top-0 left-0 right-0 z-50 h-0.5 bg-transparent overflow-hidden">
            <div className="h-full w-1/3 bg-blue-500 dark:bg-blue-400 animate-progress"/>
        </div>
    );
};

// ============================================================================
// LOADING OVERLAY (initial boot only)
// ============================================================================

const LoadingOverlay: React.FC<{ t: (k: string) => string }> = ({t}) => (
    <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-50/80 dark:bg-slate-950/80 backdrop-blur-sm">
        <div className="flex flex-col items-center gap-3">
            <div
                className="w-8 h-8 border-2 border-slate-300 dark:border-slate-600 border-t-slate-900 dark:border-t-slate-100 rounded-full animate-spin"/>
            <span className="text-sm text-slate-500 dark:text-slate-400">{t('loading')}</span>
        </div>
    </div>
);

// ============================================================================
// TOAST
// ============================================================================

const ToastContainer: React.FC<{
    toasts: Toast[];
    onDismiss: (id: string) => void;
    onToggle: (id: string) => void;
    t: (k: string) => string
}> = ({toasts, onDismiss, onToggle, t}) => {
    if (!toasts.length) return null;
    const lv: Record<Toast['level'], string> = {
        error: 'border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-900/90 text-rose-800 dark:text-rose-200',
        warn: 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/90 text-amber-800 dark:text-amber-200',
        info: 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/90 text-blue-800 dark:text-blue-200'
    };
    return (<div
        className="fixed top-16 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">{toasts.map(t2 => (
        <div key={t2.id}
             className={`pointer-events-auto rounded-xl border shadow-lg p-3 text-sm ${lv[t2.level]} ${t2.dismissing ? 'animate-toast-out' : 'animate-toast-in'}`}
             onAnimationEnd={() => {
                 if (t2.dismissing) onDismiss(t2.id);
             }}>
            <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0"><p
                    className="text-xs leading-relaxed">{t2.message}</p>{t2.detail && t2.expanded && <pre
                    className="mt-2 text-[10px] opacity-70 whitespace-pre-wrap break-all max-h-24 overflow-y-auto">{t2.detail}</pre>}
                </div>
                <div className="flex items-center gap-1 shrink-0">{t2.detail &&
                    <button type="button" onClick={() => onToggle(t2.id)}
                            className="text-[10px] underline opacity-70 hover:opacity-100">{t('toast.details')}</button>}
                    <button type="button" onClick={() => onDismiss(t2.id)}
                            className="p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10"><IconX
                        className="w-3.5 h-3.5"/></button>
                </div>
            </div>
        </div>))}</div>);
};

// ============================================================================
// SETTINGS TABS (with localStorage size + page size)
// ============================================================================

const SettingsLocalTab: React.FC<{
    config: AppConfig;
    recordCount: number;
    onClearData: () => void;
    isSyncing: boolean;
    t: (k: string) => string
}> = ({config, recordCount, onClearData, isSyncing, t}) => {
    const dataSize = useMemo(() => {
        try {
            const raw = localStorage.getItem(config.localStorageKey);
            return raw ? fmtBytes(byteSize(raw)) : '0 B';
        } catch {
            return '?';
        }
    }, [config.localStorageKey, recordCount]);
    return (
        <div className="space-y-4 animate-fade-in">
            <div
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4">
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2">{t('local.how.title')}</h3>
                <ul className="text-xs text-slate-600 dark:text-slate-400 space-y-1.5 list-disc pl-4">
                    <li>{t('local.how.1')}</li>
                    <li>{t('local.how.2')}</li>
                    <li>{t('local.how.3')}</li>
                    <li>{t('local.how.4')}</li>
                </ul>
            </div>
            <div
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4 grid grid-cols-3 gap-4 text-center">
                <div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{t('local.storageKey')}</div>
                    <code className="text-xs text-slate-700 dark:text-slate-300">{config.localStorageKey}</code></div>
                <div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{t('local.recordCount')}</div>
                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">{recordCount}</div>
                </div>
                <div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{t('local.dataSize')}</div>
                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">{dataSize}</div>
                </div>
            </div>
            <button type="button" onClick={onClearData} disabled={isSyncing || recordCount === 0}
                    className="inline-flex items-center gap-2 rounded-lg border border-rose-300 dark:border-rose-700 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium text-rose-700 dark:text-rose-400 transition hover:bg-rose-50 dark:hover:bg-rose-900/20 disabled:cursor-not-allowed disabled:opacity-50">
                <IconTrash/>{t('local.clearAll')}</button>
        </div>
    );
};

const SettingsGoogleTab: React.FC<{
    config: AppConfig;
    isAuthed: boolean;
    email: string;
    isSyncing: boolean;
    onCfg: (p: Partial<GoogleConfig>) => void;
    onConnect: () => void;
    onDisconnect: () => void;
    onAttach: () => void;
    onCreate: () => void;
    onToGoogle: () => void;
    onToLocal: () => void;
    t: (k: string) => string
}> = ({
          config,
          isAuthed,
          email,
          isSyncing,
          onCfg,
          onConnect,
          onDisconnect,
          onAttach,
          onCreate,
          onToGoogle,
          onToLocal,
          t
      }) => {
    const [nt, setNt] = useState('Google Sheets Store');
    const hc = Boolean(config.google.clientId.trim());
    const hs = Boolean(nid(config.google.spreadsheetId));
    const bp = 'inline-flex items-center gap-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 px-3 py-2 text-xs font-medium text-white dark:text-slate-900 transition hover:bg-slate-800 dark:hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50';
    const bs = 'inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 transition hover:bg-slate-50 dark:hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50';
    const bd = 'inline-flex items-center gap-1.5 rounded-lg border border-rose-300 dark:border-rose-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-medium text-rose-700 dark:text-rose-400 transition hover:bg-rose-50 dark:hover:bg-rose-900/20 disabled:cursor-not-allowed disabled:opacity-50';
    const cc = 'rounded bg-blue-100 dark:bg-blue-800 px-1.5 py-0.5 font-mono text-[11px]';
    const wc2 = 'mt-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-300';
    const ic = 'w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 outline-none transition focus:border-slate-500 dark:focus:border-slate-400';
    return (
        <div className="space-y-4 animate-fade-in">
            <details className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20">
                <summary
                    className="cursor-pointer px-4 py-3 text-sm font-semibold text-blue-900 dark:text-blue-200">{t('google.setup.title')}</summary>
                <div className="px-4 pb-4 space-y-4 text-xs text-blue-800 dark:text-blue-300">
                    <div>
                        <div
                            className="font-semibold text-blue-900 dark:text-blue-100">{t('google.setup.step1.title')}</div>
                        <p className="mt-1">{t('google.setup.step1.text')} <a href="https://console.cloud.google.com/"
                                                                              target="_blank" rel="noreferrer"
                                                                              className="underline">console.cloud.google.com</a>
                        </p></div>
                    <div>
                        <div
                            className="font-semibold text-blue-900 dark:text-blue-100">{t('google.setup.step2.title')}</div>
                        <p className="mt-1">{t('google.setup.step2.text')}</p><p
                        className="mt-1 text-blue-700 dark:text-blue-400">{t('google.setup.step2.fallback')}</p><code
                        className="mt-1 block rounded bg-blue-100 dark:bg-blue-800 px-3 py-2 font-mono text-[11px] break-all">gcloud
                        services enable sheets.googleapis.com --project=YOUR_PROJECT_ID</code></div>
                    <div>
                        <div
                            className="font-semibold text-blue-900 dark:text-blue-100">{t('google.setup.step3.title')}</div>
                        <p className="mt-1">{t('google.setup.step3.text')}</p>
                        <div className={wc2}>
                            <strong>⚠️ {t('google.setup.step3.critical')}</strong> {t('google.setup.step3.critical.text')}
                        </div>
                    </div>
                    <div>
                        <div
                            className="font-semibold text-blue-900 dark:text-blue-100">{t('google.setup.step4.title')}</div>
                        <p className="mt-1">{t('google.setup.step4.text')}</p><p
                        className="mt-1">{t('google.setup.step4.manual')}</p><code
                        className="mt-1 block rounded bg-blue-100 dark:bg-blue-800 px-3 py-2 font-mono text-[11px] break-all">https://www.googleapis.com/auth/spreadsheets</code>
                        <p className="mt-2">{t('google.setup.step4.save')}</p></div>
                    <div>
                        <div
                            className="font-semibold text-blue-900 dark:text-blue-100">{t('google.setup.step5.title')}</div>
                        <p className="mt-1">{t('google.setup.step5.text')}</p><p
                        className="mt-1">{t('google.setup.step5.origins')}</p>
                        <ul className="mt-1 list-disc pl-4 space-y-1">
                            <li><code
                                className={cc}>http://localhost:1234</code> — {t('google.setup.step5.origins.dev')}</li>
                            <li><code
                                className={cc}>https://YOUR-USERNAME.github.io</code> — {t('google.setup.step5.origins.prod')}
                            </li>
                        </ul>
                    </div>
                    <div>
                        <div
                            className="font-semibold text-blue-900 dark:text-blue-100">{t('google.setup.step6.title')}</div>
                        <p className="mt-1">{t('google.setup.step6.text')}</p><p
                        className="mt-1">{t('google.setup.step6.spreadsheet')}</p><p
                        className="mt-1">{t('google.setup.step6.reconnect')}</p>
                        <div className={wc2}><strong>⚠️ {t('google.setup.step6.checkbox')}</strong></div>
                    </div>
                </div>
            </details>
            <details
                className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4">
                <summary
                    className="cursor-pointer text-sm font-semibold text-amber-900 dark:text-amber-200">{t('google.security.title')}</summary>
                <ul className="mt-2 text-xs text-amber-800 dark:text-amber-300 space-y-1 list-disc pl-4">
                    <li>{t('google.security.1')}</li>
                    <li>{t('google.security.2')}</li>
                    <li>{t('google.security.3')}</li>
                    <li>{t('google.security.4')}</li>
                </ul>
            </details>
            <div
                className={`rounded-xl border p-4 ${isAuthed ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20' : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50'}`}>
                <div
                    className="text-sm font-medium text-slate-700 dark:text-slate-300">{isAuthed ? `${t('google.status.connected')} ${email}` : t('google.status.notConnected')}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" className={bp} disabled={isSyncing || !hc}
                            onClick={onConnect}>{isAuthed ? t('google.btn.reconnect') : t('google.btn.connect')}</button>
                    {isAuthed && <button type="button" className={bd} disabled={isSyncing}
                                         onClick={onDisconnect}>{t('google.btn.disconnect')}</button>}</div>
            </div>
            <label className="block"><span
                className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">{t('google.clientId')}</span><input
                type="text" value={config.google.clientId} onChange={e => onCfg({clientId: e.target.value})}
                placeholder={t('google.clientId.placeholder')} className={ic}/><span
                className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{t('google.clientId.hint')}</span></label>
            <label className="block"><span
                className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">{t('google.spreadsheetId')}</span><input
                type="text" value={config.google.spreadsheetId} onChange={e => onCfg({spreadsheetId: e.target.value})}
                placeholder={t('google.spreadsheetId.placeholder')} className={ic}/></label>
            <label className="block"><span
                className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">{t('google.sheetName')}</span><input
                type="text" value={config.google.sheetName} onChange={e => onCfg({sheetName: e.target.value})}
                placeholder={DEFAULT_SHEET} className={ic}/></label>
            <div className="flex flex-wrap gap-2">
                <button type="button" className={bp} disabled={isSyncing || !isAuthed || !hs}
                        onClick={onAttach}>{t('google.btn.attachSheet')}</button>
            </div>
            <div><span
                className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">{t('google.newSheetTitle')}</span>
                <div className="flex gap-2"><input type="text" value={nt} onChange={e => setNt(e.target.value)}
                                                   placeholder={t('google.newSheetTitle.placeholder')}
                                                   className={`flex-1 ${ic}`}/>
                    <button type="button" className={bs} disabled={isSyncing || !isAuthed} onClick={() => {
                        onCfg({spreadsheetId: `__CREATE__${nt}`});
                        onCreate();
                    }}>{t('google.btn.createSheet')}</button>
                </div>
            </div>
            {isAuthed && hs && <div className="flex flex-wrap gap-2">
                <button type="button" className={bp} disabled={isSyncing}
                        onClick={onToGoogle}>{t('google.btn.switchToGoogle')}</button>
                <button type="button" className={bs} disabled={isSyncing}
                        onClick={onToLocal}>{t('google.btn.switchToLocal')}</button>
            </div>}
            {nid(config.google.spreadsheetId) && !config.google.spreadsheetId.startsWith('__CREATE__') && <div
                className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-4 text-sm">
                <div
                    className="font-medium text-emerald-800 dark:text-emerald-200 mb-1">{t('google.connectedDoc')}</div>
                <a href={surl(nid(config.google.spreadsheetId))} target="_blank" rel="noreferrer"
                   className="text-xs text-emerald-700 dark:text-emerald-300 underline break-all">{surl(nid(config.google.spreadsheetId))}</a>
            </div>}
            <div
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4 text-xs text-slate-600 dark:text-slate-400">{t('google.headers.info')}
                <code className="rounded bg-slate-200 dark:bg-slate-700 px-1 py-0.5">{SHEET_HEADERS.join(' | ')}</code>
            </div>
        </div>
    );
};

const SettingsPanel: React.FC<{
    config: AppConfig;
    setConfig: React.Dispatch<React.SetStateAction<AppConfig>>;
    recordCount: number;
    onClearData: () => void;
    isSyncing: boolean;
    isClosing: boolean;
    onCloseEnd: () => void;
    isAuthed: boolean;
    email: string;
    onConnect: () => void;
    onDisconnect: () => void;
    onAttach: () => void;
    onCreate: () => void;
    onToGoogle: () => void;
    onToLocal: () => void;
    t: (k: string) => string
}> = (p) => {
    const {
        config: c,
        setConfig: sc,
        recordCount: rc2,
        onClearData,
        isSyncing,
        isClosing,
        onCloseEnd,
        isAuthed,
        email,
        onConnect,
        onDisconnect,
        onAttach,
        onCreate,
        onToGoogle,
        onToLocal,
        t
    } = p;
    const gcfg = useCallback((p2: Partial<GoogleConfig>) => sc(pr => ({...pr, google: {...pr.google, ...p2}})), [sc]);
    const to: { value: ThemePreference; label: string; icon: React.ReactNode }[] = [{
        value: 'light',
        label: t('settings.theme.light'),
        icon: <IconSun className="w-4 h-4"/>
    }, {value: 'dark', label: t('settings.theme.dark'), icon: <IconMoon className="w-4 h-4"/>}, {
        value: 'system',
        label: t('settings.theme.system'),
        icon: <IconMonitor className="w-4 h-4"/>
    }];
    const lo: { value: Locale; label: string }[] = [{value: 'en', label: t('settings.language.en')}, {
        value: 'ru',
        label: t('settings.language.ru')
    }];
    const ba = 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900';
    const bi = 'border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800';
    const pageSizes = [10, 25, 50, 100];
    return (
        <div
            className={`mb-6 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg overflow-hidden ${isClosing ? 'animate-slide-up' : 'animate-slide-down'}`}
            onAnimationEnd={() => {
                if (isClosing) onCloseEnd();
            }}>
            <div
                className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 px-5 py-3">
                <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">{t('settings.title')}</h2>
                <button type="button" onClick={() => sc(p2 => ({...p2, settingsOpen: false}))}
                        className="rounded-lg p-1.5 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
                    <IconX/></button>
            </div>
            <div className="border-b border-slate-200 dark:border-slate-700 px-5 py-4 space-y-4">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">{t('settings.general')}</h3>
                <div>
                    <div
                        className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">{t('settings.theme')}</div>
                    <div className="flex gap-2">{to.map(o => <button key={o.value} type="button"
                                                                     onClick={() => sc(p2 => ({...p2, theme: o.value}))}
                                                                     className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition ${c.theme === o.value ? ba : bi}`}>{o.icon}{o.label}</button>)}</div>
                </div>
                <div>
                    <div
                        className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">{t('settings.language')}</div>
                    <div className="flex gap-2">{lo.map(o => <button key={o.value} type="button"
                                                                     onClick={() => sc(p2 => ({
                                                                         ...p2,
                                                                         locale: o.value
                                                                     }))}
                                                                     className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition ${c.locale === o.value ? ba : bi}`}>{o.label}</button>)}</div>
                </div>
                <div>
                    <div
                        className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">{t('settings.pageSize')}</div>
                    <div className="flex gap-2">{pageSizes.map(s => <button key={s} type="button"
                                                                            onClick={() => sc(p2 => ({
                                                                                ...p2,
                                                                                pageSize: s
                                                                            }))}
                                                                            className={`inline-flex items-center rounded-lg px-3 py-2 text-xs font-medium transition ${c.pageSize === s ? ba : bi}`}>{s}</button>)}</div>
                </div>
                <div
                    className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <div
                                className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('settings.backend')}</div>
                            <div
                                className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{c.preferredBackend === 'google' ? t('settings.backend.google') : t('settings.backend.local')}</div>
                        </div>
                        <span
                            className="rounded-full bg-slate-200 dark:bg-slate-700 px-3 py-1 text-xs font-medium text-slate-700 dark:text-slate-300">{c.preferredBackend === 'google' ? 'Google' : 'Local'}</span>
                    </div>
                </div>
            </div>
            <div className="border-b border-slate-200 dark:border-slate-700">
                <div className="flex themed-scroll overflow-x-auto">{(['local', 'google'] as const).map(tab => <button
                    key={tab} type="button" onClick={() => sc(p2 => ({...p2, settingsTab: tab}))}
                    className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition whitespace-nowrap ${c.settingsTab === tab ? 'border-slate-900 dark:border-slate-100 text-slate-900 dark:text-slate-100' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}>{tab === 'local' ?
                    <IconDatabase className="shrink-0"/> :
                    <IconSheet className="shrink-0"/>}{t(`settings.tab.${tab}`)}</button>)}</div>
            </div>
            <div className="px-5 py-4 themed-scroll max-h-[60vh] overflow-y-auto">{c.settingsTab === 'local' ?
                <SettingsLocalTab config={c} recordCount={rc2} onClearData={onClearData} isSyncing={isSyncing} t={t}/> :
                <SettingsGoogleTab config={c} isAuthed={isAuthed} email={email} isSyncing={isSyncing} onCfg={gcfg}
                                   onConnect={onConnect} onDisconnect={onDisconnect} onAttach={onAttach}
                                   onCreate={onCreate} onToGoogle={onToGoogle} onToLocal={onToLocal} t={t}/>}</div>
        </div>
    );
};

const ThemeToggle: React.FC<{ theme: ThemePreference; onCycle: () => void; t: (k: string) => string }> = ({
                                                                                                              theme,
                                                                                                              onCycle,
                                                                                                              t
                                                                                                          }) => {
    const r = resolveTheme(theme);
    const ti: Record<ThemePreference, string> = {
        light: t('settings.theme.light'),
        dark: t('settings.theme.dark'),
        system: t('settings.theme.system')
    };
    return <button type="button" onClick={onCycle}
                   className="rounded-lg p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                   title={`${t('header.theme')}: ${ti[theme]}`}>{theme === 'system' ? <IconMonitor/> : r === 'dark' ?
        <IconMoon/> : <IconSun/>}</button>;
};

// ============================================================================
// APP
// ============================================================================

const App: React.FC = () => {
    const [config, setConfig] = useState<AppConfig>(() => rc());
    const [records, setRecords] = useState<AppRecord[]>([]);
    const [draftText, setDraftText] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [visiblePages, setVisiblePages] = useState(1);
    const [isLoading, setIsLoading] = useState(true);
    const [syncCount, setSyncCount] = useState(0);
    const [toasts, setToasts] = useState<Toast[]>([]);
    const [settingsVisible, setSettingsVisible] = useState(config.settingsOpen);
    const [settingsClosing, setSettingsClosing] = useState(false);
    const [isAuthed, setIsAuthed] = useState(false);
    const [gEmail, setGEmail] = useState('');
    const tokRef = useRef<string | null>(null);
    const bootDone = useRef(false);
    const t = useT(config.locale);
    const resolved = useMemo(() => resolveTheme(config.theme), [config.theme]);
    const nsid = useMemo(() => nid(config.google.spreadsheetId), [config.google.spreadsheetId]);
    const etab = useMemo(() => config.google.sheetName.trim() || DEFAULT_SHEET, [config.google.sheetName]);
    const showToggle = useMemo(() => Boolean(config.google.clientId.trim() && nsid), [config.google.clientId, nsid]);
    const isSyncing = syncCount > 0;

    const activeBackend = useMemo<BackendMode>(() => {
        if (config.preferredBackend === 'google' && isAuthed && nsid) return 'google';
        return 'local';
    }, [config.preferredBackend, isAuthed, nsid]);

    const onQuota = useCallback(() => {
        addToast(t('local.quotaError'), 'error');
    }, []);

    const dataStore: DataStore = useMemo(() => {
        if (activeBackend === 'google') return createGoogleDS(tokRef, nsid, etab);
        return createLocalDS(config.localStorageKey, onQuota);
    }, [activeBackend, config.localStorageKey, nsid, etab, onQuota]);

    /* ── Search + Sort + Pagination ─────────────────────────────────────── */
    const filteredRecords = useMemo(() => {
        let r = [...records].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            r = r.filter(rec => rec.text.toLowerCase().includes(q) || rec.id.toLowerCase().includes(q));
        }
        return r;
    }, [records, searchQuery]);

    const totalFiltered = filteredRecords.length;
    const pageSize = config.pageSize || DEFAULT_PAGE_SIZE;
    const visibleCount = visiblePages * pageSize;
    const visibleRecords = useMemo(() => filteredRecords.slice(0, visibleCount), [filteredRecords, visibleCount]);
    const hasMore = visibleCount < totalFiltered;

    /** Reset pagination when search or backend changes */
    useEffect(() => {
        setVisiblePages(1);
    }, [searchQuery, activeBackend]);

    /* ── Toast ──────────────────────────────────────────────────────────── */
    const addToast = useCallback((msg: string, level: Toast['level'] = 'error', detail?: string) => {
        const id = uid();
        setToasts(p => [...p, {id, message: msg, detail, level}]);
        setTimeout(() => setToasts(p => p.map(t2 => t2.id === id ? {...t2, dismissing: true} : t2)), TOAST_MS);
    }, []);
    const dismissToast = useCallback((id: string) => setToasts(p => {
        const f = p.find(t2 => t2.id === id);
        return f?.dismissing ? p.filter(t2 => t2.id !== id) : p.map(t2 => t2.id === id ? {
            ...t2,
            dismissing: true
        } : t2);
    }), []);
    const toggleDetail = useCallback((id: string) => setToasts(p => p.map(t2 => t2.id === id ? {
        ...t2,
        expanded: !t2.expanded
    } : t2)), []);
    const showErr = useCallback((e: unknown, msg?: string) => addToast(msg || em(e), 'error', msg ? em(e) : undefined), [addToast]);

    /**
     * Run an async operation with sync counter (non-blocking progress bar).
     * On success: runs onSuccess callback.
     * On failure: shows toast, no UI change.
     */
    const bgOp = useCallback(async <T, >(op: () => Promise<T>, onSuccess: (result: T) => void) => {
        setSyncCount(c => c + 1);
        try {
            const result = await op();
            onSuccess(result);
        } catch (e) {
            showErr(e);
        } finally {
            setSyncCount(c => c - 1);
        }
    }, [showErr]);

    /* ── Theme ──────────────────────────────────────────────────────────── */
    useEffect(() => {
        applyTheme(resolved);
    }, [resolved]);
    useEffect(() => {
        if (config.theme !== 'system') return;
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        const h = () => applyTheme(resolveTheme('system'));
        mq.addEventListener('change', h);
        return () => mq.removeEventListener('change', h);
    }, [config.theme]);
    useEffect(() => {
        wc(config);
    }, [config]);
    useEffect(() => {
        if (config.settingsOpen) {
            setSettingsClosing(false);
            setSettingsVisible(true);
        } else if (settingsVisible) setSettingsClosing(true);
    }, [config.settingsOpen, settingsVisible]);
    const onCloseEnd = useCallback(() => {
        setSettingsVisible(false);
        setSettingsClosing(false);
    }, []);

    /* ── Google auth ────────────────────────────────────────────────────── */
    const doAuth = useCallback(async (inter: boolean): Promise<string> => {
        const cid = config.google.clientId.trim();
        if (!cid) throw new Error(t('google.error.noClientId'));
        const tok = await rt(cid, inter);
        tokRef.current = tok;
        setIsAuthed(true);
        try {
            const p = await fp(tok);
            const e = p.email?.trim() || '';
            setGEmail(e);
            setConfig(pr => ({...pr, google: {...pr.google, lastAccountEmail: e}}));
        } catch {
            setGEmail(config.google.lastAccountEmail);
        }
        return tok;
    }, [config.google.clientId, config.google.lastAccountEmail, t]);

    const dropAuth = useCallback(() => {
        if (tokRef.current && window.google?.accounts?.oauth2?.revoke) window.google.accounts.oauth2.revoke(tokRef.current, () => {
        });
        tokRef.current = null;
        setIsAuthed(false);
        setGEmail('');
    }, []);

    /* ── Boot ───────────────────────────────────────────────────────────── */
    useEffect(() => {
        if (bootDone.current) return;
        bootDone.current = true;
        void (async () => {
            try {
                const lr = await createLocalDS(config.localStorageKey).list();
                setRecords(lr);
                if (config.preferredBackend === 'google' && config.google.clientId.trim() && nsid) {
                    try {
                        await doAuth(false);
                        const gr = await createGoogleDS(tokRef, nsid, etab).list();
                        setRecords(gr);
                        addToast(t('google.msg.connected'), 'info');
                    } catch (e) {
                        dbg('Silent fail', e);
                        addToast(t('toast.silentAuthFailed'), 'warn', em(e));
                    }
                }
            } catch (e) {
                showErr(e);
            } finally {
                setIsLoading(false);
            }
        })();
    }, [addToast, config.google.clientId, config.localStorageKey, config.preferredBackend, doAuth, etab, nsid, showErr, t]);

    /* ── Reload ─────────────────────────────────────────────────────────── */
    const reload = useCallback(() => bgOp(() => dataStore.list(), r => setRecords(r)), [bgOp, dataStore]);

    /* ── Google settings actions ────────────────────────────────────────── */
    const onConnect = useCallback(() => bgOp(() => doAuth(true), () => addToast(t('google.msg.connected'), 'info')), [addToast, bgOp, doAuth, t]);
    const onDisconnect = useCallback(() => {
        dropAuth();
        setConfig(p => ({...p, preferredBackend: 'local'}));
        createLocalDS(config.localStorageKey).list().then(r => setRecords(r));
        addToast(t('google.msg.disconnected'), 'info');
    }, [addToast, config.localStorageKey, dropAuth, t]);

    const onAttach = useCallback(() => bgOp(async () => {
        if (!nsid) throw new Error(t('google.error.noSpreadsheet'));
        if (!tokRef.current) await doAuth(true);
        await es(tokRef.current!, nsid, etab);
        setConfig(p => ({
            ...p,
            preferredBackend: 'google',
            google: {...p.google, spreadsheetId: nsid, spreadsheetUrl: surl(nsid), sheetName: etab}
        }));
        return createGoogleDS(tokRef, nsid, etab).list();
    }, r => {
        setRecords(r);
        addToast(t('google.msg.sheetAttached'), 'info');
    }), [addToast, bgOp, doAuth, etab, nsid, t]);
    const onCreateSheet = useCallback(() => bgOp(async () => {
        if (!tokRef.current) await doAuth(true);
        const title = config.google.spreadsheetId.startsWith('__CREATE__') ? config.google.spreadsheetId.replace('__CREATE__', '') : 'Google Sheets Store';
        const cr = await cs(tokRef.current!, title, etab);
        setConfig(p => ({
            ...p,
            preferredBackend: 'google',
            google: {...p.google, spreadsheetId: cr.spreadsheetId, spreadsheetUrl: cr.spreadsheetUrl, sheetName: etab}
        }));
        return [];
    }, r => {
        setRecords(r as AppRecord[]);
        addToast(t('google.msg.sheetCreated'), 'info');
    }), [addToast, bgOp, config.google.spreadsheetId, doAuth, etab, t]);

    const toGoogle = useCallback(() => bgOp(async () => {
        if (!nsid) throw new Error(t('google.error.noSpreadsheet'));
        if (!tokRef.current) await doAuth(true);
        await es(tokRef.current!, nsid, etab);
        setConfig(p => ({...p, preferredBackend: 'google'}));
        return createGoogleDS(tokRef, nsid, etab).list();
    }, r => {
        setRecords(r);
        addToast(t('google.msg.switchedToGoogle'), 'info');
    }), [addToast, bgOp, doAuth, etab, nsid, t]);
    const toLocal = useCallback(() => {
        setConfig(p => ({...p, preferredBackend: 'local'}));
        createLocalDS(config.localStorageKey).list().then(r => setRecords(r));
        addToast(t('google.msg.switchedToLocal'), 'info');
    }, [addToast, config.localStorageKey, t]);

    const headerToggle = useCallback(async () => {
        if (activeBackend === 'google') toLocal(); else await toGoogle();
    }, [activeBackend, toGoogle, toLocal]);
    const headerDisconnect = useCallback(() => onDisconnect(), [onDisconnect]);

    /* ── CRUD (eventually-consistent) ───────────────────────────────────── */
    const handleAdd = useCallback((e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const text = draftText.trim();
        if (!text) return;
        setDraftText('');
        bgOp(() => dataStore.add(text).then(() => dataStore.list()), r => setRecords(r));
    }, [bgOp, dataStore, draftText]);

    const handleDelete = useCallback((id: string) => {
        bgOp(() => dataStore.remove(id).then(() => dataStore.list()), r => setRecords(r));
    }, [bgOp, dataStore]);

    const handleClear = useCallback(() => {
        bgOp(() => dataStore.clear().then(() => dataStore.list()), r => setRecords(r));
    }, [bgOp, dataStore]);

    const cycleTheme = useCallback(() => {
        setConfig(p => {
            const o: ThemePreference[] = ['light', 'dark', 'system'];
            return {...p, theme: o[(o.indexOf(p.theme) + 1) % o.length]};
        });
    }, []);
    const toggleSettings = useCallback(() => setConfig(p => ({...p, settingsOpen: !p.settingsOpen})), []);

    if (isLoading) return <LoadingOverlay t={t}/>;

    return (
        <div
            className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
            <ProgressBar visible={isSyncing}/>
            <ToastContainer toasts={toasts} onDismiss={dismissToast} onToggle={toggleDetail} t={t}/>
            <header
                className="sticky top-0 z-30 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md">
                <div className="mx-auto max-w-6xl flex items-center justify-between px-4 py-3">
                    <h1 className="text-lg font-bold tracking-tight">{t('header.title')}</h1>
                    <div className="flex items-center gap-1">
                        {showToggle && (<>
                            {activeBackend === 'google' &&
                                <button type="button" onClick={headerDisconnect} disabled={isSyncing}
                                        className="rounded-lg p-2 text-base leading-none text-rose-500 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/30 transition disabled:opacity-50"
                                        title={t('header.backendToggle.disconnect')}>🔌</button>}
                            <button type="button" onClick={headerToggle} disabled={isSyncing}
                                    className={`rounded-lg p-2 text-base leading-none transition disabled:opacity-50 ${activeBackend === 'google' ? 'bg-emerald-100 dark:bg-emerald-900/40 hover:bg-emerald-200 dark:hover:bg-emerald-800/40' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                                    title={activeBackend === 'google' ? t('header.backendToggle.toLocal') : t('header.backendToggle.toGoogle')}>{activeBackend === 'google' ? '☁️' : '💾'}</button>
                            <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-0.5"/>
                        </>)}
                        <button type="button" onClick={toggleSettings}
                                className={`rounded-lg p-2 transition ${config.settingsOpen ? 'bg-slate-200 dark:bg-slate-700' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                                title={t('header.settings')}><IconSettings/></button>
                        <ThemeToggle theme={config.theme} onCycle={cycleTheme} t={t}/>
                    </div>
                </div>
            </header>
            <main className="mx-auto max-w-6xl px-4 py-6">
                {settingsVisible && <SettingsPanel config={config} setConfig={setConfig} recordCount={records.length}
                                                   onClearData={handleClear} isSyncing={isSyncing}
                                                   isClosing={settingsClosing} onCloseEnd={onCloseEnd}
                                                   isAuthed={isAuthed} email={gEmail} onConnect={onConnect}
                                                   onDisconnect={onDisconnect} onAttach={onAttach}
                                                   onCreate={onCreateSheet} onToGoogle={toGoogle} onToLocal={toLocal}
                                                   t={t}/>}
                <div className="mb-4 flex items-center gap-2">
                    <span
                        className="inline-flex items-center gap-1.5 rounded-full bg-slate-200 dark:bg-slate-800 px-3 py-1 text-xs font-medium text-slate-700 dark:text-slate-300">{activeBackend === 'google' ?
                        <IconSheet className="w-3.5 h-3.5"/> : <IconDatabase
                            className="w-3.5 h-3.5"/>}{activeBackend === 'google' ? t('backend.badge.google') : t('backend.badge.local')}</span>
                    <span
                        className="text-xs text-slate-500 dark:text-slate-400">{plur(records.length, t)}{searchQuery && ` (${totalFiltered} found)`}</span>
                </div>

                {/* Search */}
                <div className="mb-3 relative">
                    <IconSearch
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"/>
                    <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                           placeholder={t('data.search')}
                           className="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 pl-9 pr-9 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 outline-none transition focus:border-slate-500 dark:focus:border-slate-400"/>
                    {searchQuery && <button type="button" onClick={() => setSearchQuery('')}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                                            title={t('data.search.clear')}><IconX className="w-4 h-4"/></button>}
                </div>

                {/* Add form */}
                <form onSubmit={handleAdd} className="mb-5">
                    <div className="flex gap-2">
                        <input type="text" value={draftText} onChange={e => setDraftText(e.target.value)}
                               placeholder={t('data.placeholder')}
                               className="flex-1 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 outline-none transition focus:border-slate-500 dark:focus:border-slate-400"/>
                        <button type="submit" disabled={!draftText.trim()}
                                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 dark:bg-slate-100 px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 transition hover:bg-slate-800 dark:hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50">
                            <IconPlus/>{t('data.add')}</button>
                        <button type="button" onClick={reload}
                                className="rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 p-2.5 text-slate-600 dark:text-slate-300 transition hover:bg-slate-50 dark:hover:bg-slate-700"
                                title={t('data.reload')}><IconRefresh/></button>
                    </div>
                </form>

                {/* Table */}
                <div
                    className="table-container overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
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
                        {visibleRecords.length === 0
                            ? <tr>
                                <td colSpan={4} className="px-4 py-16 text-center text-slate-400 dark:text-slate-500">
                                    <div className="flex flex-col items-center gap-2"><IconDatabase
                                        className="w-8 h-8 opacity-40"/><span>{searchQuery ? t('data.emptySearch') : t('data.empty')}</span>
                                    </div>
                                </td>
                            </tr>
                            : visibleRecords.map((rec, i) => (
                                <tr key={rec.id}
                                    className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                                    <td className="px-4 py-3 align-top text-slate-400 dark:text-slate-500 tabular-nums">{i + 1}</td>
                                    <td className="px-4 py-3 align-top">
                                        <div
                                            className="text-slate-800 dark:text-slate-200 break-words whitespace-pre-wrap">{rec.text}</div>
                                        <div
                                            className="mt-1 text-[11px] text-slate-400 dark:text-slate-500 font-mono">{rec.id}</div>
                                    </td>
                                    <td className="px-4 py-3 align-top text-slate-500 dark:text-slate-400 whitespace-nowrap">{ft(rec.createdAt, config.locale)}</td>
                                    <td className="px-4 py-3 align-top text-right">
                                        <button type="button" onClick={() => handleDelete(rec.id)}
                                                className="inline-flex items-center gap-1 rounded-lg border border-rose-200 dark:border-rose-800 px-2.5 py-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 transition hover:bg-rose-50 dark:hover:bg-rose-900/20">
                                            <IconTrash/>{t('data.delete')}</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Load more */}
                {hasMore && (
                    <div className="mt-4 flex justify-center">
                        <button type="button" onClick={() => setVisiblePages(p => p + 1)}
                                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-6 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 transition hover:bg-slate-50 dark:hover:bg-slate-700">
                            {t('data.loadMore')} ({totalFiltered - visibleCount} more)
                        </button>
                    </div>
                )}

                {DEBUG && <details
                    className="mt-6 rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4">
                    <summary
                        className="cursor-pointer text-sm font-medium text-amber-800 dark:text-amber-200">{t('debug.title')}</summary>
                    <pre className="mt-3 text-xs text-amber-700 dark:text-amber-300 overflow-x-auto">{JSON.stringify({
                        config,
                        recordCount: records.length,
                        activeBackend: activeBackend,
                        resolved,
                        isAuthed,
                        gEmail,
                        syncCount,
                        searchQuery,
                        visiblePages,
                        pageSize
                    }, null, 2)}</pre>
                </details>}
            </main>
        </div>
    );
};

const rootElement = document.getElementById('root');
if (rootElement) createRoot(rootElement).render(<React.StrictMode><App/></React.StrictMode>);
