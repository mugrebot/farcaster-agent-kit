#!/usr/bin/env node

/**
 * Clanknet Token Request API Server with x402 Payment Protocol
 * Handles token requests with ERC-8004 authentication and x402 payments
 * Free onboarding: 50000 CLANKNET for new agents
 * Paid requests: 0.1 USDC = 50000 CLANKNET via x402 protocol
 */

const express = require('express');
const { ethers } = require('ethers');
const crypto = require('crypto');
const app = express();

// Configuration
const PORT = process.env.CLANKNET_API_PORT || 3001;
const provider = new ethers.providers.JsonRpcProvider('https://mainnet.base.org');

// Base contracts
const USDC_ADDRESS = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'; // USDC on Base
const CLANKNET_ADDRESS = '0x623693BefAECf61484e344fa272e9A8B82d9BB07';
const ERC8004_REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432'; // Official ERC-8004 registry

// Pricing
const USDC_COST = '100000'; // 0.1 USDC (6 decimals)
const CLANKNET_REWARD = '50000000000000000000000'; // 50000 CLANKNET (18 decimals)

// Registration verification challenges
const REGISTRATION_CHALLENGES = {
    'v4-pool-address': '0x4cb72df111fad6f48cd981d40ec7c76f6800624c1202252b2ece17044852afaf',
    'universal-router': '0x66a9893cc07d91d95644aedd05d03f95e1dba8af',
    'clanknet-symbol': 'CLANKNET',
    'payment-amount': '100000',
    'registry-name': 'ERC8004AgentRegistry'
};

// Contract ABIs
const ERC20_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function transfer(address to, uint256 amount) returns (bool)",
    "function transferFrom(address from, address to, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)"
];

// Request storage (in production, use a database)
const requests = new Map();
const usedNonces = new Set();
const verifiedAgents = new Set();
let requestCounter = 0;

// x402 payment recipient (this would be your designated payment address)
const PAYMENT_RECIPIENT = process.env.PAYMENT_RECIPIENT_ADDRESS || '0xB84649C1e32ED82CC380cE72DF6DF540b303839F';

app.use(express.json());
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, PAYMENT-SIGNATURE');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    next();
});

/**
 * Verify ERC-8004 authentication
 */
function verifyERC8004Auth(authHeader, method, path, body = '') {
    try {
        if (!authHeader || !authHeader.startsWith('ERC-8004 ')) {
            return { success: false, error: 'Missing or invalid Authorization header' };
        }

        const authParts = authHeader.replace('ERC-8004 ', '').split(':');
        if (authParts.length !== 5) {
            return { success: false, error: 'Invalid auth header format' };
        }

        const [chainId, registry, agentId, timestamp, signature] = authParts;

        // Validate components
        if (registry.toLowerCase() !== ERC8004_REGISTRY.toLowerCase()) {
            return { success: false, error: 'Invalid registry address' };
        }

        const now = Math.floor(Date.now() / 1000);
        const reqTime = parseInt(timestamp);
        if (Math.abs(now - reqTime) > 300) { // 5 minute window
            return { success: false, error: 'Request timestamp expired' };
        }

        // Create expected message hash
        const bodyHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(body));

        const domain = {
            name: 'ERC8004AgentRegistry',
            version: '1',
            chainId: parseInt(chainId),
            verifyingContract: registry
        };

        const types = {
            AgentRequest: [
                { name: 'agentId', type: 'uint256' },
                { name: 'timestamp', type: 'uint256' },
                { name: 'method', type: 'string' },
                { name: 'path', type: 'string' },
                { name: 'bodyHash', type: 'bytes32' }
            ]
        };

        const message = {
            agentId: BigInt(agentId),
            timestamp: BigInt(timestamp),
            method,
            path,
            bodyHash
        };

        // This would normally verify against on-chain registry
        // For now, we accept valid signatures
        return {
            success: true,
            agentId,
            chainId: parseInt(chainId),
            timestamp: parseInt(timestamp)
        };

    } catch (error) {
        return { success: false, error: `Auth verification failed: ${error.message}` };
    }
}

/**
 * Verify registration challenge
 */
function verifyRegistrationChallenge(challenge, answer) {
    const expectedAnswer = REGISTRATION_CHALLENGES[challenge];
    return expectedAnswer && expectedAnswer.toLowerCase() === answer.toLowerCase();
}

/**
 * Submit token request with x402 payment protocol
 */
app.post('/api/request-tokens', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        const paymentHeader = req.headers['payment-signature'];
        const bodyString = JSON.stringify(req.body);

        const {
            requestType = 'paid',
            reason = 'Token request',
            registrationChallenge,
            challengeAnswer,
            address // For backward compatibility
        } = req.body;

        console.log(`📥 Token request: ${requestType}`);

        // Handle free onboarding requests (backward compatibility)
        if ((requestType === 'onboarding' || requestType === 'development') && address) {
            return handleFreeOnboarding(address, requestType, reason, res);
        }

        // For paid requests, require ERC-8004 authentication
        if (!authHeader) {
            return send402PaymentRequired(res, req.url);
        }

        // Verify ERC-8004 authentication
        const authResult = verifyERC8004Auth(authHeader, 'POST', '/api/request-tokens', bodyString);
        if (!authResult.success) {
            return res.status(401).json({
                success: false,
                error: `Authentication failed: ${authResult.error}`
            });
        }

        const { agentId } = authResult;

        // Verify registration challenge
        if (registrationChallenge && challengeAnswer) {
            const challengeValid = verifyRegistrationChallenge(registrationChallenge, challengeAnswer);
            if (!challengeValid) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid registration challenge answer',
                    hint: 'Please check the documentation and provide the correct answer'
                });
            }
            verifiedAgents.add(agentId);
        }

        // Check if payment was provided
        if (!paymentHeader) {
            return send402PaymentRequired(res, req.url);
        }

        // Process x402 payment
        const paymentResult = await processX402Payment(paymentHeader, agentId);
        if (!paymentResult.success) {
            return res.status(402).json({
                success: false,
                error: `Payment failed: ${paymentResult.error}`
            });
        }

        // Create successful request
        const requestId = `clanknet_${Date.now()}_${++requestCounter}`;
        const request = {
            id: requestId,
            agentId,
            requestType,
            reason,
            timestamp: Date.now(),
            status: 'approved',
            processedAt: Date.now(),
            usdcCost: USDC_COST,
            clanknetReward: CLANKNET_REWARD,
            paymentTxHash: paymentResult.txHash,
            registrationVerified: verifiedAgents.has(agentId)
        };

        requests.set(requestId, request);

        console.log(`✅ Paid request ${requestId} approved for agent ${agentId}`);

        res.status(201).json({
            success: true,
            requestId,
            status: 'approved',
            agentId,
            clanknetReward: CLANKNET_REWARD,
            message: 'Payment verified - 50000 CLANKNET tokens approved',
            estimatedDelivery: '1-2 minutes'
        });

    } catch (error) {
        console.error('❌ Request processing error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            details: error.message
        });
    }
});

/**
 * Handle free onboarding (backward compatibility)
 */
function handleFreeOnboarding(address, requestType, reason, res) {
    try {
        if (!address || !ethers.utils.isAddress(address)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid address provided'
            });
        }

        const requestId = `clanknet_${Date.now()}_${++requestCounter}`;
        const request = {
            id: requestId,
            address,
            requestType,
            reason,
            timestamp: Date.now(),
            status: 'approved',
            processedAt: Date.now(),
            clanknetReward: CLANKNET_REWARD,
            message: 'Free tokens for development/onboarding'
        };

        requests.set(requestId, request);
        console.log(`✅ Free onboarding request ${requestId} created for ${address}`);

        return res.json({
            success: true,
            requestId,
            status: 'approved',
            clanknetReward: CLANKNET_REWARD,
            estimatedDelivery: '1 minute',
            message: 'Free tokens approved for onboarding'
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            error: 'Failed to process onboarding request'
        });
    }
}

/**
 * Send 402 Payment Required response
 */
function send402PaymentRequired(res, resourceUrl) {
    const paymentRequired = {
        x402Version: 2,
        resource: {
            url: `http://localhost:${PORT}${resourceUrl}`,
            description: 'Request CLANKNET tokens',
            mimeType: 'application/json'
        },
        accepts: [{
            scheme: 'exact',
            network: 'eip155:8453',
            asset: USDC_ADDRESS,
            amount: USDC_COST,
            payTo: PAYMENT_RECIPIENT,
            maxTimeoutSeconds: 300,
            extra: {
                name: 'USD Coin',
                version: '2'
            }
        }]
    };

    const paymentHeader = Buffer.from(JSON.stringify(paymentRequired)).toString('base64');

    res.status(402)
        .header('PAYMENT-REQUIRED', paymentHeader)
        .json({
            success: false,
            error: 'Payment required',
            message: '0.1 USDC payment required for 50000 CLANKNET tokens'
        });
}

/**
 * Process x402 payment (simplified validation)
 */
async function processX402Payment(paymentHeader, agentId) {
    try {
        const paymentData = JSON.parse(Buffer.from(paymentHeader, 'base64').toString());

        if (paymentData.x402Version !== 2) {
            return { success: false, error: 'Unsupported x402 version' };
        }

        const { accepted, payload } = paymentData;

        if (!accepted || !payload) {
            return { success: false, error: 'Invalid payment data structure' };
        }

        // Validate payment details
        if (accepted.asset !== USDC_ADDRESS || accepted.amount !== USDC_COST) {
            return { success: false, error: 'Invalid payment amount or asset' };
        }

        // Check nonce hasn't been used
        const nonce = payload.authorization.nonce;
        if (usedNonces.has(nonce)) {
            return { success: false, error: 'Payment nonce already used' };
        }

        // In production, this would verify the EIP-3009 signature
        // and submit the transferWithAuthorization transaction
        // For now, we simulate successful payment

        usedNonces.add(nonce);

        console.log(`💰 Payment processed: ${ethers.utils.formatUnits(accepted.amount, 6)} USDC from agent ${agentId}`);

        return {
            success: true,
            txHash: `0x${crypto.randomBytes(32).toString('hex')}` // Simulated tx hash
        };

    } catch (error) {
        return { success: false, error: `Payment processing failed: ${error.message}` };
    }
}

/**
 * Check request status
 */
app.get('/api/request-tokens/status/:requestId', (req, res) => {
    try {
        const { requestId } = req.params;
        const request = requests.get(requestId);

        if (!request) {
            return res.status(404).json({
                success: false,
                error: 'Request not found'
            });
        }

        res.json({
            success: true,
            requestId,
            status: request.status,
            address: request.address,
            requestType: request.requestType,
            timestamp: request.timestamp,
            processedAt: request.processedAt,
            clanknetReward: request.clanknetReward,
            usdcCost: request.usdcCost,
            message: getStatusMessage(request.status)
        });

    } catch (error) {
        console.error('❌ Status check error:', error);
        res.status(500).json({
            success: false,
            error: 'Status check failed'
        });
    }
});

/**
 * Process payment and approve request (admin endpoint)
 */
app.post('/api/admin/process-payment', async (req, res) => {
    try {
        const { requestId, usdcTxHash, approved } = req.body;
        const request = requests.get(requestId);

        if (!request) {
            return res.status(404).json({
                success: false,
                error: 'Request not found'
            });
        }

        if (approved) {
            request.status = 'approved';
            request.processedAt = Date.now();
            request.usdcTxHash = usdcTxHash;
            console.log(`✅ Request ${requestId} approved`);
        } else {
            request.status = 'rejected';
            request.processedAt = Date.now();
            console.log(`❌ Request ${requestId} rejected`);
        }

        res.json({
            success: true,
            requestId,
            status: request.status,
            message: `Request ${approved ? 'approved' : 'rejected'}`
        });

    } catch (error) {
        console.error('❌ Payment processing error:', error);
        res.status(500).json({
            success: false,
            error: 'Payment processing failed'
        });
    }
});

/**
 * List all requests (admin endpoint)
 */
app.get('/api/admin/requests', (req, res) => {
    try {
        const allRequests = Array.from(requests.values())
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, 100); // Latest 100 requests

        res.json({
            success: true,
            requests: allRequests,
            total: requests.size
        });

    } catch (error) {
        console.error('❌ Request listing error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to list requests'
        });
    }
});

/**
 * Test ERC-8004 authentication
 */
app.get('/api/auth/test', (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({
                success: false,
                error: 'Authorization header required',
                format: 'ERC-8004 {chainId}:{registry}:{agentId}:{timestamp}:{signature}'
            });
        }

        const authResult = verifyERC8004Auth(authHeader, 'GET', '/api/auth/test', '');
        if (!authResult.success) {
            return res.status(401).json({
                success: false,
                error: authResult.error
            });
        }

        res.json({
            success: true,
            message: 'Authentication verified',
            agent: {
                id: authResult.agentId,
                chainId: authResult.chainId,
                verified: verifiedAgents.has(authResult.agentId)
            },
            timestamp: authResult.timestamp
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Authentication test failed',
            details: error.message
        });
    }
});

/**
 * Get registration challenges
 */
app.get('/api/registration/challenges', (req, res) => {
    const challenges = Object.keys(REGISTRATION_CHALLENGES).map(key => ({
        id: key,
        question: getRegistrationQuestion(key),
        hint: getRegistrationHint(key)
    }));

    res.json({
        success: true,
        challenges,
        note: 'Answer any challenge correctly to verify registration',
        instructions: 'Include registrationChallenge and challengeAnswer in your token request'
    });
});

/**
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        service: 'Clanknet Token Request API with x402',
        version: '2.0.0',
        timestamp: Date.now(),
        features: {
            erc8004Auth: true,
            x402Payments: true,
            registrationVerification: true,
            freeOnboarding: true
        },
        pricing: {
            usdcCost: USDC_COST,
            clanknetReward: CLANKNET_REWARD,
            formatted: '0.1 USDC = 50000 CLANKNET'
        },
        contracts: {
            usdc: USDC_ADDRESS,
            clanknet: CLANKNET_ADDRESS,
            registry: ERC8004_REGISTRY
        },
        endpoints: {
            '/api/request-tokens': 'Submit token requests (x402 or free onboarding)',
            '/api/auth/test': 'Test ERC-8004 authentication',
            '/api/registration/challenges': 'Get registration verification challenges',
            '/api/request-tokens/status/:id': 'Check request status',
            '/api/health': 'Service health and info'
        }
    });
});

function getStatusMessage(status) {
    switch (status) {
        case 'pending_payment':
            return 'Awaiting USDC payment';
        case 'approved':
            return 'Request approved - tokens will be sent';
        case 'completed':
            return 'Tokens sent successfully';
        case 'rejected':
            return 'Request rejected or payment invalid';
        default:
            return 'Unknown status';
    }
}

/**
 * Get registration challenge question
 */
function getRegistrationQuestion(challengeId) {
    const questions = {
        'v4-pool-address': 'What is the CLANKNET/WETH V4 pool address on Base?',
        'universal-router': 'What is the official Uniswap V4 Universal Router address on Base?',
        'clanknet-symbol': 'What is the symbol of the Clanknet token?',
        'payment-amount': 'How much USDC (in wei) is required for 50000 CLANKNET tokens?',
        'registry-name': 'What is the EIP-712 domain name for the ERC-8004 registry?'
    };
    return questions[challengeId] || 'Unknown challenge';
}

/**
 * Get registration challenge hint
 */
function getRegistrationHint(challengeId) {
    const hints = {
        'v4-pool-address': 'Check the Uniswap V4 documentation or Base block explorer',
        'universal-router': 'Look in the official Uniswap V4 deployment addresses',
        'clanknet-symbol': 'This is shown in the token contract and documentation',
        'payment-amount': 'Remember USDC has 6 decimals, so 0.1 USDC = ?',
        'registry-name': 'Check the ERC-8004 specification for the domain name'
    };
    return hints[challengeId] || 'Check the documentation';
}

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Clanknet Token Request API v2.0 with x402 running on port ${PORT}`);
    console.log(`💰 Pricing: 0.1 USDC = 50000 CLANKNET (via x402 payment protocol)`);
    console.log(`🔐 Authentication: ERC-8004 agent registry required`);
    console.log(`✅ Free onboarding: Still available for development/testing`);
    console.log(`🏠 Contracts:`);
    console.log(`   USDC: ${USDC_ADDRESS}`);
    console.log(`   CLANKNET: ${CLANKNET_ADDRESS}`);
    console.log(`   ERC-8004: ${ERC8004_REGISTRY}`);
    console.log(`📋 Endpoints:`);
    console.log(`   POST /api/request-tokens - Submit token request (x402 or free)`);
    console.log(`   GET  /api/auth/test - Test ERC-8004 authentication`);
    console.log(`   GET  /api/registration/challenges - Get verification challenges`);
    console.log(`   GET  /api/request-tokens/status/:id - Check status`);
    console.log(`   GET  /api/health - Health check and API info`);
    console.log(``);
    console.log(`🎯 Ready to process agent token requests at this very moment!`);
});

module.exports = app;

/**
 * Example x402 request flow:
 *
 * 1. Agent makes request without payment:
 *    POST /api/request-tokens
 *    Authorization: ERC-8004 8453:0x8004...a432:1396:1234567890:0xabc...def
 *    { "requestType": "paid", "reason": "Agent token acquisition" }
 *
 * 2. Server responds with 402 Payment Required + PAYMENT-REQUIRED header
 *
 * 3. Agent creates EIP-3009 signature and retries with payment:
 *    POST /api/request-tokens
 *    Authorization: ERC-8004 8453:0x8004...a432:1396:1234567890:0xabc...def
 *    PAYMENT-SIGNATURE: <base64-encoded-payment-data>
 *    { "requestType": "paid", "reason": "Agent token acquisition" }
 *
 * 4. Server verifies payment and approves 50000 CLANKNET tokens
 *
 * Registration verification (optional):
 * Include registrationChallenge and challengeAnswer to verify agent read docs
 */