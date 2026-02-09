/**
 * Rate limiting — Upstash Redis-backed with in-memory fallback
 */

const { getKV } = require('./kv');

// In-memory fallback store
const _memLimits = new Map();

const DEFAULT_OPTS = {
    maxRequests: 5,
    windowMs: 60000,     // 1 minute
    blockMs: 300000      // 5 minutes
};

/**
 * Check rate limit for an identifier.
 * @param {string} identifier - Key (e.g. `ip_1.2.3.4`)
 * @param {object} [opts]
 * @returns {Promise<{ allowed: boolean, remaining?: number, retryAfter?: number }>}
 */
async function checkRateLimit(identifier, opts = {}) {
    const { maxRequests, windowMs, blockMs } = { ...DEFAULT_OPTS, ...opts };
    const kv = getKV();

    // Try Redis-backed atomic rate limiting
    if (kv) {
        try {
            return await _redisRateLimit(kv, identifier, maxRequests, windowMs, blockMs);
        } catch (_) {
            // Fall through to in-memory
        }
    }

    return _memRateLimit(identifier, maxRequests, windowMs, blockMs);
}

async function _redisRateLimit(kv, identifier, maxRequests, windowMs, blockMs) {
    const blockKey = `rl:block:${identifier}`;
    const countKey = `rl:count:${identifier}`;

    // Check block
    const blocked = await kv.get(blockKey);
    if (blocked) {
        const ttl = await kv.ttl(blockKey);
        return { allowed: false, remaining: 0, retryAfter: ttl > 0 ? ttl : Math.ceil(blockMs / 1000) };
    }

    // Atomic increment
    const count = await kv.incr(countKey);
    if (count === 1) {
        // First request in window — set expiry
        await kv.expire(countKey, Math.ceil(windowMs / 1000));
    }

    if (count > maxRequests) {
        // Block
        await kv.set(blockKey, '1', { ex: Math.ceil(blockMs / 1000) });
        return { allowed: false, remaining: 0, retryAfter: Math.ceil(blockMs / 1000) };
    }

    return { allowed: true, remaining: maxRequests - count };
}

function _memRateLimit(identifier, maxRequests, windowMs, blockMs) {
    const now = Date.now();
    let tracking = _memLimits.get(identifier) || { requests: [], blockedUntil: 0 };

    if (tracking.blockedUntil > now) {
        const retryAfter = Math.ceil((tracking.blockedUntil - now) / 1000);
        return { allowed: false, remaining: 0, retryAfter };
    }

    // Clean stale entries
    tracking.requests = tracking.requests.filter(t => t > now - windowMs);

    if (tracking.requests.length >= maxRequests) {
        tracking.blockedUntil = now + blockMs;
        _memLimits.set(identifier, tracking);
        return { allowed: false, remaining: 0, retryAfter: Math.ceil(blockMs / 1000) };
    }

    tracking.requests.push(now);
    _memLimits.set(identifier, tracking);
    return { allowed: true, remaining: maxRequests - tracking.requests.length };
}

module.exports = { checkRateLimit };
