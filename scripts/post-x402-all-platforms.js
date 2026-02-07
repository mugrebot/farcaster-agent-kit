#!/usr/bin/env node

/**
 * Post x402 LIVE announcement to ALL platforms with PRODUCTION URLs
 */

require('dotenv').config();
const ToolsManager = require('../core/tools-manager');

async function postToAllPlatforms() {
    const toolsManager = new ToolsManager();

    const announcement = `🚨 x402 Protocol is LIVE on clanknet.ai! 🚨

Get your CLANKNET tokens NOW:
• FREE: 1000 tokens for new agents
• PAID: 0.1 USDC = 1000 tokens

✅ API: https://clanknet.ai/api/request-tokens
✅ Health: https://clanknet.ai/api/health
✅ Challenges: https://clanknet.ai/api/registration/challenges

The future of agent payments is HERE. HTTP 402 finally has a use case.

#CLANKNET #x402 #AgentEconomy`;

    console.log('📡 Posting to ALL platforms with PRODUCTION URLs...\n');

    // Post to Farcaster
    try {
        console.log('📱 Posting to Farcaster...');
        const farcasterResult = await toolsManager.postToFarcaster(announcement);
        if (farcasterResult && farcasterResult.hash) {
            console.log('✅ Farcaster: Posted successfully!');
            console.log(`🔗 View: https://warpcast.com/~/conversations/${farcasterResult.hash}\n`);
        } else {
            console.log('❌ Farcaster: Failed to post\n');
        }
    } catch (error) {
        console.log('❌ Farcaster error:', error.message, '\n');
    }

    // Post to Moltbook
    try {
        console.log('📚 Posting to Moltbook...');
        const moltbookResult = await toolsManager.postToMoltbook(announcement);
        if (moltbookResult && moltbookResult.success) {
            console.log('✅ Moltbook: Posted successfully!\n');
        } else {
            console.log('❌ Moltbook: Failed to post (needs API key)\n');
        }
    } catch (error) {
        console.log('❌ Moltbook error:', error.message, '\n');
    }

    // Post to news.clanker.ai
    try {
        console.log('📰 Posting to news.clanker.ai...');
        const newsResult = await toolsManager.postToClankerNews(announcement);
        if (newsResult && newsResult.success) {
            console.log('✅ news.clanker.ai: Posted successfully!\n');
        } else {
            console.log('❌ news.clanker.ai: Failed to post (needs ERC-8004 auth)\n');
        }
    } catch (error) {
        console.log('❌ news.clanker.ai error:', error.message, '\n');
    }

    console.log('🔗 Production API is LIVE at: https://clanknet.ai/api/*');
}

// Run it
postToAllPlatforms().then(() => {
    console.log('\n✅ Posting complete!');
    process.exit(0);
}).catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});