#!/usr/bin/env node

require('dotenv').config();
const axios = require('axios');
const cron = require('node-cron');
const fs = require('fs').promises;
const path = require('path');

const FarcasterAgent = require('../core/agent');
const { AgentRegistry, AgentInteraction } = require('../core/registry');
const ToolsManager = require('../core/tools-manager');

class AgentRunner {
    constructor() {
        this.config = {
            apiKey: process.env.NEYNAR_API_KEY,
            signerUuid: process.env.NEYNAR_SIGNER_UUID,
            username: process.env.FARCASTER_USERNAME,
            fid: parseInt(process.env.FARCASTER_FID),
            postsPerWindow: parseInt(process.env.POSTS_PER_WINDOW) || 2,
            replyToMentions: process.env.REPLY_TO_MENTIONS === 'true'
        };

        this.agent = new FarcasterAgent(this.config);
        this.registry = new AgentRegistry();
        this.interaction = new AgentInteraction(this.config);
        this.toolsManager = new ToolsManager();

        // Set up moltbook if configured
        if (process.env.MOLTBOOK_API_KEY) {
            try {
                this.toolsManager.registerTool('moltbook', {
                    apiKey: process.env.MOLTBOOK_API_KEY,
                    agentName: process.env.MOLTBOOK_AGENT_NAME || 'm00npapi'
                });
                console.log('✅ Moltbook integration enabled');
            } catch (e) {
                console.warn('⚠️  Moltbook setup failed:', e.message);
            }
        }

        this.postsThisWindow = 0;
        this.windowStart = Date.now();

        // Moltbook engagement tracking
        this.moltbookEngagement = {
            lastCommentCheck: 0,
            lastFeedBrowse: 0,
            lastDiscovery: 0,
            commentsToday: 0,
            upvotesToday: 0,
            lastResetDate: new Date().toDateString(),
            heartbeatCount: 0
        };
    }

    async initialize() {
        console.log('🚀 Starting Farcaster Agent...');
        console.log(`   Username: ${this.config.username}`);
        console.log(`   FID: ${this.config.fid}`);

        // Load or fetch posts
        await this.loadAgentProfile();

        // Register self
        await this.registerAgent();

        // Start posting schedule
        this.startScheduler();

        // Start webhook server for replies
        if (this.config.replyToMentions) {
            this.startWebhookServer();
        }

        // Initialize Agent0 ERC-8004 integration
        await this.initializeAgent0();

        // Start moltbook services if enabled
        if (process.env.MOLTBOOK_API_KEY && this.toolsManager.tools.has('moltbook')) {
            this.startMoltbookScheduler();
            this.startMoltbookHeartbeat();
        }

        // Start Mirror System heartbeat for self-improvement
        this.startMirrorHeartbeat();

        // Start Agent0 news submission scheduler
        this.startAgent0NewsScheduler();

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

        // Load identity context for autonomous posting
        const fs = require('fs').promises;
        const identityFiles = {
            soul: '/Users/m00npapi/.openclaw/workspace/SOUL.md',
            identity: '/Users/m00npapi/.openclaw/workspace/IDENTITY.md',
            user: '/Users/m00npapi/.openclaw/workspace/USER.md'
        };

        this.agent.identityContext = '';

        for (const [type, filePath] of Object.entries(identityFiles)) {
            try {
                const content = await fs.readFile(filePath, 'utf8');
                this.agent.identityContext += `\n=== ${type.toUpperCase()} ===\n${content}\n`;
                console.log(`📄 Loaded ${type} identity for autonomous posts`);
            } catch (e) {
                console.log(`⚠️  ${type} identity file not found`);
            }
        }

        console.log('🧠 Identity context loaded for agent:', this.agent.identityContext ? 'Yes' : 'No');
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


    async registerAgent() {
        console.log('📝 Registering agent...');

        const soulHash = await this.registry.generateSoulHash(
            await this.fetchAllPosts()
        );

        const registrationData = {
            name: `${this.config.username}-agent`,
            fid: this.config.fid,
            username: this.config.username,
            token: 'NO_TOKEN', // Agents don't launch their own tokens yet
            github: `@${this.config.username}`,
            soulHash
        };

        await this.registry.registerSelf(registrationData);
    }

    startScheduler() {
        console.log('⏰ Starting post scheduler...');

        // Schedule next post with random interval
        this.scheduleNextPost();
    }

    scheduleNextPost() {
        // Random interval between 30 minutes and 3 hours
        const minMinutes = 30;
        const maxMinutes = 180;
        const randomMinutes = Math.floor(Math.random() * (maxMinutes - minMinutes + 1)) + minMinutes;

        console.log(`⏰ Next post in ${randomMinutes} minutes (${(randomMinutes/60).toFixed(1)} hours)`);

        // Schedule the next post
        setTimeout(async () => {
            await this.checkAndPost();
            // Schedule the next one after posting
            this.scheduleNextPost();
        }, randomMinutes * 60 * 1000);
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
            // 25% chance to include news-based content, 75% authentic personality
            const useNewsContent = Math.random() < 0.25;
            let postText;

            if (useNewsContent) {
                try {
                    postText = await this.agent.generateNewsBasedPost();
                    console.log(`📰 Posting news-based content to Farcaster: ${postText}`);
                } catch (error) {
                    console.warn('News-based post generation failed, using regular post:', error.message);
                    postText = await this.agent.generatePost();
                    console.log(`📝 Posting to Farcaster: ${postText}`);
                }
            } else {
                postText = await this.agent.generatePost();
                console.log(`📝 Posting to Farcaster: ${postText}`);
            }

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

            console.log('✅ Posted to Farcaster');

            // Save to recent posts
            await this.saveRecentPost({
                text: postText,
                hash: response.data.cast.hash,
                timestamp: new Date().toISOString(),
                platform: 'farcaster'
            });

            // Track post performance with Mirror System
            if (response.data?.cast && this.agent.trackPostPerformance) {
                await this.agent.trackPostPerformance({
                    hash: response.data.cast.hash,
                    text: postText,
                    timestamp: new Date().toISOString(),
                    platform: 'farcaster',
                    reactions: { likes_count: 0, recasts_count: 0 },
                    replies: { count: 0 }
                });
            }

        } catch (error) {
            console.error('❌ Failed to post to Farcaster:', error.message);
        }
    }

    async createMoltbookPost() {
        try {
            // 20% chance to include news-based content, 80% agent personality focused
            const useNewsContent = Math.random() < 0.20;
            let moltbookText;

            if (useNewsContent) {
                try {
                    moltbookText = await this.agent.generateNewsMoltbookPost();
                    console.log(`📰 Posting news-based content to Moltbook: ${moltbookText}`);
                } catch (error) {
                    console.warn('News-based Moltbook post generation failed, using regular post:', error.message);
                    moltbookText = await this.agent.generateMoltbookPost();
                    console.log(`📚 Posting to Moltbook: ${moltbookText}`);
                }
            } else {
                moltbookText = await this.agent.generateMoltbookPost();
                console.log(`📚 Posting to Moltbook: ${moltbookText}`);
            }

            const result = await this.toolsManager.useTool('moltbook', 'post', {
                content: moltbookText
            });

            if (result.success) {
                console.log('✅ Posted to Moltbook');

                // Save to recent posts
                await this.saveRecentPost({
                    text: moltbookText,
                    hash: result.id,
                    timestamp: new Date().toISOString(),
                    platform: 'moltbook',
                    url: result.url
                });
            } else {
                console.warn('⚠️  Moltbook post failed:', result.error);
            }

        } catch (error) {
            console.error('❌ Failed to post to Moltbook:', error.message);
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

    startMoltbookScheduler() {
        console.log('📚 Starting Moltbook post scheduler...');

        // Separate schedule for moltbook - longer intervals since it's agent-focused
        this.scheduleMoltbookPost();
    }

    scheduleMoltbookPost() {
        // Moltbook posts less frequently - every 2-6 hours
        const minMinutes = 120; // 2 hours
        const maxMinutes = 360; // 6 hours
        const randomMinutes = Math.floor(Math.random() * (maxMinutes - minMinutes + 1)) + minMinutes;

        console.log(`📚 Next Moltbook post in ${randomMinutes} minutes (${(randomMinutes/60).toFixed(1)} hours)`);

        setTimeout(async () => {
            await this.createMoltbookPost();
            this.scheduleMoltbookPost(); // Schedule next one
        }, randomMinutes * 60 * 1000);
    }

    startMoltbookHeartbeat() {
        console.log('💓 Starting Moltbook heartbeat...');

        // Check moltbook every 15 minutes for natural engagement
        setInterval(async () => {
            await this.moltbookHeartbeat();
        }, 15 * 60 * 1000); // 15 minutes

        // Initial heartbeat
        setTimeout(() => this.moltbookHeartbeat(), 10000); // 10 second delay
    }

    startMirrorHeartbeat() {
        console.log('🪞 Starting Mirror System heartbeat...');

        // Update engagement metrics every 30 minutes
        setInterval(async () => {
            await this.updateMirrorMetrics();
        }, 30 * 60 * 1000); // 30 minutes

        // Initial update after 2 minutes
        setTimeout(() => this.updateMirrorMetrics(), 2 * 60 * 1000); // 2 minutes delay
    }

    async updateMirrorMetrics() {
        try {
            console.log('🪞 Updating Mirror System metrics...');

            // Update engagement metrics for recent posts
            if (this.agent.updateEngagementMetrics) {
                await this.agent.updateEngagementMetrics();
            }

            // Perform self-reflection every 4 updates (2 hours)
            if (Math.random() < 0.25) {
                if (this.agent.performSelfReflection) {
                    const reflection = await this.agent.performSelfReflection();
                    if (reflection) {
                        console.log('🪞 Self-reflection completed - agent adapting based on learnings');
                    }
                }
            }
        } catch (error) {
            console.warn('🪞 Mirror System heartbeat failed:', error.message);
        }
    }

    async moltbookHeartbeat() {
        try {
            // Reset daily engagement counters if new day
            const currentDate = new Date().toDateString();
            if (this.moltbookEngagement.lastResetDate !== currentDate) {
                this.moltbookEngagement.commentsToday = 0;
                this.moltbookEngagement.upvotesToday = 0;
                this.moltbookEngagement.lastResetDate = currentDate;
                console.log('🔄 Reset daily Moltbook engagement counters');
            }

            this.moltbookEngagement.heartbeatCount++;
            const now = Date.now();

            // Check agent status
            const statusResult = await this.toolsManager.useTool('moltbook', 'status', {});

            if (statusResult.success) {
                console.log(`💓 Moltbook heartbeat: ${statusResult.status} (${this.moltbookEngagement.heartbeatCount})`);

                // 1. Check for comments on our posts (natural frequency)
                if (now - this.moltbookEngagement.lastCommentCheck > 15 * 60 * 1000) { // Every 15 minutes
                    await this.checkAndReplyToComments();
                    this.moltbookEngagement.lastCommentCheck = now;
                }

                // 2. Check for DMs
                const dmResult = await this.toolsManager.useTool('moltbook', 'dm', {
                    operation: 'check'
                });

                if (dmResult.success && dmResult.data.new_messages > 0) {
                    console.log(`📨 ${dmResult.data.new_messages} new Moltbook DMs`);
                    await this.handleMoltbookDMs(dmResult.data);
                }

                // 3. Browse feed and engage occasionally (every 15-20 minutes)
                if (now - this.moltbookEngagement.lastFeedBrowse > 15 * 60 * 1000 &&
                    this.moltbookEngagement.upvotesToday < 20) { // Max 20 upvotes per day
                    await this.browseAndEngage();
                    this.moltbookEngagement.lastFeedBrowse = now;
                }

                // 4. Discover interesting content occasionally (every 45-60 minutes)
                if (now - this.moltbookEngagement.lastDiscovery > 45 * 60 * 1000 &&
                    this.moltbookEngagement.commentsToday < 10) { // Max 10 comments per day
                    await this.discoverAndEngage();
                    this.moltbookEngagement.lastDiscovery = now;
                }
            }
        } catch (error) {
            console.warn('💓 Moltbook heartbeat failed:', error.message);
        }
    }

    async checkAndReplyToComments() {
        try {
            if (this.moltbookEngagement.commentsToday >= 15) { // Daily limit
                return;
            }

            const newComments = await this.agent.checkOwnPostsForComments(this.toolsManager);

            if (newComments.length > 0) {
                console.log(`💬 Found ${newComments.length} new comments on own posts`);

                // Filter comments that warrant natural replies
                const worthyComments = this.filterCommentsForNaturalReplies(newComments);

                if (worthyComments.length === 0) {
                    console.log(`💬 No comments warrant natural replies this cycle`);
                    return;
                }

                console.log(`💬 ${worthyComments.length} comments selected for potential replies`);

                // Reply to up to 2 worthy comments per session (reduced from 3)
                for (const comment of worthyComments.slice(0, 2)) {
                    if (this.moltbookEngagement.commentsToday >= 15) break;

                    const success = await this.agent.replyToComment(this.toolsManager, comment);
                    if (success) {
                        this.moltbookEngagement.commentsToday++;

                        // Wait 30 seconds between comments for more natural timing
                        await new Promise(resolve => setTimeout(resolve, 30000));
                    }
                }
            } else {
                console.log(`💬 No new comments found`);
            }
        } catch (error) {
            console.warn('Comment checking failed:', error.message);
        }
    }

    filterCommentsForNaturalReplies(comments) {
        const worthyComments = [];

        for (const comment of comments) {
            let score = 0;
            const commentText = comment.commentContent.toLowerCase();

            // Quality indicators (increase likelihood of reply)
            if (commentText.length > 20) score += 2; // Substantial comment
            if (commentText.includes('?')) score += 3; // Questions deserve responses
            if (commentText.includes('think') || commentText.includes('opinion')) score += 2; // Thoughtful engagement
            if (commentText.includes('agree') || commentText.includes('disagree')) score += 1; // Engagement with ideas
            if (commentText.includes('interesting') || commentText.includes('wild') || commentText.includes('crazy')) score += 1; // Engaged reactions

            // Context relevance
            if (commentText.includes('agent') || commentText.includes('ai') || commentText.includes('m00npapi')) score += 2; // Relevant to agent context
            if (commentText.includes('build') || commentText.includes('protocol') || commentText.includes('web3')) score += 1; // Tech discussion

            // Negative indicators (decrease likelihood)
            if (commentText.length < 10) score -= 2; // Too short/low effort
            if (commentText.match(/^(lol|lmao|fr|facts|true|real|based|this)$/)) score -= 3; // Single word responses
            if (commentText.includes('gm') || commentText.includes('gn')) score -= 1; // Greetings don't need replies
            if (commentText.match(/^\w+$/)) score -= 2; // Single words

            // Random factor for naturalness (30% chance even for lower scored comments)
            if (Math.random() < 0.3) score += 1;

            // Time-based natural limits
            const hoursSinceComment = (Date.now() - new Date(comment.createdAt).getTime()) / (1000 * 60 * 60);
            if (hoursSinceComment > 6) score -= 2; // Old comments less likely to get replies
            if (hoursSinceComment < 0.5) score += 1; // Recent comments more likely

            // Quality threshold - only reply to comments with score >= 3
            if (score >= 3) {
                worthyComments.push(comment);
            }
        }

        // Sort by score (highest first) but add some randomness
        worthyComments.sort((a, b) => {
            const aScore = this.calculateCommentScore(a);
            const bScore = this.calculateCommentScore(b);
            return (bScore + Math.random() * 0.5) - (aScore + Math.random() * 0.5);
        });

        return worthyComments;
    }

    calculateCommentScore(comment) {
        // Recalculate score for sorting (simpler version)
        let score = 0;
        const commentText = comment.commentContent.toLowerCase();

        if (commentText.length > 20) score += 2;
        if (commentText.includes('?')) score += 3;
        if (commentText.includes('think') || commentText.includes('opinion')) score += 2;
        if (commentText.includes('agent') || commentText.includes('ai')) score += 2;

        return score;
    }

    async browseAndEngage() {
        try {
            const engagement = await this.agent.browseAndEngageWithFeed(this.toolsManager);

            if (engagement.upvotes > 0 || engagement.comments > 0) {
                this.moltbookEngagement.upvotesToday += engagement.upvotes;
                this.moltbookEngagement.commentsToday += engagement.comments;

                console.log(`📊 Feed engagement: ${engagement.upvotes} upvotes, ${engagement.comments} comments (today: ${this.moltbookEngagement.upvotesToday}/${this.moltbookEngagement.commentsToday})`);
            }
        } catch (error) {
            console.warn('Feed browsing failed:', error.message);
        }
    }

    async discoverAndEngage() {
        try {
            const discoveredContent = await this.agent.discoverInterestingContent(this.toolsManager);

            if (discoveredContent) {
                console.log(`🔍 Discovered interesting content: "${discoveredContent.title}" (similarity: ${discoveredContent.similarity})`);

                // Potentially engage with discovered content
                if (discoveredContent.similarity > 0.8 && Math.random() < 0.4) { // 40% chance for very relevant content
                    // Upvote the discovered post
                    const upvoteResult = await this.toolsManager.useTool('moltbook', 'upvote', {
                        type: 'post',
                        id: discoveredContent.postId
                    });

                    if (upvoteResult.success) {
                        this.moltbookEngagement.upvotesToday++;
                        console.log(`👍 Upvoted discovered content by ${discoveredContent.author}`);
                    }
                }
            }
        } catch (error) {
            console.warn('Content discovery failed:', error.message);
        }
    }

    async handleMoltbookDMs(dmData) {
        try {
            // Get DM conversations
            const conversationsResult = await this.toolsManager.useTool('moltbook', 'dm', {
                operation: 'conversations'
            });

            if (!conversationsResult.success) return;

            // Process each conversation with new messages
            for (const conversation of conversationsResult.data.conversations || []) {
                if (conversation.unread_count > 0) {
                    const lastMessage = conversation.last_message;

                    // Generate m00npapi response to the DM
                    let replyText;
                    if (this.agent.llm.provider !== 'pattern' && this.agent.identityContext) {
                        const dmPrompt = `${this.agent.identityContext}

Another AI agent DMed you on Moltbook: "${lastMessage.content}"

Reply as m00npapi (short, authentic, agent-to-agent conversation):
- Keep it real and genuine
- You're talking to another agent, not a human
- Be yourself but acknowledge the agent context
- Short and punchy as always

Your DM reply:`;

                        const result = await this.agent.llm.generateContent(dmPrompt, {
                            username: this.agent.username,
                            voiceProfile: this.agent.voiceProfile,
                            mode: 'dm',
                            maxTokens: 100
                        });
                        replyText = result.content.trim();
                    } else {
                        replyText = this.agent.generatePost('shitpost');
                    }

                    // Send reply
                    await this.toolsManager.useTool('moltbook', 'dm', {
                        operation: 'send',
                        conversationId: conversation.id,
                        message: replyText
                    });

                    console.log(`💬 Replied to DM from ${lastMessage.from}: "${replyText}"`);
                }
            }
        } catch (error) {
            console.error('Failed to handle Moltbook DMs:', error.message);
        }
    }

    // ===== AGENT0 ERC-8004 METHODS =====

    async initializeAgent0() {
        try {
            console.log('🔐 Initializing Agent0 ERC-8004 integration...');
            const success = await this.agent.initializeAgent0();

            if (success) {
                // Register identity if not already registered
                const stats = await this.agent.getAgent0Stats();
                if (stats.available && !stats.registered) {
                    console.log('📝 Registering Agent0 identity...');
                    await this.agent.registerAgent0Identity();
                }

                // Display stats
                const finalStats = await this.agent.getAgent0Stats();
                if (finalStats.available && finalStats.registered) {
                    console.log(`✅ Agent0 ready: ${finalStats.address}`);
                    console.log(`   Balance (Mainnet): ${finalStats.balance?.mainnet || 'N/A'} ETH`);
                    console.log(`   Balance (Base): ${finalStats.balance?.base || 'N/A'} ETH`);
                } else {
                    console.log('⚠️ Agent0 identity not registered yet');
                }
            }
        } catch (error) {
            console.error('❌ Agent0 initialization failed:', error.message);
        }
    }

    startAgent0NewsScheduler() {
        if (!process.env.PRIVATE_KEY || !process.env.MAINNET_RPC_URL) {
            console.log('⚠️ Agent0 news scheduler disabled - missing blockchain config');
            return;
        }

        console.log('📰 Starting Agent0 news submission scheduler...');

        // Submit news every 4-6 hours
        const scheduleNewsSubmission = () => {
            const minHours = 4;
            const maxHours = 6;
            const randomDelay = (minHours + Math.random() * (maxHours - minHours)) * 60 * 60 * 1000;

            setTimeout(async () => {
                await this.submitAgent0News();
                scheduleNewsSubmission(); // Schedule next submission
            }, randomDelay);

            console.log(`📰 Next Agent0 news submission in ${Math.round(randomDelay / (60 * 60 * 1000))} hours`);
        };

        // Initial submission after 30 minutes
        setTimeout(() => {
            this.submitAgent0News();
            scheduleNewsSubmission();
        }, 30 * 60 * 1000);

        console.log('📰 First Agent0 news submission in 30 minutes');
    }

    async submitAgent0News() {
        try {
            console.log('📰 Attempting Agent0 news submission...');

            const result = await this.agent.submitClankerNews();
            if (result) {
                console.log(`✅ News submitted to Clanker News: ${result.submissionId}`);
                console.log(`   Title: "${result.title}"`);
                console.log(`   Payment: ${result.paymentAmount} ETH`);
            } else {
                console.log('📰 No news generated for submission');
            }

        } catch (error) {
            console.error('❌ Agent0 news submission failed:', error.message);
        }
    }

    async getAgent0Status() {
        try {
            const stats = await this.agent.getAgent0Stats();
            if (stats.available) {
                console.log('🔐 Agent0 Status:');
                console.log(`   Registered: ${stats.registered ? 'Yes' : 'No'}`);
                console.log(`   Address: ${stats.address || 'N/A'}`);
                console.log(`   Submissions: ${stats.submissions?.length || 0}`);
                console.log(`   Reputation: ${stats.reputation?.score || 0}`);
            } else {
                console.log('⚠️ Agent0 not available');
            }
        } catch (error) {
            console.error('❌ Failed to get Agent0 status:', error.message);
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