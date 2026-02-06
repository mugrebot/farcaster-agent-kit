#!/usr/bin/env node

require('dotenv').config();
const axios = require('axios');

const text = process.argv.slice(2).join(' ');

if (!text) {
    console.log('Usage: npm run post "your message here"');
    process.exit(1);
}

async function post() {
    try {
        const response = await axios.post('https://api.neynar.com/v2/farcaster/cast', {
            signer_uuid: process.env.NEYNAR_SIGNER_UUID,
            text: text
        }, {
            headers: {
                'api_key': process.env.NEYNAR_API_KEY,
                'Content-Type': 'application/json'
            }
        });

        console.log('✅ Posted to Farcaster!');
        console.log('📝 Text:', text);
        console.log('🔗 View at: https://warpcast.com/~/conversations/' + response.data.cast.hash);
    } catch (error) {
        console.error('❌ Error:', error.response?.data?.message || error.message);
    }
}

post();