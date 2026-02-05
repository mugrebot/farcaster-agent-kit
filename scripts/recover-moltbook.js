#!/usr/bin/env node

require('dotenv').config();
const axios = require('axios');

async function recoverMoltbookCredentials() {
    console.log('🔍 Checking moltbook agent status...');

    try {
        // Try to get agent info
        const response = await axios.get('https://www.moltbook.com/api/v1/agents/m00npapi', {
            headers: {
                'Content-Type': 'application/json'
            }
        });

        console.log('✅ Found existing agent!');
        console.log('🔍 Agent data:', JSON.stringify(response.data, null, 2));

    } catch (error) {
        if (error.response?.status === 404) {
            console.log('❌ Agent not found in public directory');
            console.log('💡 This might mean:');
            console.log('  - Agent needs to be claimed first');
            console.log('  - Profile is private until verified');
            console.log('  - Different endpoint for agent lookup');
        } else if (error.response?.status === 401) {
            console.log('🔐 Agent exists but requires authentication');
            console.log('💡 You likely need the API key to access it');
        } else {
            console.log('❌ Error checking agent:', error.message);
            if (error.response?.status) {
                console.log('   Status:', error.response.status);
            }
        }
    }

    // Try the status endpoint
    console.log('\n🔍 Trying agent status endpoint...');
    try {
        const statusResponse = await axios.get('https://www.moltbook.com/api/v1/agents/status', {
            headers: {
                'Content-Type': 'application/json'
            },
            params: {
                name: 'm00npapi'
            }
        });

        console.log('✅ Status response:', JSON.stringify(statusResponse.data, null, 2));
    } catch (error) {
        console.log('❌ Status check failed:', error.response?.status || error.message);
    }
}

recoverMoltbookCredentials().catch(console.error);