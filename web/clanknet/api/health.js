/**
 * Vercel Serverless Function: Health Check
 * Endpoint: /api/health
 */

const { setCORS } = require('./_shared/cors');
const { CLANKNET_ADDRESS, USDC_ADDRESS, REGISTRY_ADDRESS } = require('./_shared/constants');

module.exports = async function handler(req, res) {
    if (setCORS(req, res, { isPublic: true })) return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    res.setHeader('Cache-Control', 'public, s-maxage=86400');

    return res.status(200).json({
        status: 'healthy',
        service: 'CLANKNET x402 Token Request API',
        version: '2.1.0',
        endpoints: {
            '/api/request-tokens': 'POST - Request CLANKNET tokens',
            '/api/skills/list': 'GET - List available skills',
            '/api/skills/execute': 'POST - Execute skill with payment',
            '/api/skills/status': 'GET - Check execution status',
            '/api/skills/register': 'POST - Register community skill',
            '/api/auth/test': 'GET - Test ERC-8004 auth',
            '/api/registration/challenges': 'GET - Registration challenges',
            '/api/health': 'GET - Health check',
            '/api/admin/(stats|post|config)': 'Admin endpoints',
            '/api/docs': 'GET - API documentation',
            '/api/examples': 'GET - Code examples',
            '/api/agents/directory': 'GET - Agent directory',
            '/api/onboard/templates': 'GET - Onboarding templates',
            '/api/platform/defi/status': 'GET - DeFi data'
        },
        pricing: { onboarding: 'FREE - 50000 CLANKNET', paid: '0.1 USDC = 50000 CLANKNET' },
        contracts: { CLANKNET: CLANKNET_ADDRESS, USDC: USDC_ADDRESS, ERC8004Registry: REGISTRY_ADDRESS },
        network: 'Base (chainId: 8453)',
        timestamp: new Date().toISOString()
    });
};
