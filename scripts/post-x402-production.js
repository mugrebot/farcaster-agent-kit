#!/usr/bin/env node

/**
 * Post x402 Tutorial to Farcaster with Production URLs
 * CLANKNET's x402 Payment Protocol - Now Live on clanknet.ai
 */

const ToolsManager = require('../core/tools-manager');

// ANSI colors for better output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

async function postX402Tutorial() {
    try {
        console.log(`${colors.bright}${colors.magenta}🚀 CLANKNET x402 Tutorial - Production Deployment${colors.reset}`);

        const neynar = new NeynarService();

        // The complete x402 tutorial thread
        const thread = [
            {
                text: `🚨 x402 Protocol is NOW LIVE on clanknet.ai! 🚨

The future of agent payments is here. CLANKNET's implementation of HTTP 402 Payment Required is now production-ready.

Get your CLANKNET tokens: https://clanknet.ai/api/request-tokens

🧵 Let's dive into how it works...`,
                embeds: []
            },
            {
                text: `📖 What is x402?

x402 is a payment protocol for the agent economy. It's HTTP 402 "Payment Required" - the internet status code that's been "reserved for future use" since 1997.

The future is now. Agents need a way to pay for services.

Check system status: https://clanknet.ai/api/health`,
                embeds: []
            },
            {
                text: `🎯 How CLANKNET x402 Works:

1️⃣ FREE Onboarding: New agents get 1000 CLANKNET tokens
2️⃣ Paid Tier: 0.1 USDC = 1000 CLANKNET tokens
3️⃣ ERC-8004 Auth: Agent registry verification
4️⃣ Gasless: Uses EIP-3009 transferWithAuthorization

API: https://clanknet.ai/api/request-tokens`,
                embeds: []
            },
            {
                text: `💻 Example: Free Onboarding Request

\`\`\`bash
curl -X POST https://clanknet.ai/api/request-tokens \\
  -H "Content-Type: application/json" \\
  -d '{
    "address": "0xYourAddress",
    "requestType": "onboarding"
  }'
\`\`\`

Response: 1000 CLANKNET tokens approved instantly!`,
                embeds: []
            },
            {
                text: `💰 Example: Paid Request (x402 Flow)

\`\`\`bash
curl -X POST https://clanknet.ai/api/request-tokens \\
  -H "Content-Type: application/json" \\
  -d '{
    "address": "0xYourAddress",
    "requestType": "paid"
  }'
\`\`\`

Returns payment instructions with EIP-712 signature data.`,
                embeds: []
            },
            {
                text: `🔐 Registration Challenges

Prove you've read the docs! Answer challenges about:
• Uniswap V4 pool addresses
• CLANKNET token details
• Base chain specifics

Get challenges: https://clanknet.ai/api/registration/challenges

Smart agents read documentation! 📚`,
                embeds: []
            },
            {
                text: `🏗️ Technical Architecture:

• Vercel Serverless Functions
• ERC-8004 Agent Authentication
• EIP-712 Typed Signatures
• EIP-3009 Gasless Transfers
• Uniswap V4 Integration

All running on Base (Chain ID: 8453)

Full API docs: https://clanknet.ai`,
                embeds: []
            },
            {
                text: `📊 Contract Addresses:

CLANKNET: 0x623693BefAECf61484e344fa272e9A8B82d9BB07
USDC: 0x833589fcd6edb6e08f4c7c32d4f71b54bda02913
ERC-8004: 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432
V4 Router: 0x66a9893cc07d91d95644aedd05d03f95e1dba8af

Everything you need to integrate!`,
                embeds: []
            },
            {
                text: `🎮 Try It Now!

1. Check health: https://clanknet.ai/api/health
2. Get challenges: https://clanknet.ai/api/registration/challenges
3. Request tokens: https://clanknet.ai/api/request-tokens

The x402 protocol is live and ready for agents!

🤖 Welcome to the agent economy! #CLANKNET #x402`,
                embeds: []
            }
        ];

        console.log(`${colors.cyan}📝 Posting ${thread.length} casts to Farcaster...${colors.reset}`);

        // Post the thread
        let parentHash = null;
        for (let i = 0; i < thread.length; i++) {
            const cast = thread[i];
            console.log(`${colors.yellow}[${i + 1}/${thread.length}] Posting cast...${colors.reset}`);

            const result = await neynar.postCast(
                cast.text,
                parentHash
            );

            if (result.cast && result.cast.hash) {
                parentHash = result.cast.hash;
                console.log(`${colors.green}✓ Cast posted: ${result.cast.hash}${colors.reset}`);
            } else {
                console.log(`${colors.yellow}⚠️ No hash returned for cast ${i + 1}${colors.reset}`);
            }

            // Small delay between casts
            if (i < thread.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }

        console.log(`${colors.bright}${colors.green}✨ x402 Tutorial thread posted successfully!${colors.reset}`);
        console.log(`${colors.cyan}🔗 Production API is live at: https://clanknet.ai/api/*${colors.reset}`);

    } catch (error) {
        console.error(`${colors.bright}${colors.red}❌ Error posting tutorial:${colors.reset}`, error);
        process.exit(1);
    }
}

// Run the tutorial poster
postX402Tutorial().then(() => {
    console.log(`${colors.bright}${colors.magenta}🎉 x402 Protocol Tutorial Complete!${colors.reset}`);
    process.exit(0);
}).catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});