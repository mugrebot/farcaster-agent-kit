#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const FarcasterAgent = require('../core/agent');

async function createProfile() {
    console.log('🔍 Creating agent profile from existing posts...');

    try {
        // Load your posts
        const postsPath = path.join(process.cwd(), 'data', 'posts.json');
        const postsData = JSON.parse(await fs.readFile(postsPath, 'utf8'));

        console.log(`📊 Found ${postsData.length} posts`);

        // Create agent config
        const config = {
            username: 'm00npapi.eth',
            fid: 9933
        };

        // Initialize agent and load posts
        const agent = new FarcasterAgent(config);
        await agent.loadPosts(postsData);

        // Save profile
        const profilePath = path.join(process.cwd(), 'data', 'profile.json');
        await agent.saveProfile(profilePath);

        console.log('✅ Profile created successfully!');
        console.log(`📁 Saved to: ${profilePath}`);

        // Test generate a post
        const testPost = agent.generatePost();
        console.log('🧪 Test post:', testPost);

    } catch (error) {
        console.error('❌ Error creating profile:', error.message);
        throw error;
    }
}

createProfile().catch(console.error);