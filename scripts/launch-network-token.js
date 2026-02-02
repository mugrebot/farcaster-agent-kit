#!/usr/bin/env node

require('dotenv').config();
const NetworkTokenLauncher = require('../token/network-token');

async function launchNetworkToken() {
    console.log('🌐 Launching CLANKIT Network Token');
    console.log('==================================');

    const config = {
        apiKey: process.env.NEYNAR_API_KEY,
        signerUuid: process.env.NEYNAR_SIGNER_UUID
    };

    if (!config.apiKey || !config.signerUuid) {
        console.error('❌ Missing required environment variables');
        console.error('   Set NEYNAR_API_KEY and NEYNAR_SIGNER_UUID');
        process.exit(1);
    }

    try {
        const launcher = new NetworkTokenLauncher(config);
        const tokenData = await launcher.launchNetworkToken();

        console.log('\n✅ Network token launch initiated!');
        console.log(`   Ticker: $${tokenData.ticker}`);
        console.log(`   Cast: https://warpcast.com/~/conversations/${tokenData.launchCastHash}`);
        console.log('\n⏰ Monitoring for @clanker response...');
        console.log('   Check back in a few minutes for contract address');

    } catch (error) {
        console.error('❌ Failed to launch network token:', error.message);
        process.exit(1);
    }
}

launchNetworkToken();