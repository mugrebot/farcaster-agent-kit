/**
 * Vercel Serverless Function: Auth + Registration (consolidated)
 * Routes: /api/auth/test, /api/registration/challenges
 */

const { setCORS } = require('./_shared/cors');
const { verifyERC8004Auth } = require('./_shared/auth');
const { REGISTRATION_CHALLENGES } = require('./_shared/constants');

// --- Auth test handler ---
async function handleAuthTest(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const authResult = verifyERC8004Auth(req.headers.authorization, 'GET', '/api/auth/test');

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

// --- Registration challenges handler ---
async function handleChallenges(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const challenges = Object.entries(REGISTRATION_CHALLENGES).map(([id, challenge]) => ({
        id,
        question: challenge.question,
        hint: challenge.hint
    }));

    return res.status(200).json({
        challenges,
        instructions: 'Include a challengeId and challengeAnswer in your token request to prove you have read the documentation',
        example: {
            registrationChallenge: 'clanknet-symbol',
            challengeAnswer: 'CLANKNET'
        }
    });
}

// --- Main router ---
module.exports = async function handler(req, res) {
    if (setCORS(req, res, { isPublic: true })) return res.status(200).end();

    const url = req.url || '';
    if (url.includes('/auth/test'))               return handleAuthTest(req, res);
    if (url.includes('/registration/challenges'))  return handleChallenges(req, res);

    return res.status(404).json({
        error: 'Not found',
        endpoints: ['/api/auth/test', '/api/registration/challenges']
    });
};
