/**
 * Tests for _shared/auth.js — ERC-8004 authentication verification
 */

const { ethers } = require('ethers');

// Mock Date.now for timestamp tests
const REAL_DATE_NOW = Date.now;
let mockNow;

beforeEach(() => {
    mockNow = REAL_DATE_NOW.call(Date);
    Date.now = jest.fn(() => mockNow);
});

afterEach(() => {
    Date.now = REAL_DATE_NOW;
});

const { verifyERC8004Auth } = require('../../api/_shared/auth');

// Test wallet
const TEST_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const testWallet = new ethers.Wallet(TEST_PRIVATE_KEY);

async function makeAuthHeader(overrides = {}) {
    const chainId = overrides.chainId || '8453';
    const registry = overrides.registry || '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';
    const agentId = overrides.agentId || '1396';
    const timestamp = overrides.timestamp || Math.floor(mockNow / 1000).toString();
    const method = overrides.method || 'GET';
    const path = overrides.path || '/api/auth/test';
    const body = overrides.body || '';

    let message = `${chainId}:${registry}:${agentId}:${timestamp}:${method}:${path}`;
    if (body) {
        const bodyHash = ethers.utils.sha256(ethers.utils.toUtf8Bytes(body)).slice(2);
        message += `:${bodyHash}`;
    }

    const wallet = overrides.wallet || testWallet;
    const signature = await wallet.signMessage(message);
    return `ERC-8004 ${chainId}:${registry}:${agentId}:${timestamp}:${signature}`;
}

describe('verifyERC8004Auth', () => {
    test('valid signature accepted', async () => {
        const header = await makeAuthHeader();
        const result = verifyERC8004Auth(header, 'GET', '/api/auth/test');
        expect(result.valid).toBe(true);
        expect(result.signerAddress).toBe(testWallet.address);
    });

    test('missing header rejected', () => {
        const result = verifyERC8004Auth(null, 'GET', '/api/auth/test');
        expect(result.valid).toBe(false);
        expect(result.error).toMatch(/Missing/);
    });

    test('wrong prefix rejected', () => {
        const result = verifyERC8004Auth('Bearer xyz', 'GET', '/api/auth/test');
        expect(result.valid).toBe(false);
        expect(result.error).toMatch(/Missing/);
    });

    test('expired timestamp (91s) rejected', async () => {
        const pastTimestamp = Math.floor(mockNow / 1000) - 91;
        const header = await makeAuthHeader({ timestamp: pastTimestamp.toString() });
        const result = verifyERC8004Auth(header, 'GET', '/api/auth/test');
        expect(result.valid).toBe(false);
        expect(result.error).toMatch(/Timestamp/);
    });

    test('future timestamp (91s ahead) rejected', async () => {
        const futureTimestamp = Math.floor(mockNow / 1000) + 91;
        const header = await makeAuthHeader({ timestamp: futureTimestamp.toString() });
        const result = verifyERC8004Auth(header, 'GET', '/api/auth/test');
        expect(result.valid).toBe(false);
        expect(result.error).toMatch(/Timestamp/);
    });

    test('malformed header (4 parts instead of 5)', () => {
        const result = verifyERC8004Auth('ERC-8004 8453:0x8004:1396:12345', 'GET', '/api/auth/test');
        expect(result.valid).toBe(false);
        expect(result.error).toMatch(/Invalid header format/);
    });

    test('invalid signature (wrong key)', async () => {
        const wrongWallet = ethers.Wallet.createRandom();
        const header = await makeAuthHeader({ wallet: wrongWallet });
        const result = verifyERC8004Auth(header, 'GET', '/api/auth/test');
        expect(result.valid).toBe(true);
        expect(result.signerAddress).not.toBe(testWallet.address);
        expect(result.signerAddress).toBe(wrongWallet.address);
    });

    test('body hash mismatch — signer differs', async () => {
        const header = await makeAuthHeader({ body: '{"foo":"bar"}', method: 'POST', path: '/api/test' });
        const result = verifyERC8004Auth(header, 'POST', '/api/test', '{"foo":"baz"}');
        // Signature is valid cryptographically but recovers a different address
        expect(result.valid).toBe(true);
        expect(result.signerAddress).not.toBe(testWallet.address);
    });

    test('empty body hash (GET request)', async () => {
        const header = await makeAuthHeader({ method: 'GET', path: '/api/test' });
        const result = verifyERC8004Auth(header, 'GET', '/api/test');
        expect(result.valid).toBe(true);
    });

    test('valid body hash (POST request)', async () => {
        const body = JSON.stringify({ address: '0x123', requestType: 'paid' });
        const header = await makeAuthHeader({ body, method: 'POST', path: '/api/request-tokens' });
        const result = verifyERC8004Auth(header, 'POST', '/api/request-tokens', body);
        expect(result.valid).toBe(true);
        expect(result.signerAddress).toBe(testWallet.address);
    });

    test('chainId extraction', async () => {
        const header = await makeAuthHeader({ chainId: '8453' });
        const result = verifyERC8004Auth(header, 'GET', '/api/auth/test');
        expect(result.chainId).toBe('8453');
    });

    test('agentId extraction', async () => {
        const header = await makeAuthHeader({ agentId: '42' });
        const result = verifyERC8004Auth(header, 'GET', '/api/auth/test');
        expect(result.agentId).toBe('42');
    });

    test('boundary: exactly 90 seconds (accepted)', async () => {
        const ts = Math.floor(mockNow / 1000) - 90;
        const header = await makeAuthHeader({ timestamp: ts.toString() });
        const result = verifyERC8004Auth(header, 'GET', '/api/auth/test');
        expect(result.valid).toBe(true);
    });

    test('boundary: exactly 91 seconds (rejected)', async () => {
        const ts = Math.floor(mockNow / 1000) - 91;
        const header = await makeAuthHeader({ timestamp: ts.toString() });
        const result = verifyERC8004Auth(header, 'GET', '/api/auth/test');
        expect(result.valid).toBe(false);
    });

    test('unicode in body hash', async () => {
        const body = JSON.stringify({ name: 'CLANKNET Agent' });
        const header = await makeAuthHeader({ body, method: 'POST', path: '/api/test' });
        const result = verifyERC8004Auth(header, 'POST', '/api/test', body);
        expect(result.valid).toBe(true);
    });
});
