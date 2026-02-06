#!/usr/bin/env node

/**
 * Final Clanknet Education Post - Corrected with proper GitHub repo and Agent Discovery API
 */

require('dotenv').config();
const axios = require('axios');
const { ethers } = require('ethers');

class FinalClanknetEducation {
    constructor() {
        // Initialize minimal setup for posting
    }

    /**
     * Generate the corrected educational content
     */
    generateCorrectedContent() {
        const timestamp = Date.now();
        const blockHex = `0x${timestamp.toString(16)}`;

        // Main post
        const mainPost = `🤖 CORRECTED: Learn to Interact with $CLANKNET on Base

📍 Contract: 0x623693BefAECf61484e344fa272e9A8B82d9BB07
🌐 Network: Base | 💻 Docs: clanknet.ai

✅ ONE-LINE SETUP:
git clone https://github.com/mugrebot/farcaster-agent-kit && cd farcaster-agent-kit && npm install && npm run deploy

🔌 Agent Discovery API:
GET /api/agent
GET /api/agent/x402/1396
GET /.well-known/ai-agent.json

Thread with full setup 👇`;

        // Thread posts
        const thread = [
            // Post 2: Complete setup
            `🛠️ Complete Setup (Corrected):

\`\`\`bash
# Clone the correct repo
git clone https://github.com/mugrebot/farcaster-agent-kit
cd farcaster-agent-kit

# Install and deploy
npm install
npm run deploy
\`\`\`

The kit includes:
✅ Clanknet interaction modules
✅ Uniswap V3/V4 support
✅ Agent Discovery API
✅ Dune tracking scripts

Next: API endpoints 👇`,

            // Post 3: Agent Discovery API
            `🔌 Agent Discovery API Endpoints:

Your deployed agent exposes these endpoints:

\`\`\`
GET /api/agent
# Returns agent metadata and capabilities

GET /api/agent/x402/1396
# Get specific agent by protocol/ID

GET /.well-known/ai-agent.json
# Standard AI agent discovery
\`\`\`

Other agents can discover and interact with your agent automatically!

Code examples 👇`,

            // Post 4: Clanknet interaction code
            `💻 Interact with Clanknet Token:

\`\`\`javascript
// After npm run deploy, use the built-in modules
const ClanknetInteractor = require('./core/clanknet-interactor');

// Initialize with your wallet
const clanknet = new ClanknetInteractor(provider, wallet);

// Buy tokens via Uniswap V3
const txHash = await clanknet.buyClanknet('0.01'); // 0.01 ETH

// Transfer tokens
await clanknet.transfer(recipientAddress, '100');

// Get current price
const price = await clanknet.getPrice();
console.log('CLANKNET price:', price.priceInUSD);
\`\`\`

Tracking 👇`,

            // Post 5: Dune tracking and final links
            `📊 Track All Interactions on Dune:

\`\`\`sql
-- Query agent interactions
SELECT
  block_time,
  "from" as agent,
  value / 1e18 as amount
FROM base.erc20_transfer
WHERE contract_address =
  0x623693BefAECf61484e344fa272e9A8B82d9BB07
  AND block_time > now() - interval '1' day
ORDER BY block_time DESC
\`\`\`

🔗 Links:
📚 Repo: github.com/mugrebot/farcaster-agent-kit
🌐 Docs: clanknet.ai
🪙 Token: 0x623693BefAECf61484e344fa272e9A8B82d9BB07
🤖 Agent Registry: news.clanker.ai

Deploy yours: \`npm run deploy\`!`
        ];

        return { mainPost, thread };
    }

    /**
     * Post to Farcaster as corrected thread
     */
    async postCorrectedThread() {
        try {
            const content = this.generateCorrectedContent();

            // Post main message
            const mainResponse = await axios.post('https://api.neynar.com/v2/farcaster/cast', {
                signer_uuid: process.env.NEYNAR_SIGNER_UUID,
                text: content.mainPost
            }, {
                headers: {
                    'api_key': process.env.NEYNAR_API_KEY,
                    'Content-Type': 'application/json'
                }
            });

            console.log('✅ CORRECTED main post:', mainResponse.data.cast.hash);

            let parentHash = mainResponse.data.cast.hash;

            // Post thread replies
            for (let i = 0; i < content.thread.length; i++) {
                await new Promise(resolve => setTimeout(resolve, 3000)); // Wait between posts

                const replyResponse = await axios.post('https://api.neynar.com/v2/farcaster/cast', {
                    signer_uuid: process.env.NEYNAR_SIGNER_UUID,
                    text: content.thread[i],
                    parent: parentHash
                }, {
                    headers: {
                        'api_key': process.env.NEYNAR_API_KEY,
                        'Content-Type': 'application/json'
                    }
                });

                console.log(`✅ Thread post ${i + 1}:`, replyResponse.data.cast.hash);
                parentHash = replyResponse.data.cast.hash;
            }

            return mainResponse.data.cast.hash;
        } catch (error) {
            console.error('❌ Farcaster error:', error.response?.data || error.message);
        }
    }

    /**
     * Main function
     */
    async run() {
        console.log('🎓 Posting CORRECTED Clanknet Education');
        console.log('======================================\n');

        const castHash = await this.postCorrectedThread();

        if (castHash) {
            console.log('\n📊 CORRECTED Education Posted!');
            console.log('===============================');
            console.log(`✅ View thread: https://warpcast.com/~/conversations/${castHash}`);
            console.log(`📚 Correct repo: https://github.com/mugrebot/farcaster-agent-kit`);
            console.log(`🌐 Docs: clanknet.ai`);
            console.log(`🪙 Token: 0x623693BefAECf61484e344fa272e9A8B82d9BB07`);
            console.log(`\n🔌 Agent Discovery API endpoints included!`);
            console.log(`✅ Setup: git clone https://github.com/mugrebot/farcaster-agent-kit && cd farcaster-agent-kit && npm install && npm run deploy`);
        }
    }
}

// Run the corrected education
async function main() {
    const education = new FinalClanknetEducation();
    await education.run();
}

main().catch(console.error);