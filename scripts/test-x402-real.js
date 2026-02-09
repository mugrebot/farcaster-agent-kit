#!/usr/bin/env node

/**
 * Test REAL x402 Protocol with On-Chain USDC Transfers
 *
 * Requirements:
 * - Wallet with 0.1+ USDC on Base
 * - Agent registered on ERC-8004 (optional, can test without)
 * - Private key
 */

const { ethers } = require('ethers');
const axios = require('axios');
require('dotenv').config();

// IMPORTANT: Set your test private key here (with 0.1 USDC on Base)
const PRIVATE_KEY = process.env.TEST_PRIVATE_KEY || '0x...';

async function testX402() {
    console.log('🧪 Testing REAL x402 Protocol with On-Chain USDC Transfers\n');
    console.log('============================================\n');

    if (PRIVATE_KEY === '0x...') {
        console.log('❌ Please set TEST_PRIVATE_KEY in .env');
        console.log('   You need a wallet with 0.1 USDC on Base');
        return;
    }

    const wallet = new ethers.Wallet(PRIVATE_KEY);
    console.log('💰 Testing from wallet:', wallet.address);

    // Create ERC-8004 auth
    const timestamp = Math.floor(Date.now() / 1000);
    const message = `8453:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432:${wallet.address}:${timestamp}:POST:/api/request-tokens`;
    const signature = await wallet.signMessage(message);
    const authHeader = `ERC-8004 8453:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432:${wallet.address}:${timestamp}:${signature}`;

    console.log('🔐 Created ERC-8004 authentication\n');

    try {
        // Step 1: First request (will get 402)
        console.log('📤 Step 1: Sending initial request...');
        const response1 = await axios.post('https://clanknet.ai/api/request-tokens', {
            address: wallet.address,
            requestType: 'paid',
            challengeAnswer: 'CLANKNET'
        }, {
            headers: { 'Authorization': authHeader },
            validateStatus: () => true
        });

        if (response1.status === 402) {
            console.log('💳 Got 402 Payment Required - This is expected!\n');

            // Parse payment requirements
            const paymentRequired = JSON.parse(
                Buffer.from(response1.headers['payment-required'], 'base64').toString()
            );

            console.log('📋 Payment Requirements:');
            console.log('   - Amount: 0.1 USDC');
            console.log('   - Pay to:', paymentRequired.accepts[0].payTo);
            console.log('   - Network: Base (Chain ID 8453)\n');

            // Step 2: Create EIP-3009 payment signature
            console.log('✍️  Step 2: Creating payment signature...');
            const nonce = ethers.utils.hexlify(ethers.utils.randomBytes(32));
            const validBefore = Math.floor(Date.now() / 1000) + 3600;

            const domain = {
                name: "USD Coin",
                version: "2",
                chainId: 8453,
                verifyingContract: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
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

            const value = {
                from: wallet.address,
                to: paymentRequired.accepts[0].payTo,
                value: "100000", // 0.1 USDC
                validAfter: "0",
                validBefore: validBefore.toString(),
                nonce: nonce
            };

            const paymentSig = await wallet._signTypedData(domain, types, value);
            console.log('✅ Payment signature created\n');

            // Step 3: Retry with payment
            console.log('🚀 Step 3: Sending payment and requesting tokens...');
            const paymentData = {
                from: wallet.address,
                to: paymentRequired.accepts[0].payTo,
                value: "100000",
                validAfter: "0",
                validBefore: validBefore.toString(),
                nonce: nonce,
                signature: paymentSig
            };

            const paymentHeader = Buffer.from(JSON.stringify(paymentData)).toString('base64');

            const response2 = await axios.post('https://clanknet.ai/api/request-tokens', {
                address: wallet.address,
                requestType: 'paid',
                challengeAnswer: 'CLANKNET'
            }, {
                headers: {
                    'Authorization': authHeader,
                    'PAYMENT-SIGNATURE': paymentHeader
                }
            });

            console.log('\n🎉 SUCCESS! x402 Payment Executed On-Chain!');
            console.log('============================================\n');
            console.log('✅ Status:', response2.data.status);
            console.log('✅ Tokens approved:', response2.data.tokens, 'CLANKNET');
            console.log('✅ Payment:', response2.data.paymentReceived);
            console.log('✅ Transaction hash:', response2.data.txHash);
            console.log('✅ Block number:', response2.data.blockNumber);
            console.log('✅ View on Basescan:', response2.data.explorer);

            return response2.data;
        } else {
            console.log('Unexpected response:', response1.data);
        }

    } catch (error) {
        console.error('\n❌ Error:', error.response?.data || error.message);

        if (error.response?.status === 500 && error.response?.data?.message?.includes('EXECUTOR_PRIVATE_KEY')) {
            console.log('\n⚠️  NOTE: The server needs EXECUTOR_PRIVATE_KEY environment variable');
            console.log('   to execute on-chain transfers. Add it in Vercel dashboard.');
        }
    }
}

// Test free onboarding (no wallet needed)
async function testFreeOnboarding() {
    console.log('\n📦 Testing FREE Onboarding (no payment required)...\n');

    try {
        const response = await axios.post('https://clanknet.ai/api/request-tokens', {
            address: '0x' + '1234567890'.repeat(4), // Random address
            requestType: 'onboarding'
        }, {
            headers: { 'Content-Type': 'application/json' }
        });

        console.log('✅ FREE tokens received!');
        console.log('   Tokens:', response.data.tokens, 'CLANKNET');
        console.log('   Status:', response.data.status);
    } catch (error) {
        console.error('❌ Free onboarding error:', error.response?.data || error.message);
    }
}

// Run tests
async function main() {
    console.log('🚀 CLANKNET x402 Protocol Test Suite\n');

    // Test free onboarding first
    await testFreeOnboarding();

    console.log('\n---\n');

    // Test real x402 with payment
    await testX402();
}

main().catch(console.error);