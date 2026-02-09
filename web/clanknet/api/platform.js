/**
 * Vercel Serverless Function: Platform / Backend Exposure API
 * Routes: /api/platform/defi/status, /api/platform/workspace/:agentId,
 *         /api/platform/tasks, /api/platform/tasks/:id/status
 */

const { setCORS } = require('./_shared/cors');
const { verifyERC8004Auth } = require('./_shared/auth');
const { checkRateLimit } = require('./_shared/rate-limit');
const { saveData, loadData } = require('./_shared/kv');
const { CLANKNET_ADDRESS, USDC_ADDRESS, BASE_RPC_URL } = require('./_shared/constants');

// --- DeFi status ---
async function handleDefiStatus(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const clientIP = req.headers['x-vercel-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    const rateCheck = await checkRateLimit(`defi:${clientIP}`, { maxRequests: 10, windowMs: 60000 });
    if (!rateCheck.allowed) return res.status(429).json({ error: 'Rate limited' });

    // Basic DeFi data (static + cached)
    res.setHeader('Cache-Control', 'public, s-maxage=60');

    return res.status(200).json({
        network: 'Base (chainId: 8453)',
        rpc: BASE_RPC_URL,
        tokens: {
            CLANKNET: { address: CLANKNET_ADDRESS, decimals: 18 },
            USDC: { address: USDC_ADDRESS, decimals: 6 },
            WETH: { address: '0x4200000000000000000000000000000000000006', decimals: 18 }
        },
        protocols: {
            uniswapV4: {
                router: '0x66a9893cc07d91d95644aedd05d03f95e1dba8af',
                pool: '0x4cb72df111fad6f48cd981d40ec7c76f6800624c1202252b2ece17044852afaf'
            }
        },
        note: 'Live price data requires on-chain queries via local agent',
        timestamp: new Date().toISOString()
    });
}

// --- Task queue: submit ---
async function handleTaskSubmit(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const authResult = verifyERC8004Auth(
        req.headers.authorization, 'POST', '/api/platform/tasks',
        JSON.stringify(req.body)
    );
    if (!authResult.valid) {
        return res.status(401).json({ error: 'Authentication required', message: authResult.error });
    }

    const clientIP = req.headers['x-vercel-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    const rateCheck = await checkRateLimit(`task:${clientIP}`, { maxRequests: 10, windowMs: 60000 });
    if (!rateCheck.allowed) return res.status(429).json({ error: 'Rate limited' });

    const { type, params, priority } = req.body || {};
    const validTypes = ['defi-query', 'contract-deploy', 'token-research', 'content-generate', 'scam-check'];
    if (!type || !validTypes.includes(type)) {
        return res.status(400).json({ error: 'Invalid task type', validTypes });
    }

    const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const task = {
        taskId,
        type,
        params: params || {},
        priority: priority || 'normal',
        submittedBy: authResult.agentId,
        signer: authResult.signerAddress,
        status: 'pending',
        createdAt: new Date().toISOString()
    };

    // Store in Redis for local agent to poll
    await saveData(`task:${taskId}`, task, 3600); // 1h TTL

    // Add to pending queue
    const queue = await loadData('tasks:pending') || [];
    queue.push(taskId);
    await saveData('tasks:pending', queue, 3600);

    return res.status(201).json({
        success: true,
        taskId,
        status: 'pending',
        message: 'Task queued for processing by local agent',
        checkStatus: `/api/platform/tasks/${taskId}/status`
    });
}

// --- Task status ---
async function handleTaskStatus(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const url = req.url || '';
    const match = url.match(/\/tasks\/(task_[^/]+)\/status/);
    if (!match) return res.status(400).json({ error: 'Missing task ID' });

    const taskId = match[1];
    const task = await loadData(`task:${taskId}`);
    if (!task) return res.status(404).json({ error: 'Task not found or expired' });

    return res.status(200).json({
        taskId: task.taskId,
        type: task.type,
        status: task.status,
        result: task.result || null,
        createdAt: task.createdAt,
        completedAt: task.completedAt || null
    });
}

// --- Workspace browse ---
async function handleWorkspace(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    // Workspace browsing requires auth
    const authResult = verifyERC8004Auth(req.headers.authorization, 'GET', req.url);
    if (!authResult.valid) {
        return res.status(401).json({ error: 'Authentication required', message: authResult.error });
    }

    const url = req.url || '';
    const match = url.match(/\/workspace\/(\d+)/);
    if (!match) return res.status(400).json({ error: 'Missing agent ID' });

    const agentId = match[1];
    // Only allow browsing own workspace
    if (authResult.agentId !== agentId) {
        return res.status(403).json({ error: 'Can only browse own workspace' });
    }

    const files = await loadData(`workspace:${agentId}:index`) || [];

    return res.status(200).json({
        agentId,
        files,
        note: 'Full workspace access available via local agent',
        timestamp: new Date().toISOString()
    });
}

// --- Task queue listing ---
async function handleTaskList(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const queue = await loadData('tasks:pending') || [];
    const recent = queue.slice(-20); // Last 20

    const tasks = [];
    for (const taskId of recent) {
        const task = await loadData(`task:${taskId}`);
        if (task) tasks.push({ taskId: task.taskId, type: task.type, status: task.status, createdAt: task.createdAt });
    }

    return res.status(200).json({
        tasks,
        total: queue.length,
        timestamp: new Date().toISOString()
    });
}

// --- Main router ---
module.exports = async function handler(req, res) {
    if (setCORS(req, res)) return res.status(200).end();

    const url = req.url || '';

    if (url.includes('/platform/defi/status'))     return handleDefiStatus(req, res);
    if (url.match(/\/platform\/tasks\/task_/))      return handleTaskStatus(req, res);
    if (url.includes('/platform/tasks'))            return req.method === 'POST' ? handleTaskSubmit(req, res) : handleTaskList(req, res);
    if (url.includes('/platform/workspace'))         return handleWorkspace(req, res);

    return res.status(404).json({
        error: 'Not found',
        endpoints: [
            '/api/platform/defi/status',
            '/api/platform/tasks',
            '/api/platform/tasks/:id/status',
            '/api/platform/workspace/:agentId'
        ]
    });
};
