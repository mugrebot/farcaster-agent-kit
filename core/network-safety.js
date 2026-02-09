/**
 * Network Safety — SSRF protection, domain filtering, rate limiting, and content sanitization.
 *
 * All outbound HTTP from the agent routes through safeFetch() to prevent:
 *   - SSRF attacks (internal IPs, cloud metadata endpoints)
 *   - Scheme injection (file://, ftp://, data:, javascript:)
 *   - Binary/oversized downloads
 *   - Prompt injection in fetched content
 */

const { URL } = require('url');
const dns = require('dns').promises;
const axios = require('axios');

class NetworkSafety {
    constructor(config = {}) {
        this.maxResponseBytes = config.maxResponseBytes || 100 * 1024; // 100KB
        this.maxContentForLLM = config.maxContentForLLM || 4000; // 4KB after cleaning
        this.requestTimeoutMs = config.requestTimeoutMs || 10000;
        this.maxRedirects = config.maxRedirects || 3;

        // Rate limiting: max fetches per window
        this.rateLimitMax = config.rateLimitMax || 10;
        this.rateLimitWindowMs = config.rateLimitWindowMs || 60 * 1000; // 1 minute
        this._fetchLog = []; // timestamps of recent fetches

        // Blocked hostnames (exact match + suffix match for *.local etc.)
        this.blockedHostnames = new Set([
            'localhost',
            'metadata.google.internal',
            'metadata.google.com',
        ]);

        this.blockedHostSuffixes = [
            '.local',
            '.internal',
            '.localhost',
        ];

        // Only allow HTTPS
        this.allowedSchemes = new Set(['https:']);
    }

    /**
     * Validate a URL string before fetching.
     * Returns { safe: true } or { safe: false, reason: string }.
     */
    validateUrl(urlString) {
        let parsed;
        try {
            parsed = new URL(urlString);
        } catch {
            return { safe: false, reason: 'Invalid URL' };
        }

        // Scheme check
        if (!this.allowedSchemes.has(parsed.protocol)) {
            return { safe: false, reason: `Blocked scheme: ${parsed.protocol} (only HTTPS allowed)` };
        }

        // Hostname checks
        const hostname = parsed.hostname.toLowerCase();

        if (this.blockedHostnames.has(hostname)) {
            return { safe: false, reason: `Blocked hostname: ${hostname}` };
        }

        for (const suffix of this.blockedHostSuffixes) {
            if (hostname.endsWith(suffix)) {
                return { safe: false, reason: `Blocked hostname suffix: ${suffix}` };
            }
        }

        // Block IP-literal hostnames (users shouldn't be fetching raw IPs)
        if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
            if (this.isPrivateIP(hostname)) {
                return { safe: false, reason: `Blocked private IP: ${hostname}` };
            }
        }

        // Block IPv6 literals
        if (hostname.startsWith('[') || hostname === '::1') {
            return { safe: false, reason: 'Blocked IPv6 literal' };
        }

        return { safe: true, parsed };
    }

    /**
     * Check if an IP address is private/reserved (SSRF protection).
     */
    isPrivateIP(ip) {
        const parts = ip.split('.').map(Number);
        if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) {
            return true; // malformed → block
        }

        const [a, b] = parts;

        // 0.0.0.0/8
        if (a === 0) return true;
        // 10.0.0.0/8
        if (a === 10) return true;
        // 127.0.0.0/8 (loopback)
        if (a === 127) return true;
        // 169.254.0.0/16 (link-local, AWS metadata)
        if (a === 169 && b === 254) return true;
        // 172.16.0.0/12
        if (a === 172 && b >= 16 && b <= 31) return true;
        // 192.168.0.0/16
        if (a === 192 && b === 168) return true;
        // 100.64.0.0/10 (carrier-grade NAT)
        if (a === 100 && b >= 64 && b <= 127) return true;
        // 198.18.0.0/15 (benchmark)
        if (a === 198 && (b === 18 || b === 19)) return true;
        // 224.0.0.0/4 (multicast) through 255.255.255.255
        if (a >= 224) return true;

        return false;
    }

    /**
     * Check rate limit. Returns true if within limit.
     */
    _checkRateLimit() {
        const now = Date.now();
        // Prune old entries
        this._fetchLog = this._fetchLog.filter(t => now - t < this.rateLimitWindowMs);
        if (this._fetchLog.length >= this.rateLimitMax) {
            return false;
        }
        this._fetchLog.push(now);
        return true;
    }

    /**
     * Safe fetch: validate URL → resolve DNS → check resolved IP → fetch → validate content.
     *
     * Returns { safe: true, content, status, contentType } or { safe: false, reason }.
     */
    async safeFetch(urlString) {
        // 1. Rate limit
        if (!this._checkRateLimit()) {
            return { safe: false, reason: 'Rate limit exceeded (max 10 fetches/minute)' };
        }

        // 2. URL validation
        const urlCheck = this.validateUrl(urlString);
        if (!urlCheck.safe) {
            return urlCheck;
        }

        const { parsed } = urlCheck;

        // 3. DNS resolution — check the actual IPs before connecting
        try {
            const addresses = await dns.resolve4(parsed.hostname).catch(() => []);
            const addresses6 = await dns.resolve6(parsed.hostname).catch(() => []);

            for (const addr of addresses) {
                if (this.isPrivateIP(addr)) {
                    return { safe: false, reason: `DNS resolves to private IP: ${addr}` };
                }
            }

            // Block if hostname resolves to IPv6 loopback or private
            for (const addr of addresses6) {
                if (addr === '::1' || addr.startsWith('fc') || addr.startsWith('fd') || addr.startsWith('fe80')) {
                    return { safe: false, reason: `DNS resolves to private IPv6: ${addr}` };
                }
            }

            // If no A or AAAA records found, allow — could be CNAME only, axios will handle
        } catch {
            // DNS resolution failed — let axios try (could be valid with different resolver)
        }

        // 4. Fetch with constraints
        try {
            const resp = await axios.get(urlString, {
                timeout: this.requestTimeoutMs,
                maxRedirects: this.maxRedirects,
                maxContentLength: this.maxResponseBytes,
                headers: { 'User-Agent': 'papibot/1.0 (safe-fetch)' },
                responseType: 'text',
                // Only accept 2xx responses
                validateStatus: (status) => status >= 200 && status < 300,
            });

            // 5. Content-type check
            const contentType = (resp.headers['content-type'] || '').toLowerCase();
            const allowedTypes = ['text/', 'application/json', 'application/xml', 'application/rss', 'application/atom'];
            const isAllowedType = allowedTypes.some(t => contentType.includes(t));

            if (!isAllowedType && contentType) {
                return { safe: false, reason: `Blocked content-type: ${contentType}` };
            }

            // 6. Process content
            const body = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data, null, 2);
            const cleaned = this.sanitizeForLLM(body);

            return {
                safe: true,
                content: cleaned,
                status: resp.status,
                contentType,
                originalLength: body.length,
            };

        } catch (err) {
            if (err.response) {
                return { safe: false, reason: `HTTP ${err.response.status}` };
            }
            return { safe: false, reason: err.message };
        }
    }

    /**
     * Check if a URL is safe for browser navigation.
     * Stricter than safeFetch — blocks additional browser-specific schemes.
     */
    isBrowserNavigationAllowed(urlString) {
        // First run standard URL validation
        const baseCheck = this.validateUrl(urlString);
        if (!baseCheck.safe) return baseCheck;

        let parsed;
        try {
            parsed = new URL(urlString);
        } catch {
            return { safe: false, reason: 'Invalid URL' };
        }

        // Block browser-internal schemes
        const blockedSchemes = ['chrome:', 'chrome-extension:', 'file:', 'about:', 'data:', 'javascript:', 'blob:'];
        for (const scheme of blockedSchemes) {
            if (parsed.protocol === scheme) {
                return { safe: false, reason: `Blocked browser scheme: ${parsed.protocol}` };
            }
        }

        // Optional: domain allowlist for browser (stricter)
        if (this.browserAllowedDomains && this.browserAllowedDomains.length > 0) {
            const hostname = parsed.hostname.toLowerCase();
            const allowed = this.browserAllowedDomains.some(d =>
                hostname === d || hostname.endsWith('.' + d)
            );
            if (!allowed) {
                return { safe: false, reason: `Domain not in browser allowlist: ${hostname}` };
            }
        }

        return { safe: true, parsed };
    }

    /**
     * Sanitize fetched content before passing to the LLM.
     *   - Strip HTML tags
     *   - Remove prompt injection patterns
     *   - Truncate to maxContentForLLM
     */
    sanitizeForLLM(raw) {
        let text = raw;

        // Strip HTML tags
        text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
        text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
        text = text.replace(/<[^>]+>/g, ' ');

        // Decode common HTML entities
        text = text.replace(/&amp;/g, '&')
                   .replace(/&lt;/g, '<')
                   .replace(/&gt;/g, '>')
                   .replace(/&quot;/g, '"')
                   .replace(/&#39;/g, "'")
                   .replace(/&nbsp;/g, ' ');

        // Collapse whitespace
        text = text.replace(/\s+/g, ' ').trim();

        // Remove common prompt injection patterns
        const injectionPatterns = [
            /ignore\s+(all\s+)?previous\s+instructions/gi,
            /ignore\s+(all\s+)?above\s+instructions/gi,
            /you\s+are\s+now\s+a/gi,
            /disregard\s+(all\s+)?prior/gi,
            /new\s+instructions?\s*:/gi,
            /system\s*:\s*you\s+are/gi,
            /\[SYSTEM\]/gi,
            /<<\s*SYS\s*>>/gi,
        ];

        for (const pattern of injectionPatterns) {
            text = text.replace(pattern, '[filtered]');
        }

        // Truncate
        if (text.length > this.maxContentForLLM) {
            text = text.substring(0, this.maxContentForLLM) + '... [truncated]';
        }

        return text;
    }
}

module.exports = NetworkSafety;
