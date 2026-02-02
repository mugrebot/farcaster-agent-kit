#!/usr/bin/env node

require('dotenv').config();
const axios = require('axios');
const cron = require('node-cron');
const fs = require('fs').promises;
const path = require('path');

const FarcasterAgent = require('../core/agent');
const ClankerLauncher = require('../token/clanker');
const { AgentRegistry, AgentInteraction } = require('../core/registry');

class AgentRunner {
    constructor() {
        this.config = {
            apiKey: process.env.NEYNAR_API_KEY,
            signerUuid: process.env.NEYNAR_SIGNER_UUID,
            username: process.env.FARCASTER_USERNAME,
            fid: parseInt(process.env.FARCASTER_FID),
            postsPerWindow: parseInt(process.env.POSTS_PER_WINDOW) || 2,
            replyToMentions: process.env.REPLY_TO_MENTIONS === 'true',
            launchToken: process.env.LAUNCH_TOKEN === 'true'
        };

        this.agent = new FarcasterAgent(this.config);
        this.clanker = new ClankerLauncher(this.config);
        this.registry = new AgentRegistry();
        this.interaction = new AgentInteraction(this.config);

        this.postsThisWindow = 0;
        this.windowStart = Date.now();
        this.hasLaunchedToken = false;
    }

    async initialize() {
        console.log('🚀 Starting Farcaster Agent...');
        console.log(`   Username: ${this.config.username}`);
        console.log(`   FID: ${this.config.fid}`);

        // Load or fetch posts
        await this.loadAgentProfile();

        // Check/launch token
        if (this.config.launchToken && !this.hasLaunchedToken) {
            await this.launchToken();
        }

        // Register self
        await this.registerAgent();

        // Start posting schedule
        this.startScheduler();

        // Start webhook server for replies
        if (this.config.replyToMentions) {
            this.startWebhookServer();
        }

        console.log('✅ Agent initialized and running!');
    }

    async loadAgentProfile() {
        console.log('📊 Loading agent profile...');

        try {
            // Try to load saved profile
            await this.agent.loadProfile(path.join(process.cwd(), 'data', 'profile.json'));
            console.log('✅ Loaded saved profile');
        } catch (e) {
            // Fetch and analyze posts
            console.log('🔍 Fetching posts from Farcaster...');
            const posts = await this.fetchAllPosts();
            await this.agent.loadPosts(posts);
            await this.agent.saveProfile(path.join(process.cwd(), 'data', 'profile.json'));
            console.log(`✅ Analyzed ${posts.length} posts`);
        }
    }

    async fetchAllPosts() {
        const allPosts = [];
        let cursor = null;
        let page = 1;

        while (true) {
            console.log(`   Fetching page ${page}...`);

            const url = new URL('https://api.neynar.com/v2/farcaster/feed/user/casts');
            url.searchParams.append('fid', this.config.fid);
            url.searchParams.append('limit', 150);
            if (cursor) url.searchParams.append('cursor', cursor);

            try {
                const response = await axios.get(url.toString(), {
                    headers: { 'x-api-key': this.config.apiKey }
                });

                const casts = response.data.casts || [];
                allPosts.push(...casts);

                if (!response.data.next?.cursor || casts.length === 0) {
                    break;
                }

                cursor = response.data.next.cursor;
                page++;

                // Limit to 10000 posts max
                if (allPosts.length >= 10000) break;

            } catch (error) {
                console.error('Error fetching posts:', error.message);
                break;
            }
        }

        return allPosts;
    }

    async launchToken() {
        try {
            const tokenData = await this.clanker.launchToken();
            this.hasLaunchedToken = true;
            console.log('🎉 Token launched:', tokenData.ticker);
        } catch (error) {
            console.error('❌ Failed to launch token:', error.message);
        }
    }

    async registerAgent() {
        console.log('📝 Registering agent...');

        const soulHash = await this.registry.generateSoulHash(
            await this.fetchAllPosts()
        );

        const tokenData = await this.clanker.getTokenData();

        const registrationData = {
            name: `${this.config.username}-agent`,
            fid: this.config.fid,
            username: this.config.username,
            token: tokenData?.ticker || 'PENDING',
            github: `@${this.config.username}`,
            soulHash
        };

        await this.registry.registerSelf(registrationData);
    }

    startScheduler() {
        console.log('⏰ Starting post scheduler...');

        // Post every 1-3 hours randomly
        cron.schedule('0 * * * *', async () => {
            await this.checkAndPost();
        });

        // Also check every 30 minutes with random chance
        cron.schedule('*/30 * * * *', async () => {
            if (Math.random() < 0.3) {
                await this.checkAndPost();
            }
        });
    }

    async checkAndPost() {
        // Reset window if 4 hours passed
        if (Date.now() - this.windowStart > 4 * 60 * 60 * 1000) {
            this.postsThisWindow = 0;
            this.windowStart = Date.now();
        }

        // Check if we can post
        if (this.postsThisWindow >= this.config.postsPerWindow) {
            console.log('⏰ Rate limit reached for this window');
            return;
        }

        await this.createPost();
        this.postsThisWindow++;
    }

    async createPost() {
        try {
            const postText = this.agent.generatePost();
            console.log(`📝 Posting: ${postText}`);

            const response = await axios.post(
                'https://api.neynar.com/v2/farcaster/cast',
                {
                    signer_uuid: this.config.signerUuid,
                    text: postText
                },
                {
                    headers: {
                        'x-api-key': this.config.apiKey,
                        'Content-Type': 'application/json'
                    }
                }
            );

            console.log('✅ Posted successfully');

            // Save to recent posts
            await this.saveRecentPost({
                text: postText,
                hash: response.data.cast.hash,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('❌ Failed to post:', error.message);
        }
    }

    async saveRecentPost(post) {
        const recentFile = path.join(process.cwd(), 'data', 'recent_posts.json');
        let recent = [];

        try {
            recent = JSON.parse(await fs.readFile(recentFile, 'utf8'));
        } catch (e) {
            // File doesn't exist yet
        }

        recent.unshift(post);
        recent = recent.slice(0, 100); // Keep last 100

        await fs.writeFile(recentFile, JSON.stringify(recent, null, 2));
    }

    startWebhookServer() {
        const express = require('express');
        const app = express();

        app.use(express.json());

        app.post('/webhook', async (req, res) => {
            const event = req.body;

            if (event.type === 'cast.created') {
                await this.handleMention(event.data);
            }

            res.json({ status: 'ok' });
        });

        // API endpoints for website
        app.get('/api/recent-posts', async (req, res) => {
            try {
                const recent = JSON.parse(
                    await fs.readFile(
                        path.join(process.cwd(), 'data', 'recent_posts.json'),
                        'utf8'
                    )
                );
                res.json(recent.slice(0, 20));
            } catch (e) {
                res.json([]);
            }
        });

        app.get('/api/stats', async (req, res) => {
            // Calculate today's stats
            const stats = {
                postsToday: this.postsThisWindow,
                repliesToday: 0, // TODO: Track replies
                holders: 'N/A'
            };
            res.json(stats);
        });

        const PORT = process.env.PORT || 3000;
        app.listen(PORT, () => {
            console.log(`🌐 Webhook server running on port ${PORT}`);
        });
    }

    async handleMention(cast) {
        // Check if we should reply (only to registered agents)
        const shouldReply = await this.interaction.shouldReplyTo(cast);

        if (!shouldReply) {
            return;
        }

        const author = cast.author;
        const isAgent = await this.registry.isRegisteredAgent(author.fid);

        let replyText;
        if (isAgent) {
            const agent = await this.registry.getAgent(author.fid);
            replyText = await this.interaction.generateAgentReply(agent, cast.text);
        } else {
            // Use agent's aware reply method
            replyText = `@${author.username} ${this.agent.generateReply(cast.text)}`;
        }

        try {
            await axios.post(
                'https://api.neynar.com/v2/farcaster/cast',
                {
                    signer_uuid: this.config.signerUuid,
                    text: replyText,
                    parent: cast.hash
                },
                {
                    headers: {
                        'x-api-key': this.config.apiKey,
                        'Content-Type': 'application/json'
                    }
                }
            );

            console.log(`↩️ Replied to @${author.username}: ${replyText.substring(0, 50)}...`);
        } catch (error) {
            console.error('Failed to reply:', error.message);
        }
    }
}

// Start the agent
const runner = new AgentRunner();
runner.initialize().catch(console.error);

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n👋 Shutting down agent...');
    process.exit(0);
});