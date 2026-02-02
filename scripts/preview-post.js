#!/usr/bin/env node

require('dotenv').config();
const Agent = require('../core/agent');
const path = require('path');

/**
 * Preview what the agent would post without actually posting
 */
async function previewPost() {
    console.log('🔮 Generating preview post using your voice profile...');

    try {
        // Initialize the agent with full profile
        const agent = new Agent({
            username: process.env.FARCASTER_USERNAME,
            fid: process.env.FARCASTER_FID,
            neynarApiKey: process.env.NEYNAR_API_KEY,
            signerUuid: process.env.NEYNAR_SIGNER_UUID
        });

        // Load the agent's voice profile
        const profilePath = path.join(__dirname, '../data/profile.json');
        console.log('📊 Loading your voice profile...');
        await agent.loadProfile(profilePath);

        console.log('🎭 Voice profile loaded! Stats:');
        console.log(`   - Average post length: ${agent.voiceProfile.avgLength} characters`);
        console.log(`   - Total patterns analyzed: ${Object.keys(agent.voiceProfile.commonWords || {}).length} word patterns`);
        console.log(`   - Voice model: Claude Sonnet 4-5 + pattern analysis`);

        console.log('\n🧠 Generating sample posts...');

        // Generate different types of posts
        const postTypes = ['observation', 'shitpost', 'mini_rant'];

        for (const type of postTypes) {
            console.log(`\n📝 ${type.toUpperCase()}:`);

            // Generate using your voice profile
            const post = await agent.generatePost(type);
            console.log(`   "${post}"`);
            console.log(`   Length: ${post.length} characters`);
        }

        console.log('\n✨ These are examples of what your agent would post autonomously!');
        console.log('💡 Each post uses Claude + your 8,247-post voice analysis for authentic style');

    } catch (error) {
        console.error('❌ Error generating preview:', error.message);
    }
}

previewPost();