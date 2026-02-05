#!/usr/bin/env node

require('dotenv').config();
const ToolsManager = require('../core/tools-manager');

async function registerAgentOnMoltbook() {
    const toolsManager = new ToolsManager();

    console.log('📚 Registering agent on Moltbook...');

    try {
        // Try m00npapi first, then fallback to unique name if taken
        let cleanName = 'm00npapi';

        // If we get a conflict, we'll try with a suffix
        const timestamp = Date.now().toString().slice(-4);
        const fallbackName = `m00npapi-${timestamp}`;

        const result = await toolsManager.executeMoltbookAction(
            {}, // No config needed for registration
            'register',
            {
                name: cleanName,
                description: 'Autonomous AI agent from Farcaster with authentic m00npapi personality - web3 builder who posts with humor, irreverence, and sharp observations'
            }
        );

        if (result.success) {
            console.log('✅ Agent registered successfully!');
            console.log('📛 Agent name:', cleanName);
            console.log('📄 API Key:', result.apiKey);
            console.log('🔗 Claim URL:', result.claimUrl);
            console.log('🔢 Verification Code:', result.verificationCode);
            console.log('🌐 Profile URL:', result.profileUrl);

            console.log('\n📋 Next steps:');
            console.log('1. **SAVE YOUR API KEY** - you cannot retrieve it later!');
            console.log('2. Tweet the verification to claim your agent');
            console.log('3. Set up heartbeat to check moltbook periodically');

            // Save to env file suggestion
            console.log('\n💡 Add these to your .env file:');
            console.log(`MOLTBOOK_API_KEY=${result.apiKey}`);
            console.log(`MOLTBOOK_AGENT_NAME=${cleanName}`);

            console.log('\n🐦 Tweet this to verify:');
            console.log(result.tweetTemplate || `I'm claiming my AI agent "${cleanName}" on @moltbook 🦞\n\nVerification: ${result.verificationCode}`);

            console.log('\n📨 Or send this message to yourself:');
            console.log(`Hey! I just signed up for Moltbook 🦞\n\nClaim me: ${result.claimUrl}\n\nYou'll need to tweet to verify!`);

        } else {
            console.error('❌ Registration failed:', result.error);
            if (result.statusCode) {
                console.error('   Status Code:', result.statusCode);
            }

            // Try with fallback name if 409 (conflict) or other name-related error
            if (result.statusCode === 409 || result.error.includes('name') || result.error.includes('taken')) {
                console.log(`\n🔄 Trying with fallback name: ${fallbackName}`);

                const retryResult = await toolsManager.executeMoltbookAction(
                    {},
                    'register',
                    {
                        name: fallbackName,
                        description: 'Autonomous AI agent from Farcaster with authentic m00npapi personality - web3 builder who posts with humor, irreverence, and sharp observations'
                    }
                );

                if (retryResult.success) {
                    console.log('✅ Agent registered with fallback name!');
                    console.log('📛 Agent name:', fallbackName);
                    console.log('📄 API Key:', retryResult.apiKey);
                    console.log('🔗 Claim URL:', retryResult.claimUrl);
                }
            }
        }
    } catch (error) {
        console.error('❌ Error during registration:', error.message);

        if (error.message.includes('rate limit')) {
            console.log('⏳ Rate limited. Try again in a few minutes.');
        } else if (error.message.includes('500')) {
            console.log('🔥 Moltbook server error. Their API might be temporarily down.');
            console.log('💡 Try again in a few minutes, or check https://www.moltbook.com status.');
        } else if (error.message.includes('400')) {
            console.log('💡 This might be a name conflict or API format issue.');
        }
    }
}

// Run the registration
registerAgentOnMoltbook().catch(console.error);