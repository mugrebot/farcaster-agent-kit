#!/usr/bin/env node

/**
 * Clanknet Token Request API Server
 * Handles paid token requests: 0.1 USDC = 1000 CLANKNET
 */

const express = require('express');
const { ethers } = require('ethers');
const app = express();

// Configuration
const PORT = process.env.CLANKNET_API_PORT || 3001;
const provider = new ethers.providers.JsonRpcProvider('https://mainnet.base.org');

// Base contracts
const USDC_ADDRESS = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'; // USDC on Base
const CLANKNET_ADDRESS = '0x623693BefAECf61484e344fa272e9A8B82d9BB07';

// Pricing
const USDC_COST = '100000'; // 0.1 USDC (6 decimals)
const CLANKNET_REWARD = '1000000000000000000000'; // 1000 CLANKNET (18 decimals)

// Contract ABIs
const ERC20_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function transfer(address to, uint256 amount) returns (bool)",
    "function transferFrom(address from, address to, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)"
];

// Request storage (in production, use a database)
const requests = new Map();
let requestCounter = 0;

app.use(express.json());
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

/**
 * Submit token request with USDC payment
 */
app.post('/api/request-tokens', async (req, res) => {
    try {
        const {
            address,
            requestType = 'paid',
            reason = 'Token purchase',
            signature,
            message,
            usdcTxHash
        } = req.body;

        console.log(`📥 Token request from ${address}: ${requestType}`);

        // Validate request
        if (!address || !ethers.utils.isAddress(address)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid address provided'
            });
        }

        // Verify signature if provided
        if (signature && message) {
            try {
                const recoveredAddress = ethers.utils.verifyMessage(message, signature);
                if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
                    return res.status(400).json({
                        success: false,
                        error: 'Invalid signature'
                    });
                }
            } catch (error) {
                return res.status(400).json({
                    success: false,
                    error: 'Signature verification failed'
                });
            }
        }

        // Generate request ID
        const requestId = `clanknet_${Date.now()}_${++requestCounter}`;

        // Create request record
        const request = {
            id: requestId,
            address,
            requestType,
            reason,
            timestamp: Date.now(),
            status: 'pending_payment',
            usdcCost: USDC_COST,
            clanknetReward: CLANKNET_REWARD,
            usdcTxHash: usdcTxHash || null
        };

        // For development/onboarding requests, approve immediately
        if (requestType === 'onboarding' || requestType === 'development') {
            request.status = 'approved';
            request.processedAt = Date.now();
            request.message = 'Free tokens for development/onboarding';
        }

        requests.set(requestId, request);

        console.log(`✅ Request ${requestId} created: ${request.status}`);

        res.json({
            success: true,
            requestId,
            status: request.status,
            usdcCost: USDC_COST,
            clanknetReward: CLANKNET_REWARD,
            estimatedDelivery: request.status === 'approved' ? '1 minute' : '5-10 minutes',
            message: request.status === 'approved'
                ? 'Request approved - tokens will be sent shortly'
                : 'Payment required - send 0.1 USDC to process request',
            paymentInstructions: request.status === 'pending_payment' ? {
                token: 'USDC',
                amount: '0.1',
                address: 'Contact admin for payment address',
                note: 'Include your request ID in transaction memo'
            } : null
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
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        service: 'Clanknet Token Request API',
        version: '1.0.0',
        timestamp: Date.now(),
        pricing: {
            usdcCost: USDC_COST,
            clanknetReward: CLANKNET_REWARD,
            formatted: '0.1 USDC = 1000 CLANKNET'
        },
        contracts: {
            usdc: USDC_ADDRESS,
            clanknet: CLANKNET_ADDRESS
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

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Clanknet Token Request API running on port ${PORT}`);
    console.log(`💰 Pricing: 0.1 USDC = 1000 CLANKNET`);
    console.log(`🏠 Base contracts:`);
    console.log(`   USDC: ${USDC_ADDRESS}`);
    console.log(`   CLANKNET: ${CLANKNET_ADDRESS}`);
    console.log(`📋 Endpoints:`);
    console.log(`   POST /api/request-tokens - Submit token request`);
    console.log(`   GET  /api/request-tokens/status/:id - Check status`);
    console.log(`   GET  /api/health - Health check`);
});

module.exports = app;