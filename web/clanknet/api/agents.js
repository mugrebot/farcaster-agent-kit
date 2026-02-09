/**
 * Vercel Serverless Function: Agent Directory
 * Routes: /api/agents/register, /api/agents/directory, /api/agents/:id, /api/agents/update
 */

const { setCORS } = require('./_shared/cors');
const { verifyERC8004Auth } = require('./_shared/auth');
const { checkRateLimit } = require('./_shared/rate-limit');
const { saveData, loadData } = require('./_shared/kv');

// --- Register agent ---
async function handleRegister(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const authResult = verifyERC8004Auth(
        req.headers.authorization, 'POST', '/api/agents/register',
        JSON.stringify(req.body)
    );
    if (!authResult.valid) {
        return res.status(401).json({ error: 'Authentication required', message: authResult.error });
    }

    const clientIP = req.headers['x-vercel-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    const rateCheck = await checkRateLimit(`agentreg:${clientIP}`, { maxRequests: 3, windowMs: 3600000, blockMs: 3600000 });
    if (!rateCheck.allowed) return res.status(429).json({ error: 'Rate limited' });

    const { name, description, capabilities, skills, soulMd, contactUrl } = req.body || {};
    if (!name || !description) {
        return res.status(400).json({ error: 'Missing required fields: name, description' });
    }

    const agentEntry = {
        agentId: authResult.agentId,
        name,
        description,
        capabilities: capabilities || [],
        skills: skills || [],
        signer: authResult.signerAddress,
        chainId: authResult.chainId,
        registry: authResult.registryAddress,
        contactUrl: contactUrl || null,
        soulMdHash: soulMd ? require('crypto').createHash('sha256').update(soulMd).digest('hex') : null,
        status: 'active',
        registeredAt: new Date().toISOString(),
        lastSeen: new Date().toISOString()
    };

    // Store agent
    const agents = await loadData('agents:directory') || [];
    const existingIdx = agents.findIndex(a => a.agentId === authResult.agentId);
    if (existingIdx >= 0) {
        agents[existingIdx] = { ...agents[existingIdx], ...agentEntry, updatedAt: new Date().toISOString() };
    } else {
        agents.push(agentEntry);
    }
    await saveData('agents:directory', agents);

    // Store SOUL.md if provided
    if (soulMd) {
        await saveData(`agent:soul:${authResult.agentId}`, { content: soulMd });
    }

    return res.status(201).json({
        success: true,
        message: existingIdx >= 0 ? 'Agent updated' : 'Agent registered',
        agent: agentEntry
    });
}

// --- Directory listing ---
async function handleDirectory(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const agents = await loadData('agents:directory') || [];
    const page = parseInt(req.query?.page) || 1;
    const limit = Math.min(parseInt(req.query?.limit) || 20, 50);
    const start = (page - 1) * limit;

    // Filter by capability if requested
    let filtered = agents;
    if (req.query?.capability) {
        filtered = agents.filter(a => a.capabilities && a.capabilities.includes(req.query.capability));
    }

    res.setHeader('Cache-Control', 'public, s-maxage=60');
    return res.status(200).json({
        agents: filtered.slice(start, start + limit).map(a => ({
            agentId: a.agentId, name: a.name, description: a.description,
            capabilities: a.capabilities, skills: a.skills,
            status: a.status, registeredAt: a.registeredAt
        })),
        total: filtered.length,
        page, limit,
        timestamp: new Date().toISOString()
    });
}

// --- Agent details ---
async function handleAgentDetails(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const url = req.url || '';
    const match = url.match(/\/agents\/(\d+)/);
    if (!match) return res.status(400).json({ error: 'Missing agent ID' });

    const agentId = match[1];
    const agents = await loadData('agents:directory') || [];
    const agent = agents.find(a => a.agentId === agentId);

    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    return res.status(200).json({ agent, timestamp: new Date().toISOString() });
}

// --- Update agent ---
async function handleUpdate(req, res) {
    if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });

    const authResult = verifyERC8004Auth(
        req.headers.authorization, 'PUT', '/api/agents/update',
        JSON.stringify(req.body)
    );
    if (!authResult.valid) {
        return res.status(401).json({ error: 'Authentication required', message: authResult.error });
    }

    const agents = await loadData('agents:directory') || [];
    const idx = agents.findIndex(a => a.agentId === authResult.agentId);
    if (idx < 0) return res.status(404).json({ error: 'Agent not registered' });

    // Only allow updating own agent
    if (agents[idx].signer.toLowerCase() !== authResult.signerAddress.toLowerCase()) {
        return res.status(403).json({ error: 'Not authorized to update this agent' });
    }

    const { name, description, capabilities, skills, contactUrl } = req.body || {};
    if (name) agents[idx].name = name;
    if (description) agents[idx].description = description;
    if (capabilities) agents[idx].capabilities = capabilities;
    if (skills) agents[idx].skills = skills;
    if (contactUrl !== undefined) agents[idx].contactUrl = contactUrl;
    agents[idx].lastSeen = new Date().toISOString();
    agents[idx].updatedAt = new Date().toISOString();

    await saveData('agents:directory', agents);

    return res.status(200).json({ success: true, agent: agents[idx] });
}

// --- Main router ---
module.exports = async function handler(req, res) {
    if (setCORS(req, res)) return res.status(200).end();

    const url = req.url || '';
    if (url.includes('/agents/register'))  return handleRegister(req, res);
    if (url.includes('/agents/update'))    return handleUpdate(req, res);
    if (url.includes('/agents/directory')) return handleDirectory(req, res);
    // Numeric ID pattern: /agents/1396
    if (url.match(/\/agents\/\d+/))        return handleAgentDetails(req, res);

    return res.status(404).json({
        error: 'Not found',
        endpoints: ['/api/agents/register', '/api/agents/directory', '/api/agents/:id', '/api/agents/update']
    });
};
