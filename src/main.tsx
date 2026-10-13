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
 * PROJECT: Google Sheets Store — YouTube Parity Edition
 * ENVIRONMENT: Bun, Parcel, React 19, TypeScript, TailwindCSS v4
 * DESIGN PARITY: YouTube Dashboard (daggerok/youtube) — Exact UI/UX port
 *
 * MODULES & FEATURES:
 *
 * 1. [i18n] en/ru via DICTIONARIES + useT hook.
 * 2. [Theme] light/dark/system via resolveTheme/applyTheme (YouTube parity: dark boolean derived, #020617 background).
 * 3. [Settings Panel] Animated console-wrap/settings-wrap grid (YouTube exact). General, Local Storage, Google Sheets tabs + scale slider + debug console.
 * 4. [Unified Data Layer] DataStore: list/add/update/remove/clear (update added for edit parity, like YouTube note edit).
 * 5. [Eventually-Consistent Sync] bgOp wrapper with syncCount → ProgressBar + toast.
 * 6. [Stay-Connected Auth] YouTube-grade persistence:
 *    - clientId + spreadsheetId + lastAccountEmail → silentAttemptedRef guard
 *    - doAuth(false) prompt:'' silent restore on boot if hasPrevGoogle
 *    - doAuth(true) prompt:'consent' interactive connect
 *    - gTokRef memory-only token, revoke on disconnect
 *    - isGoogleReady = isAuthed && token && nid(spreadsheetId)
 *    - zero-click auto-ensure: es() + reload when isGoogleReady changes (mirrors YouTube ensureVideoTab + readVideosFromSheet)
 *    - Auto-ensure after successful auth (setTimeout 300ms) + immediate load, matching YouTube's post-auth tab ensure.
 *    - saveGsConfig equivalent via wc(config) persisting lastAccountEmail.
 * 7. [Loading States] isLoading (boot), syncCount (progress bar), gsSyncing (YouTube parity naming via syncCount).
 * 8. [Header Backend Toggle] 💾/☁️ + 🔌 + ⚙️ + 🐛 debug + 🔄 reload + 🔍 search toggle (YouTube tbBtn grid).
 * 9. [Toast Notifications] YouTube-style card + themed colors, plus logs console.
 * 10. [Unified Input Bar — Add/Search Mode] Toggle 🔍 switches modes with animation, Escape two-step (clear → deactivate).
 * 11. [Table Parity] YouTube table card: rounded-xl border shadow-lg, gradient header, scale slider (A/A), dark/light scroll, sortable columns (Th with filter), inline edit (like YouTube note), mobile cards.
 * 12. [Pagination] "Load more" with visiblePages * pageSize (existing).
 * 13. [localStorage Safety] Quota check + byteSize/fmtBytes.
 * 14. [Keyboard Shortcuts]
 *     - Escape: clear input text → then deactivate search mode (two-step).
 *     - Cmd+R / Ctrl+R / F5: reload data from active backend (prevent default).
 * 15. [Debug] ?debug=true + showDebug console with logs table (YouTube parity), plus DEBUG details JSON.
 * 16. [Copy & Mask] maskEmail, copyToClipboard with ✅ feedback (YouTube parity for Client ID / Spreadsheet ID / Email).
 * 17. [Scale Slider] sliderToScale 0.7-1.5 via DEFAULT_SCALE_SLIDER=50, table font sizes tblFs/tblHFs/tblCellPy (YouTube exact).
 * ============================================================================
 */

// @ts-ignore
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createRoot } from 'react-dom/client';

// ============================================================================
// TYPES
// ============================================================================

type Locale = 'en' | 'ru';
type ThemePreference = 'light' | 'dark' | 'system';
type BackendMode = 'local' | 'google';
type InputMode = 'add' | 'search';
type AppRecord = { id: string; text: string; createdAt: string; updatedAt: string };
type GoogleConfig = { clientId: string; spreadsheetId: string; spreadsheetUrl: string; sheetName: string; lastAccountEmail: string };
type AppConfig = { locale: Locale; theme: ThemePreference; preferredBackend: BackendMode; localStorageKey: string; settingsOpen: boolean; settingsTab: 'local' | 'google'; google: GoogleConfig; pageSize: number; scaleSlider?: number; sortConfig?: { key: string; direction: 'asc' | 'desc' }; filters?: Record<string, string> };
type DataStore = { list: () => Promise<AppRecord[]>; add: (text: string) => Promise<AppRecord>; update: (id: string, text: string) => Promise<void>; remove: (id: string) => Promise<void>; clear: () => Promise<void> };
type Toast = { id: string; message: string; detail?: string; level: 'error' | 'info' | 'warn'; expanded?: boolean; dismissing?: boolean };
type LogEntry = { id: string; msg: string; ts: string };
type GisTokenResponse = { access_token?: string; error?: string };
type GisErrorResponse = { type?: string; message?: string };
type GisTokenClient = { requestAccessToken: (opts?: { prompt?: string }) => void };
type GisNamespace = { accounts: { oauth2: { initTokenClient: (cfg: { client_id: string; scope: string; callback: (r: GisTokenResponse) => void; error_callback?: (e: GisErrorResponse) => void }) => GisTokenClient; revoke: (token: string, cb?: () => void) => void } } };
declare global { interface Window { google?: GisNamespace } }

// ============================================================================
// i18n
// ============================================================================

const DICTIONARIES: Record<Locale, Record<string, string>> = {
    en: {
        'header.title': 'Google Sheets Store', 'header.settings': 'Settings', 'header.theme': 'Theme',
        'header.backendToggle.toGoogle': 'Switch to Google Sheets', 'header.backendToggle.toLocal': 'Switch to localStorage', 'header.backendToggle.disconnect': 'Disconnect from Google',
        'settings.title': 'Settings', 'settings.general': 'General',
        'settings.theme': 'Theme', 'settings.theme.light': 'Light', 'settings.theme.dark': 'Dark', 'settings.theme.system': 'System',
        'settings.language': 'Language', 'settings.language.en': 'English', 'settings.language.ru': 'Russian',
        'settings.storage': 'Storage', 'settings.storage.local': 'Local',
        'settings.backend': 'Active backend', 'settings.backend.local': 'localStorage', 'settings.backend.google': 'Google Sheets (if connected)',
        'settings.tab.local': 'Local Storage', 'settings.tab.google': 'Google Sheets',
        'settings.scale': 'Table scale',
        'local.how.title': 'How localStorage works', 'local.how.1': 'Data stays in this browser only.', 'local.how.2': 'No internet required.', 'local.how.3': 'Clearing browser storage deletes records.', 'local.how.4': 'Use Google Sheets for cloud sync.',
        'local.storageKey': 'Key', 'local.recordCount': 'Records', 'local.dataSize': 'Size', 'local.clearAll': 'Clear all records', 'local.quotaError': 'Quota exceeded.',
        'google.setup.title': '📋 How to set up Google Sheets as a datastore',
        'google.setup.step1.title': '1. Create a project in Google Cloud Console', 'google.setup.step1.text': 'Go to console.cloud.google.com and create a new project.',
        'google.setup.step2.title': '2. Enable Google Sheets API', 'google.setup.step2.text': 'Search "Google Sheets API" and click Enable.', 'google.setup.step2.fallback': 'If error, run in Cloud Shell:',
        'google.setup.step3.title': '3. Configure OAuth Consent Screen & Test Users', 'google.setup.step3.text': 'Google Auth Platform → Audience → External.', 'google.setup.step3.critical': 'Crucial:', 'google.setup.step3.critical.text': 'Add your email under Test users or you\'ll get 403.',
        'google.setup.step4.title': '4. Configure Data Access (Scopes)', 'google.setup.step4.text': 'Data Access → Add or remove scopes.', 'google.setup.step4.manual': 'Manually add:', 'google.setup.step4.save': 'Check, Update, then Save.',
        'google.setup.step5.title': '5. Create OAuth Client ID', 'google.setup.step5.text': 'Clients → Create → OAuth client ID → Web application.', 'google.setup.step5.origins': 'Add JavaScript origins:', 'google.setup.step5.origins.dev': 'for dev (Parcel)', 'google.setup.step5.origins.prod': 'for GitHub Pages',
        'google.setup.step6.title': '6. Connect the App', 'google.setup.step6.text': 'Paste Client ID below.', 'google.setup.step6.spreadsheet': 'Add Spreadsheet ID and tab name.', 'google.setup.step6.reconnect': 'Disconnect then Reconnect.', 'google.setup.step6.checkbox': 'Important: Check the Sheets permission box in Google popup.',
        'google.security.title': '🔒 Security', 'google.security.1': 'Client ID is public.', 'google.security.2': 'Never enter Client Secret.', 'google.security.3': 'Token is memory-only.', 'google.security.4': 'Each user uses own account.',
        'google.clientId': 'OAuth Client ID', 'google.clientId.placeholder': '123...apps.googleusercontent.com', 'google.clientId.hint': 'Public ID, not Secret.',
        'google.spreadsheetId': 'Spreadsheet ID or URL', 'google.spreadsheetId.placeholder': 'https://docs.google.com/spreadsheets/d/...',
        'google.sheetName': 'Sheet tab name', 'google.connectedDoc': 'Connected document', 'google.headers.info': 'First row reserved for headers:',
        'google.status.notConnected': 'Not connected', 'google.status.connected': 'Connected as',
        'google.btn.connect': 'Connect', 'google.btn.reconnect': 'Reconnect', 'google.btn.disconnect': 'Disconnect',
        'google.btn.attachSheet': 'Attach spreadsheet', 'google.btn.createSheet': 'Create new',
        'google.btn.switchToGoogle': 'Use Google Sheets', 'google.btn.switchToLocal': 'Use localStorage',
        'google.newSheetTitle': 'New spreadsheet title', 'google.newSheetTitle.placeholder': 'My Store',
        'google.error.noClientId': 'Enter Client ID first.', 'google.error.noSpreadsheet': 'Enter Spreadsheet ID first.',
        'google.msg.connected': 'Connected to Google.', 'google.msg.disconnected': 'Disconnected. Using localStorage.',
        'google.msg.sheetAttached': 'Spreadsheet attached.', 'google.msg.sheetCreated': 'New spreadsheet created.',
        'google.msg.switchedToGoogle': 'Using Google Sheets.', 'google.msg.switchedToLocal': 'Using localStorage.',
        'toast.silentAuthFailed': 'Auto-login failed. Using localStorage. Reconnect in Settings.', 'toast.details': 'Details',
        'data.add': 'Add', 'data.find': 'Find', 'data.reload': 'Reload', 'data.mode.add': 'Add mode', 'data.mode.search': 'Search mode',
        'data.placeholder.add': 'Add a record and press Enter…', 'data.placeholder.search': 'Search records…',
        'data.col.index': '#', 'data.col.text': 'Text', 'data.col.created': 'Created', 'data.col.updated': 'Updated', 'data.col.actions': 'Actions',
        'data.empty': 'No records yet. Add your first one above.', 'data.emptySearch': 'Nothing matched your search.', 'data.found': 'found', 'data.edit': 'Edit', 'data.save': 'Save', 'data.cancel': 'Cancel', 'data.delete': 'Delete', 'data.loadMore': 'Load more',
        'backend.badge.local': 'localStorage', 'backend.badge.google': 'Google Sheets',
        'data.records.0': 'records', 'data.records.1': 'record', 'data.records.few': 'records', 'data.records.many': 'records',
        'loading': 'Loading...', 'debug.title': '🐛 Debug info', 'console.title': '🐛 Debug Console', 'console.clear': 'Clear',
        'google.defaultDocTitle': 'Google Sheets Store',
    },
    ru: {
        'header.title': 'Хранилище Google Sheets', 'header.settings': 'Настройки', 'header.theme': 'Тема',
        'header.backendToggle.toGoogle': 'Переключить на Google Sheets', 'header.backendToggle.toLocal': 'Переключить на localStorage', 'header.backendToggle.disconnect': 'Отключиться от Google',
        'settings.title': 'Настройки', 'settings.general': 'Общие',
        'settings.theme': 'Тема', 'settings.theme.light': 'Светлая', 'settings.theme.dark': 'Тёмная', 'settings.theme.system': 'Системная',
        'settings.language': 'Язык', 'settings.language.en': 'Английский', 'settings.language.ru': 'Русский',
        'settings.storage': 'Хранилище', 'settings.storage.local': 'Локально',
        'settings.backend': 'Активный backend', 'settings.backend.local': 'localStorage', 'settings.backend.google': 'Google Sheets (если подключён)',
        'settings.tab.local': 'Local Storage', 'settings.tab.google': 'Google Sheets',
        'settings.scale': 'Масштаб таблицы',
        'local.how.title': 'Как работает localStorage', 'local.how.1': 'Данные только в этом браузере.', 'local.how.2': 'Интернет не нужен.', 'local.how.3': 'Очистка хранилища удалит записи.', 'local.how.4': 'Используйте Google Sheets для синхронизации.',
        'local.storageKey': 'Ключ', 'local.recordCount': 'Записей', 'local.dataSize': 'Размер', 'local.clearAll': 'Очистить всё', 'local.quotaError': 'Квота превышена.',
        'google.setup.title': '📋 Как настроить Google Sheets',
        'google.setup.step1.title': '1. Создайте проект', 'google.setup.step1.text': 'console.cloud.google.com.',
        'google.setup.step2.title': '2. Включите Google Sheets API', 'google.setup.step2.text': 'Найдите и включите.', 'google.setup.step2.fallback': 'При ошибке:',
        'google.setup.step3.title': '3. OAuth и тестовые пользователи', 'google.setup.step3.text': 'Audience → External.', 'google.setup.step3.critical': 'Критично:', 'google.setup.step3.critical.text': 'Добавьте email в Test users.',
        'google.setup.step4.title': '4. Scopes', 'google.setup.step4.text': 'Data Access → Add scopes.', 'google.setup.step4.manual': 'Вручную:', 'google.setup.step4.save': 'Update, Save.',
        'google.setup.step5.title': '5. OAuth Client ID', 'google.setup.step5.text': 'Clients → Create → Web.', 'google.setup.step5.origins': 'Origins:', 'google.setup.step5.origins.dev': 'для Parcel', 'google.setup.step5.origins.prod': 'для GitHub Pages',
        'google.setup.step6.title': '6. Подключите', 'google.setup.step6.text': 'Вставьте Client ID.', 'google.setup.step6.spreadsheet': 'Spreadsheet ID + вкладка.', 'google.setup.step6.reconnect': 'Disconnect → Reconnect.', 'google.setup.step6.checkbox': 'Отметьте доступ к Sheets.',
        'google.security.title': '🔒 Безопасность', 'google.security.1': 'Client ID публичный.', 'google.security.2': 'Не вводите Secret.', 'google.security.3': 'Токен в памяти.', 'google.security.4': 'Свой аккаунт.',
        'google.clientId': 'OAuth Client ID', 'google.clientId.placeholder': '123...apps.googleusercontent.com', 'google.clientId.hint': 'Публичный ID.',
        'google.spreadsheetId': 'Spreadsheet ID или URL', 'google.spreadsheetId.placeholder': 'https://docs.google.com/spreadsheets/d/...',
        'google.sheetName': 'Имя вкладки', 'google.connectedDoc': 'Документ', 'google.headers.info': 'Заголовки:',
        'google.status.notConnected': 'Не подключён', 'google.status.connected': 'Подключён как',
        'google.btn.connect': 'Подключить', 'google.btn.reconnect': 'Переподключить', 'google.btn.disconnect': 'Отключить',
        'google.btn.attachSheet': 'Подключить документ', 'google.btn.createSheet': 'Создать',
        'google.btn.switchToGoogle': 'Google Sheets', 'google.btn.switchToLocal': 'localStorage',
        'google.newSheetTitle': 'Название', 'google.newSheetTitle.placeholder': 'Хранилище',
        'google.error.noClientId': 'Введите Client ID.', 'google.error.noSpreadsheet': 'Введите Spreadsheet ID.',
        'google.msg.connected': 'Подключён.', 'google.msg.disconnected': 'Отключён. localStorage.',
        'google.msg.sheetAttached': 'Документ подключён.', 'google.msg.sheetCreated': 'Документ создан.',
        'google.msg.switchedToGoogle': 'Google Sheets.', 'google.msg.switchedToLocal': 'localStorage.',
        'toast.silentAuthFailed': 'Автовход не удался. Переподключитесь.', 'toast.details': 'Подробности',
        'data.add': 'Добавить', 'data.find': 'Найти', 'data.reload': 'Обновить', 'data.mode.add': 'Режим добавления', 'data.mode.search': 'Режим поиска',
        'data.placeholder.add': 'Введите запись и нажмите Enter…', 'data.placeholder.search': 'Поиск записей…',
        'data.col.index': '#', 'data.col.text': 'Текст', 'data.col.created': 'Создано', 'data.col.updated': 'Обновлено', 'data.col.actions': 'Действия',
        'data.empty': 'Пока пусто. Добавьте первую запись выше.', 'data.emptySearch': 'Ничего не найдено.', 'data.found': 'найдено', 'data.edit': 'Изм.', 'data.save': 'Сохр.', 'data.cancel': 'Отм.', 'data.delete': 'Удалить', 'data.loadMore': 'Показать ещё',
        'backend.badge.local': 'localStorage', 'backend.badge.google': 'Google Sheets',
        'data.records.0': 'записей', 'data.records.1': 'запись', 'data.records.few': 'записи', 'data.records.many': 'записей',
        'loading': 'Загрузка...', 'debug.title': '🐛 Отладка', 'console.title': '🐛 Консоль', 'console.clear': 'Очистить',
        'google.defaultDocTitle': 'Хранилище',
    },
};

// ============================================================================
// ALL INFRA CODE (identical to previous — compact) — YouTube parity extended
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
const byteSize = (s: string) => new Blob([s]).size;
const fmtBytes = (b: number) => b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`;
const resolveTheme = (p: ThemePreference): 'light' | 'dark' => p === 'light' || p === 'dark' ? p : (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
const applyTheme = (r: 'light' | 'dark') => {
    document.documentElement.classList.toggle('dark', r === 'dark');
};
// YouTube parity helpers
const sliderToScale = (v: number) => 0.7 + (v / 100) * 0.8;
const DEFAULT_SCALE_SLIDER = 50;
const maskEmail = (e: string) => {
    if (!e || !e.includes('@')) return e || '—';
    const [u, d] = e.split('@');
    if (u.length <= 2) return `${u[0]}***@${d}`;
    return `${u.slice(0, 2)}***@${d}`;
};
const copyToClipboard = async (text: string) => {
    try { await navigator.clipboard.writeText(text); return true; } catch { 
        try { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); return true; } catch { return false; }
    }
};
const DC: AppConfig = {
    locale: 'en',
    theme: 'system',
    preferredBackend: 'local',
    localStorageKey: DEFAULT_DB_KEY,
    settingsOpen: false,
    settingsTab: 'local',
    google: {clientId: '', spreadsheetId: '', spreadsheetUrl: '', sheetName: DEFAULT_SHEET, lastAccountEmail: ''},
    pageSize: DEFAULT_PAGE_SIZE,
    scaleSlider: DEFAULT_SCALE_SLIDER,
    sortConfig: { key: 'createdAt', direction: 'desc' },
    filters: { text: '', createdAt: '' }
};
const rc = (): AppConfig => {
    try {
        const r = localStorage.getItem(APP_CONFIG_KEY);
        if (!r) return {...DC};
        const p = jp<Partial<AppConfig>>(r, {});
        return {...DC, ...p, google: {...DC.google, ...(p.google ?? {})}, scaleSlider: (p as any).scaleSlider ?? DC.scaleSlider, sortConfig: (p as any).sortConfig ?? DC.sortConfig, filters: (p as any).filters ?? DC.filters};
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

const createLocalDS = (key: string, onQuota?: () => void): DataStore => {
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
            if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22)) onQuota?.();
            throw e;
        }
    };
    return {
        list: async () => ra(), add: async (text) => {
            const r: AppRecord = {id: uid(), text, createdAt: now(), updatedAt: now()};
            const all = ra();
            all.push(r);
            wa(all);
            return r;
        }, update: async (id, text) => {
            const all = ra();
            const idx = all.findIndex(r => r.id === id);
            if (idx === -1) throw new Error('Not found');
            all[idx] = {...all[idx], text, updatedAt: now()};
            wa(all);
        }, remove: async (id) => wa(ra().filter(r => r.id !== id)), clear: async () => wa([])
    };
};

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
                f(new Error('GIS fail'));
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
    if (!id) throw new Error('No ID');
    await es(tok, id, t);
    return {spreadsheetId: id, spreadsheetUrl: r.spreadsheetUrl?.trim() || surl(id)};
};
const rsr = async (tok: string, sid: string, tab: string): Promise<AppRecord[]> => {
    const id = nid(sid);
    const t = tab.trim() || DEFAULT_SHEET;
    const r = await sa<{ values?: string[][] }>(`/spreadsheets/${id}/values/${encodeURIComponent(sr(t, 'A2:D'))}`, tok);
    return (r.values ?? []).map((row, i) => {
        const rid = (row[0] ?? '').trim() || `r-${i}-${uid()}`;
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
        }, update: async (rid, text) => {
            const all = await rsr(gt(), id, t);
            const idx = all.findIndex(r => r.id === rid);
            if (idx === -1) throw new Error('Not found');
            all[idx] = {...all[idx], text, updatedAt: now()};
            await wsr(gt(), id, t, all);
        }, remove: async (rid) => {
            const all = await rsr(gt(), id, t);
            await wsr(gt(), id, t, all.filter(r => r.id !== rid));
        }, clear: async () => wsr(gt(), id, t, [])
    };
};

// ============================================================================
// SVG ICONS
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
const IconEdit: React.FC<{ className?: string }> = ({className}) => (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>);
const IconCheck: React.FC<{ className?: string }> = ({className}) => (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 6L9 17l-5-5"/>
    </svg>);

// ============================================================================
// SMALL COMPONENTS
// ============================================================================

const ProgressBar: React.FC<{ visible: boolean }> = ({visible}) => visible ?
    <div className="fixed top-0 left-0 right-0 z-50 h-0.5 overflow-hidden">
        <div className="h-full w-1/3 bg-blue-500 dark:bg-blue-400 animate-progress"/>
    </div> : null;
const LoadingOverlay: React.FC<{ t: (k: string) => string }> = ({t}) => (<div
    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-50/80 dark:bg-slate-950/80 backdrop-blur-sm">
    <div className="flex flex-col items-center gap-3">
        <div
            className="w-8 h-8 border-2 border-slate-300 dark:border-slate-600 border-t-slate-900 dark:border-t-slate-100 rounded-full animate-spin"/>
        <span className="text-sm text-slate-500 dark:text-slate-400">{t('loading')}</span></div>
</div>);
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
// SETTINGS (YouTube parity styled)
// ============================================================================

const SettingsLocalTab: React.FC<{
    config: AppConfig;
    recordCount: number;
    onClearData: () => void;
    isSyncing: boolean;
    t: (k: string) => string
}> = ({config, recordCount, onClearData, isSyncing, t}) => {
    const ds = useMemo(() => {
        try {
            const r = localStorage.getItem(config.localStorageKey);
            return r ? fmtBytes(byteSize(r)) : '0 B';
        } catch {
            return '?';
        }
    }, [config.localStorageKey, recordCount]);
    return (<div className="space-y-4 animate-fade-in">
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4">
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
                <code className="text-xs text-slate-700 dark:text-slate-300 break-all">{config.localStorageKey}</code></div>
            <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">{t('local.recordCount')}</div>
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">{recordCount}</div>
            </div>
            <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">{t('local.dataSize')}</div>
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">{ds}</div>
            </div>
        </div>
        <button type="button" onClick={onClearData} disabled={isSyncing || recordCount === 0}
                className="inline-flex items-center gap-2 rounded-lg border border-rose-300 dark:border-rose-700 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium text-rose-700 dark:text-rose-400 transition hover:bg-rose-50 dark:hover:bg-rose-900/20 disabled:cursor-not-allowed disabled:opacity-50">
            <IconTrash/>{t('local.clearAll')}</button>
    </div>);
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
    t: (k: string) => string;
    showClientId: boolean; setShowClientId: (v: boolean) => void;
    showSpreadsheetId: boolean; setShowSpreadsheetId: (v: boolean) => void;
    showEmail: boolean; setShowEmail: (v: boolean) => void;
    copiedField: string | null; onCopy: (text: string, field: string) => void;
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
          t,
          showClientId, setShowClientId,
          showSpreadsheetId, setShowSpreadsheetId,
          showEmail, setShowEmail,
          copiedField, onCopy
      }) => {
    const [nt, setNt] = useState(t('google.defaultDocTitle'));
    const hc = Boolean(config.google.clientId.trim());
    const hs = Boolean(nid(config.google.spreadsheetId));
    const connected = isAuthed && hs;
    const bp = 'inline-flex items-center gap-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 px-3 py-2 text-xs font-medium text-white dark:text-slate-900 transition hover:bg-slate-800 dark:hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50';
    const bs = 'inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 transition hover:bg-slate-50 dark:hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50';
    return (<div className="space-y-4 animate-fade-in">
        <details className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20">
            <summary
                className="cursor-pointer px-4 py-3 text-sm font-semibold text-blue-900 dark:text-blue-200">{t('google.setup.title')}</summary>
            <div className="px-4 pb-4 space-y-3 text-xs text-blue-800 dark:text-blue-300">
                <div>
                    <div
                        className="font-semibold text-blue-900 dark:text-blue-100">{t('google.setup.step1.title')}</div>
                    <p className="mt-1">{t('google.setup.step1.text')} <a href="https://console.cloud.google.com/"
                                                                          target="_blank"
                                                                          className="underline">console.cloud.google.com</a>
                    </p>
                </div>
                <div>
                    <div
                        className="font-semibold text-blue-900 dark:text-blue-100">{t('google.setup.step2.title')}</div>
                    <p className="mt-1">{t('google.setup.step2.text')}</p>
                    <code
                        className="mt-1 block rounded bg-blue-100 dark:bg-blue-800 px-2 py-1 text-[10px]">gcloud services enable sheets.googleapis.com</code>
                </div>
                <div>
                    <div
                        className="font-semibold text-blue-900 dark:text-blue-100">{t('google.setup.step3.title')}</div>
                    <p className="mt-1">{t('google.setup.step3.text')}</p>
                    <p className="mt-1"><span className="font-semibold">{t('google.setup.step3.critical')}</span> {t('google.setup.step3.critical.text')}
                    </p>
                </div>
                <div>
                    <div
                        className="font-semibold text-blue-900 dark:text-blue-100">{t('google.setup.step4.title')}</div>
                    <p className="mt-1">{t('google.setup.step4.text')}</p>
                    <p className="mt-1 text-[10px]">{t('google.setup.step4.manual')} <code
                        className="bg-blue-100 dark:bg-blue-800 px-1">.../auth/spreadsheets</code>, <code
                        className="bg-blue-100 dark:bg-blue-800 px-1">openid</code>, <code
                        className="bg-blue-100 dark:bg-blue-800 px-1">email</code>, <code
                        className="bg-blue-100 dark:bg-blue-800 px-1">profile</code></p>
                </div>
                <div>
                    <div
                        className="font-semibold text-blue-900 dark:text-blue-100">{t('google.setup.step5.title')}</div>
                    <p className="mt-1">{t('google.setup.step5.text')}</p>
                    <ul className="mt-1 list-disc pl-4 text-[10px] space-y-0.5">
                        <li><code className="bg-blue-100 dark:bg-blue-800 px-1">https://daggerok.github.io</code> {t('google.setup.step5.origins.prod')}</li>
                        <li><code className="bg-blue-100 dark:bg-blue-800 px-1">http://localhost:1234</code> {t('google.setup.step5.origins.dev')}</li>
                    </ul>
                </div>
                <div>
                    <div
                        className="font-semibold text-blue-900 dark:text-blue-100">{t('google.setup.step6.title')}</div>
                    <p className="mt-1">{t('google.setup.step6.text')}</p>
                    <p className="mt-1">{t('google.setup.step6.spreadsheet')}</p>
                    <p className="mt-1">{t('google.setup.step6.reconnect')} {t('google.setup.step6.checkbox')}</p>
                </div>
                <div
                    className="rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-2 text-amber-800 dark:text-amber-200">
                    <span className="font-semibold">{t('google.security.title')}</span> {t('google.security.1')} {t('google.security.2')} {t('google.security.3')} {t('google.security.4')}
                </div>
            </div>
        </details>

        {/* Connected status — YouTube parity card */}
        <div className={`rounded-xl border p-4 ${connected ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20' : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50'}`}>
            <div className="flex items-center justify-between text-sm">
                <div className="font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2 flex-wrap">
                    <span>{connected ? `${t('google.status.connected')} ${showEmail ? email : maskEmail(email)}` : t('google.status.notConnected')}</span>
                    {connected && email && (
                        <span className="flex items-center gap-1">
                            <button type="button" onClick={() => setShowEmail(!showEmail)} className="text-xs px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-700 transition-colors" title={showEmail ? "Hide email" : "Show email"}>{showEmail ? "👁️" : "👁️‍🗨️"}</button>
                            <button type="button" onClick={() => onCopy(email, 'gEmail')} className="text-xs px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-700 transition-colors" title="Copy email">{copiedField === 'gEmail' ? "✅" : "📋"}</button>
                        </span>
                    )}
                </div>
                <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-slate-400'}`} title={connected ? 'Connected' : 'Not connected'}></span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
                {!isAuthed ? <button type="button" onClick={onConnect} disabled={isSyncing || !hc} className={bp}>{t('google.btn.connect')}</button> : <button type="button" onClick={onDisconnect} disabled={isSyncing} className={bs}>{t('google.btn.disconnect')}</button>}
                {isAuthed && <button type="button" onClick={onConnect} disabled={isSyncing || !hc} className={bs}>{t('google.btn.reconnect')}</button>}
            </div>
        </div>

        <div>
            <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">{t('google.clientId')}</label>
                <span className="flex items-center gap-1">
                    <button type="button" onClick={() => setShowClientId(!showClientId)} className="text-xs px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800" title={showClientId ? "Hide" : "Show"}>{showClientId ? "👁️" : "👁️‍🗨️"}</button>
                    <button type="button" onClick={() => onCopy(config.google.clientId, 'clientId')} className="text-xs px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800" title="Copy">{copiedField === 'clientId' ? "✅" : "📋"}</button>
                </span>
            </div>
            <input type={showClientId ? "text" : "password"} value={config.google.clientId} onChange={e => onCfg({clientId: e.target.value})}
                   placeholder={t('google.clientId.placeholder')}
                   className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-mono text-slate-800 dark:text-slate-200 placeholder-slate-400 outline-none focus:border-emerald-500 transition"/>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">{t('google.clientId.hint')}</div>
        </div>
        <div>
            <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">{t('google.spreadsheetId')}</label>
                <span className="flex items-center gap-1">
                    <button type="button" onClick={() => setShowSpreadsheetId(!showSpreadsheetId)} className="text-xs px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800" title={showSpreadsheetId ? "Hide" : "Show"}>{showSpreadsheetId ? "👁️" : "👁️‍🗨️"}</button>
                    <button type="button" onClick={() => onCopy(config.google.spreadsheetId, 'spreadsheetId')} className="text-xs px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800" title="Copy">{copiedField === 'spreadsheetId' ? "✅" : "📋"}</button>
                </span>
            </div>
            <input type={showSpreadsheetId ? "text" : "password"} value={config.google.spreadsheetId} onChange={e => onCfg({spreadsheetId: e.target.value})}
                   placeholder={t('google.spreadsheetId.placeholder')}
                   className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-mono text-slate-800 dark:text-slate-200 placeholder-slate-400 outline-none focus:border-emerald-500 transition"/>
        </div>
        <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">{t('google.sheetName')}</label>
            <input type="text" value={config.google.sheetName} onChange={e => onCfg({sheetName: e.target.value})}
                   placeholder={DEFAULT_SHEET}
                   className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-800 dark:text-slate-200 outline-none focus:border-emerald-500 transition"/>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">Tab name inside spreadsheet. Auto-created if missing.</div>
        </div>
        <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onAttach} disabled={isSyncing || !hc || !hs} className={bp}>{t('google.btn.attachSheet')}</button>
            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                <input type="text" value={nt} onChange={e => setNt(e.target.value)}
                       placeholder={t('google.newSheetTitle.placeholder')}
                       className="flex-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-800 dark:text-slate-200 outline-none focus:border-emerald-500 transition"/>
                <button type="button" onClick={() => { const v = nt.trim() || t('google.defaultDocTitle'); onCfg({spreadsheetId: `__CREATE__${v}`}); setTimeout(() => onCreate(), 50); }} disabled={isSyncing || !hc} className={bs}>{t('google.btn.createSheet')}</button>
            </div>
        </div>
        <div className="flex flex-wrap gap-2">
            <button type="button" disabled={isSyncing || !hs} onClick={onToGoogle} className={bp}>{t('google.btn.switchToGoogle')}</button>
            <button type="button" disabled={isSyncing} onClick={onToLocal} className={bs}>{t('google.btn.switchToLocal')}</button>
        </div>
        {nid(config.google.spreadsheetId) && !config.google.spreadsheetId.startsWith('__CREATE__') && <div
            className="rounded-xl border border-emerald-200 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 p-3">
            <div className="font-medium text-emerald-800 dark:text-emerald-200 mb-1 text-xs">{t('google.connectedDoc')}</div>
            <a href={surl(nid(config.google.spreadsheetId))} target="_blank" rel="noreferrer"
               className="text-xs text-emerald-700 dark:text-emerald-300 underline break-all">{surl(nid(config.google.spreadsheetId))}</a>
        </div>}
        <div
            className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-3 text-xs text-slate-600 dark:text-slate-400">
            <div className="font-medium text-slate-700 dark:text-slate-200 mb-1">{t('google.headers.info')}</div>
            <code className="rounded bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 font-mono text-[10px]">{SHEET_HEADERS.join(' | ')}</code>
        </div>
    </div>);
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
    t: (k: string) => string;
    showClientId: boolean; setShowClientId: (v: boolean) => void;
    showSpreadsheetId: boolean; setShowSpreadsheetId: (v: boolean) => void;
    showEmail: boolean; setShowEmail: (v: boolean) => void;
    copiedField: string|null; onCopy: (txt: string, field: string) => void;
}> = ({
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
          t,
          showClientId, setShowClientId,
          showSpreadsheetId, setShowSpreadsheetId,
          showEmail, setShowEmail,
          copiedField, onCopy
      }) => {
    const gcfg = useCallback((p2: Partial<GoogleConfig>) => sc(pr => ({...pr, google: {...pr.google, ...p2}})), [sc]);
    // mimic YouTube card style: outer card with header gradient, close button
    return (<div onAnimationEnd={e => {
        if (e.animationName === 'slideUp' && isClosing) onCloseEnd();
    }}
                 className={`settings-wrap open mb-2 ${isClosing ? 'animate-slide-up' : 'animate-slide-down'}`}>
        <div className="settings-inner">
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-gradient-to-r from-slate-50 to-slate-100/50 dark:from-slate-900/30 dark:to-slate-900/10 flex items-center justify-between">
            <h2 className="text-sm font-bold text-emerald-500">📋 {t('settings.title')}</h2>
            <button onClick={() => sc(p=> ({...p, settingsOpen:false}))} className="text-xs px-3 py-1 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800">Close</button>
        </div>
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/20">
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <div className="text-xs font-medium text-slate-600 dark:text-slate-400">{t('settings.language')}</div>
                    <select value={c.locale} onChange={e => sc(p => ({...p, locale: e.target.value as Locale}))}
                            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200">
                        <option value="en">{t('settings.language.en')}</option>
                        <option value="ru">{t('settings.language.ru')}</option>
                    </select>
                </div>
                <div>
                    <div className="text-xs font-medium text-slate-600 dark:text-slate-400">{t('settings.theme')}</div>
                    <select value={c.theme} onChange={e => sc(p => ({...p, theme: e.target.value as ThemePreference}))}
                            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200">
                        <option value="light">{t('settings.theme.light')}</option>
                        <option value="dark">{t('settings.theme.dark')}</option>
                        <option value="system">{t('settings.theme.system')}</option>
                    </select>
                </div>
            </div>
            <div className="mt-3 flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2">
                <div>
                    <div
                        className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('settings.backend')}</div>
                    <div
                        className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{c.preferredBackend === 'google' ? t('settings.backend.google') : t('settings.backend.local')}</div>
                </div>
                <span
                    className="rounded-full bg-slate-200 dark:bg-slate-700 px-3 py-1 text-xs font-medium text-slate-700 dark:text-slate-300">{c.preferredBackend === 'google' ? 'Google' : 'Local'}</span>
            </div>
            <div className="mt-3">
                <div className="text-xs font-medium text-slate-600 dark:text-slate-400">{t('settings.scale')}</div>
                <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-slate-500">A</span>
                    <input type="range" min={0} max={100} value={c.scaleSlider ?? DEFAULT_SCALE_SLIDER} onChange={e => sc(p => ({...p, scaleSlider: Number(e.target.value)}))} className="scale-slider flex-1" />
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">A</span>
                    <span className="text-[10px] text-slate-500">{Math.round(sliderToScale(c.scaleSlider ?? DEFAULT_SCALE_SLIDER)*100)}%</span>
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
                               onConnect={onConnect} onDisconnect={onDisconnect} onAttach={onAttach} onCreate={onCreate}
                               onToGoogle={onToGoogle} onToLocal={onToLocal} t={t}
                               showClientId={showClientId} setShowClientId={setShowClientId}
                               showSpreadsheetId={showSpreadsheetId} setShowSpreadsheetId={setShowSpreadsheetId}
                               showEmail={showEmail} setShowEmail={setShowEmail}
                               copiedField={copiedField} onCopy={onCopy}/>}</div>
    </div>
        </div>
    </div>);
};

// ============================================================================
// APP
// ============================================================================

const REPO_URL = 'https://github.com/daggerok/google';

const App: React.FC = () => {
    const [config, setConfig] = useState<AppConfig>(() => rc());
    const [records, setRecords] = useState<AppRecord[]>([]);
    const [inputText, setInputText] = useState('');
    const [inputMode, setInputMode] = useState<InputMode>('add');
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
    const silentAttemptedRef = useRef(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const t = useT(config.locale);
    // YouTube parity: logs, debug, copy, mask, scale, sorting
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [showDebug, setShowDebug] = useState(false);
    const [showClientId, setShowClientId] = useState(false);
    const [showSpreadsheetId, setShowSpreadsheetId] = useState(false);
    const [showEmail, setShowEmail] = useState(false);
    const [copiedField, setCopiedField] = useState<string|null>(null);
    const [editingId, setEditingId] = useState<string|null>(null);
    const [editingText, setEditingText] = useState('');
    const resolved = useMemo(() => resolveTheme(config.theme), [config.theme]);
    const dark = resolved === 'dark';
    const nsid = useMemo(() => nid(config.google.spreadsheetId), [config.google.spreadsheetId]);
    const etab = useMemo(() => config.google.sheetName.trim() || DEFAULT_SHEET, [config.google.sheetName]);
    const showToggle = useMemo(() => Boolean(config.google.clientId.trim() && nsid), [config.google.clientId, nsid]);
    const isSyncing = syncCount > 0;

    const scale = useMemo(() => sliderToScale(config.scaleSlider ?? DEFAULT_SCALE_SLIDER), [config.scaleSlider]);
    const tblFs = `${Math.round(14 * scale)}px`;
    const tblHFs = `${Math.round(11 * scale)}px`;
    const tblCellPy = `${Math.round(10 * scale)}px`;

    // YouTube parity class helpers
    const bg = dark ? 'bg-slate-950/95 text-slate-100' : 'bg-white/95 text-slate-900';
    const bdr = dark ? 'border-slate-800' : 'border-slate-200';
    const card = dark ? 'bg-slate-800 border-slate-600 text-slate-100' : 'bg-white border-slate-200 text-slate-900 shadow-sm';
    const inp = dark ? 'bg-slate-800 border-slate-700 text-emerald-400' : 'bg-slate-50 border-slate-300 text-emerald-700';
    const inpFilter = dark ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-white border-slate-300 text-slate-800';
    const mt = dark ? 'text-slate-400' : 'text-slate-500';
    const t1 = dark ? 'text-slate-100' : 'text-slate-800';
    const sB = dark ? 'bg-slate-800' : 'bg-white';
    const hR = dark ? 'hover:bg-slate-700/20' : 'hover:bg-slate-50';
    const scCls = dark ? 'dark-scroll' : 'light-scroll';
    const tbBtn = 'w-full md:w-9 h-9 rounded-lg border-0 bg-transparent transition-all flex items-center justify-center disabled:opacity-40 text-base';
    const iconBtn = 'w-7 h-7 rounded-md border-0 bg-transparent flex items-center justify-center text-xs transition-all active:scale-95 flex-shrink-0';

    const activeBackend = useMemo<BackendMode>(() => {
        if (config.preferredBackend === 'google' && isAuthed && nsid) return 'google';
        return 'local';
    }, [config.preferredBackend, isAuthed, nsid]);

    const isGoogleReady = useMemo(() => isAuthed && !!tokRef.current && !!nsid, [isAuthed, nsid, syncCount]);

    // logs helper (YouTube parity)
    const log = useCallback((msg: string) => {
        const ts = new Date().toLocaleTimeString();
        setLogs(prev => [...prev.slice(-80), {id: uid(), msg, ts}]);
        dbg(msg);
    }, []);

    const onQuota = useCallback(() => addToast(t('local.quotaError'), 'error'), []);
    const dataStore: DataStore = useMemo(() => activeBackend === 'google' ? createGoogleDS(tokRef, nsid, etab) : createLocalDS(config.localStorageKey, onQuota), [activeBackend, config.localStorageKey, nsid, etab, onQuota]);

    // Sorting & filtering (YouTube parity: per-column)
    const sortConfig = config.sortConfig ?? { key: 'createdAt', direction: 'desc' as const };
    const filters = config.filters ?? { text: '', createdAt: '' };

    const requestSort = useCallback((key: string) => {
        setConfig(prev => {
            const cur = prev.sortConfig ?? { key: 'createdAt', direction: 'desc' };
            let direction: 'asc' | 'desc' = 'asc';
            if (cur.key === key && cur.direction === 'asc') direction = 'desc';
            else if (cur.key === key && cur.direction === 'desc') direction = 'asc';
            else direction = key === 'createdAt' || key === 'updatedAt' ? 'desc' : 'asc';
            return {...prev, sortConfig: { key, direction }};
        });
    }, []);

    const handleFilterChange = useCallback((key: string, value: string) => {
        setConfig(prev => ({...prev, filters: {...(prev.filters ?? {}), [key]: value}}));
    }, []);

    const filteredRecords = useMemo(() => {
        let r = [...records];
        // column filters
        const fText = (filters.text || '').toLowerCase().trim();
        const fCreated = (filters.createdAt || '').toLowerCase().trim();
        if (fText) r = r.filter(rec => rec.text.toLowerCase().includes(fText) || rec.id.toLowerCase().includes(fText));
        if (fCreated) r = r.filter(rec => rec.createdAt.toLowerCase().includes(fCreated) || ft(rec.createdAt, config.locale).toLowerCase().includes(fCreated));
        // searchQuery (unified bar search mode)
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            r = r.filter(rec => rec.text.toLowerCase().includes(q) || rec.id.toLowerCase().includes(q));
        }
        // sort
        const { key, direction } = sortConfig;
        r.sort((a, b) => {
            let av: string = (a as any)[key] ?? '';
            let bv: string = (b as any)[key] ?? '';
            // for text, case-insensitive
            if (key === 'text') { av = av.toLowerCase(); bv = bv.toLowerCase(); }
            const cmp = av.localeCompare(bv);
            return direction === 'asc' ? cmp : -cmp;
        });
        return r;
    }, [records, searchQuery, sortConfig, filters, config.locale]);

    const pageSize = config.pageSize || DEFAULT_PAGE_SIZE;
    const visibleCount = visiblePages * pageSize;
    const visibleRecords = useMemo(() => filteredRecords.slice(0, visibleCount), [filteredRecords, visibleCount]);
    const hasMore = visibleCount < filteredRecords.length;
    useEffect(() => {
        setVisiblePages(1);
    }, [searchQuery, activeBackend, filters.text, filters.createdAt, sortConfig.key, sortConfig.direction]);

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
    const showErr = useCallback((e: unknown, msg?: string) => {
        const m = msg || em(e);
        const d = msg ? em(e) : undefined;
        addToast(m, 'error', d);
        log(`❌ ${m}${d ? ': '+d : ''}`);
    }, [addToast, log]);
    const bgOp = useCallback(async <T, >(op: () => Promise<T>, onOk: (r: T) => void) => {
        setSyncCount(c => c + 1);
        try {
            onOk(await op());
        } catch (e) {
            showErr(e);
        } finally {
            setSyncCount(c => c - 1);
        }
    }, [showErr]);

    useEffect(() => {
        applyTheme(resolved);
        // YouTube parity: also set body bg for dark
        document.body.style.background = dark ? '#020617' : '#f8fafc';
    }, [resolved, dark]);
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

    const handleCopy = useCallback(async (text: string, field: string) => {
        const ok = await copyToClipboard(text);
        if (ok) {
            setCopiedField(field);
            setTimeout(() => setCopiedField(null), 1500);
            log(`📋 Copied ${field}`);
        }
    }, [log]);

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
            log(`✅ Connected as ${e || 'unknown'}`);
        } catch {
            setGEmail(config.google.lastAccountEmail);
            log(`✅ Connected (email fetch failed, using cached)`);
        }
        // YouTube parity: auto-ensure tab after auth (300ms)
        setTimeout(async () => {
            if (tokRef.current) {
                try {
                    await es(tokRef.current, nsid, etab);
                    log(`✅ Tab ensured: ${etab}`);
                    const gr = await createGoogleDS(tokRef, nsid, etab).list();
                    setRecords(gr);
                    log(`☁️ Loaded ${gr.length} records from ${etab}`);
                } catch (e) { dbg('post-auth ensure failed', e); }
            }
        }, 300);
        return tok;
    }, [config.google.clientId, config.google.lastAccountEmail, etab, nsid, t, log]);
    const dropAuth = useCallback(() => {
        if (tokRef.current && window.google?.accounts?.oauth2?.revoke) window.google.accounts.oauth2.revoke(tokRef.current, () => {
        });
        tokRef.current = null;
        setIsAuthed(false);
        setGEmail('');
        log('🔌 Disconnected from Google');
    }, [log]);

    // Boot with YouTube-grade stay-connected
    useEffect(() => {
        if (bootDone.current) return;
        bootDone.current = true;
        void (async () => {
            try {
                const lr = await createLocalDS(config.localStorageKey).list();
                setRecords(lr);
                log(`📦 Auto-loaded ${lr.length} from localStorage`);
                if (config.preferredBackend === 'google' && config.google.clientId.trim() && nsid) {
                    const hasPrevGoogle = !!(config.google.clientId.trim() && nsid && config.google.lastAccountEmail);
                    // YouTube pattern: only silent if hasPrevGoogle, guard with silentAttemptedRef
                    if (hasPrevGoogle && !isAuthed && !silentAttemptedRef.current) {
                        silentAttemptedRef.current = true;
                        try {
                            await doAuth(false);
                            const gr = await createGoogleDS(tokRef, nsid, etab).list();
                            setRecords(gr);
                            log(`☁️ Google Sheets session restored (${gr.length} records)`);
                            addToast(t('google.msg.connected'), 'info');
                        } catch (e) {
                            dbg('Silent fail', e);
                            log(`ℹ️ Silent restore skipped: ${em(e)} (click Connect if needed)`);
                            addToast(t('toast.silentAuthFailed'), 'warn', em(e));
                        }
                    } else if (!hasPrevGoogle) {
                        // Fallback: try silent once without email guard (original google behavior) — but don't spam
                        try {
                            await doAuth(false);
                            const gr = await createGoogleDS(tokRef, nsid, etab).list();
                            setRecords(gr);
                            log(`☁️ Google silent connected (${gr.length})`);
                            addToast(t('google.msg.connected'), 'info');
                        } catch (e) {
                            dbg('Silent fail no email', e);
                            log(`ℹ️ Auto-login failed: ${em(e)}`);
                        }
                    }
                }
            } catch (e) {
                showErr(e);
            } finally {
                setIsLoading(false);
            }
        })();
    }, []); // intentionally empty deps for boot once; config captured via initial closure; isAuthed will be updated via doAuth

    // Zero-click persistence: auto-ensure + load when isGoogleReady changes (YouTube parity)
    useEffect(() => {
        if (!isGoogleReady) return;
        const doAuto = async () => {
            try {
                await es(tokRef.current!, nsid, etab);
                const gr = await createGoogleDS(tokRef, nsid, etab).list();
                setRecords(gr);
                log(`☁️ Auto-loaded ${gr.length} from Google Sheets (tab: ${etab})`);
            } catch (e) {
                dbg('auto ensure fail', e);
                // silent — keep local data
            }
        };
        doAuto();
    }, [isGoogleReady, etab, nsid, log]);

    const reload = useCallback(() => bgOp(() => dataStore.list(), r => {
        setRecords(r);
        log(`↻ Reloaded ${r.length} records from ${activeBackend}`);
    }), [bgOp, dataStore, activeBackend, log]);
    const onConnect = useCallback(() => bgOp(() => doAuth(true), () => addToast(t('google.msg.connected'), 'info')), [addToast, bgOp, doAuth, t]);
    const onDisconnect = useCallback(() => {
        dropAuth();
        setConfig(p => ({...p, preferredBackend: 'local'}));
        createLocalDS(config.localStorageKey).list().then(r => {
            setRecords(r);
            log(`📦 Switched to localStorage (${r.length} records)`);
        });
        addToast(t('google.msg.disconnected'), 'info');
    }, [addToast, config.localStorageKey, dropAuth, t, log]);
    const onAttach = useCallback(() => bgOp(async () => {
        if (!nsid) throw new Error(t('google.error.noSpreadsheet'));
        if (!tokRef.current) await doAuth(true);
        await es(tokRef.current!, nsid, etab);
        setConfig(p => ({
            ...p,
            preferredBackend: 'google',
            google: {...p.google, spreadsheetId: nsid, spreadsheetUrl: surl(nsid), sheetName: etab}
        }));
        log(`✅ Attached spreadsheet tab: ${etab}`);
        return createGoogleDS(tokRef, nsid, etab).list();
    }, r => {
        setRecords(r);
        addToast(t('google.msg.sheetAttached'), 'info');
        log(`📦 Loaded ${r.length} after attach`);
    }), [addToast, bgOp, doAuth, etab, nsid, t, log]);
    const onCreateSheet = useCallback(() => bgOp(async () => {
        let title = t('google.defaultDocTitle');
        if (config.google.spreadsheetId.startsWith('__CREATE__')) {
            title = config.google.spreadsheetId.replace('__CREATE__', '').trim() || title;
        }
        if (!tokRef.current) await doAuth(true);
        const cr = await cs(tokRef.current!, title, etab);
        setConfig(p => ({
            ...p,
            preferredBackend: 'google',
            google: {...p.google, spreadsheetId: cr.spreadsheetId, spreadsheetUrl: cr.spreadsheetUrl, sheetName: etab}
        }));
        log(`✅ Created spreadsheet: ${cr.spreadsheetUrl}`);
        return createGoogleDS(tokRef, cr.spreadsheetId, etab).list();
    }, r => {
        setRecords(r);
        addToast(t('google.msg.sheetCreated'), 'info');
        log(`📦 Loaded ${r.length} from new sheet`);
    }), [addToast, bgOp, config.google.spreadsheetId, doAuth, etab, t, log]);
    const toGoogle = useCallback(() => bgOp(async () => {
        if (!nsid) throw new Error(t('google.error.noSpreadsheet'));
        if (!tokRef.current) await doAuth(true);
        await es(tokRef.current!, nsid, etab);
        setConfig(p => ({...p, preferredBackend: 'google'}));
        log(`☁️ Switched to Google Sheets`);
        return createGoogleDS(tokRef, nsid, etab).list();
    }, r => {
        setRecords(r);
        addToast(t('google.msg.switchedToGoogle'), 'info');
    }), [addToast, bgOp, doAuth, etab, nsid, t, log]);
    const toLocal = useCallback(() => {
        setConfig(p => ({...p, preferredBackend: 'local'}));
        createLocalDS(config.localStorageKey).list().then(r => {
            setRecords(r);
            log(`💾 Switched to localStorage (${r.length})`);
        });
        addToast(t('google.msg.switchedToLocal'), 'info');
    }, [addToast, config.localStorageKey, t, log]);
    const headerToggle = useCallback(async () => {
        if (activeBackend === 'google') toLocal(); else await toGoogle();
    }, [activeBackend, toGoogle, toLocal]);
    const headerDisconnect = useCallback(() => onDisconnect(), [onDisconnect]);
    const toggleMode = useCallback(() => {
        if (inputMode === 'add') {
            setInputMode('search');
            setSearchQuery(inputText);
            log('🔍 Search mode');
        } else {
            setInputMode('add');
            setSearchQuery('');
            log('✏️ Add mode');
        }
    }, [inputMode, inputText, log]);
    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const v = e.target.value;
        setInputText(v);
        if (inputMode === 'search') setSearchQuery(v);
    }, [inputMode]);
    const handleSubmit = useCallback((e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (inputMode === 'add') {
            const v = inputText.trim();
            if (!v) return;
            bgOp(() => dataStore.add(v).then(() => dataStore.list()), r => {
                setRecords(r);
                log(`➕ Added: "${v.slice(0, 40)}${v.length > 40 ? '…' : ''}"`);
            });
            setInputText('');
        } else {
            setSearchQuery(inputText);
        }
    }, [bgOp, dataStore, inputMode, inputText, log]);
    const handleDelete = useCallback((id: string) => {
        const rec = records.find(r => r.id === id);
        bgOp(() => dataStore.remove(id).then(() => dataStore.list()), r => {
            setRecords(r);
            log(`🗑️ Deleted ${rec ? `"${rec.text.slice(0, 30)}"` : id}`);
        });
    }, [bgOp, dataStore, records, log]);
    const handleClear = useCallback(() => bgOp(() => dataStore.clear().then(() => dataStore.list()), r => {
        setRecords(r);
        log(`🧹 Cleared all (${r.length} left)`);
    }), [bgOp, dataStore, log]);
    const handleUpdate = useCallback((id: string, newText: string) => {
        const v = newText.trim();
        if (!v) return;
        bgOp(() => dataStore.update(id, v).then(() => dataStore.list()), r => {
            setRecords(r);
            log(`✏️ Updated ${id.slice(0, 8)}: "${v.slice(0, 40)}"`);
            setEditingId(null);
            setEditingText('');
        });
    }, [bgOp, dataStore, log]);
    const cycleTheme = useCallback(() => setConfig(p => {
        const o: ThemePreference[] = ['light', 'dark', 'system'];
        const i = o.indexOf(p.theme);
        return {...p, theme: o[(i + 1) % o.length]};
    }), []);
    const toggleSettings = useCallback(() => setConfig(p => ({...p, settingsOpen: !p.settingsOpen})), []);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                const active = document.activeElement;
                const isInSettingsInput = active && active !== inputRef.current && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT');
                if (isInSettingsInput) return;
                if (inputText) {
                    e.preventDefault();
                    setInputText('');
                    if (inputMode === 'search') setSearchQuery('');
                    log('⎋ Cleared input');
                    return;
                }
                if (inputMode === 'search') {
                    e.preventDefault();
                    setInputMode('add');
                    setSearchQuery('');
                    setInputText('');
                    log('⎋ Exit search mode');
                    return;
                }
                return;
            }
            if (e.key === 'r' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                reload();
                return;
            }
            if (e.key === 'F5') {
                e.preventDefault();
                reload();
                return;
            }
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [inputText, inputMode, reload, log]);

    if (isLoading) return <LoadingOverlay t={t} />;

    // Th component — YouTube parity with sort + filter
    const Th: React.FC<{ label: string; columnKey: string; width?: string }> = ({ label, columnKey, width }) => (
        <th className={`px-4 align-top ${width || ''}`} style={{ fontSize: tblHFs, paddingTop: tblCellPy, paddingBottom: tblCellPy }}>
            <div className="flex flex-col gap-1.5">
                <button onClick={() => requestSort(columnKey)} title={`Sort by ${label}`} className={`flex items-center gap-1 font-semibold uppercase tracking-wider text-left transition-colors hover:text-emerald-500 ${sortConfig.key === columnKey ? 'text-emerald-500' : mt}`}>
                    {label}
                    <span className="text-[10px]">{sortConfig.key === columnKey ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}</span>
                </button>
                <input type="text" placeholder="Filter..." title={`Filter by ${label}`} value={(filters as any)[columnKey] || ''} onChange={e => handleFilterChange(columnKey, e.target.value)} className={`w-full px-2 py-1 text-[10px] rounded border focus:outline-none focus:border-emerald-500 transition-colors ${inpFilter}`} />
            </div>
        </th>
    );

    return (
        <div className={`flex min-h-screen flex-col transition-colors ${dark ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
            <ProgressBar visible={isSyncing} />
            <ToastContainer toasts={toasts} onDismiss={dismissToast} onToggle={toggleDetail} t={t} />
            {/* Sticky Navbar — YouTube parity */}
            <div className={`sticky top-0 z-30 border-b backdrop-blur-md ${bg} ${bdr}`}>
                <div className="px-4 xl:px-8">
                    <div className="flex flex-col md:flex-row md:items-center gap-2 py-3">
                        {/* Input first (full width on mobile) — unified add/search bar */}
                        <div className="w-full md:flex-1 min-w-0">
                            <form onSubmit={handleSubmit} className="flex gap-2">
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={inputText}
                                    onChange={handleInputChange}
                                    placeholder={inputMode === 'add' ? t('data.placeholder.add') : t('data.placeholder.search')}
                                    className={`w-full ${inp} border rounded-lg px-3 py-2 font-mono font-medium text-sm focus:outline-none focus:border-emerald-500 transition-colors`}
                                />
                                {inputMode === 'add'
                                    ? <button type="submit" disabled={!inputText.trim()} className="hidden md:inline-flex items-center gap-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 px-4 py-2 text-sm font-medium text-white dark:text-slate-900 transition hover:bg-slate-800 dark:hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"><IconPlus/>{t('data.add')}</button>
                                    : <button type="button" disabled className="hidden md:inline-flex items-center gap-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 px-4 py-2 text-sm font-medium text-white dark:text-slate-900 opacity-80 cursor-default"><IconSearch/>{t('data.find')}</button>}
                                <button type="button" onClick={toggleMode} className={`rounded-lg border p-2.5 transition ${inputMode === 'search' ? 'border-blue-400 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'}`} title={inputMode === 'search' ? t('data.mode.add') : t('data.mode.search')}><IconSearch/></button>
                            </form>
                        </div>
                        {/* Actions grid — YouTube tbBtn */}
                        <div className="grid grid-flow-col auto-cols-fr justify-items-center gap-1.5 w-full md:flex md:w-auto">
                            <button onClick={toggleSettings} title={t('header.settings')} className={`${tbBtn} ${config.settingsOpen ? (dark ? 'bg-slate-700 text-slate-300' : 'bg-slate-200 text-slate-600') : (dark ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100')}`}>⚙️</button>
                            <button type="button" onClick={() => setShowDebug(p=>!p)} title="Toggle debug console" className={`${tbBtn} ${dark ? 'hover:bg-slate-800' : 'hover:bg-slate-100'}`}>
                                <span className="flex items-center justify-center gap-1">
                                    <span className={`h-2 w-2 rounded-full ${isGoogleReady ? 'bg-blue-500' : activeBackend==='google' ? 'bg-amber-500' : 'bg-slate-400'}`} title={isGoogleReady ? `Google Sheets: ${gEmail || 'connected'}` : activeBackend==='google' ? 'Google pending auth' : 'localStorage'}></span>
                                    <span className={`h-2 w-2 rounded-full ${records.length>0 ? 'bg-emerald-500' : 'bg-red-500'}`} title={records.length ? `${records.length} records` : 'No records'}></span>
                                </span>
                            </button>
                            <button type="button" onClick={reload} className={`${tbBtn} ${dark ? 'hover:bg-slate-800 text-slate-300' : 'hover:bg-slate-100 text-slate-600'}`} title={t('data.reload')}><IconRefresh/></button>
                            {showToggle && (<>
                                {activeBackend === 'google' && <button type="button" onClick={headerDisconnect} disabled={isSyncing} className={`${tbBtn} text-rose-500 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/30 transition disabled:opacity-50`} title={t('header.backendToggle.disconnect')}>🔌</button>}
                                <button type="button" onClick={headerToggle} disabled={isSyncing} className={`${tbBtn} transition disabled:opacity-50 ${activeBackend === 'google' ? 'bg-emerald-100 dark:bg-emerald-900/40 hover:bg-emerald-200 dark:hover:bg-emerald-800/40 text-emerald-700 dark:text-emerald-300' : (dark ? 'hover:bg-slate-800 text-slate-300' : 'hover:bg-slate-100 text-slate-600')}`} title={activeBackend === 'google' ? t('header.backendToggle.toLocal') : t('header.backendToggle.toGoogle')}>{activeBackend === 'google' ? '☁️' : '💾'}</button>
                            </>)}
                            <button onClick={cycleTheme} title={t('header.theme')} className={`${tbBtn} ${dark ? 'hover:bg-slate-800' : 'hover:bg-slate-100'}`}>{config.theme === 'system' ? <IconMonitor/> : dark ? <IconMoon/> : <IconSun/>}</button>
                        </div>
                    </div>
                    {/* Debug Console — YouTube parity */}
                    <div className={`console-wrap ${showDebug ? 'open' : ''}`}>
                        <div className="console-inner">
                            <div className="pb-2 -mt-1">
                                <div className={`${card} border rounded-xl overflow-hidden shadow-sm`}>
                                    <div className={`px-3 py-2 border-b ${dark ? 'border-slate-700/50 bg-slate-900/40' : 'border-slate-200 bg-slate-50'} flex items-center justify-between text-[11px]`}>
                                        <div className="font-semibold text-emerald-500 flex items-center gap-2">
                                            {t('console.title')}
                                            <span className="font-normal text-[10px] text-slate-400">({logs.length})</span>
                                        </div>
                                        <button onClick={() => setLogs([])} className="text-[10px] px-2 py-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700">Clear</button>
                                    </div>
                                    {logs.length > 0 ? (
                                        <div className={`max-h-[180px] overflow-auto ${scCls} p-1`}>
                                            <table className="w-full text-[11px] font-mono">
                                                <thead>
                                                    <tr className={dark ? 'text-slate-400' : 'text-slate-500'}>
                                                        <th className="px-2 py-1 text-left w-10">#</th>
                                                        <th className="px-2 py-1 text-left">Event</th>
                                                        <th className="px-2 py-1 text-right w-20">Time</th>
                                                    </tr>
                                                </thead>
                                                <tbody className={`divide-y ${dark ? 'divide-slate-700/30' : 'divide-slate-100'}`}>
                                                    {logs.slice(-30).map((l, i) => (
                                                        <tr key={l.id} className={`${hR} debug-row`}>
                                                            <td className="px-2 py-1 text-slate-500">{i+1}</td>
                                                            <td className="px-2 py-1 break-all">{l.msg}</td>
                                                            <td className="px-2 py-1 text-right text-slate-500 whitespace-nowrap">{l.ts}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <div className="p-3 text-center text-[11px] text-slate-500">No events yet. Actions will appear here.</div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Workspace */}
            <div className="flex-1 px-4 xl:px-8 pt-1">
                {/* Settings Panel — YouTube card width parity */}
                <div className={`settings-wrap ${config.settingsOpen ? 'open mb-2' : ''}`}>
                    <div className="settings-inner">
                        {settingsVisible && <SettingsPanel config={config} setConfig={setConfig} recordCount={records.length} onClearData={handleClear} isSyncing={isSyncing} isClosing={settingsClosing} onCloseEnd={onCloseEnd} isAuthed={isAuthed} email={gEmail} onConnect={onConnect} onDisconnect={onDisconnect} onAttach={onAttach} onCreate={onCreateSheet} onToGoogle={toGoogle} onToLocal={toLocal} t={t} showClientId={showClientId} setShowClientId={setShowClientId} showSpreadsheetId={showSpreadsheetId} setShowSpreadsheetId={setShowSpreadsheetId} showEmail={showEmail} setShowEmail={setShowEmail} copiedField={copiedField} onCopy={handleCopy}/>}
                    </div>
                </div>

                {/* Badge row — YouTube style inventory header pre-table */}
                <div className="mb-3 flex items-center gap-2 text-xs">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium ${activeBackend === 'google' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800' : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700'}`}>{activeBackend === 'google' ? <IconSheet className="w-3.5 h-3.5"/> : <IconDatabase className="w-3.5 h-3.5"/>}{activeBackend === 'google' ? t('backend.badge.google') : t('backend.badge.local')}</span>
                    <span className={mt}>{plur(records.length, t)}{searchQuery ? ` · ${filteredRecords.length} ${t('data.found')}` : ''}{filters.text || filters.createdAt ? ` · filtered` : ''}</span>
                    {isGoogleReady && <span className="text-[10px] text-emerald-500 hidden md:inline">☁️ Synced • tab: <span className="font-mono">{etab}</span></span>}
                </div>

                {/* Table Card — YouTube parity */}
                <div className={`${card} border rounded-xl overflow-hidden shadow-lg`}>
                    <div className={`px-4 py-3 bg-gradient-to-r ${dark ? 'from-slate-900/30 to-slate-900/10' : 'from-slate-50 to-slate-100/50'} flex items-center justify-between gap-4`}>
                        <div>
                            <h3 className="font-bold text-emerald-500" style={{ fontSize: `${Math.round(16 * scale)}px` }}>
                                📋 Messages ({filteredRecords.length} / {records.length})
                            </h3>
                            {isGoogleReady && (
                                <div className="text-[10px] mt-0.5 text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                    ☁️ Synced to Google Sheets • tab: <span className="font-mono">{etab}</span> {isSyncing && '• syncing...'}
                                </div>
                            )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                            <span className={`text-[10px] ${mt}`}>A</span>
                            <input type="range" min={0} max={100} value={config.scaleSlider ?? DEFAULT_SCALE_SLIDER} onChange={e => setConfig(p => ({...p, scaleSlider: Number(e.target.value)}))} className="scale-slider w-20" title={`Scale: ${Math.round(scale*100)}%`} />
                            <span className={`text-xs font-bold ${mt}`}>A</span>
                        </div>
                    </div>

                    {/* Desktop Table */}
                    <div className={`hidden md:block overflow-x-auto ${scCls}`}>
                        <table className="w-full text-left border-collapse" style={{ fontSize: tblFs }}>
                            <thead>
                                <tr className={dark ? 'text-slate-400' : 'text-slate-500'}>
                                    <th className="px-4 py-3 text-left font-semibold w-12" style={{ fontSize: tblHFs, paddingTop: tblCellPy, paddingBottom: tblCellPy }}>{t('data.col.index')}</th>
                                    <Th label={t('data.col.text')} columnKey="text" />
                                    <Th label={t('data.col.created')} columnKey="createdAt" width="w-44" />
                                    <th className="px-4 py-3 text-right font-semibold w-40" style={{ fontSize: tblHFs, paddingTop: tblCellPy, paddingBottom: tblCellPy }}>{t('data.col.actions')}</th>
                                </tr>
                            </thead>
                            <tbody className={`divide-y ${dark ? 'divide-slate-700/30' : 'divide-slate-100'}`}>
                                {visibleRecords.length === 0
                                    ? <tr><td colSpan={4} className={`px-4 py-16 text-center ${mt}`}><div className="flex flex-col items-center gap-2"><IconDatabase className="w-8 h-8 opacity-40"/><span>{searchQuery || filters.text || filters.createdAt ? t('data.emptySearch') : t('data.empty')}</span></div></td></tr>
                                    : visibleRecords.map((rec, i) => (
                                    <tr key={rec.id} className={`${hR} transition-colors group`}>
                                        <td className={`px-4 font-mono ${mt} sticky left-0 z-10 ${sB} whitespace-nowrap`} style={{ paddingTop: tblCellPy, paddingBottom: tblCellPy }}>{i+1}</td>
                                        <td className="px-4 align-top" style={{ paddingTop: tblCellPy, paddingBottom: tblCellPy }}>
                                            {editingId === rec.id ? (
                                                <div className="flex gap-2">
                                                    <input value={editingText} onChange={e => setEditingText(e.target.value)} onKeyDown={e => { if (e.key==='Enter') handleUpdate(rec.id, editingText); if (e.key==='Escape') { setEditingId(null); setEditingText(''); } }} autoFocus className={`flex-1 rounded border px-2 py-1 text-sm ${inp} focus:outline-none focus:border-emerald-500`} placeholder="Edit text..." />
                                                    <button onClick={() => handleUpdate(rec.id, editingText)} disabled={!editingText.trim()} className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs disabled:opacity-50 flex items-center gap-1"><IconCheck/> {t('data.save')}</button>
                                                    <button onClick={() => { setEditingId(null); setEditingText(''); }} className={`px-2 py-1 rounded border text-xs ${bs || 'border-slate-300 dark:border-slate-600'}`}>{t('data.cancel')}</button>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className={`break-words whitespace-pre-wrap ${t1}`}>{rec.text}</div>
                                                    <div className="mt-1 text-[11px] font-mono text-slate-400 dark:text-slate-500 break-all">{rec.id}</div>
                                                </>
                                            )}
                                        </td>
                                        <td className={`px-4 align-top whitespace-nowrap ${mt}`} style={{ paddingTop: tblCellPy, paddingBottom: tblCellPy }}>
                                            <div>{ft(rec.createdAt, config.locale)}</div>
                                            {rec.updatedAt !== rec.createdAt && <div className="text-[10px] opacity-60">upd: {ft(rec.updatedAt, config.locale)}</div>}
                                        </td>
                                        <td className="px-4 align-top text-right" style={{ paddingTop: tblCellPy, paddingBottom: tblCellPy }}>
                                            <div className="flex items-center justify-end gap-1">
                                                {editingId === rec.id ? null : <button type="button" onClick={() => { setEditingId(rec.id); setEditingText(rec.text); }} className={`has-tip ${iconBtn} ${dark ? 'text-emerald-400 hover:bg-emerald-500/20' : 'text-emerald-600 hover:bg-emerald-100'}`} data-tip={t('data.edit')}><IconEdit/></button>}
                                                <button type="button" onClick={() => handleDelete(rec.id)} className={`has-tip ${iconBtn} ${dark ? 'text-rose-400 hover:bg-rose-500/20' : 'text-rose-600 hover:bg-rose-100'}`} data-tip={t('data.delete')}><IconTrash/></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile cards */}
                    <div className="block md:hidden p-3 space-y-2">
                        <div className="pb-1 flex gap-2">
                            <input type="text" placeholder="Filter Text..." title="Filter by Text" value={filters.text || ''} onChange={e => handleFilterChange('text', e.target.value)} className={`flex-1 min-w-0 px-3 py-2 text-xs rounded border ${inpFilter}`} />
                            <input type="text" placeholder="Filter Date..." title="Filter by Date" value={filters.createdAt || ''} onChange={e => handleFilterChange('createdAt', e.target.value)} className={`w-28 px-3 py-2 text-xs rounded border ${inpFilter}`} />
                        </div>
                        {visibleRecords.length === 0 ? (
                            <div className={`text-center py-12 ${mt}`}>{searchQuery || filters.text || filters.createdAt ? t('data.emptySearch') : t('data.empty')}</div>
                        ) : visibleRecords.map((rec, i) => (
                            <div key={rec.id} className={`border rounded-xl px-3 py-2.5 ${dark ? 'bg-slate-900/40 border-slate-700/60' : 'bg-slate-50 border-slate-200'} space-y-1.5`}>
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0 flex-1">
                                        {editingId === rec.id ? (
                                            <div className="space-y-2">
                                                <textarea value={editingText} onChange={e => setEditingText(e.target.value)} rows={3} className={`w-full rounded border px-2 py-1 text-sm ${inp} focus:outline-none focus:border-emerald-500`} />
                                                <div className="flex gap-2">
                                                    <button onClick={() => handleUpdate(rec.id, editingText)} disabled={!editingText.trim()} className="flex-1 py-1.5 rounded bg-emerald-600 text-white text-xs disabled:opacity-50">Save</button>
                                                    <button onClick={() => { setEditingId(null); setEditingText(''); }} className="flex-1 py-1.5 rounded border text-xs">Cancel</button>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                <div className={`font-medium text-sm leading-snug whitespace-pre-wrap break-words ${t1}`}>{rec.text}</div>
                                                <div className="text-[10px] font-mono text-slate-400 truncate">{rec.id}</div>
                                            </>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-0.5 flex-shrink-0">
                                        {editingId !== rec.id && (
                                            <>
                                                <button onClick={() => { setEditingId(rec.id); setEditingText(rec.text); }} className={`has-tip ${iconBtn} ${dark ? 'text-emerald-400 hover:bg-emerald-500/20' : 'text-emerald-600 hover:bg-emerald-100'}`} data-tip="Edit"><IconEdit/></button>
                                                <button onClick={() => handleDelete(rec.id)} className={`has-tip ${iconBtn} ${dark ? 'text-rose-400 hover:bg-rose-500/20' : 'text-rose-600 hover:bg-rose-100'}`} data-tip="Delete"><IconTrash/></button>
                                            </>
                                        )}
                                    </div>
                                </div>
                                <div className={`text-[11px] font-mono ${mt} flex items-center justify-between`}>
                                    <span>{ft(rec.createdAt, config.locale)}</span>
                                    <span className="opacity-60">#{i+1}</span>
                                </div>
                                {rec.updatedAt !== rec.createdAt && <div className="text-[10px] text-slate-500">updated: {ft(rec.updatedAt, config.locale)}</div>}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Mobile Add bar for small screens (YouTube parity: input already in navbar, but keep load more etc) */}
                <div className="md:hidden mt-3">
                    <form onSubmit={handleSubmit} className="flex gap-2">
                        <button type="submit" disabled={!inputText.trim() || inputMode !== 'add'} className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition ${inputMode === 'add' ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-200 disabled:opacity-50' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'}`}>{inputMode === 'add' ? t('data.add') : t('data.find')}</button>
                    </form>
                </div>

                {hasMore && <div className="mt-4 flex justify-center"><button type="button" onClick={() => setVisiblePages(p => p + 1)} className={`inline-flex items-center gap-2 rounded-xl border px-6 py-2.5 text-sm font-medium transition ${dark ? 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>{t('data.loadMore')} ({filteredRecords.length - visibleCount})</button></div>}
                {DEBUG && <details className="mt-6 rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4"><summary className="cursor-pointer text-sm font-medium text-amber-800 dark:text-amber-200">{t('debug.title')}</summary><pre className="mt-3 text-xs text-amber-700 dark:text-amber-300 overflow-x-auto">{JSON.stringify({ config, recordCount: records.length, activeBackend, resolved, dark, isAuthed, gEmail, syncCount, isGoogleReady, inputMode, searchQuery, visiblePages, pageSize, sortConfig, filters, etab, nsid }, null, 2)}</pre></details>}
            </div>
            <footer className="flex h-4 xl:h-8 items-center justify-center px-4 xl:px-8 text-[10px] leading-none text-slate-400">
                <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-slate-600 dark:hover:text-slate-200">
                    daggerok &copy; {new Date().getFullYear()}
                </a>
            </footer>
        </div>
    );
};

const rootElement = document.getElementById('root');
if (rootElement) createRoot(rootElement).render(<React.StrictMode><App/></React.StrictMode>);
