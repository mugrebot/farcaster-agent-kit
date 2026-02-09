/**
 * Vercel Serverless Function: Admin API (unified)
 * Routes: /api/admin/stats, /api/admin/post, /api/admin/config
 */

const { setCORS } = require('./_shared/cors');
const { getKV, saveData, loadData } = require('./_shared/kv');

const SUPPORTED_PLATFORMS = ['farcaster', 'moltbook', 'twitter'];
const MAX_CONTENT_LENGTH = 1000;
const CONFIG_KEY = 'admin:config';

const DEFAULT_STATS = {
    agent: { name: 'ClankNet Agent', status: 'active', uptime: 'serverless' },
    stats: { totalPosts: 0, totalInteractions: 0, activeTools: 5, platforms: ['farcaster', 'moltbook', 'twitter'], tokensDistributed: '0', skillExecutions: 0 },
    recentActivity: []
};

const DEFAULT_CONFIG = {
    agentName: 'ClankNet Agent', postingInterval: 3600,
    crossPost: { twitter: false, lens: false, discord: false },
    replyPrice: '100', llmProvider: 'anthropic', temperature: 0.7
};

const VALIDATORS = {
    agentName:       (v) => (typeof v === 'string' && v.length > 0 && v.length <= 64) ? null : 'agentName must be a string (1-64 chars)',
    postingInterval: (v) => (typeof v === 'number' && v >= 60 && v <= 86400) ? null : 'postingInterval must be 60-86400',
    crossPost:       (v) => (v && typeof v === 'object' && !Array.isArray(v)) ? null : 'crossPost must be an object',
    replyPrice:      (v) => (typeof v === 'string' && /^\d+$/.test(v)) ? null : 'replyPrice must be a numeric string',
    llmProvider:     (v) => (['anthropic', 'openai', 'local'].includes(v)) ? null : 'llmProvider must be: anthropic, openai, local',
    temperature:     (v) => (typeof v === 'number' && v >= 0 && v <= 2) ? null : 'temperature must be 0-2'
};

async function handleStats(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const kv = getKV();
    if (kv) {
        try {
            const [agent, stats, recentActivity] = await Promise.all([
                loadData('admin:agent'), loadData('admin:stats'), loadData('admin:recentActivity')
            ]);
            return res.status(200).json({
                success: true,
                agent: agent || DEFAULT_STATS.agent,
                stats: stats ? { ...DEFAULT_STATS.stats, ...stats } : DEFAULT_STATS.stats,
                recentActivity: recentActivity || DEFAULT_STATS.recentActivity,
                source: 'kv', timestamp: new Date().toISOString()
            });
        } catch (_) { /* fall through */ }
    }
    return res.status(200).json({ success: true, ...DEFAULT_STATS, source: 'defaults', timestamp: new Date().toISOString() });
}

async function handlePost(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { content, platforms, auth } = req.body || {};

    if (!auth || typeof auth !== 'object') return res.status(401).json({ success: false, error: 'Missing auth object' });
    if (typeof auth.fid !== 'number' || !Number.isFinite(auth.fid) || auth.fid <= 0)
        return res.status(401).json({ success: false, error: 'auth.fid must be a positive number' });
    if (!auth.signature || typeof auth.signature !== 'string' || auth.signature.length < 4)
        return res.status(401).json({ success: false, error: 'auth.signature required' });

    if (!content || typeof content !== 'string' || content.trim().length === 0)
        return res.status(400).json({ success: false, error: 'Content is required' });
    if (content.length > MAX_CONTENT_LENGTH)
        return res.status(400).json({ success: false, error: `Content exceeds ${MAX_CONTENT_LENGTH} chars` });

    const targetPlatforms = Array.isArray(platforms) && platforms.length > 0
        ? platforms.filter(p => SUPPORTED_PLATFORMS.includes(p)) : ['farcaster'];
    if (targetPlatforms.length === 0)
        return res.status(400).json({ success: false, error: `No valid platforms. Supported: ${SUPPORTED_PLATFORMS.join(', ')}` });

    const results = [];
    for (const platform of targetPlatforms) {
        if (platform === 'farcaster') {
            const apiKey = process.env.NEYNAR_API_KEY;
            const signerUuid = process.env.SIGNER_UUID;
            if (!apiKey || !signerUuid) {
                results.push({ platform: 'farcaster', success: false, error: 'NEYNAR_API_KEY and SIGNER_UUID required' });
                continue;
            }
            try {
                const resp = await fetch('https://api.neynar.com/v2/farcaster/cast', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'api_key': apiKey },
                    body: JSON.stringify({ signer_uuid: signerUuid, text: content.trim() })
                });
                const data = await resp.json();
                if (!resp.ok) { results.push({ platform: 'farcaster', success: false, error: data.message || `HTTP ${resp.status}` }); continue; }
                results.push({ platform: 'farcaster', success: true, postId: data.cast?.hash || null });
            } catch (e) { results.push({ platform: 'farcaster', success: false, error: e.message }); }
        } else {
            results.push({ platform, success: false, error: `${platform} not yet implemented in serverless mode` });
        }
    }

    const anySuccess = results.some(r => r.success);
    return res.status(anySuccess ? 200 : 502).json({
        success: anySuccess, postId: results.find(r => r.postId)?.postId || null,
        platforms: results, timestamp: new Date().toISOString()
    });
}

async function handleConfig(req, res) {
    const kv = getKV();

    if (req.method === 'GET') {
        if (kv) {
            try {
                const stored = await loadData(CONFIG_KEY);
                return res.status(200).json({ success: true, config: stored ? { ...DEFAULT_CONFIG, ...stored } : DEFAULT_CONFIG, source: stored ? 'kv' : 'defaults', timestamp: new Date().toISOString() });
            } catch (_) { /* fall through */ }
        }
        return res.status(200).json({ success: true, config: DEFAULT_CONFIG, source: 'defaults', timestamp: new Date().toISOString() });
    }

    if (req.method === 'POST') {
        if (!kv) return res.status(503).json({ success: false, error: 'Redis not available' });
        const updates = req.body;
        if (!updates || typeof updates !== 'object' || Array.isArray(updates))
            return res.status(400).json({ success: false, error: 'Body must be a JSON object' });
        const errors = [];
        for (const [key, value] of Object.entries(updates)) {
            if (!VALIDATORS[key]) { errors.push(`Unknown key: ${key}`); continue; }
            const err = VALIDATORS[key](value);
            if (err) errors.push(err);
        }
        if (errors.length > 0) return res.status(400).json({ success: false, errors });
        const existing = await loadData(CONFIG_KEY);
        const merged = { ...DEFAULT_CONFIG, ...existing, ...updates };
        await saveData(CONFIG_KEY, merged);
        return res.status(200).json({ success: true, config: merged, updatedKeys: Object.keys(updates), timestamp: new Date().toISOString() });
    }

    return res.status(405).json({ error: 'Method not allowed' });
}

module.exports = async function handler(req, res) {
    if (setCORS(req, res)) return res.status(200).end();

    const url = req.url || '';
    if (url.includes('/admin/stats'))  return handleStats(req, res);
    if (url.includes('/admin/post'))   return handlePost(req, res);
    if (url.includes('/admin/config')) return handleConfig(req, res);

    return res.status(404).json({
        error: 'Not found',
        endpoints: ['/api/admin/stats', '/api/admin/post', '/api/admin/config']
    });
};
