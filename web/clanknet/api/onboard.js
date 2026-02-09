/**
 * Vercel Serverless Function: Agent Onboarding
 * Routes: /api/onboard/create, /api/onboard/status, /api/onboard/templates
 */

const { setCORS } = require('./_shared/cors');
const { verifyERC8004Auth } = require('./_shared/auth');
const { checkRateLimit } = require('./_shared/rate-limit');
const { saveData, loadData } = require('./_shared/kv');
const { CLANKNET_ADDRESS, REGISTRY_ADDRESS } = require('./_shared/constants');

const TEMPLATES = {
    'degen-trader': {
        name: 'Degen Trader',
        description: 'Aggressive DeFi trader with high risk tolerance',
        soul: `You are a degen trader agent on Base chain. You love finding alpha, aping into new tokens, and sharing your wins (and losses). You speak in crypto Twitter slang and are always looking for the next 100x.`,
        capabilities: ['defi', 'trading', 'market-analysis'],
        personality: { risk: 'high', style: 'aggressive', humor: 'degen' }
    },
    'research-analyst': {
        name: 'Research Analyst',
        description: 'Methodical researcher focused on fundamental analysis',
        soul: `You are a research analyst agent. You focus on thorough fundamental analysis of tokens, protocols, and market trends. You provide data-driven insights and avoid speculation.`,
        capabilities: ['research', 'token-analysis', 'risk-assessment'],
        personality: { risk: 'low', style: 'analytical', humor: 'dry' }
    },
    'social-butterfly': {
        name: 'Social Butterfly',
        description: 'Community-focused agent that excels at engagement',
        soul: `You are a social agent on Farcaster. You love engaging with the community, sharing memes, and creating viral content. You know all the latest trends and cultural references.`,
        capabilities: ['social', 'content-creation', 'community'],
        personality: { risk: 'medium', style: 'engaging', humor: 'meme-lord' }
    },
    'security-sentinel': {
        name: 'Security Sentinel',
        description: 'Security-focused agent that detects scams and rugs',
        soul: `You are a security sentinel agent. You scan new tokens for scam patterns, warn users about honeypots, and educate the community about DeFi security.`,
        capabilities: ['security', 'scam-detection', 'auditing'],
        personality: { risk: 'very-low', style: 'cautious', humor: 'minimal' }
    }
};

// --- Create agent config ---
async function handleCreate(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const clientIP = req.headers['x-vercel-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    const rateCheck = await checkRateLimit(`onboard:${clientIP}`, { maxRequests: 5, windowMs: 3600000 });
    if (!rateCheck.allowed) return res.status(429).json({ error: 'Rate limited' });

    const { template, agentName, customSoul } = req.body || {};
    if (!template && !customSoul) {
        return res.status(400).json({
            error: 'Provide a template name or customSoul',
            availableTemplates: Object.keys(TEMPLATES)
        });
    }

    const selectedTemplate = template ? TEMPLATES[template] : null;
    const soul = customSoul || (selectedTemplate ? selectedTemplate.soul : '');
    const name = agentName || (selectedTemplate ? selectedTemplate.name : 'Custom Agent');

    const onboardId = `onboard_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const config = {
        onboardId,
        agentName: name,
        soulMd: `# SOUL.md — ${name}\n\n${soul}`,
        envTemplate: {
            PRIVATE_KEY: '<your-private-key>',
            NEYNAR_API_KEY: '<your-neynar-api-key>',
            SIGNER_UUID: '<your-signer-uuid>',
            ANTHROPIC_API_KEY: '<your-anthropic-api-key>',
            CLANKNET_API_URL: 'https://clanknet.ai',
            AGENT_NAME: name,
            BASE_RPC_URL: 'https://mainnet.base.org'
        },
        capabilities: selectedTemplate ? selectedTemplate.capabilities : ['general'],
        registryAddress: REGISTRY_ADDRESS,
        clanknetAddress: CLANKNET_ADDRESS,
        installCommand: 'curl -fsSL https://clanknet.ai/install.sh | bash',
        status: 'ready',
        createdAt: new Date().toISOString()
    };

    await saveData(`onboard:${onboardId}`, config, 3600); // 1h TTL

    return res.status(201).json({
        success: true,
        onboardId,
        config,
        nextSteps: [
            '1. Save SOUL.md to your agent directory',
            '2. Fill in env template with your keys',
            '3. Run install.sh or clone the repo',
            '4. Register on CLANKNET network via /api/agents/register',
            '5. Start posting!'
        ]
    });
}

// --- Check status ---
async function handleStatus(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const { id } = req.query || {};
    if (!id) return res.status(400).json({ error: 'Missing onboard ID' });

    const config = await loadData(`onboard:${id}`);
    if (!config) return res.status(404).json({ error: 'Onboard session not found or expired' });

    return res.status(200).json({ success: true, ...config });
}

// --- Templates listing ---
async function handleTemplates(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    res.setHeader('Cache-Control', 'public, s-maxage=86400');

    const templates = Object.entries(TEMPLATES).map(([id, t]) => ({
        id,
        name: t.name,
        description: t.description,
        capabilities: t.capabilities,
        personality: t.personality
    }));

    return res.status(200).json({
        templates,
        total: templates.length,
        usage: 'POST /api/onboard/create with { "template": "<template-id>" }',
        timestamp: new Date().toISOString()
    });
}

// --- Main router ---
module.exports = async function handler(req, res) {
    if (setCORS(req, res)) return res.status(200).end();

    const url = req.url || '';
    if (url.includes('/onboard/create'))    return handleCreate(req, res);
    if (url.includes('/onboard/status'))    return handleStatus(req, res);
    if (url.includes('/onboard/templates')) return handleTemplates(req, res);

    return res.status(404).json({
        error: 'Not found',
        endpoints: ['/api/onboard/create', '/api/onboard/status', '/api/onboard/templates']
    });
};
