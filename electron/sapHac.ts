// Uses native fetch (available in Electron/Node 18+) with a per-instance cookie jar

/**
 * Minimal cookie jar that injects cookies into requests and captures Set-Cookie responses.
 * Sufficient for SAP HAC session management (JSESSIONID + _csrf tokens).
 */
class CookieJar {
    private store: Record<string, string> = {}

    private getCookieHeader(): string {
        return Object.entries(this.store).map(([k, v]) => `${k}=${v}`).join('; ')
    }

    private parseSetCookie(raw: string): void {
        // Each Set-Cookie value: "name=value; Path=/; ..."  (may be combined with comma)
        // Split on commas that are followed by a cookie name (not inside expires date values)
        const parts = raw.split(/,(?=[^;]+=)/)
        for (const part of parts) {
            const nameVal = part.trim().split(';')[0]
            const eqIdx = nameVal.indexOf('=')
            if (eqIdx > 0) {
                const name = nameVal.slice(0, eqIdx).trim()
                const value = nameVal.slice(eqIdx + 1).trim()
                if (name) this.store[name] = value
            }
        }
    }

    async fetch(url: string, init?: RequestInit, ignoreSsl = false): Promise<Response> {
        const cookieHeader = this.getCookieHeader()
        const headers: Record<string, string> = { ...(init?.headers as Record<string, string> || {}) }
        if (cookieHeader) headers['Cookie'] = cookieHeader

        let originalRejectUnauthorized: string | undefined;
        if (ignoreSsl) {
            originalRejectUnauthorized = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
            process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
        }

        try {
            const resp = await globalThis.fetch(url, { ...init, headers, redirect: 'manual' })

            const setCookie = resp.headers.get('set-cookie')
            if (setCookie) this.parseSetCookie(setCookie)

            // Follow 302 redirects manually so we keep our cookies
            if ((resp.status === 301 || resp.status === 302 || resp.status === 303) && resp.headers.get('location')) {
                const location = resp.headers.get('location')!
                const redirectUrl = location.startsWith('http') ? location : new URL(location, url).toString()
                return this.fetch(redirectUrl, { method: 'GET' }, ignoreSsl)
            }

            return resp;
        } finally {
            if (ignoreSsl) {
                if (originalRejectUnauthorized === undefined) {
                    delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
                } else {
                    process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalRejectUnauthorized;
                }
            }
        }
    }
}

function extractCsrfToken(html: string): string | null {
    // similar patterns as C# service
    let m = html.match(/name="_csrf"\s+value="([^"]+)"/i);
    if (m) return m[1];
    m = html.match(/value="([^"]+)"\s+name="_csrf"/i);
    if (m) return m[1];
    m = html.match(/<meta\s+name="_csrf"\s+content="([^"]+)"/i);
    if (m) return m[1];
    m = html.match(/"_csrf"\s*:\s*"([^"]+)"/);
    if (m) return m[1];
    return null;
}

export type CronJobEntry = { Code: string; Status: string; LastResult: string; NextActivationTime: string; TriggerActive: string; };
export type FlexibleSearchResult = { Headers: string[]; Rows: string[][]; Error: string };
export type ImpExResult = { Success: boolean; Log: string };

export class SapHacService {
    private baseUrl: string;
    private loggedIn = false;
    private cookieJar = new CookieJar()
    private ignoreSsl = false;

    constructor(hacBaseUrl: string, ignoreSsl = false) {
        this.baseUrl = hacBaseUrl.replace(/\/+$/, '');
        this.ignoreSsl = ignoreSsl;
    }

    async login(username: string, password: string): Promise<boolean> {
        // try to fetch csrf from multiple paths
        let csrf: string | null = null;
        const paths = ['/login', '/hac/login', '/j_spring_security_check'];
        for (const p of paths) {
            try {
                const resp = await this.cookieJar.fetch(this.baseUrl + p, { method: 'GET' }, this.ignoreSsl);
                const text = await resp.text();
                csrf = extractCsrfToken(text);
                if (csrf) break;
            } catch {
                // ignore
            }
        }
        try {
            const form = new URLSearchParams();
            form.append('j_username', username);
            form.append('j_password', password);
            form.append('_csrf', csrf || '');
            const resp = await this.cookieJar.fetch(this.baseUrl + '/j_spring_security_check', {
                method: 'POST',
                body: form.toString(),
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }, this.ignoreSsl);
            this.loggedIn = resp.ok || resp.status === 302 || resp.status === 200;
            return this.loggedIn;
        } catch {
            this.loggedIn = false;
            return false;
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private async postWithCsrfRetry(csrfPage: string, postPath: string, buildForm: (csrf: string | null) => URLSearchParams): Promise<any> {
        let page = await this.cookieJar.fetch(this.baseUrl + csrfPage, { method: 'GET' }, this.ignoreSsl);
        let html = await page.text();
        let csrf = extractCsrfToken(html);
        let res = await this.cookieJar.fetch(this.baseUrl + postPath, { method: 'POST', body: buildForm(csrf).toString(), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }, this.ignoreSsl);
        if (res.status === 403) {
            page = await this.cookieJar.fetch(this.baseUrl + csrfPage, { method: 'GET' }, this.ignoreSsl);
            html = await page.text();
            csrf = extractCsrfToken(html);
            res = await this.cookieJar.fetch(this.baseUrl + postPath, { method: 'POST', body: buildForm(csrf).toString(), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }, this.ignoreSsl);
        }
        return res;
    }

    async getCronJobs(): Promise<CronJobEntry[]> {
        if (!this.loggedIn) throw new Error('Not logged in');
        // try JSON endpoint
        try {
            const r = await this.cookieJar.fetch(this.baseUrl + '/monitoring/cronjobs/data', { method: 'GET' }, this.ignoreSsl);
            if (r.ok) {
                const text = await r.text();
                const trimmed = text.trim();
                if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                    const json = JSON.parse(text);
                    const data = json.cronJobData || json.cronJobTableData || json.data || (Array.isArray(json) ? json : null);
                    if (Array.isArray(data)) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        return data.map((item: any) => ({
                            Code: item.jobCode || item.code || '',
                            Status: item.jobStatus || item.status || '',
                            LastResult: item.jobResult || item.result || '',
                            NextActivationTime: item.nextActivationTime || item.nextActivation || '-',
                            TriggerActive: item.triggerActive != null ? item.triggerActive.toString() : (item.active != null ? item.active.toString() : '-')
                        } as CronJobEntry));
                    }
                }
            }
        } catch {
            // fall through to HTML scraping
        }
        // fallback to HTML parsing
        const html = await this.cookieJar.fetch(this.baseUrl + '/monitoring/cronjobs', { method: 'GET' }, this.ignoreSsl).then((r: Response) => r.text());
        // very simplistic table scrape
        const rowRegex = /<tr[^>]*>(.*?)<\/tr>/gis;
        const cellRegex = /<t[dh][^>]*>(.*?)<\/t[dh]>/gis;
        const tagRegex = /<[^>]+>/g;
        const results: CronJobEntry[] = [];
        let first = true;
        let m;
        while ((m = rowRegex.exec(html))) {
            if (first) { first = false; continue; }
            const row = m[1];
            const cells = Array.from(row.matchAll(cellRegex)).map(c => c[1].replace(tagRegex, '').trim());
            if (cells.length < 4) continue;
            results.push({
                Code: cells[0] || '',
                Status: cells[1] || '',
                LastResult: cells[2] || '',
                NextActivationTime: cells[3] || '-',
                TriggerActive: cells[4] || '-'
            });
        }
        return results;
    }

    async runFlexibleSearch(query: string, maxResults = 100): Promise<FlexibleSearchResult> {
        if (!this.loggedIn) throw new Error('Not logged in');
        try {
            const form = (csrf: string | null) => {
                const p = new URLSearchParams();
                p.append('flexibleSearchQuery', query);
                p.append('maxCount', maxResults.toString());
                p.append('_csrf', csrf || '');
                return p;
            };
            const resp = await this.postWithCsrfRetry('/console/flexsearch', '/console/flexsearch/execute', form);
            const json = await resp.text();
            const root = JSON.parse(json);
            if (root.exception) return { Headers: [], Rows: [], Error: root.exception };
            const headers: string[] = [];
            const rows: string[][] = [];
            if (root.headers) for (const h of root.headers) headers.push(String(h));
            if (root.resultList) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                for (const r of root.resultList) rows.push(r.map((c: any) => c == null ? '' : String(c)));
            }
            return { Headers: headers, Rows: rows, Error: '' };
        } catch (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ex: any
        ) {
            return { Headers: [], Rows: [], Error: ex.message };
        }
    }

    async importImpEx(script: string, enableCodeExecution = false): Promise<ImpExResult> {
        if (!this.loggedIn) throw new Error('Not logged in');
        try {
            const form = (csrf: string | null) => {
                const p = new URLSearchParams();
                p.append('scriptContent', script);
                p.append('encoding', 'UTF-8');
                p.append('enableCodeExecution', enableCodeExecution ? 'true' : 'false');
                p.append('_csrf', csrf || '');
                return p;
            };
            const resp = await this.postWithCsrfRetry('/console/impex/import', '/console/impex/import/upload-script', form);
            const body = await resp.text();
            if (body.trim().startsWith('{')) {
                try {
                    const root = JSON.parse(body);
                    const hasError = root.hasError || false;
                    const log = root.initMessage || root.exceptionMessage || root.log || body;
                    return { Success: !hasError, Log: log };
                    // eslint-disable-next-line no-empty
                } catch {
                }
            }
            const success = body.includes('Import finished successfully') || resp.ok;
            return { Success: success, Log: body };
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (ex: any) {
            return { Success: false, Log: ex.message };
        }
    }

    async getCatalogVersions(): Promise<{ catalogId: string, version: string }[]> {
        const query = "SELECT {catalog(id)}, {version} FROM {CatalogVersion}";
        const res = await this.runFlexibleSearch(query, 1000);
        if (res.Error) throw new Error(res.Error);
        return res.Rows.map((r: string[]) => ({ catalogId: r[0], version: r[1] }));
    }

    async getCatalogIds(): Promise<string[]> {
        const query = "SELECT {id} FROM {Catalog}";
        const res = await this.runFlexibleSearch(query, 1000);
        if (res.Error) throw new Error(res.Error);
        return res.Rows.map((r: string[]) => r[0]).filter(Boolean);
    }

    async getCatalogSyncDiff(catalogId: string, maxMissing = 200): Promise<{ catalogId: string, stagedCount: number, onlineCount: number, missingStagedToOnline: string[], timestamp: string }> {
        const safeId = catalogId.replace(/'/g, "''");
        const stagedQ = `SELECT {p.code} FROM {Product AS p JOIN CatalogVersion AS cv ON {p.catalogVersion}={cv.pk}} WHERE {cv.catalog(id)}='${safeId}' AND {cv.version}='Staged'`;
        const onlineQ = `SELECT {p.code} FROM {Product AS p JOIN CatalogVersion AS cv ON {p.catalogVersion}={cv.pk}} WHERE {cv.catalog(id)}='${safeId}' AND {cv.version}='Online'`;

        const stagedResult = await this.runFlexibleSearch(stagedQ, 5000);
        const onlineResult = await this.runFlexibleSearch(onlineQ, 5000);

        if (stagedResult.Error) throw new Error(`Staged query error: ${stagedResult.Error}`);
        if (onlineResult.Error) throw new Error(`Online query error: ${onlineResult.Error}`);

        const stagedCodes = new Set(stagedResult.Rows.map((r: string[]) => r[0]).filter(Boolean));
        const onlineCodes = new Set(onlineResult.Rows.map((r: string[]) => r[0]).filter(Boolean));

        const missing: string[] = [];
        for (const code of stagedCodes) {
            if (!onlineCodes.has(code)) {
                missing.push(code);
                if (missing.length >= maxMissing) break;
            }
        }

        return {
            catalogId,
            stagedCount: stagedCodes.size,
            onlineCount: onlineCodes.size,
            missingStagedToOnline: missing,
            timestamp: new Date().toISOString()
        };
    }
}

