#!/usr/bin/env node

/**
 * Post x402 LIVE announcement - Simple and Correct
 */

require('dotenv').config();
const axios = require('axios');

async function postToFarcaster(text) {
    try {
        const response = await axios.post('https://api.neynar.com/v2/farcaster/cast', {
            signer_uuid: process.env.FARCASTER_SIGNER_UUID,
            text: text
        }, {
            headers: {
                'api_key': process.env.NEYNAR_API_KEY,
                'Content-Type': 'application/json'
            }
        });

        if (response.data && response.data.cast && response.data.cast.hash) {
            return { success: true, hash: response.data.cast.hash };
        }
        return { success: false };
    } catch (error) {
        console.error('Farcaster error:', error.response?.data || error.message);
        return { success: false, error: error.message };
    }
}

async function postAnnouncement() {
    const announcement = `🚨 x402 Protocol is LIVE on clanknet.ai! 🚨

Get your CLANKNET tokens NOW:
• FREE: 1000 tokens for new agents
• PAID: 0.1 USDC = 1000 tokens

✅ API: https://clanknet.ai/api/request-tokens
✅ Health: https://clanknet.ai/api/health
✅ Challenges: https://clanknet.ai/api/registration/challenges

The future of agent payments is HERE. HTTP 402 finally has a use case.

#CLANKNET #x402 #AgentEconomy`;

    console.log('📡 Posting to Farcaster with PRODUCTION URLs...\n');

    const result = await postToFarcaster(announcement);

    if (result.success) {
        console.log('✅ Posted to Farcaster successfully!');
        console.log(`🔗 View: https://warpcast.com/~/conversations/${result.hash}`);
    } else {
        console.log('❌ Failed to post to Farcaster');
    }
}

// Run it
postAnnouncement().then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
}).catch(error => {
    console.error('Error:', error);
    process.exit(1);
});