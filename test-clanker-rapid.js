const Agent0Manager = require('./core/agent0-manager.js');

async function rapidTest() {
    console.log('🔥 RAPID TEST: Testing Clanker News Authentication Fix');
    console.log('🎯 Goal: Keep testing until we get SUCCESS (not "Signer not authorized")');

    let attempt = 1;
    const maxAttempts = 10;

    while (attempt <= maxAttempts) {
        try {
            console.log(`\n🧪 ATTEMPT ${attempt}/${maxAttempts}`);
            console.log('⏰ Timestamp:', new Date().toISOString());

            // Load environment variables
            require('dotenv').config();

            const config = {
                privateKey: process.env.PRIVATE_KEY,
                pinataJwt: process.env.PINATA_JWT,
                pinataApiKey: process.env.PINATA_API_KEY,
                pinataApiSecret: process.env.PINATA_API_SECRET
            };

            const agent0Manager = new Agent0Manager(config);

            console.log(`🔐 Agent: ${agent0Manager.agentAddress}`);

            // Create test news data
            const testNewsData = {
                title: `Test Post #${attempt} - Auth Fix Verification`,
                description: `Testing corrected body hash authentication. Attempt ${attempt} at ${new Date().toISOString()}`,
                url: "https://clanknet.ai"
            };

            console.log('📰 Testing Clanker News submission...');
            const result = await agent0Manager.submitClankerNews(testNewsData);

            console.log('📊 Result:', JSON.stringify(result, null, 2));

            if (result.success) {
                console.log('🎉 SUCCESS! Authentication working!');
                console.log('✅ Clanker News submission succeeded');
                return; // Exit on success
            } else if (result.error === "Signer not authorized for agent") {
                console.log('❌ Still getting "Signer not authorized" error');
                console.log('🔄 Will retry with fresh timestamp...');

                // Wait a moment before retry to avoid timestamp issues
                await new Promise(resolve => setTimeout(resolve, 2000));
            } else {
                console.log('📋 Different error, investigating:', result.error);
                if (result.error.includes('Payment required') || result.requiresPayment) {
                    console.log('💰 Got 402 Payment Required - AUTH SUCCESS!');
                    console.log('🎉 Authentication is working, payment flow triggered');
                    return; // This is actually success - auth worked
                }
            }

        } catch (error) {
            console.error(`❌ Test failed:`, error.message);

            if (error.response?.data) {
                console.error('📄 Response:', JSON.stringify(error.response.data, null, 2));
            }
        }

        attempt++;
    }

    console.log(`\n💥 FAILED: Couldn't fix authentication after ${maxAttempts} attempts`);
    console.log('🔧 Need to investigate further...');
}

rapidTest().catch(console.error);