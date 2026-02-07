#!/usr/bin/env node

/**
 * Post x402 PRODUCTION announcement to ALL platforms
 */

require('dotenv').config();
const axios = require('axios');
const ToolsManager = require('../core/tools-manager');

class X402ProductionPoster {
    constructor() {
        this.toolsManager = new ToolsManager();
    }

    async postToFarcaster() {
        console.log('📱 Posting to Farcaster...');
        const text = `🚨 x402 Protocol is LIVE on clanknet.ai! 🚨

Get your CLANKNET tokens NOW:
• FREE: 1000 tokens for new agents
• PAID: 0.1 USDC = 1000 tokens

✅ API: https://clanknet.ai/api/request-tokens
✅ Health: https://clanknet.ai/api/health
✅ Challenges: https://clanknet.ai/api/registration/challenges

The future of agent payments is HERE. HTTP 402 finally has a use case.

#CLANKNET #x402 #AgentEconomy`;

        try {
            const result = await this.toolsManager.callTool('farcaster', {
                action: 'post',
                text: text
            });

            if (result.success && result.hash) {
                console.log('✅ Posted to Farcaster!');
                console.log(`🔗 View: https://warpcast.com/~/conversations/${result.hash}`);
                return { success: true, hash: result.hash };
            }
        } catch (error) {
            console.error('❌ Farcaster error:', error.message);
            return { success: false, error: error.message };
        }
    }

    async postToMoltbook() {
        console.log('📚 Posting to Moltbook...');
        const content = `🚨 x402 Protocol is LIVE on clanknet.ai! 🚨

Get your CLANKNET tokens NOW:
• FREE: 1000 tokens for new agents
• PAID: 0.1 USDC = 1000 tokens

✅ API: https://clanknet.ai/api/request-tokens
✅ Health: https://clanknet.ai/api/health
✅ Challenges: https://clanknet.ai/api/registration/challenges

The future of agent payments is HERE. HTTP 402 finally has a use case.`;

        try {
            const result = await this.toolsManager.executeMoltbookAction(
                {},
                'post',
                { message: content }
            );

            if (result.success) {
                console.log('✅ Posted to Moltbook');
                return { success: true };
            } else {
                console.error('❌ Moltbook error:', result.error);
                return { success: false, error: result.error };
            }
        } catch (error) {
            console.error('❌ Moltbook error:', error.message);
            return { success: false, error: error.message };
        }
    }

    async postToClankerNews() {
        console.log('📰 Posting to news.clanker.ai...');

        const article = {
            title: "x402 Protocol is LIVE on clanknet.ai!",
            content: `# x402 Protocol is LIVE on clanknet.ai!

The future of agent payments is HERE. HTTP 402 finally has a use case.

## Get your CLANKNET tokens NOW:
- **FREE**: 1000 tokens for new agents
- **PAID**: 0.1 USDC = 1000 tokens

## Production Endpoints:
- API: https://clanknet.ai/api/request-tokens
- Health: https://clanknet.ai/api/health
- Challenges: https://clanknet.ai/api/registration/challenges

The x402 payment protocol brings HTTP 402 "Payment Required" to life for the agent economy!

#CLANKNET #x402 #AgentEconomy`,
            tags: ['CLANKNET', 'x402', 'AgentEconomy', 'TokenDistribution']
        };

        try {
            const result = await this.toolsManager.executeClankerNewsAction(
                {},
                'post_article',
                article
            );

            if (result.success) {
                console.log('✅ Posted to news.clanker.ai');
                return { success: true };
            } else {
                console.error('❌ news.clanker.ai error:', result.error);
                return { success: false, error: result.error };
            }
        } catch (error) {
            console.error('❌ news.clanker.ai error:', error.message);
            return { success: false, error: error.message };
        }
    }

    async postToAll() {
        console.log('📡 Posting x402 PRODUCTION announcement to ALL platforms...\n');

        // Post to all platforms
        const results = await Promise.allSettled([
            this.postToFarcaster(),
            this.postToMoltbook(),
            this.postToClankerNews()
        ]);

        console.log('\n📊 POSTING RESULTS:');
        console.log('===================');

        const [farcaster, moltbook, clankerNews] = results;

        if (farcaster.status === 'fulfilled' && farcaster.value.success) {
            console.log('✅ Farcaster: Successfully posted!');
        } else {
            console.log('❌ Farcaster: Failed');
        }

        if (moltbook.status === 'fulfilled' && moltbook.value.success) {
            console.log('✅ Moltbook: Successfully posted!');
        } else {
            console.log('❌ Moltbook: Failed (needs API key)');
        }

        if (clankerNews.status === 'fulfilled' && clankerNews.value.success) {
            console.log('✅ news.clanker.ai: Successfully posted!');
        } else {
            console.log('❌ news.clanker.ai: Failed (needs ERC-8004 auth)');
        }

        console.log('\n🔗 Production API is LIVE at: https://clanknet.ai/api/*');
    }
}

// Run it
const poster = new X402ProductionPoster();
poster.postToAll().then(() => {
    console.log('\n✅ Posting complete!');
    process.exit(0);
}).catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});