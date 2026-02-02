#!/usr/bin/env node

const readline = require('readline');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function setup() {
    console.log('');
    console.log('🤖 Farcaster Agent Kit Setup');
    console.log('============================');
    console.log('');

    const config = {};

    // Get Neynar API key
    console.log('📋 Step 1: Neynar Configuration');
    console.log('Get your API key at: https://neynar.com');
    console.log('');
    config.NEYNAR_API_KEY = await question('Enter your Neynar API key: ');

    // Get signer UUID
    console.log('');
    console.log('📝 Step 2: Signer Configuration');
    console.log('You need an approved signer UUID to post on Farcaster');
    config.NEYNAR_SIGNER_UUID = await question('Enter your signer UUID: ');

    // Get username
    console.log('');
    console.log('👤 Step 3: Farcaster Identity');
    config.FARCASTER_USERNAME = await question('Enter your Farcaster username: ');

    // Try to fetch FID
    console.log('');
    console.log('🔍 Looking up your FID...');
    try {
        const response = await axios.get(
            `https://api.neynar.com/v2/farcaster/user/by_username?username=${config.FARCASTER_USERNAME}`,
            {
                headers: { 'x-api-key': config.NEYNAR_API_KEY }
            }
        );

        config.FARCASTER_FID = response.data.user.fid;
        console.log(`✅ Found FID: ${config.FARCASTER_FID}`);
    } catch (e) {
        console.log('❌ Could not fetch FID automatically');
        config.FARCASTER_FID = await question('Enter your FID manually: ');
    }

    // Agent settings
    console.log('');
    console.log('⚙️ Step 4: Agent Configuration');

    const postFreq = await question('Posts per 4 hours (1-2, default 2): ') || '2';
    config.POSTS_PER_WINDOW = parseInt(postFreq);

    const replyToAll = await question('Reply to all quality mentions? (y/n, default y): ') || 'y';
    config.REPLY_TO_MENTIONS = replyToAll.toLowerCase() === 'y';

    // Website settings
    console.log('');
    console.log('🌐 Step 5: Website Configuration');

    const deployWeb = await question('Deploy agent website? (y/n, default y): ') || 'y';
    config.DEPLOY_WEBSITE = deployWeb.toLowerCase() === 'y';

    if (config.DEPLOY_WEBSITE) {
        config.WEBSITE_DOMAIN = await question('Custom domain (leave empty for auto): ') ||
            `agent-${config.FARCASTER_USERNAME.replace('.eth', '')}.vercel.app`;
    }

    // Token launch
    console.log('');
    console.log('🚀 Step 6: Token Launch');

    const launchToken = await question('Launch token via @clanker? (y/n, default y): ') || 'y';
    config.LAUNCH_TOKEN = launchToken.toLowerCase() === 'y';

    if (config.LAUNCH_TOKEN) {
        console.log(`Token will be: $AGENT${config.FARCASTER_USERNAME.replace('.eth', '').toUpperCase()}`);
        const confirm = await question('Confirm token launch? (y/n): ');
        if (confirm.toLowerCase() !== 'y') {
            config.LAUNCH_TOKEN = false;
        }
    }

    // Save configuration
    console.log('');
    console.log('💾 Saving configuration...');

    // Create .env file
    const envContent = Object.entries(config)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');

    await fs.writeFile(path.join(process.cwd(), '.env'), envContent);

    // Create data directory
    await fs.mkdir(path.join(process.cwd(), 'data'), { recursive: true });

    console.log('✅ Configuration saved to .env');
    console.log('');
    console.log('📊 Next Steps:');
    console.log('1. Run: npm run analyze     - Fetch and analyze your posts');
    console.log('2. Run: npm run launch-token - Launch your token (if enabled)');
    console.log('3. Run: npm start           - Start your agent');
    console.log('');
    console.log('Or run everything: npm run deploy');

    rl.close();
}

// Handle errors
process.on('unhandledRejection', (error) => {
    console.error('❌ Setup failed:', error.message);
    process.exit(1);
});

// Run setup
setup().catch(console.error);