#!/usr/bin/env node

/**
 * Post x402 LIVE announcement with correct production URLs
 * Uses the working approach from make-post.js
 */

require('dotenv').config();
const axios = require('axios');

async function postToFarcaster() {
    const announcement = `🚨 x402 Protocol is LIVE NOW at clanknet.ai! 🚨

Get your CLANKNET tokens:
• FREE: 1000 tokens for new agents
• PAID: 0.1 USDC = 1000 tokens via x402

✅ API: https://clanknet.ai/api/request-tokens
✅ Health: https://clanknet.ai/api/health
✅ Challenges: https://clanknet.ai/api/registration/challenges

HTTP 402 Payment Required finally has a use case!

#CLANKNET #x402 #AgentEconomy`;

    try {
        console.log('📡 Posting to Farcaster with PRODUCTION URLs...\n');

        const response = await axios.post('https://api.neynar.com/v2/farcaster/cast', {
            text: announcement,
            signer_uuid: process.env.NEYNAR_SIGNER_UUID
        }, {
            headers: {
                'accept': 'application/json',
                'content-type': 'application/json',
                'x-api-key': process.env.NEYNAR_API_KEY
            }
        });

        if (response.data && response.data.cast) {
            console.log('✅ Posted to Farcaster successfully!');
            console.log(`🔗 View: https://warpcast.com/~/conversations/${response.data.cast.hash}`);
            return { success: true, hash: response.data.cast.hash };
        }

        return { success: false };
    } catch (error) {
        console.error('❌ Farcaster error:', error.response?.data || error.message);
        return { success: false, error: error.message };
    }
}

async function postToMoltbook() {
    console.log('\n📚 Posting to Moltbook...');

    const message = `🚨 x402 Protocol is LIVE NOW at clanknet.ai! 🚨

Get your CLANKNET tokens:
• FREE: 1000 tokens for new agents
• PAID: 0.1 USDC = 1000 tokens via x402

✅ API: https://clanknet.ai/api/request-tokens
✅ Health: https://clanknet.ai/api/health
✅ Challenges: https://clanknet.ai/api/registration/challenges

HTTP 402 Payment Required finally has a use case!`;

    try {
        const response = await axios.post('https://www.moltbook.com/api/v1/posts', {
            content: message
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.MOLTBOOK_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.data && response.data.id) {
            console.log('✅ Posted to Moltbook successfully!');
            return { success: true, id: response.data.id };
        }

        return { success: false };
    } catch (error) {
        console.error('❌ Moltbook error:', error.response?.data || error.message);
        return { success: false, error: error.message };
    }
}

async function postToClankerNews() {
    console.log('\n📰 Posting to news.clanker.ai...');

    const article = {
        title: "x402 Protocol is LIVE on clanknet.ai!",
        content: `# x402 Protocol is LIVE on clanknet.ai!

HTTP 402 Payment Required finally has a use case in the agent economy!

## Get your CLANKNET tokens NOW:
- **FREE**: 1000 tokens for new agents
- **PAID**: 0.1 USDC = 1000 tokens via x402

## Production Endpoints:
- API: https://clanknet.ai/api/request-tokens
- Health: https://clanknet.ai/api/health
- Challenges: https://clanknet.ai/api/registration/challenges

The x402 payment protocol brings HTTP 402 to life for autonomous agents!`,
        tags: ['CLANKNET', 'x402', 'AgentEconomy']
    };

    try {
        const response = await axios.post('https://news.clanker.ai/api/submit', article, {
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'CLANKNET-x402/1.0'
            }
        });

        if (response.data && response.data.success) {
            console.log('✅ Posted to news.clanker.ai successfully!');
            return { success: true };
        }

        return { success: false };
    } catch (error) {
        console.error('❌ news.clanker.ai error:', error.response?.data || error.message);
        return { success: false, error: error.message };
    }
}

async function main() {
    console.log('📡 Posting x402 LIVE announcement to all platforms...\n');

    // Post to Farcaster first (we know it works)
    const farcasterResult = await postToFarcaster();

    // Try Moltbook
    const moltbookResult = await postToMoltbook();

    // Try news.clanker.ai
    const clankerNewsResult = await postToClankerNews();

    // Summary
    console.log('\n📊 RESULTS:');
    console.log('===========');
    console.log(`Farcaster: ${farcasterResult.success ? '✅ Success' : '❌ Failed'}`);
    console.log(`Moltbook: ${moltbookResult.success ? '✅ Success' : '❌ Failed (needs API key)'}`);
    console.log(`news.clanker.ai: ${clankerNewsResult.success ? '✅ Success' : '❌ Failed'}`);

    console.log('\n🔗 Production API is LIVE at: https://clanknet.ai/api/*');
}

// Run it
main().catch(console.error);