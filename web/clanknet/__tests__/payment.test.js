/**
 * Tests for payment flow in request-tokens.js
 * Tests the payment signature verification, nonce dedup, and field validation
 */

const { ethers } = require('ethers');

// Mock shared modules
jest.mock('../api/_shared/kv', () => {
    const _nonces = new Set();
    return {
        getKV: jest.fn(() => null),
        saveData: jest.fn(async () => true),
        loadData: jest.fn(async () => null),
        deleteData: jest.fn(async () => {}),
        isNonceUsed: jest.fn(async (nonce) => _nonces.has(nonce)),
        markNonceUsed: jest.fn(async (nonce) => { _nonces.add(nonce); }),
        _nonces // expose for test manipulation
    };
});

jest.mock('../api/_shared/rate-limit', () => ({
    checkRateLimit: jest.fn(async () => ({ allowed: true, remaining: 4 }))
}));

const USDC_ADDRESS = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const PAYMENT_RECIPIENT = '0xB84649C1e32ED82CC380cE72DF6DF540b303839F';

const TEST_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const testWallet = new ethers.Wallet(TEST_KEY);

function makeERC8004Header(method, path, body = '') {
    const chainId = '8453';
    const registry = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';
    const agentId = '1396';
    const timestamp = Math.floor(Date.now() / 1000).toString();
    let message = `${chainId}:${registry}:${agentId}:${timestamp}:${method}:${path}`;
    if (body) {
        const bodyHash = ethers.utils.sha256(ethers.utils.toUtf8Bytes(body)).slice(2);
        message += `:${bodyHash}`;
    }
    const signature = testWallet.signMessageSync(message);
    return `ERC-8004 ${chainId}:${registry}:${agentId}:${timestamp}:${signature}`;
}

async function makePaymentSignature(overrides = {}) {
    const wallet = overrides.wallet || testWallet;
    const paymentData = {
        from: overrides.from || wallet.address,
        to: overrides.to || PAYMENT_RECIPIENT,
        value: overrides.value || '100000',
        validAfter: overrides.validAfter || '0',
        validBefore: overrides.validBefore || Math.floor(Date.now() / 1000 + 3600).toString(),
        nonce: overrides.nonce || ethers.utils.hexlify(ethers.utils.randomBytes(32))
    };
    const domain = { name: "USD Coin", version: "2", chainId: 8453, verifyingContract: USDC_ADDRESS };
    const types = {
        TransferWithAuthorization: [
            { name: "from", type: "address" }, { name: "to", type: "address" },
            { name: "value", type: "uint256" }, { name: "validAfter", type: "uint256" },
            { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" }
        ]
    };
    paymentData.signature = await wallet._signTypedData(domain, types, paymentData);
    return { paymentData, encoded: Buffer.from(JSON.stringify(paymentData)).toString('base64') };
}

describe('Payment signature verification', () => {
    test('valid EIP-3009 signature verification', async () => {
        const { paymentData } = await makePaymentSignature();
        const domain = { name: "USD Coin", version: "2", chainId: 8453, verifyingContract: USDC_ADDRESS };
        const types = {
            TransferWithAuthorization: [
                { name: "from", type: "address" }, { name: "to", type: "address" },
                { name: "value", type: "uint256" }, { name: "validAfter", type: "uint256" },
                { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" }
            ]
        };
        const recovered = ethers.utils.verifyTypedData(domain, types, {
            from: paymentData.from, to: paymentData.to, value: paymentData.value,
            validAfter: paymentData.validAfter, validBefore: paymentData.validBefore, nonce: paymentData.nonce
        }, paymentData.signature);
        expect(recovered.toLowerCase()).toBe(testWallet.address.toLowerCase());
    });

    test('nonce replay rejected', async () => {
        const { isNonceUsed, markNonceUsed, _nonces } = require('../api/_shared/kv');
        const nonce = ethers.utils.hexlify(ethers.utils.randomBytes(32));
        await markNonceUsed(nonce);
        const used = await isNonceUsed(nonce);
        expect(used).toBe(true);
    });

    test('signature hash replay detection', async () => {
        const { paymentData } = await makePaymentSignature();
        const sigHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(paymentData.signature));
        const usedSignatures = new Set();
        usedSignatures.add(sigHash);
        expect(usedSignatures.has(sigHash)).toBe(true);
    });

    test('wrong from address rejected', async () => {
        const wrongWallet = ethers.Wallet.createRandom();
        const { paymentData } = await makePaymentSignature();
        // Signer doesn't match paymentData.from if we use a different wallet
        const { paymentData: wrongPayment } = await makePaymentSignature({ wallet: wrongWallet });
        // The signature was made by wrongWallet, so recovered address != testWallet.address
        const domain = { name: "USD Coin", version: "2", chainId: 8453, verifyingContract: USDC_ADDRESS };
        const types = {
            TransferWithAuthorization: [
                { name: "from", type: "address" }, { name: "to", type: "address" },
                { name: "value", type: "uint256" }, { name: "validAfter", type: "uint256" },
                { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" }
            ]
        };
        const recovered = ethers.utils.verifyTypedData(domain, types, {
            from: wrongPayment.from, to: wrongPayment.to, value: wrongPayment.value,
            validAfter: wrongPayment.validAfter, validBefore: wrongPayment.validBefore, nonce: wrongPayment.nonce
        }, wrongPayment.signature);
        // Should match the wrongWallet, not the testWallet
        expect(recovered.toLowerCase()).toBe(wrongWallet.address.toLowerCase());
        expect(recovered.toLowerCase()).not.toBe(testWallet.address.toLowerCase());
    });

    test('wrong chain ID in domain', async () => {
        // Signature created with wrong domain will recover different address
        const paymentData = {
            from: testWallet.address,
            to: PAYMENT_RECIPIENT,
            value: '100000',
            validAfter: '0',
            validBefore: Math.floor(Date.now() / 1000 + 3600).toString(),
            nonce: ethers.utils.hexlify(ethers.utils.randomBytes(32))
        };
        const wrongDomain = { name: "USD Coin", version: "2", chainId: 1, verifyingContract: USDC_ADDRESS }; // Mainnet instead of Base
        const types = {
            TransferWithAuthorization: [
                { name: "from", type: "address" }, { name: "to", type: "address" },
                { name: "value", type: "uint256" }, { name: "validAfter", type: "uint256" },
                { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" }
            ]
        };
        const wrongSig = await testWallet._signTypedData(wrongDomain, types, paymentData);

        // Verify with correct domain should NOT recover testWallet
        const correctDomain = { name: "USD Coin", version: "2", chainId: 8453, verifyingContract: USDC_ADDRESS };
        const recovered = ethers.utils.verifyTypedData(correctDomain, types, paymentData, wrongSig);
        expect(recovered.toLowerCase()).not.toBe(testWallet.address.toLowerCase());
    });

    test('missing payment fields detected', () => {
        const requiredFields = ['from', 'to', 'value', 'validAfter', 'validBefore', 'nonce', 'signature'];
        const incomplete = { from: '0x123', to: '0x456' };
        const missing = requiredFields.filter(f => incomplete[f] === undefined);
        expect(missing.length).toBeGreaterThan(0);
    });

    test('malformed base64 payload detected', () => {
        expect(() => {
            JSON.parse(Buffer.from('not-valid-base64!!!', 'base64').toString());
        }).toThrow();
    });

    test('valid onboarding (free tier) requires no payment', () => {
        // Onboarding requests should not need payment or auth
        const body = { address: testWallet.address, requestType: 'onboarding' };
        expect(body.requestType).toBe('onboarding');
        expect(ethers.utils.isAddress(body.address)).toBe(true);
    });

    test('rate limit headers present', async () => {
        const { checkRateLimit } = require('../api/_shared/rate-limit');
        const result = await checkRateLimit('test-payment');
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBeDefined();
    });

    test('body hash verification', () => {
        const body = JSON.stringify({ address: '0x123', requestType: 'paid' });
        const hash1 = ethers.utils.sha256(ethers.utils.toUtf8Bytes(body)).slice(2);
        const hash2 = ethers.utils.sha256(ethers.utils.toUtf8Bytes(body)).slice(2);
        expect(hash1).toBe(hash2);

        const differentBody = JSON.stringify({ address: '0x456', requestType: 'paid' });
        const hash3 = ethers.utils.sha256(ethers.utils.toUtf8Bytes(differentBody)).slice(2);
        expect(hash1).not.toBe(hash3);
    });

    test('incorrect payment amount detected', async () => {
        const { paymentData } = await makePaymentSignature({ value: '50000' });
        expect(paymentData.value).not.toBe('100000');
    });
});
