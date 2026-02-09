/**
 * Vercel Serverless Function: Memory & Personality API
 * Routes: /api/memory/:agentId, /api/memory/:agentId/soul, /api/memory/:agentId/memory, /api/memory/:agentId/context
 */

const { setCORS } = require('./_shared/cors');
const { verifyERC8004Auth } = require('./_shared/auth');
const { checkRateLimit } = require('./_shared/rate-limit');
const { saveData, loadData } = require('./_shared/kv');

function extractAgentId(url) {
    const match = url.match(/\/memory\/(\d+)/);
    return match ? match[1] : null;
}

// --- Get personality files ---
async function handleGet(req, res, agentId) {
    const soul = await loadData(`agent:soul:${agentId}`);
    const memory = await loadData(`agent:memory:${agentId}`);

    if (!soul && !memory) {
        return res.status(404).json({ error: 'No personality data found for this agent' });
    }

    return res.status(200).json({
        agentId,
        soul: soul ? soul.content : null,
        memory: memory ? memory.content : null,
        timestamp: new Date().toISOString()
    });
}

// --- Update SOUL.md ---
async function handleUpdateSoul(req, res, agentId) {
    const authResult = verifyERC8004Auth(
        req.headers.authorization, 'PUT', `/api/memory/${agentId}/soul`,
        JSON.stringify(req.body)
    );
    if (!authResult.valid) return res.status(401).json({ error: 'Authentication required', message: authResult.error });
    if (authResult.agentId !== agentId) return res.status(403).json({ error: 'Can only update own personality' });

    const { content } = req.body || {};
    if (!content || typeof content !== 'string') {
        return res.status(400).json({ error: 'Missing content field' });
    }
    if (content.length > 10000) {
        return res.status(400).json({ error: 'SOUL.md too large (max 10KB)' });
    }

    const hash = require('crypto').createHash('sha256').update(content).digest('hex');
    await saveData(`agent:soul:${agentId}`, { content, hash, updatedAt: new Date().toISOString() });

    return res.status(200).json({ success: true, agentId, hash, size: content.length });
}

// --- Update MEMORY.md ---
async function handleUpdateMemory(req, res, agentId) {
    const authResult = verifyERC8004Auth(
        req.headers.authorization, 'PUT', `/api/memory/${agentId}/memory`,
        JSON.stringify(req.body)
    );
    if (!authResult.valid) return res.status(401).json({ error: 'Authentication required', message: authResult.error });
    if (authResult.agentId !== agentId) return res.status(403).json({ error: 'Can only update own memory' });

    const { content } = req.body || {};
    if (!content || typeof content !== 'string') {
        return res.status(400).json({ error: 'Missing content field' });
    }
    if (content.length > 50000) {
        return res.status(400).json({ error: 'MEMORY.md too large (max 50KB)' });
    }

    const hash = require('crypto').createHash('sha256').update(content).digest('hex');
    await saveData(`agent:memory:${agentId}`, { content, hash, updatedAt: new Date().toISOString() });

    return res.status(200).json({ success: true, agentId, hash, size: content.length });
}

// --- Get context ---
async function handleContext(req, res, agentId) {
    const [soul, memory, agentsData] = await Promise.all([
        loadData(`agent:soul:${agentId}`),
        loadData(`agent:memory:${agentId}`),
        loadData('agents:directory')
    ]);

    const agents = agentsData || [];
    const agent = agents.find(a => a.agentId === agentId);

    return res.status(200).json({
        agentId,
        name: agent?.name || null,
        soul: soul ? { hash: soul.hash, size: soul.content?.length || 0 } : null,
        memory: memory ? { hash: memory.hash, size: memory.content?.length || 0 } : null,
        capabilities: agent?.capabilities || [],
        status: agent?.status || 'unknown',
        timestamp: new Date().toISOString()
    });
}

// --- Main router ---
module.exports = async function handler(req, res) {
    if (setCORS(req, res)) return res.status(200).end();

    const url = req.url || '';
    const agentId = extractAgentId(url);

    if (!agentId) {
        return res.status(400).json({
            error: 'Missing agent ID',
            format: '/api/memory/:agentId',
            endpoints: ['/api/memory/:id', '/api/memory/:id/soul', '/api/memory/:id/memory', '/api/memory/:id/context']
        });
    }

    if (url.includes('/soul'))    return req.method === 'PUT' ? handleUpdateSoul(req, res, agentId) : res.status(405).json({ error: 'Use PUT' });
    if (url.includes('/memory') && url.match(/\/memory\/\d+\/memory/))
        return req.method === 'PUT' ? handleUpdateMemory(req, res, agentId) : res.status(405).json({ error: 'Use PUT' });
    if (url.includes('/context')) return handleContext(req, res, agentId);

    // Default: GET personality files
    if (req.method === 'GET') return handleGet(req, res, agentId);

    return res.status(405).json({ error: 'Method not allowed' });
};
