/**
 * Vercel Serverless Function: Health Check Endpoint
 * Endpoint: /api/health
 * Health check for the x402 token request system
 */

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    return res.status(200).json({
        status: 'healthy',
        service: 'CLANKNET x402 Token Request API',
        version: '1.0.0',
        endpoints: {
            '/api/request-tokens': 'POST - Request CLANKNET tokens (free onboarding or x402 paid)',
            '/api/auth/test': 'GET - Test ERC-8004 authentication',
            '/api/registration/challenges': 'GET - Get registration challenges',
            '/api/health': 'GET - Health check (this endpoint)'
        },
        pricing: {
            onboarding: 'FREE - 1000 CLANKNET tokens',
            paid: '0.1 USDC = 1000 CLANKNET tokens'
        },
        contracts: {
            CLANKNET: '0x623693BefAECf61484e344fa272e9A8B82d9BB07',
            USDC: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
            ERC8004Registry: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
            V4UniversalRouter: '0x66a9893cc07d91d95644aedd05d03f95e1dba8af'
        },
        network: 'Base (chainId: 8453)',
        timestamp: new Date().toISOString()
    });
}