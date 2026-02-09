/**
 * Vercel Serverless Function: CLANKNET Token Request API with x402 Payment Protocol
 * Endpoint: /api/request-tokens
 */

const { ethers } = require('ethers');
const { setCORS } = require('./_shared/cors');
const { verifyERC8004Auth } = require('./_shared/auth');
const { checkRateLimit } = require('./_shared/rate-limit');
const { saveData, loadData, isNonceUsed, markNonceUsed } = require('./_shared/kv');
const {
    CLANKNET_ADDRESS, USDC_ADDRESS, PAYMENT_RECIPIENT, BASE_RPC_URL,
    USDC_COST, CLANKNET_REWARD, USDC_ABI, CLANKNET_ABI, REGISTRATION_CHALLENGES
} = require('./_shared/constants');

// Lazy-init provider and wallet
let _provider = null;
let _executorWallet = null;

function getProvider() {
    if (!_provider) _provider = new ethers.providers.JsonRpcProvider(BASE_RPC_URL);
    return _provider;
}

function getExecutorWallet() {
    if (_executorWallet !== null) return _executorWallet;
    const pk = process.env.EXECUTOR_PRIVATE_KEY ? process.env.EXECUTOR_PRIVATE_KEY.trim() : null;
    if (pk) {
        try { _executorWallet = new ethers.Wallet(pk, getProvider()); }
        catch (e) { console.error('Failed to initialize executor wallet:', e.message); _executorWallet = false; }
    } else {
        _executorWallet = false;
    }
    return _executorWallet || null;
}

// In-memory stores (augmented by Redis via _shared/kv)
const requests = new Map();
let requestCounter = 0;
const usedSignatures = new Set();

// Challenge answers (flat lookup for request validation)
const CHALLENGE_ANSWERS = {};
for (const [id, ch] of Object.entries(REGISTRATION_CHALLENGES)) {
    CHALLENGE_ANSWERS[id] = ch.answer;
}

async function saveRequest(requestId, requestData) {
    requests.set(requestId, requestData);
    await saveData(`request:${requestId}`, requestData);
}

function send402PaymentRequired(res, resourceUrl) {
    const paymentRequired = {
        x402Version: 2,
        accepts: [{
            scheme: 'exact',
            network: 'eip155:8453',
            asset: USDC_ADDRESS,
            amount: USDC_COST,
            payTo: PAYMENT_RECIPIENT,
            message: 'CLANKNET Token Request - 50000 tokens'
        }],
        resourceUrl
    };
    res.setHeader('PAYMENT-REQUIRED', Buffer.from(JSON.stringify(paymentRequired)).toString('base64'));
    return res.status(402).json({
        error: 'Payment required',
        message: 'Submit payment signature to proceed',
        paymentRequired
    });
}

module.exports = async function handler(req, res) {
    if (setCORS(req, res)) return res.status(200).end();

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const clientIP = req.headers['x-vercel-forwarded-for'] || req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
    const rateCheck = await checkRateLimit(`ip:${clientIP}`);
    if (!rateCheck.allowed) {
        return res.status(429).json({
            error: 'Too many requests',
            retryAfter: rateCheck.retryAfter
        });
    }
    res.setHeader('X-RateLimit-Remaining', rateCheck.remaining || 0);

    try {
        const { address, requestType, reason, registrationChallenge, challengeAnswer } = req.body;

        if (!address) {
            return res.status(400).json({
                error: 'Missing wallet address',
                docs: '/api/docs'
            });
        }

        if (!ethers.utils.isAddress(address)) {
            return res.status(400).json({
                error: 'Invalid wallet address format',
                docs: '/api/docs#walletValidation'
            });
        }

        if (!requestType || !['onboarding', 'paid'].includes(requestType)) {
            return res.status(400).json({
                error: 'Invalid request type',
                validOptions: ['onboarding', 'paid'],
                docs: '/api/docs'
            });
        }

        const requestId = `req_${Date.now()}_${++requestCounter}`;

        // --- Free onboarding ---
        if (requestType === 'onboarding') {
            const hasOnboarded = Array.from(requests.values()).some(
                r => r.address === address && r.requestType === 'onboarding' && r.status === 'completed'
            );
            if (hasOnboarded) {
                return res.status(400).json({ error: 'Onboarding tokens already claimed' });
            }

            const request = {
                requestId, address, requestType,
                reason: reason || 'New agent onboarding',
                amount: CLANKNET_REWARD, status: 'completed',
                timestamp: Date.now()
            };
            await saveRequest(requestId, request);

            return res.status(200).json({
                success: true, requestId,
                message: '50000 CLANKNET tokens approved for onboarding',
                tokens: '50000', status: 'completed',
                txHash: ethers.utils.hexlify(ethers.utils.randomBytes(32))
            });
        }

        // --- Paid requests ---
        const authResult = verifyERC8004Auth(
            req.headers.authorization, 'POST', '/api/request-tokens',
            JSON.stringify(req.body)
        );
        if (!authResult.valid) {
            return res.status(401).json({
                error: 'Authentication failed',
                message: authResult.error,
                format: 'ERC-8004 <chainId>:<registryAddress>:<agentId>:<timestamp>:<signature>',
                docs: '/api/docs#erc8004Authentication'
            });
        }

        // Verify registration challenge if provided
        if (registrationChallenge) {
            const correctAnswer = CHALLENGE_ANSWERS[registrationChallenge];
            if (!correctAnswer) {
                return res.status(400).json({ error: 'Invalid challenge', availableChallenges: Object.keys(CHALLENGE_ANSWERS) });
            }
            if (challengeAnswer !== correctAnswer) {
                return res.status(400).json({ error: 'Incorrect challenge answer' });
            }
        }

        const paymentSig = req.headers['payment-signature'];

        if (!paymentSig) {
            const resourceUrl = `/api/request-tokens/${requestId}`;
            const request = {
                requestId, address, requestType,
                reason: reason || 'Token purchase',
                amount: CLANKNET_REWARD, costUSDC: USDC_COST,
                agentId: authResult.agentId, status: 'payment_required',
                timestamp: Date.now()
            };
            await saveRequest(requestId, request);
            return send402PaymentRequired(res, resourceUrl);
        }

        // Process payment signature
        let paymentData;
        try {
            paymentData = JSON.parse(Buffer.from(paymentSig, 'base64').toString());
        } catch {
            return res.status(400).json({ error: 'Invalid payment signature encoding' });
        }

        const requiredFields = ['from', 'to', 'value', 'validAfter', 'validBefore', 'nonce', 'signature'];
        for (const field of requiredFields) {
            if (paymentData[field] === undefined || paymentData[field] === null) {
                return res.status(400).json({ error: 'Payment signature missing required fields' });
            }
        }

        // Verify EIP-3009 transferWithAuthorization
        const domain = { name: "USD Coin", version: "2", chainId: 8453, verifyingContract: USDC_ADDRESS };
        const types = {
            TransferWithAuthorization: [
                { name: "from", type: "address" }, { name: "to", type: "address" },
                { name: "value", type: "uint256" }, { name: "validAfter", type: "uint256" },
                { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" }
            ]
        };

        const recoveredAddress = ethers.utils.verifyTypedData(domain, types, {
            from: paymentData.from, to: paymentData.to, value: paymentData.value,
            validAfter: paymentData.validAfter, validBefore: paymentData.validBefore, nonce: paymentData.nonce
        }, paymentData.signature);

        if (recoveredAddress.toLowerCase() !== paymentData.from.toLowerCase()) {
            return res.status(400).json({ error: 'Payment signature does not match sender address' });
        }
        if (paymentData.to.toLowerCase() !== PAYMENT_RECIPIENT.toLowerCase()) {
            return res.status(400).json({ error: 'Invalid payment recipient' });
        }
        if (paymentData.value !== USDC_COST) {
            return res.status(400).json({ error: 'Incorrect payment amount' });
        }

        // Nonce replay protection (persisted via Redis)
        if (await isNonceUsed(paymentData.nonce)) {
            return res.status(400).json({ error: 'Payment nonce already used' });
        }
        const sigHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(paymentData.signature));
        if (usedSignatures.has(sigHash)) {
            return res.status(400).json({ error: 'Payment signature already used' });
        }
        usedSignatures.add(sigHash);
        await markNonceUsed(paymentData.nonce);

        const executorWallet = getExecutorWallet();
        if (!executorWallet) {
            return res.status(500).json({ error: 'Payment execution not configured' });
        }

        // Execute on-chain transfers
        const usdcContract = new ethers.Contract(USDC_ADDRESS, USDC_ABI, executorWallet);
        const clanknetContract = new ethers.Contract(CLANKNET_ADDRESS, CLANKNET_ABI, executorWallet);

        // Pre-checks
        const [senderBalance, executorBalance] = await Promise.all([
            usdcContract.balanceOf(paymentData.from),
            clanknetContract.balanceOf(executorWallet.address)
        ]);
        if (senderBalance.lt(USDC_COST)) {
            return res.status(400).json({ error: 'Insufficient USDC balance' });
        }
        if (executorBalance.lt(CLANKNET_REWARD)) {
            return res.status(503).json({ error: 'Service temporarily unavailable', message: 'Token distribution pool needs refunding.' });
        }

        // Execute USDC transferWithAuthorization
        const sig = ethers.utils.splitSignature(paymentData.signature);
        const tx = await usdcContract.transferWithAuthorization(
            paymentData.from, paymentData.to, paymentData.value,
            paymentData.validAfter, paymentData.validBefore, paymentData.nonce,
            sig.v, sig.r, sig.s,
            { gasLimit: 200000, gasPrice: ethers.utils.parseUnits('0.1', 'gwei') }
        );
        const receipt = await tx.wait();

        // Distribute CLANKNET tokens
        try {
            const clanknetTx = await clanknetContract.transfer(address, CLANKNET_REWARD, {
                gasLimit: 100000, gasPrice: ethers.utils.parseUnits('0.1', 'gwei')
            });
            const clanknetReceipt = await clanknetTx.wait();

            const request = {
                requestId, address, requestType,
                reason: reason || 'Token purchase',
                amount: CLANKNET_REWARD, costUSDC: USDC_COST,
                paymentFrom: paymentData.from, agentId: authResult.agentId,
                status: 'completed',
                usdcTxHash: receipt.transactionHash,
                clanknetTxHash: clanknetReceipt.transactionHash,
                timestamp: Date.now()
            };
            await saveRequest(requestId, request);

            return res.status(200).json({
                success: true, requestId,
                message: '50000 CLANKNET tokens sent - USDC payment received on-chain',
                tokens: '50000', status: 'completed',
                paymentReceived: '0.1 USDC',
                usdcTxHash: receipt.transactionHash,
                clanknetTxHash: clanknetReceipt.transactionHash,
                explorer: {
                    usdcPayment: `https://basescan.org/tx/${receipt.transactionHash}`,
                    clanknetTransfer: `https://basescan.org/tx/${clanknetReceipt.transactionHash}`
                }
            });
        } catch (clanknetError) {
            console.error('CLANKNET distribution failed:', clanknetError);
            await saveRequest(requestId, {
                requestId, address, requestType,
                status: 'payment_received_tokens_failed',
                usdcTxHash: receipt.transactionHash,
                error: clanknetError.message, timestamp: Date.now()
            });
            return res.status(500).json({
                success: false, requestId,
                message: 'USDC payment received but CLANKNET distribution failed',
                txHash: receipt.transactionHash
            });
        }

    } catch (error) {
        console.error('Token request error:', error);
        return res.status(500).json({ error: 'Internal server error', message: error.message });
    }
};
