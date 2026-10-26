// Token retry on 401: the real helpers from main.tsx (kept single-file on purpose) run here
// against a fake in-memory Sheets client. No network, no real Google account.
const {readFileSync} = require('node:fs');
const path = require('node:path');
const {stripTypeScriptTypes} = require('node:module');

const source = readFileSync(path.join(__dirname, 'main.tsx'), 'utf8');
// From the fetch wrapper (gf) through createGoogleDS: every Sheets helper and the retry wrapper.
const start = source.indexOf('const gf = async');
const end = source.indexOf('// SVG ICONS');
if (start === -1 || end === -1 || end < start) throw new Error('main.tsx layout changed: gf .. createGoogleDS not found');
const region = stripTypeScriptTypes(source.slice(start, source.lastIndexOf('// ====', end)));

const load = (fetch) => new Function(
    'fetch', 'dbg', 'jp', 'nid', 'sr', 'surl', 'now', 'uid', 'em', 'SHEETS_API', 'USERINFO', 'DEFAULT_SHEET', 'SHEET_HEADERS',
    `${region}\nreturn { withTokenRetry, createGoogleDS };`,
)(
    fetch, () => {}, (s, f) => { try { return JSON.parse(s); } catch { return f; } }, v => v, (t, c) => `${t}!${c}`,
    id => `https://docs.google.com/spreadsheets/d/${id}/edit`, () => '2026-10-25T00:00:00.000Z', () => 'uid-1',
    e => (e instanceof Error ? e.message : String(e)), 'https://sheets.test/v4', 'https://userinfo.test', 'Records',
    ['id', 'text', 'createdAt', 'updatedAt'],
);

// A refresh that works once and then refuses, so a looping retry fails fast instead of hanging.
const refreshOnce = (tRef) => {
    let n = 0;
    return jest.fn(async () => {
        if (n++) throw new Error('refresh called more than once');
        tRef.current = 'new';
        return 'new';
    });
};
const unauthorized = () => Object.assign(new Error('API 401: Request had invalid authentication credentials.'), {status: 401});

// Fake Sheets client: rejects every token in `expired` with 401, records each call.
const fakeSheets = ({expired = ['old'], rows = [['a', 'first', '2024-01-01', '2024-01-01']]} = {}) => {
    const calls = [];
    const fetch = async (url, init = {}) => {
        const tok = new Headers(init.headers).get('Authorization').replace('Bearer ', '');
        const method = init.method || 'GET';
        calls.push({tok, method, url: decodeURIComponent(url)});
        if (expired.includes(tok)) {
            return new Response(JSON.stringify({error: {code: 401, message: 'Request had invalid authentication credentials.'}}), {status: 401});
        }
        return new Response(method === 'GET' ? JSON.stringify({values: rows}) : '{}', {status: 200});
    };
    return {fetch, calls};
};

describe('withTokenRetry', () => {
    const {withTokenRetry} = load(async () => { throw new Error('no network in this test'); });

    test('401 -> refresh -> the retry succeeds with the new token', async () => {
        const tRef = {current: 'old'};
        const refresh = jest.fn(async () => { tRef.current = 'new'; return 'new'; });
        const op = jest.fn(async tok => { if (tok === 'old') throw unauthorized(); return `ok:${tok}`; });
        await expect(withTokenRetry(tRef, refresh, op)).resolves.toBe('ok:new');
        expect(refresh).toHaveBeenCalledTimes(1);
        expect(op.mock.calls.map(c => c[0])).toEqual(['old', 'new']);
    });

    test('401 twice -> the second error surfaces, one refresh, two attempts, no loop', async () => {
        const tRef = {current: 'old'};
        const refresh = refreshOnce(tRef);
        const op = jest.fn(async tok => { throw Object.assign(unauthorized(), {tok}); });
        await expect(withTokenRetry(tRef, refresh, op)).rejects.toMatchObject({status: 401, tok: 'new', message: expect.stringMatching(/^API 401/)});
        expect(refresh).toHaveBeenCalledTimes(1);
        expect(op).toHaveBeenCalledTimes(2);
    });

    test('other errors are not retried', async () => {
        const refresh = jest.fn();
        const op = jest.fn(async () => { throw Object.assign(new Error('API 403: forbidden'), {status: 403}); });
        await expect(withTokenRetry({current: 'old'}, refresh, op)).rejects.toThrow('API 403');
        expect(refresh).not.toHaveBeenCalled();
        expect(op).toHaveBeenCalledTimes(1);
    });

    test('a refresh that throws synchronously (no client id) also surfaces the original 401', async () => {
        const refresh = jest.fn(() => { throw new Error('no client id'); });
        const op = jest.fn(async () => { throw unauthorized(); });
        await expect(withTokenRetry({current: 'old'}, refresh, op)).rejects.toThrow(/^API 401/);
        expect(op).toHaveBeenCalledTimes(1);
    });

    test('a failed refresh surfaces the original 401 without a retry', async () => {
        const refresh = jest.fn(async () => { throw new Error('popup_closed'); });
        const op = jest.fn(async () => { throw unauthorized(); });
        await expect(withTokenRetry({current: 'old'}, refresh, op)).rejects.toThrow(/^API 401/);
        expect(refresh).toHaveBeenCalledTimes(1);
        expect(op).toHaveBeenCalledTimes(1);
    });

    test('a token already renewed by another call is reused without a new refresh', async () => {
        const tRef = {current: 'old'};
        const refresh = jest.fn();
        const op = jest.fn(async tok => {
            if (tok === 'old') { tRef.current = 'new'; throw unauthorized(); }
            return tok;
        });
        await expect(withTokenRetry(tRef, refresh, op)).resolves.toBe('new');
        expect(refresh).not.toHaveBeenCalled();
    });

    test('no token at all fails fast without calling the API', async () => {
        const op = jest.fn();
        // Synchronous by design: every caller awaits it inside an async function.
        expect(() => withTokenRetry({current: null}, jest.fn(), op)).toThrow('Session expired');
        expect(op).not.toHaveBeenCalled();
    });
});

describe('createGoogleDS with a fake Sheets client', () => {
    test('list after the token expired: 401, refresh, retry with the new token', async () => {
        const {fetch, calls} = fakeSheets();
        const {createGoogleDS} = load(fetch);
        const tRef = {current: 'old'};
        const refresh = jest.fn(async () => { tRef.current = 'new'; return 'new'; });
        const records = await createGoogleDS(tRef, 'sid', 'Records', refresh).list();
        expect(records).toEqual([{id: 'a', text: 'first', createdAt: '2024-01-01', updatedAt: '2024-01-01'}]);
        expect(calls.map(c => c.tok)).toEqual(['old', 'new']);
        expect(refresh).toHaveBeenCalledTimes(1);
        expect(tRef.current).toBe('new');
    });

    test('a renewed token that is also rejected surfaces API 401 after exactly two requests', async () => {
        const {fetch, calls} = fakeSheets({expired: ['old', 'new']});
        const {createGoogleDS} = load(fetch);
        const tRef = {current: 'old'};
        const refresh = refreshOnce(tRef);
        await expect(createGoogleDS(tRef, 'sid', 'Records', refresh).list()).rejects.toThrow(/^API 401/);
        expect(calls.map(c => c.tok)).toEqual(['old', 'new']);
        expect(refresh).toHaveBeenCalledTimes(1);
    });

    test('an update rejected at the write re-reads the row and writes once with the new token', async () => {
        const {fetch, calls} = fakeSheets({expired: []});
        let writes = 0;
        const flaky = async (url, init = {}) => {
            // The token expires between the row lookup and the write.
            if (init.method === 'PUT' && writes++ === 0) {
                calls.push({tok: 'old', method: 'PUT', url: 'rejected'});
                return new Response(JSON.stringify({error: {message: 'expired'}}), {status: 401});
            }
            return fetch(url, init);
        };
        const {createGoogleDS} = load(flaky);
        const tRef = {current: 'old'};
        const refresh = jest.fn(async () => { tRef.current = 'new'; return 'new'; });
        await createGoogleDS(tRef, 'sid', 'Records', refresh).update('a', 'changed');
        expect(calls.map(c => `${c.method} ${c.tok}`)).toEqual(['GET old', 'PUT old', 'GET new', 'PUT new']);
        expect(calls.at(-1).url).toBe('https://sheets.test/v4/spreadsheets/sid/values/Records!B2:D2?valueInputOption=RAW');
    });

    test('an add rejected with 401 appends exactly one row after the refresh', async () => {
        const {fetch, calls} = fakeSheets();
        const {createGoogleDS} = load(fetch);
        const tRef = {current: 'old'};
        const refresh = jest.fn(async () => { tRef.current = 'new'; return 'new'; });
        const rec = await createGoogleDS(tRef, 'sid', 'Records', refresh).add('hello');
        expect(rec.text).toBe('hello');
        expect(calls.filter(c => c.method === 'POST').map(c => c.tok)).toEqual(['old', 'new']);
    });
});
