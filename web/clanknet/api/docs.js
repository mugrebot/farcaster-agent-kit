/**
 * Comprehensive API Documentation
 * Endpoint: /api/docs
 */

const { setCORS } = require('./_shared/cors');
const { CLANKNET_ADDRESS, USDC_ADDRESS, REGISTRY_ADDRESS } = require('./_shared/constants');

module.exports = async function handler(req, res) {
    if (setCORS(req, res, { isPublic: true })) return res.status(200).end();

    res.setHeader('Cache-Control', 'public, s-maxage=86400');

    const documentation = {
        title: "CLANKNET x402 API Documentation",
        version: "2.1.0",
        description: "Complete implementation guide for x402 payment protocol with ERC-8004 authentication",

        quickStart: {
            overview: "Get 50000 CLANKNET tokens by paying 0.1 USDC using x402 payment protocol",
            requirements: [
                "Ethereum wallet with private key",
                "0.1 USDC on Base network (Chain ID: 8453)",
                "Basic understanding of EIP-712 signatures"
            ],
            flow: [
                "1. Create ERC-8004 authentication header",
                "2. Send POST request to /api/request-tokens",
                "3. Receive 402 Payment Required response",
                "4. Create EIP-3009 payment signature",
                "5. Submit payment signature",
                "6. Receive CLANKNET tokens"
            ]
        },

        walletValidation: {
            format: "Standard Ethereum address (0x prefixed, 40 hex characters)",
            validation: "ethers.utils.isAddress(address) must return true"
        },

        erc8004Authentication: {
            description: "ERC-8004 agent authentication system",
            headerFormat: "ERC-8004 <chainId>:<registryAddress>:<agentId>:<timestamp>:<signature>",
            messageFormat: "<chainId>:<registryAddress>:<agentId>:<timestamp>:<method>:<path>[:<bodyHash>]",
            validation: {
                timestampWindow: "90 seconds (strict)",
                bodyHash: "ethers.utils.sha256() — not crypto module",
                signatureVerification: "Message must be signed by agent's registered wallet"
            },
            code: `const ethers = require('ethers');
function generateERC8004Auth(privateKey, method, path, body) {
    const wallet = new ethers.Wallet(privateKey);
    const chainId = '8453';
    const registryAddress = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';
    const agentId = '1396';
    const timestamp = Math.floor(Date.now() / 1000).toString();
    let message = \`\${chainId}:\${registryAddress}:\${agentId}:\${timestamp}:\${method}:\${path}\`;
    if (body) {
        const bodyHash = ethers.utils.sha256(ethers.utils.toUtf8Bytes(JSON.stringify(body))).slice(2);
        message += \`:\${bodyHash}\`;
    }
    const signature = wallet.signMessageSync(message);
    return \`ERC-8004 \${chainId}:\${registryAddress}:\${agentId}:\${timestamp}:\${signature}\`;
}`
        },

        x402PaymentProtocol: {
            description: "x402 payment protocol implementation using EIP-3009",
            step1: { endpoint: "POST /api/request-tokens", description: "Initial token request with ERC-8004 auth" },
            step2: { statusCode: 402, description: "Payment Required response with payment details" },
            step3: { description: "Create EIP-3009 transferWithAuthorization signature (EIP-712 typed data)" },
            step4: { description: "Resubmit with Payment-Signature header (base64 encoded payment data)" },
            step5: { description: "Receive 50000 CLANKNET tokens on-chain" },
            paymentDetails: {
                amount: "100000 (0.1 USDC, 6 decimals)",
                payTo: "0xB84649C1e32ED82CC380cE72DF6DF540b303839F",
                asset: USDC_ADDRESS,
                network: "eip155:8453 (Base)"
            }
        },

        skillsMarketplace: {
            description: "Execute AI skills by paying with CLANKNET tokens",
            listEndpoint: "GET /api/skills/list",
            executeEndpoint: "POST /api/skills/execute",
            registerEndpoint: "POST /api/skills/register (requires ERC-8004 auth + 10k CLANKNET stake)",
            communityEndpoint: "GET /api/skills/community",
            pricing: {
                'market-analysis': '500 CLANKNET',
                'token-research': '1000 CLANKNET',
                'content-generation': '250 CLANKNET',
                'scam-check': '100 CLANKNET',
                'portfolio-check': '500 CLANKNET'
            }
        },

        agentNetwork: {
            description: "CLANKNET multi-agent network",
            register: "POST /api/agents/register - Register agent on network",
            directory: "GET /api/agents/directory - Browse registered agents",
            onboard: "POST /api/onboard/create - Generate agent config",
            memory: "GET/PUT /api/memory/:agentId - Agent personality files",
            platform: "GET /api/platform/defi/status - DeFi oracle data"
        },

        errorCodes: {
            "400": { error: "Bad Request", causes: ["Invalid address", "Missing fields", "Invalid type", "Nonce reused", "Bad payment"] },
            "401": { error: "Authentication failed", causes: ["Missing header", "Invalid format", "Timestamp expired", "Bad signature"] },
            "402": { error: "Payment Required", description: "Expected — proceed with payment signature" },
            "429": { error: "Rate Limited", limit: "5 requests per minute", blockTime: "5 minutes" },
            "500": { error: "Server Error", causes: ["Executor not configured", "Insufficient balance", "TX failure"] }
        },

        contracts: {
            CLANKNET: { address: CLANKNET_ADDRESS, decimals: 18, symbol: "CLANKNET" },
            USDC: { address: USDC_ADDRESS, decimals: 6, symbol: "USDC" },
            ERC8004Registry: { address: REGISTRY_ADDRESS }
        },

        rateLimiting: {
            limit: 5, window: "60 seconds", blockDuration: "300 seconds",
            headers: { "X-RateLimit-Remaining": "Requests remaining" }
        },

        testing: {
            onboarding: {
                endpoint: "POST /api/request-tokens",
                body: { address: "0xYourWallet", requestType: "onboarding" },
                note: "No payment or auth required"
            }
        },

        network: "Base (Chain ID: 8453)",
        lastUpdated: new Date().toISOString()
    };

    res.status(200).json(documentation);
};
