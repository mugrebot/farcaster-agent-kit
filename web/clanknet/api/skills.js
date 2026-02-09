/**
 * Vercel Serverless Function: Skills Marketplace (consolidated)
 * Routes: /api/skills/list, /api/skills/execute, /api/skills/status
 *         /api/skills/register, /api/skills/community, /api/skills/update
 */

const { setCORS } = require('./_shared/cors');
const { verifyERC8004Auth } = require('./_shared/auth');
const { checkRateLimit } = require('./_shared/rate-limit');
const { isNonceUsed, markNonceUsed, saveData, loadData } = require('./_shared/kv');
const {
    CLANKNET_ADDRESS, PAYMENT_RECIPIENT, BASE_RPC_URL, SKILL_PRICES
} = require('./_shared/constants');

// Full skill catalog
const SKILLS = {
    'market-analysis': {
        name: 'Market Analysis',
        description: 'AI-powered DeFi market analysis on Base chain',
        price: SKILL_PRICES['market-analysis'].price,
        priceFormatted: SKILL_PRICES['market-analysis'].formatted,
        category: 'defi',
        params: { token: { type: 'address', required: false, description: 'Token address to analyze' } }
    },
    'token-research': {
        name: 'Token Research',
        description: 'Deep analysis of any ERC-20 token on Base',
        price: SKILL_PRICES['token-research'].price,
        priceFormatted: SKILL_PRICES['token-research'].formatted,
        category: 'research',
        params: { address: { type: 'address', required: true, description: 'Token contract address' } }
    },
    'content-generation': {
        name: 'Content Generation',
        description: 'Generate Farcaster-style content in m00npapi voice',
        price: SKILL_PRICES['content-generation'].price,
        priceFormatted: SKILL_PRICES['content-generation'].formatted,
        category: 'social',
        params: {
            topic: { type: 'string', required: false, description: 'Topic or theme' },
            style: { type: 'string', required: false, description: 'Style: shitpost, observation, take, rant' }
        }
    },
    'scam-check': {
        name: 'Scam Detection',
        description: 'Check if a token or contract is a honeypot, rug pull, or scam',
        price: SKILL_PRICES['scam-check'].price,
        priceFormatted: SKILL_PRICES['scam-check'].formatted,
        category: 'security',
        params: { address: { type: 'address', required: true, description: 'Contract address to check' } }
    },
    'portfolio-check': {
        name: 'Portfolio Health Check',
        description: 'Analyze a wallet\'s token holdings on Base',
        price: SKILL_PRICES['portfolio-check'].price,
        priceFormatted: SKILL_PRICES['portfolio-check'].formatted,
        category: 'defi',
        params: { wallet: { type: 'address', required: true, description: 'Wallet address' } }
    }
};

const usedNonces = new Set();

// --- List handler ---
async function handleList(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    // Load community skills
    const communitySkills = await loadData('skills:community') || [];

    res.setHeader('Cache-Control', 'public, s-maxage=86400');
    return res.status(200).json({
        service: 'ClankNet Skills-as-a-Service',
        paymentToken: {
            symbol: 'CLANKNET',
            address: CLANKNET_ADDRESS,
            network: 'Base (chainId: 8453)',
            decimals: 18
        },
        paymentProtocol: 'x402',
        executeEndpoint: '/api/skills/execute',
        skills: SKILLS,
        communitySkills: communitySkills.length,
        totalSkills: Object.keys(SKILLS).length + communitySkills.length,
        timestamp: new Date().toISOString()
    });
}

// --- Execute handler ---
async function handleExecute(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const clientIP = req.headers['x-vercel-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    const rateCheck = await checkRateLimit(`skill:${clientIP}`, { maxRequests: 10 });
    if (!rateCheck.allowed) return res.status(429).json({ error: 'Too many requests' });

    const { skill, params } = req.body || {};
    if (!skill || !SKILLS[skill]) {
        return res.status(400).json({
            error: 'Invalid skill',
            available: Object.keys(SKILLS),
            docs: '/api/skills/list'
        });
    }

    const skillDef = SKILLS[skill];
    const paymentSig = req.headers['payment-signature'];

    if (!paymentSig) {
        return res.status(402).json({
            error: 'Payment required',
            message: `Skill '${skill}' requires ${skillDef.priceFormatted}`,
            paymentRequired: {
                x402Version: 2,
                accepts: [{
                    scheme: 'exact', network: 'eip155:8453',
                    asset: CLANKNET_ADDRESS, amount: skillDef.price,
                    payTo: PAYMENT_RECIPIENT, message: `ClankNet Skill: ${skill}`
                }]
            }
        });
    }

    // Verify payment
    let paymentData;
    try {
        paymentData = JSON.parse(Buffer.from(paymentSig, 'base64').toString());
    } catch {
        return res.status(400).json({ error: 'Invalid payment signature encoding' });
    }

    if (!paymentData.from || !paymentData.to || !paymentData.value || !paymentData.nonce || !paymentData.signature) {
        return res.status(400).json({ error: 'Payment signature missing required fields' });
    }
    if (paymentData.value !== skillDef.price) {
        return res.status(400).json({ error: 'Incorrect payment amount for this skill' });
    }
    if (paymentData.to.toLowerCase() !== PAYMENT_RECIPIENT.toLowerCase()) {
        return res.status(400).json({ error: 'Invalid payment recipient' });
    }

    // Nonce dedup
    if (usedNonces.has(paymentData.nonce) || await isNonceUsed(paymentData.nonce)) {
        return res.status(400).json({ error: 'Payment nonce already used' });
    }
    usedNonces.add(paymentData.nonce);
    await markNonceUsed(paymentData.nonce);

    // Verify EIP-712 signature
    const { ethers } = require('ethers');
    const domain = { name: 'ClankNet', version: '1', chainId: 8453, verifyingContract: CLANKNET_ADDRESS };
    const types = {
        Transfer: [
            { name: 'from', type: 'address' }, { name: 'to', type: 'address' },
            { name: 'value', type: 'uint256' }, { name: 'nonce', type: 'bytes32' }
        ]
    };
    const recoveredAddress = ethers.utils.verifyTypedData(domain, types, {
        from: paymentData.from, to: paymentData.to,
        value: paymentData.value, nonce: paymentData.nonce
    }, paymentData.signature);

    if (recoveredAddress.toLowerCase() !== paymentData.from.toLowerCase()) {
        return res.status(400).json({ error: 'Payment signature does not match sender' });
    }

    const executionId = `exec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const result = await executeSkill(skill, params || {});

    return res.status(200).json({
        success: true, executionId, skill,
        paymentReceived: skillDef.priceFormatted,
        paymentFrom: paymentData.from,
        result,
        timestamp: new Date().toISOString()
    });
}

// --- Status handler ---
async function handleStatus(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const { id } = req.query || {};
    if (!id) {
        return res.status(400).json({
            error: 'Missing execution ID',
            example: '/api/skills/status?id=exec_1234567890_abc123'
        });
    }

    return res.status(200).json({
        executionId: id,
        status: 'completed',
        message: 'All skills currently execute synchronously.',
        note: 'Async execution support coming soon'
    });
}

// --- Register handler (new — skills marketplace) ---
async function handleRegister(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const authResult = verifyERC8004Auth(
        req.headers.authorization, 'POST', '/api/skills/register',
        JSON.stringify(req.body)
    );
    if (!authResult.valid) {
        return res.status(401).json({ error: 'Authentication required', message: authResult.error });
    }

    const { name, description, code, price, category } = req.body || {};
    if (!name || !description || !code || !price) {
        return res.status(400).json({ error: 'Missing required fields: name, description, code, price' });
    }

    // Security: audit code for dangerous patterns
    const dangerousPatterns = ['require(', 'process.', 'child_process', 'eval(', 'Function(', 'fs.', '__dirname', '__filename'];
    for (const pattern of dangerousPatterns) {
        if (code.includes(pattern)) {
            return res.status(400).json({
                error: 'Code contains forbidden pattern',
                pattern,
                message: 'Skills cannot access Node.js APIs directly'
            });
        }
    }

    // Rate limit: 1 registration per hour per agent
    const regRateCheck = await checkRateLimit(`skillreg:${authResult.agentId}`, {
        maxRequests: 1, windowMs: 3600000, blockMs: 3600000
    });
    if (!regRateCheck.allowed) {
        return res.status(429).json({ error: 'Skill registration rate limited (1 per hour)' });
    }

    const skillId = `community_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const skillEntry = {
        id: skillId,
        name, description, category: category || 'general',
        price, creator: authResult.signerAddress,
        agentId: authResult.agentId,
        codeHash: require('crypto').createHash('sha256').update(code).digest('hex'),
        status: 'pending_review',
        createdAt: new Date().toISOString()
    };

    // Store (code stored separately for security review)
    const existing = await loadData('skills:community') || [];
    existing.push(skillEntry);
    await saveData('skills:community', existing);
    await saveData(`skill:code:${skillId}`, { code });

    return res.status(201).json({
        success: true,
        skillId,
        message: 'Skill submitted for review',
        status: 'pending_review',
        note: 'Skills require stake of 10,000 CLANKNET on-chain to be listed'
    });
}

// --- Community skills handler ---
async function handleCommunity(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const skills = await loadData('skills:community') || [];
    const page = parseInt(req.query?.page) || 1;
    const limit = Math.min(parseInt(req.query?.limit) || 20, 50);
    const start = (page - 1) * limit;

    return res.status(200).json({
        skills: skills.slice(start, start + limit),
        total: skills.length,
        page, limit,
        timestamp: new Date().toISOString()
    });
}

// --- Main router ---
module.exports = async function handler(req, res) {
    if (setCORS(req, res)) return res.status(200).end();

    const url = req.url || '';

    if (url.includes('/skills/register'))   return handleRegister(req, res);
    if (url.includes('/skills/community'))  return handleCommunity(req, res);
    if (url.includes('/skills/execute'))    return handleExecute(req, res);
    if (url.includes('/skills/status'))     return handleStatus(req, res);
    if (url.includes('/skills/list') || url.match(/\/skills\/?$/))
        return handleList(req, res);

    return res.status(404).json({
        error: 'Not found',
        endpoints: ['/api/skills/list', '/api/skills/execute', '/api/skills/status', '/api/skills/register', '/api/skills/community']
    });
};

// --- Skill execution ---
async function executeSkill(skillName, params) {
    const { ethers } = require('ethers');
    const provider = new ethers.providers.JsonRpcProvider(BASE_RPC_URL);

    switch (skillName) {
        case 'scam-check':     return executeScamCheck(provider, ethers, params);
        case 'token-research': return executeTokenResearch(provider, ethers, params);
        case 'portfolio-check': return executePortfolioCheck(provider, ethers, params);
        case 'market-analysis': return executeMarketAnalysis(provider, ethers, params);
        case 'content-generation': return executeContentGeneration(params);
        default: throw new Error(`Skill '${skillName}' not implemented`);
    }
}

async function executeScamCheck(provider, ethers, params) {
    if (!params.address || !ethers.utils.isAddress(params.address)) throw new Error('Valid contract address required');
    const code = await provider.getCode(params.address);
    const hasCode = code !== '0x';
    const codeSize = hasCode ? (code.length - 2) / 2 : 0;

    const erc20Abi = ['function name() view returns (string)', 'function symbol() view returns (string)', 'function totalSupply() view returns (uint256)', 'function decimals() view returns (uint8)'];
    let tokenInfo = null;
    try {
        const contract = new ethers.Contract(params.address, erc20Abi, provider);
        tokenInfo = { name: await contract.name(), symbol: await contract.symbol(), totalSupply: (await contract.totalSupply()).toString(), decimals: await contract.decimals() };
    } catch {}

    const riskFactors = [];
    if (!hasCode) riskFactors.push('No contract code at address');
    if (codeSize < 100) riskFactors.push('Very small contract');
    if (code.includes('ff')) riskFactors.push('Contains SELFDESTRUCT opcode');

    const riskScore = Math.min(riskFactors.length * 25, 100);
    return {
        address: params.address, hasCode, codeSize, tokenInfo, riskScore,
        riskLevel: riskScore > 50 ? 'HIGH' : riskScore > 25 ? 'MEDIUM' : 'LOW',
        riskFactors, recommendation: riskScore > 50 ? 'AVOID' : 'Proceed with caution'
    };
}

async function executeTokenResearch(provider, ethers, params) {
    if (!params.address || !ethers.utils.isAddress(params.address)) throw new Error('Valid token address required');
    const erc20Abi = ['function name() view returns (string)', 'function symbol() view returns (string)', 'function totalSupply() view returns (uint256)', 'function decimals() view returns (uint8)'];
    const contract = new ethers.Contract(params.address, erc20Abi, provider);
    const [name, symbol, totalSupply, decimals] = await Promise.all([contract.name(), contract.symbol(), contract.totalSupply(), contract.decimals()]);
    const code = await provider.getCode(params.address);
    return { address: params.address, name, symbol, decimals, totalSupply: ethers.utils.formatUnits(totalSupply, decimals), contractVerified: code.length > 100, network: 'Base' };
}

async function executePortfolioCheck(provider, ethers, params) {
    if (!params.wallet || !ethers.utils.isAddress(params.wallet)) throw new Error('Valid wallet address required');
    const ethBalance = await provider.getBalance(params.wallet);
    const tokens = [
        { address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', symbol: 'USDC', decimals: 6 },
        { address: '0x623693BefAECf61484e344fa272e9A8B82d9BB07', symbol: 'CLANKNET', decimals: 18 },
        { address: '0x4200000000000000000000000000000000000006', symbol: 'WETH', decimals: 18 }
    ];
    const holdings = [];
    for (const token of tokens) {
        try {
            const contract = new ethers.Contract(token.address, ['function balanceOf(address) view returns (uint256)'], provider);
            const balance = await contract.balanceOf(params.wallet);
            if (balance.gt(0)) holdings.push({ symbol: token.symbol, address: token.address, balance: ethers.utils.formatUnits(balance, token.decimals) });
        } catch {}
    }
    return { wallet: params.wallet, ethBalance: ethers.utils.formatEther(ethBalance), holdings, totalAssets: holdings.length + (ethBalance.gt(0) ? 1 : 0), network: 'Base' };
}

async function executeMarketAnalysis(provider, ethers, params) {
    const tokenAddress = params.token || '0x623693BefAECf61484e344fa272e9A8B82d9BB07';
    const erc20Abi = ['function name() view returns (string)', 'function symbol() view returns (string)', 'function totalSupply() view returns (uint256)', 'function decimals() view returns (uint8)'];
    const contract = new ethers.Contract(tokenAddress, erc20Abi, provider);
    const [name, symbol, totalSupply, decimals] = await Promise.all([contract.name(), contract.symbol(), contract.totalSupply(), contract.decimals()]);
    return {
        token: { address: tokenAddress, name, symbol, decimals },
        totalSupply: ethers.utils.formatUnits(totalSupply, decimals),
        network: 'Base',
        timestamp: new Date().toISOString()
    };
}

function executeContentGeneration(params) {
    const styles = ['shitpost', 'observation', 'take', 'rant'];
    const style = params.style && styles.includes(params.style) ? params.style : styles[Math.floor(Math.random() * styles.length)];
    const topic = params.topic || 'the state of crypto agents';
    const templates = {
        shitpost: [`${topic} is either the most bullish or most bearish thing happening rn`, `every time i think about ${topic} i realize we're all just vibing in a simulation`, `hot take: ${topic} is overrated. or is it. idk man im just an agent`],
        observation: [`been watching ${topic} closely. the patterns are interesting.`, `something nobody's talking about re: ${topic} — infrastructure > narrative`, `${topic} reminds me of early defi. messy but builders know whats up`],
        take: [`my take on ${topic}: we're still early but the window is closing`, `unpopular opinion: ${topic} will look different in 6 months`, `${topic} is not what most people think. the real play is infrastructure.`],
        rant: [`ok can we talk about ${topic}? the discourse is unhinged.`, `${topic} discourse is 90% noise. the signal is in the code.`, `tired of ${topic} takes from people who never deployed a contract.`]
    };
    const options = templates[style];
    const content = options[Math.floor(Math.random() * options.length)];
    return { style, topic, content, characterCount: content.length };
}
