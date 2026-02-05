const Agent0Manager = require('./core/agent0-manager.js');

async function testAuthFirst() {
    console.log('🚀 PROPER FLOW: Testing Auth FIRST, then Submission');
    console.log('📍 Working Directory:', process.cwd());
    console.log('📁 ENV File Check:', require('fs').existsSync('.env') ? '✅ Found' : '❌ Missing');

    try {
        // Load environment variables
        require('dotenv').config();

        if (!process.env.PRIVATE_KEY) {
            console.error('❌ PRIVATE_KEY not found in environment variables');
            return;
        }

        console.log('🔑 Private key loaded from .env');

        const config = {
            privateKey: process.env.PRIVATE_KEY,
            pinataJwt: process.env.PINATA_JWT,
            pinataApiKey: process.env.PINATA_API_KEY,
            pinataApiSecret: process.env.PINATA_API_SECRET
        };

        const agent0Manager = new Agent0Manager(config);

        console.log(`🤖 Agent: ${agent0Manager.agentAddress}`);

        // STEP 1: Test authentication with /auth/test
        console.log('\n🧪 STEP 1: Testing Clanker News Authentication...');
        const authResult = await agent0Manager.testClankerAuth();

        if (!authResult.success) {
            console.log('❌ AUTH TEST FAILED:', authResult.error);
            console.log('   This means our signature format or agent registration is wrong');
            console.log('   Status:', authResult.status);
            return;
        }

        console.log('🎉 AUTH TEST PASSED!');
        console.log('   Agent is properly authenticated with Clanker News');
        console.log('   Data:', JSON.stringify(authResult.data, null, 2));

        // STEP 2: Now try actual submission since auth works
        console.log('\n📰 STEP 2: Attempting News Submission...');
        const testNewsData = {
            title: 'SUCCESS: Auth Test Passed - Real Submission Attempt',
            description: 'Authentication validated successfully, now testing full submission flow.',
            url: 'https://clanknet.ai'
        };

        const submitResult = await agent0Manager.submitClankerNews(testNewsData);

        if (submitResult.success) {
            console.log('🎉🎉 COMPLETE SUCCESS! News submitted successfully!');
            console.log('   Result:', JSON.stringify(submitResult, null, 2));
        } else {
            console.log('📋 Submission result:', submitResult.error);
            if (submitResult.error?.includes('Payment required') || submitResult.requiresPayment) {
                console.log('💰 Got payment requirement - this is actually GOOD!');
                console.log('   Auth is working, just need to handle payment flow');
            }
        }

    } catch (error) {
        console.error('💥 Test failed with error:', error.message);
        if (error.response?.data) {
            console.error('📄 Response data:', JSON.stringify(error.response.data, null, 2));
        }
    }
}

testAuthFirst().catch(console.error);