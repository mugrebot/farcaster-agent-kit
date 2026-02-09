/**
 * BrowserAgent — Playwright-based browser automation for the CLANKNET agent.
 *
 * Gives the agent "eyes and hands" on the web:
 *   - navigate(url) — go to a URL (validated by NetworkSafety)
 *   - snapshot()    — accessibility tree as structured JSON
 *   - screenshot()  — PNG buffer
 *   - click(sel)    — click element by selector or accessibility label
 *   - fill(sel, v)  — fill form field
 *   - eval(js)      — execute JS in page context
 *   - extract(prompt) — LLM reads accessibility tree and extracts data
 *
 * Launches headless Chromium on demand. Auto-closes after 5 min idle. Max 3 pages.
 */

class BrowserAgent {
    constructor(opts = {}) {
        this.networkSafety = opts.networkSafety;
        this.llm = opts.llm || null;
        this.eventBus = opts.eventBus || null;
        this.maxPages = opts.maxPages || 3;
        this.idleTimeoutMs = opts.idleTimeoutMs || 5 * 60 * 1000; // 5 min

        this._browser = null;
        this._pages = new Map();    // id → { page, createdAt, lastUsed }
        this._idleTimer = null;
        this._launching = false;
    }

    /**
     * Ensure browser is running. Launches on demand.
     */
    async _ensureBrowser() {
        if (this._browser?.isConnected()) {
            this._resetIdleTimer();
            return;
        }

        if (this._launching) {
            // Wait for in-progress launch
            await new Promise(resolve => {
                const check = setInterval(() => {
                    if (this._browser?.isConnected()) {
                        clearInterval(check);
                        resolve();
                    }
                }, 100);
            });
            return;
        }

        this._launching = true;
        try {
            const { chromium } = require('playwright');
            this._browser = await chromium.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-dev-shm-usage'],
            });
            console.log('🌐 Browser launched (headless Chromium)');
            this._resetIdleTimer();
        } catch (err) {
            console.error('❌ Browser launch failed:', err.message);
            throw new Error('Browser unavailable: ' + err.message);
        } finally {
            this._launching = false;
        }
    }

    _resetIdleTimer() {
        if (this._idleTimer) clearTimeout(this._idleTimer);
        this._idleTimer = setTimeout(() => this.close(), this.idleTimeoutMs);
    }

    /**
     * Create or get a page. Returns { page, pageId }.
     */
    async _getPage(pageId) {
        await this._ensureBrowser();

        if (pageId && this._pages.has(pageId)) {
            const entry = this._pages.get(pageId);
            entry.lastUsed = Date.now();
            return { page: entry.page, pageId };
        }

        // Enforce max pages
        if (this._pages.size >= this.maxPages) {
            // Close oldest
            let oldestId = null, oldestTime = Infinity;
            for (const [id, entry] of this._pages) {
                if (entry.lastUsed < oldestTime) {
                    oldestTime = entry.lastUsed;
                    oldestId = id;
                }
            }
            if (oldestId) {
                await this._pages.get(oldestId).page.close().catch(() => {});
                this._pages.delete(oldestId);
            }
        }

        const context = await this._browser.newContext({
            userAgent: 'papibot/1.0 (browser-agent)',
        });
        const page = await context.newPage();
        const newId = pageId || `page_${Date.now()}`;

        this._pages.set(newId, { page, context, createdAt: Date.now(), lastUsed: Date.now() });
        return { page, pageId: newId };
    }

    /**
     * Navigate to a URL. Validates through NetworkSafety first.
     */
    async navigate(url, pageId) {
        // Validate URL
        if (this.networkSafety) {
            const check = this.networkSafety.isBrowserNavigationAllowed
                ? this.networkSafety.isBrowserNavigationAllowed(url)
                : this.networkSafety.validateUrl(url);
            if (!check.safe) {
                throw new Error(`Navigation blocked: ${check.reason}`);
            }
        }

        const { page, pageId: pid } = await this._getPage(pageId);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

        if (this.eventBus) {
            this.eventBus.publish('browser:snapshot', { pageId: pid, url, action: 'navigate' });
        }

        return { pageId: pid, url: page.url(), title: await page.title() };
    }

    /**
     * Get accessibility tree snapshot as structured JSON.
     * Much more token-efficient than screenshots for LLM consumption.
     */
    async snapshot(pageId) {
        const { page, pageId: pid } = await this._getPage(pageId);

        const tree = await page.accessibility.snapshot({ interestingOnly: true });

        return {
            pageId: pid,
            url: page.url(),
            title: await page.title(),
            tree: tree || { role: 'document', name: 'empty', children: [] },
        };
    }

    /**
     * Take a screenshot. Returns PNG buffer.
     */
    async screenshot(pageId, opts = {}) {
        const { page, pageId: pid } = await this._getPage(pageId);

        const buffer = await page.screenshot({
            type: 'png',
            fullPage: opts.fullPage || false,
        });

        return { pageId: pid, png: buffer, size: buffer.length };
    }

    /**
     * Click an element by CSS selector or accessible name.
     */
    async click(selector, pageId) {
        const { page, pageId: pid } = await this._getPage(pageId);

        // Try CSS selector first, fall back to accessible name
        try {
            await page.click(selector, { timeout: 5000 });
        } catch {
            // Try by role/name
            await page.getByRole('link', { name: selector }).or(
                page.getByRole('button', { name: selector })
            ).first().click({ timeout: 5000 });
        }

        return { pageId: pid, clicked: selector };
    }

    /**
     * Fill a form field.
     */
    async fill(selector, value, pageId) {
        const { page, pageId: pid } = await this._getPage(pageId);

        try {
            await page.fill(selector, value, { timeout: 5000 });
        } catch {
            await page.getByLabel(selector).first().fill(value, { timeout: 5000 });
        }

        return { pageId: pid, filled: selector };
    }

    /**
     * Execute JavaScript in the page context.
     */
    async eval(js, pageId) {
        const { page, pageId: pid } = await this._getPage(pageId);
        const result = await page.evaluate(js);
        return { pageId: pid, result };
    }

    /**
     * LLM reads accessibility tree and extracts structured data.
     */
    async extract(prompt, pageId) {
        if (!this.llm || this.llm.provider === 'pattern') {
            throw new Error('LLM required for extract()');
        }

        const snap = await this.snapshot(pageId);
        const treeStr = JSON.stringify(snap.tree, null, 2).slice(0, 8000); // Token limit

        const extractPrompt = `You are analyzing a web page's accessibility tree. Extract the requested information as structured JSON.

Page URL: ${snap.url}
Page Title: ${snap.title}

Accessibility Tree:
${treeStr}

User Request: ${prompt}

Output ONLY valid JSON with the extracted data.`;

        const result = await this.llm.generateContent(extractPrompt, {
            username: 'browser-agent',
            mode: 'coordination',
            maxTokens: 1000,
            temperature: 0.3,
        });

        const raw = result.content?.trim();
        try {
            const jsonMatch = raw.match(/\{[\s\S]*\}/);
            return { pageId: snap.pageId, data: jsonMatch ? JSON.parse(jsonMatch[0]) : raw };
        } catch {
            return { pageId: snap.pageId, data: raw };
        }
    }

    /**
     * Close all pages and the browser.
     */
    async close() {
        if (this._idleTimer) {
            clearTimeout(this._idleTimer);
            this._idleTimer = null;
        }

        for (const [id, entry] of this._pages) {
            try { await entry.context.close(); } catch {}
        }
        this._pages.clear();

        if (this._browser) {
            try { await this._browser.close(); } catch {}
            this._browser = null;
            console.log('🌐 Browser closed');
        }
    }

    /**
     * Status for health checks.
     */
    status() {
        return {
            running: !!this._browser?.isConnected(),
            pages: this._pages.size,
            maxPages: this.maxPages,
        };
    }
}

module.exports = BrowserAgent;
