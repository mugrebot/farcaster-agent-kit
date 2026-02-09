/**
 * ERC-8004 authentication verification
 * Uses ethers.utils.sha256 for body hashing (not crypto module)
 * 90-second timestamp window
 */

let _ethers = null;
function getEthers() {
    if (!_ethers) _ethers = require('ethers');
    return _ethers;
}

/**
 * Verify an ERC-8004 authentication header.
 * @param {string} authHeader - Full Authorization header value
 * @param {string} method - HTTP method (GET, POST, etc.)
 * @param {string} path - Request path (e.g. /api/request-tokens)
 * @param {string} [body=''] - Stringified request body (for body hash)
 * @returns {{ valid: boolean, error?: string, chainId?: string, registryAddress?: string, agentId?: string, signerAddress?: string, timestamp?: string }}
 */
function verifyERC8004Auth(authHeader, method, path, body = '') {
    if (!authHeader || !authHeader.startsWith('ERC-8004 ')) {
        return { valid: false, error: 'Missing or invalid Authorization header' };
    }

    try {
        const ethers = getEthers();
        const parts = authHeader.slice(9).split(':');
        if (parts.length !== 5) {
            return { valid: false, error: 'Invalid header format' };
        }

        const [chainId, registryAddress, agentId, timestamp, signature] = parts;

        // 90-second window (strict)
        const now = Math.floor(Date.now() / 1000);
        const ts = parseInt(timestamp);
        if (isNaN(ts) || Math.abs(now - ts) > 90) {
            return { valid: false, error: 'Timestamp out of range (must be within 90 seconds)' };
        }

        // Recreate signed message
        let message = `${chainId}:${registryAddress}:${agentId}:${timestamp}:${method}:${path}`;
        if (body) {
            const bodyHash = ethers.utils.sha256(ethers.utils.toUtf8Bytes(body)).slice(2);
            message += `:${bodyHash}`;
        }

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

module.exports = { verifyERC8004Auth };
