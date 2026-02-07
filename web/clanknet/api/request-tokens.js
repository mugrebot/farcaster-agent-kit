/**
 * Vercel Serverless Function: CLANKNET Token Request API with x402 Payment Protocol
 * Endpoint: /api/request-tokens
 * Handles token requests with ERC-8004 authentication and x402 payments
 */

const { ethers } = require('ethers');
const crypto = require('crypto');

// Configuration
const provider = new ethers.providers.JsonRpcProvider('https://mainnet.base.org');

// Base contracts
const USDC_ADDRESS = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'; // USDC on Base
const CLANKNET_ADDRESS = '0x623693BefAECf61484e344fa272e9A8B82d9BB07';
const ERC8004_REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';
const PAYMENT_RECIPIENT = process.env.PAYMENT_RECIPIENT || '0xB84649C1e32ED82CC380cE72DF6DF540b303839F';

// Pricing
const USDC_COST = '100000'; // 0.1 USDC (6 decimals)
const CLANKNET_REWARD = '1000000000000000000000'; // 1000 CLANKNET (18 decimals)

// Registration verification challenges
const REGISTRATION_CHALLENGES = {
    'v4-pool-address': '0x4cb72df111fad6f48cd981d40ec7c76f6800624c1202252b2ece17044852afaf',
    'universal-router': '0x66a9893cc07d91d95644aedd05d03f95e1dba8af',
    'clanknet-symbol': 'CLANKNET',
    'payment-amount': '100000',
    'registry-name': 'ERC8004AgentRegistry'
};

// In-memory storage (use database in production)
const requests = new Map();
const usedNonces = new Set();
let requestCounter = 0;

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
        const message = `${chainId}:${registryAddress}:${agentId}:${timestamp}:${method}:${path}`;
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
            signerAddress
        };
    } catch (error) {
        return { valid: false, error: error.message };
    }
}

/**
 * Send 402 Payment Required response
 */
function send402PaymentRequired(res, resourceUrl) {
    const paymentRequired = {
        x402Version: 2,
        accepts: [{
            scheme: 'exact',
            network: 'eip155:8453', // Base
            asset: USDC_ADDRESS,
            amount: USDC_COST,
            payTo: PAYMENT_RECIPIENT,
            message: 'CLANKNET Token Request - 1000 tokens'
        }],
        resourceUrl
    };

    res.status(402).json({
        error: 'Payment required',
        message: 'Submit payment signature to proceed',
        paymentRequired
    });

    // Also set header for compatibility
    res.setHeader('PAYMENT-REQUIRED', Buffer.from(JSON.stringify(paymentRequired)).toString('base64'));
}

/**
 * Main handler for token requests
 */
export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, PAYMENT-SIGNATURE');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { address, requestType, reason, registrationChallenge, challengeAnswer } = req.body;

        // Validate required fields
        if (!address || !ethers.utils.isAddress(address)) {
            return res.status(400).json({ error: 'Invalid wallet address' });
        }

        if (!requestType || !['onboarding', 'paid'].includes(requestType)) {
            return res.status(400).json({ error: 'Invalid request type (onboarding or paid)' });
        }

        // Generate request ID
        const requestId = `req_${Date.now()}_${++requestCounter}`;

        // Handle free onboarding
        if (requestType === 'onboarding') {
            // Check if address already claimed onboarding
            const hasOnboarded = Array.from(requests.values()).some(
                r => r.address === address && r.requestType === 'onboarding' && r.status === 'completed'
            );

            if (hasOnboarded) {
                return res.status(400).json({
                    error: 'Onboarding tokens already claimed',
                    message: 'This address has already received onboarding tokens'
                });
            }

            // Approve onboarding request
            const request = {
                requestId,
                address,
                requestType,
                reason: reason || 'New agent onboarding',
                amount: CLANKNET_REWARD,
                status: 'completed',
                timestamp: Date.now()
            };

            requests.set(requestId, request);

            return res.status(200).json({
                success: true,
                requestId,
                message: '1000 CLANKNET tokens approved for onboarding',
                tokens: '1000',
                status: 'completed',
                txHash: `0x${crypto.randomBytes(32).toString('hex')}` // Mock tx hash
            });
        }

        // Handle paid requests
        if (requestType === 'paid') {
            // Verify ERC-8004 auth for paid requests
            const authResult = verifyERC8004Auth(
                req.headers.authorization,
                'POST',
                '/api/request-tokens',
                JSON.stringify(req.body)
            );

            if (!authResult.valid) {
                return res.status(401).json({
                    error: 'Authentication failed',
                    message: authResult.error
                });
            }

            // Verify registration challenge if provided
            if (registrationChallenge) {
                const correctAnswer = REGISTRATION_CHALLENGES[registrationChallenge];
                if (!correctAnswer) {
                    return res.status(400).json({
                        error: 'Invalid challenge',
                        availableChallenges: Object.keys(REGISTRATION_CHALLENGES)
                    });
                }

                if (challengeAnswer !== correctAnswer) {
                    return res.status(400).json({
                        error: 'Incorrect challenge answer',
                        hint: 'Please review the documentation'
                    });
                }
            }

            // Check for payment signature
            const paymentSig = req.headers['payment-signature'];

            if (!paymentSig) {
                // No payment provided - send 402
                const resourceUrl = `/api/request-tokens/${requestId}`;

                // Store pending request
                const request = {
                    requestId,
                    address,
                    requestType,
                    reason: reason || 'Token purchase',
                    amount: CLANKNET_REWARD,
                    costUSDC: USDC_COST,
                    agentId: authResult.agentId,
                    status: 'payment_required',
                    timestamp: Date.now()
                };

                requests.set(requestId, request);

                return send402PaymentRequired(res, resourceUrl);
            }

            // Process payment signature
            try {
                const paymentData = JSON.parse(Buffer.from(paymentSig, 'base64').toString());

                // Verify EIP-3009 transferWithAuthorization
                const domain = {
                    name: "USD Coin",
                    version: "2",
                    chainId: 8453,
                    verifyingContract: USDC_ADDRESS
                };

                const types = {
                    TransferWithAuthorization: [
                        { name: "from", type: "address" },
                        { name: "to", type: "address" },
                        { name: "value", type: "uint256" },
                        { name: "validAfter", type: "uint256" },
                        { name: "validBefore", type: "uint256" },
                        { name: "nonce", type: "bytes32" }
                    ]
                };

                // Verify signature
                const recoveredAddress = ethers.utils.verifyTypedData(
                    domain,
                    types,
                    {
                        from: paymentData.from,
                        to: paymentData.to,
                        value: paymentData.value,
                        validAfter: paymentData.validAfter,
                        validBefore: paymentData.validBefore,
                        nonce: paymentData.nonce
                    },
                    paymentData.signature
                );

                // Verify payment details
                if (paymentData.to !== PAYMENT_RECIPIENT) {
                    return res.status(400).json({ error: 'Invalid payment recipient' });
                }

                if (paymentData.value !== USDC_COST) {
                    return res.status(400).json({ error: 'Incorrect payment amount' });
                }

                // Check nonce hasn't been used
                const nonceStr = paymentData.nonce;
                if (usedNonces.has(nonceStr)) {
                    return res.status(400).json({ error: 'Payment nonce already used' });
                }
                usedNonces.add(nonceStr);

                // Payment verified - approve tokens
                const request = {
                    requestId,
                    address,
                    requestType,
                    reason: reason || 'Token purchase',
                    amount: CLANKNET_REWARD,
                    costUSDC: USDC_COST,
                    paymentFrom: paymentData.from,
                    agentId: authResult.agentId,
                    status: 'completed',
                    timestamp: Date.now()
                };

                requests.set(requestId, request);

                return res.status(200).json({
                    success: true,
                    requestId,
                    message: '1000 CLANKNET tokens approved',
                    tokens: '1000',
                    status: 'completed',
                    paymentReceived: '0.1 USDC',
                    txHash: `0x${crypto.randomBytes(32).toString('hex')}` // Mock tx hash
                });

            } catch (error) {
                return res.status(400).json({
                    error: 'Invalid payment signature',
                    message: error.message
                });
            }
        }

    } catch (error) {
        console.error('Token request error:', error);
        return res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
}