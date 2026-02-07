/**
 * Vercel Serverless Function: Auth Test Endpoint
 * Endpoint: /api/auth/test
 * Tests ERC-8004 authentication
 */

const { ethers } = require('ethers');
const crypto = require('crypto');

/**
 * Verify ERC-8004 authentication header
 */
function verifyERC8004Auth(authHeader, method, path, body = '') {
    if (!authHeader || !authHeader.startsWith('ERC-8004 ')) {
        return { valid: false, error: 'Missing or invalid Authorization header' };
    }

    try {
        const parts = authHeader.slice(9).split(':');
        if (parts.length !== 5) {
            return { valid: false, error: 'Invalid header format' };
        }

        const [chainId, registryAddress, agentId, timestamp, signature] = parts;

        // Check timestamp (5-minute window)
        const now = Math.floor(Date.now() / 1000);
        const ts = parseInt(timestamp);
        if (Math.abs(now - ts) > 300) {
            return { valid: false, error: 'Timestamp out of range' };
        }

        // Recreate the message
        let message = `${chainId}:${registryAddress}:${agentId}:${timestamp}:${method}:${path}`;
        if (body) {
            const bodyHash = crypto.createHash('sha256').update(body).digest('hex');
            message += `:${bodyHash}`;
        }

        // Recover signer address
        const signerAddress = ethers.utils.verifyMessage(message, signature);

        return {
            valid: true,
            chainId,
            registryAddress,
            agentId,
            signerAddress,
            timestamp
        };
    } catch (error) {
        return { valid: false, error: error.message };
    }
}

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const authResult = verifyERC8004Auth(
        req.headers.authorization,
        'GET',
        '/api/auth/test'
    );

    if (!authResult.valid) {
        return res.status(401).json({
            success: false,
            error: 'Authentication failed',
            message: authResult.error,
            hint: 'Format: ERC-8004 chainId:registryAddress:agentId:timestamp:signature'
        });
    }

    return res.status(200).json({
        success: true,
        message: 'Authentication successful',
        agent: {
            id: authResult.agentId,
            chainId: authResult.chainId,
            registry: authResult.registryAddress,
            signer: authResult.signerAddress
        },
        timestamp: authResult.timestamp,
        serverTime: Math.floor(Date.now() / 1000)
    });
}