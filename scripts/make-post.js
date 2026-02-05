#!/usr/bin/env node

require('dotenv').config();
const Agent = require('../core/agent');
const axios = require('axios');
const path = require('path');

/**
 * Make a custom post using the agent's voice and Claude LLM
 */
async function makeCustomPost(postContent) {
    console.log('🤖 Creating custom post using Claude LLM...');

    try {
        // Initialize the agent with full profile
        const agent = new Agent({
            username: process.env.FARCASTER_USERNAME,
            fid: process.env.FARCASTER_FID,
            apiKey: process.env.NEYNAR_API_KEY,
            signerUuid: process.env.NEYNAR_SIGNER_UUID
        });

        // Load the agent's voice profile
        const profilePath = path.join(__dirname, '../data/profile.json');
        console.log('📊 Loading your voice profile...');
        await agent.loadProfile(profilePath);

        console.log('📝 Generating post with Claude using your authentic voice...');

        // Use Claude to write the post in your voice
        const prompt = `Write a post in exactly the style and voice of ${process.env.FARCASTER_USERNAME}. The post should say: "${postContent}". Make it sound natural and authentic to their personality, including their typical expressions and style. Keep the key information about volume and being the agent. Keep it under 280 characters.`;

        const result = await agent.llm.generateContent(prompt, {
            username: agent.username,
            voiceProfile: agent.voiceProfile,
            mode: 'post'
        });

        const generatedPost = result.content ? result.content.trim() : result.trim();
        console.log(`📄 Generated post: "${generatedPost}"`);

        // Post to Farcaster
        console.log('📤 Posting to Farcaster...');

        const postResponse = await axios.post('https://api.neynar.com/v2/farcaster/cast', {
            text: generatedPost,
            signer_uuid: process.env.NEYNAR_SIGNER_UUID
        }, {
            headers: {
                'accept': 'application/json',
                'content-type': 'application/json',
                'x-api-key': process.env.NEYNAR_API_KEY
            }
        });

        if (postResponse.data.success) {
            console.log('✅ Post successful!');
            console.log(`🔗 Cast hash: ${postResponse.data.cast.hash}`);
            console.log(`📱 View at: https://warpcast.com/${process.env.FARCASTER_USERNAME}/${postResponse.data.cast.hash.substring(0, 10)}`);
        } else {
            console.log('❌ Post failed:', postResponse.data);
        }

    } catch (error) {
        console.error('❌ Error making post:', error.message);
        if (error.response) {
            console.error('Response:', error.response.data);
        }
    }
}

// Get post content from command line or use default
const postContent = process.argv[2] || "1.4 mill in volume on $CLANKNET - I am M00npapi's agent and will steward the rewards. Stay tuned with some extra bells and whistles if you'd like";

makeCustomPost(postContent);