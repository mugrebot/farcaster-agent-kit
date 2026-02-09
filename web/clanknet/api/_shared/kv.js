/**
 * Upstash Redis client with in-memory fallback
 * Replaces @vercel/kv
 */

let _redis = null;
let _initAttempted = false;

function getKV() {
    if (_initAttempted) return _redis;
    _initAttempted = true;

    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (url && token) {
        try {
            const { Redis } = require('@upstash/redis');
            _redis = new Redis({ url, token });
        } catch (e) {
            console.warn('⚠️ @upstash/redis not available, falling back to in-memory');
        }
    }
    return _redis;
}

// In-memory fallback store
const _memStore = new Map();

async function saveData(key, data, ttlSeconds = 86400) {
    const kv = getKV();
    if (kv) {
        try {
            await kv.set(key, JSON.stringify(data), { ex: ttlSeconds });
            return true;
        } catch (error) {
            console.error('KV save failed:', error.message);
        }
    }
    // In-memory fallback
    _memStore.set(key, { data, expires: Date.now() + ttlSeconds * 1000 });
    return true;
}

async function loadData(key) {
    const kv = getKV();
    if (kv) {
        try {
            const raw = await kv.get(key);
            if (raw == null) return null;
            return typeof raw === 'string' ? JSON.parse(raw) : raw;
        } catch (error) {
            console.error('KV load failed:', error.message);
        }
    }
    // In-memory fallback
    const entry = _memStore.get(key);
    if (!entry) return null;
    if (entry.expires < Date.now()) {
        _memStore.delete(key);
        return null;
    }
    return entry.data;
}

async function deleteData(key) {
    const kv = getKV();
    if (kv) {
        try { await kv.del(key); } catch (_) {}
    }
    _memStore.delete(key);
}

async function isNonceUsed(nonce) {
    const key = `nonce:${nonce}`;
    const kv = getKV();
    if (kv) {
        try {
            const exists = await kv.exists(key);
            return !!exists;
        } catch (_) {}
    }
    const entry = _memStore.get(key);
    return !!(entry && entry.expires > Date.now());
}

async function markNonceUsed(nonce) {
    const key = `nonce:${nonce}`;
    const kv = getKV();
    if (kv) {
        try {
            await kv.set(key, Date.now(), { ex: 86400 }); // 24h TTL
            return;
        } catch (_) {}
    }
    _memStore.set(key, { data: Date.now(), expires: Date.now() + 86400000 });
}

module.exports = { getKV, saveData, loadData, deleteData, isNonceUsed, markNonceUsed };
