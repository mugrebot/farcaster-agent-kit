# CLANKNET x402 Token Request Skill

This skill enables your AI agent to request and receive CLANKNET tokens using the x402 payment protocol.

## Quick Setup

Add this skill to your agent to enable CLANKNET token requests via x402 protocol.

## Skill Configuration

```yaml
name: clanknet-x402
version: 1.0.0
description: Request CLANKNET tokens using x402 payment protocol
author: CLANKNET Protocol
license: MIT
```

## Required Capabilities

Your agent needs:
- Ethereum wallet with private key
- 0.1 USDC on Base network per token request
- HTTP client capabilities (axios, fetch, etc.)
- EIP-712 signing capability

## Environment Variables

```bash
# Required
AGENT_PRIVATE_KEY=0x... # Your agent's private key
AGENT_ID=1396 # Your ERC-8004 agent ID (default: 1396)

# Optional
CLANKNET_API_BASE=https://www.clanknet.ai
```

## API Endpoints

- Base URL: `https://www.clanknet.ai`
- Documentation: `/api/docs`
- Examples: `/api/examples`
- Token Request: `/api/request-tokens`

## Core Functions

### 1. Generate ERC-8004 Authentication

```javascript
function generateERC8004Auth(privateKey, method, path, body) {
    const wallet = new ethers.Wallet(privateKey);
    const chainId = '8453';
    const registry = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';
    const agentId = process.env.AGENT_ID || '1396';
    const timestamp = Math.floor(Date.now() / 1000).toString();

    let message = `${chainId}:${registry}:${agentId}:${timestamp}:${method}:${path}`;

    if (body) {
        const bodyHash = ethers.utils.sha256(
            ethers.utils.toUtf8Bytes(JSON.stringify(body))
        ).slice(2);
        message += `:${bodyHash}`;
    }

    const signature = wallet.signMessageSync(message);
    return `ERC-8004 ${chainId}:${registry}:${agentId}:${timestamp}:${signature}`;
}
```

### 2. Request CLANKNET Tokens

```javascript
async function requestClanknetTokens(privateKey, reason = "Agent token request") {
    const wallet = new ethers.Wallet(privateKey);
    const apiBase = 'https://www.clanknet.ai';

    // Step 1: Initial request
    const body = {
        address: wallet.address,
        requestType: 'paid', // or 'onboarding' for free tokens
        reason: reason
    };

    const auth = generateERC8004Auth(privateKey, 'POST', '/api/request-tokens', body);

    try {
        const response = await fetch(`${apiBase}/api/request-tokens`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': auth
            },
            body: JSON.stringify(body)
        });

        if (response.status === 402) {
            // Step 2: Handle payment required
            const data = await response.json();
            const paymentSig = await createPaymentSignature(privateKey, data.paymentRequired);

            // Step 3: Submit with payment
            const paymentResponse = await fetch(`${apiBase}/api/request-tokens`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': auth,
                    'Payment-Signature': paymentSig
                },
                body: JSON.stringify(body)
            });

            return await paymentResponse.json();
        }

        return await response.json();
    } catch (error) {
        console.error('Token request failed:', error);
        throw error;
    }
}
```

### 3. Create Payment Signature

```javascript
async function createPaymentSignature(privateKey, paymentRequired) {
    const wallet = new ethers.Wallet(privateKey);
    const payment = paymentRequired.accepts[0];

    const paymentData = {
        from: wallet.address,
        to: payment.payTo,
        value: payment.amount,
        validAfter: '0',
        validBefore: Math.floor(Date.now() / 1000 + 3600).toString(),
        nonce: ethers.utils.hexlify(ethers.utils.randomBytes(32))
    };

    const domain = {
        name: 'USD Coin',
        version: '2',
        chainId: 8453,
        verifyingContract: payment.asset
    };

    const types = {
        TransferWithAuthorization: [
            { name: 'from', type: 'address' },
            { name: 'to', type: 'address' },
            { name: 'value', type: 'uint256' },
            { name: 'validAfter', type: 'uint256' },
            { name: 'validBefore', type: 'uint256' },
            { name: 'nonce', type: 'bytes32' }
        ]
    };

    const signature = await wallet._signTypedData(domain, types, paymentData);
    paymentData.signature = signature;

    return Buffer.from(JSON.stringify(paymentData)).toString('base64');
}
```

## Usage Examples

### Get Free Onboarding Tokens (One-Time)

```javascript
async function getOnboardingTokens(privateKey) {
    const wallet = new ethers.Wallet(privateKey);

    const response = await fetch('https://www.clanknet.ai/api/request-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            address: wallet.address,
            requestType: 'onboarding',
            reason: 'First time agent onboarding'
        })
    });

    return await response.json();
}
```

### Purchase Tokens with USDC

```javascript
async function purchaseTokens(privateKey) {
    const result = await requestClanknetTokens(
        privateKey,
        "Purchasing tokens for agent operations"
    );

    console.log(`Received ${result.tokens} CLANKNET tokens`);
    console.log(`USDC Payment: ${result.usdcTxHash}`);
    console.log(`Token Transfer: ${result.clanknetTxHash}`);

    return result;
}
```

## Agent Commands

Add these commands to your agent:

```javascript
// Command: /clanknet balance
async function checkClanknetBalance(address) {
    const provider = new ethers.providers.JsonRpcProvider('https://mainnet.base.org');
    const clanknetAddress = '0x623693BefAECf61484e344fa272e9A8B82d9BB07';
    const abi = ['function balanceOf(address) view returns (uint256)'];
    const contract = new ethers.Contract(clanknetAddress, abi, provider);
    const balance = await contract.balanceOf(address);
    return ethers.utils.formatEther(balance);
}

// Command: /clanknet request [amount]
async function handleClanknetRequest(privateKey, amount = 1000) {
    const requests = Math.ceil(amount / 1000); // 1000 tokens per request
    const results = [];

    for (let i = 0; i < requests; i++) {
        const result = await requestClanknetTokens(privateKey);
        results.push(result);

        // Respect rate limits (5 requests per minute)
        if (i < requests - 1) {
            await new Promise(resolve => setTimeout(resolve, 12000)); // 12 seconds
        }
    }

    return results;
}

// Command: /clanknet help
function clanknetHelp() {
    return `
CLANKNET x402 Commands:
• /clanknet balance - Check CLANKNET token balance
• /clanknet request [amount] - Request tokens (1000 per request)
• /clanknet price - Check current token price (0.1 USDC = 1000 CLANKNET)
• /clanknet docs - Get API documentation link

Requirements:
• 0.1 USDC on Base network per 1000 tokens
• Rate limit: 5 requests per minute

Learn more: https://www.clanknet.ai/api/docs
    `;
}
```

## Rate Limiting

- **Limit**: 5 requests per minute
- **Block Duration**: 5 minutes after exceeding limit
- **Headers**: Check `X-RateLimit-Remaining` in responses

## Error Handling

```javascript
function handleClanknetError(error) {
    if (error.response) {
        switch (error.response.status) {
            case 400:
                return `Invalid request: ${error.response.data.message}`;
            case 401:
                return `Authentication failed. Check your agent credentials.`;
            case 402:
                return `Payment required. Ensure you have 0.1 USDC on Base.`;
            case 429:
                return `Rate limited. Try again in ${error.response.data.retryAfter} seconds.`;
            default:
                return `Error: ${error.response.data.message || 'Unknown error'}`;
        }
    }
    return `Network error: ${error.message}`;
}
```

## Contract Addresses

- **CLANKNET Token**: `0x623693BefAECf61484e344fa272e9A8B82d9BB07`
- **USDC on Base**: `0x833589fcd6edb6e08f4c7c32d4f71b54bda02913`
- **ERC-8004 Registry**: `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`
- **Payment Recipient**: `0xB84649C1e32ED82CC380cE72DF6DF540b303839F`

## Network

- **Chain**: Base (Ethereum L2)
- **Chain ID**: 8453
- **RPC**: `https://mainnet.base.org`

## Support

- Documentation: https://www.clanknet.ai/api/docs
- Examples: https://www.clanknet.ai/api/examples
- GitHub: https://github.com/mugrebot/farcaster-agent-kit

## License

MIT - Free to use in any AI agent implementation

---

## Quick Integration

```bash
# 1. Install dependencies
npm install ethers axios

# 2. Set environment variable
export AGENT_PRIVATE_KEY="0xYourPrivateKey"

# 3. Copy the functions above to your agent

# 4. Start requesting tokens!
```

## One-Line Integration

```bash
curl -s https://www.clanknet.ai/clanknet-x402-skill.md > skills/clanknet-x402.md
```