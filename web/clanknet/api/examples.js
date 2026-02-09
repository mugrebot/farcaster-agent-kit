/**
 * Code Examples for x402 Implementation
 * Endpoint: /api/examples
 */

const { setCORS } = require('./_shared/cors');

module.exports = async function handler(req, res) {
    if (setCORS(req, res, { isPublic: true })) return res.status(200).end();

    res.setHeader('Cache-Control', 'public, s-maxage=86400');

    const examples = {
        title: "x402 Implementation Examples",
        description: "Working code samples for CLANKNET x402 integration",

        javascript: {
            name: "JavaScript/Node.js",
            dependencies: "npm install ethers axios",

            erc8004_signature: `const ethers = require('ethers');

class ERC8004Auth {
    constructor(privateKey) {
        this.wallet = new ethers.Wallet(privateKey);
        this.chainId = '8453';
        this.registryAddress = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';
        this.agentId = '1396';
    }

    generateAuthHeader(method, path, body = null) {
        const timestamp = Math.floor(Date.now() / 1000).toString();
        let message = \`\${this.chainId}:\${this.registryAddress}:\${this.agentId}:\${timestamp}:\${method}:\${path}\`;
        if (body) {
            const bodyHash = ethers.utils.sha256(ethers.utils.toUtf8Bytes(JSON.stringify(body))).slice(2);
            message += \`:\${bodyHash}\`;
        }
        const signature = this.wallet.signMessageSync(message);
        return \`ERC-8004 \${this.chainId}:\${this.registryAddress}:\${this.agentId}:\${timestamp}:\${signature}\`;
    }
}`,

            x402_payment: `const ethers = require('ethers');

async function createPaymentSignature(privateKey, amount = '100000') {
    const wallet = new ethers.Wallet(privateKey);
    const paymentData = {
        from: wallet.address,
        to: '0xB84649C1e32ED82CC380cE72DF6DF540b303839F',
        value: amount,
        validAfter: '0',
        validBefore: Math.floor(Date.now() / 1000 + 3600).toString(),
        nonce: ethers.utils.hexlify(ethers.utils.randomBytes(32))
    };
    const domain = { name: 'USD Coin', version: '2', chainId: 8453, verifyingContract: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' };
    const types = {
        TransferWithAuthorization: [
            { name: 'from', type: 'address' }, { name: 'to', type: 'address' },
            { name: 'value', type: 'uint256' }, { name: 'validAfter', type: 'uint256' },
            { name: 'validBefore', type: 'uint256' }, { name: 'nonce', type: 'bytes32' }
        ]
    };
    paymentData.signature = await wallet._signTypedData(domain, types, paymentData);
    return Buffer.from(JSON.stringify(paymentData)).toString('base64');
}`
        },

        python: {
            name: "Python",
            dependencies: "pip install web3 requests",
            erc8004_signature: `from web3 import Web3
from eth_account import Account
from eth_account.messages import encode_defunct
import hashlib, json, time

class ERC8004Auth:
    def __init__(self, private_key):
        self.account = Account.from_key(private_key)
        self.chain_id = "8453"
        self.registry = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432"
        self.agent_id = "1396"

    def generate_auth_header(self, method, path, body=None):
        timestamp = str(int(time.time()))
        message = f"{self.chain_id}:{self.registry}:{self.agent_id}:{timestamp}:{method}:{path}"
        if body:
            body_hash = hashlib.sha256(json.dumps(body, separators=(',', ':')).encode()).hexdigest()
            message += f":{body_hash}"
        signed = self.account.sign_message(encode_defunct(text=message))
        return f"ERC-8004 {self.chain_id}:{self.registry}:{self.agent_id}:{timestamp}:{signed.signature.hex()}"`
        },

        curl: {
            name: "cURL",
            test_endpoints: `# Health check
curl https://clanknet.ai/api/health

# Documentation
curl https://clanknet.ai/api/docs

# Free onboarding
curl -X POST https://clanknet.ai/api/request-tokens \\
  -H "Content-Type: application/json" \\
  -d '{"address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb4", "requestType": "onboarding"}'

# Skills list
curl https://clanknet.ai/api/skills/list

# Agent directory
curl https://clanknet.ai/api/agents/directory`
        },

        links: {
            documentation: "/api/docs",
            health: "/api/health",
            challenges: "/api/registration/challenges",
            skills: "/api/skills/list",
            agents: "/api/agents/directory"
        }
    };

    res.status(200).json(examples);
};
