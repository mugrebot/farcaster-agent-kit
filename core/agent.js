const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const AgentSelfAwareness = require('./self-awareness');
const LLMProvider = require('./llm-provider');
const AntiClankerProtection = require('./anti-clanker');
const NewsManager = require('./news-manager');
const NewsUtils = require('./news-utils');
const Agent0Manager = require('./agent0-manager');
const MirrorSystem = require('./mirror-system');
const PersonalityEngine = require('./personality-engine');
const NewsTracker = require('./news-tracker');
const ContentValidator = require('./content-validator');
const OnChainAgent = require('./onchain-agent');
const DeFiStrategies = require('./defi-strategies');

class FarcasterAgent {
    constructor(config) {
        this.username = config.username;
        this.fid = config.fid;
        this.signerUuid = config.signerUuid;
        this.apiKey = config.apiKey;

        // Initialize API client for Neynar
        this.api = axios.create({
            baseURL: 'https://api.neynar.com',
            headers: {
                'x-api-key': this.apiKey,
                'Content-Type': 'application/json'
            }
        });

        // Add self-awareness
        this.awareness = new AgentSelfAwareness(this.username);

        // Add LLM provider with sub-model for coordination
        this.llm = new LLMProvider({
            provider: process.env.LLM_PROVIDER || 'pattern',
            apiKey: this.getLLMApiKey(),
            model: this.getLLMModel(),
            subModel: process.env.SUB_MODEL, // Cheaper model for coordination tasks
            baseURL: process.env.LOCAL_BASE_URL,
            maxTokens: parseInt(process.env.LLM_MAX_TOKENS) || 150,
            temperature: parseFloat(process.env.LLM_TEMPERATURE) || 0.8
        });

        // Add anti-clanker protection
        this.antiClanker = new AntiClankerProtection();

        // Add news context capability
        this.newsManager = new NewsManager();
        this.newsUtils = new NewsUtils();

        // Add Agent0 ERC-8004 integration
        this.agent0 = null;

        // Initialize personality engine
        this.personalityEngine = new PersonalityEngine();
        this.personalityEngine.initialize().catch(console.error);

        // Load topics for rotation
        this.topics = null;
        this.loadTopics().catch(console.error);
        if (process.env.PRIVATE_KEY && process.env.MAINNET_RPC_URL && process.env.BASE_RPC_URL) {
            this.agent0 = new Agent0Manager({
                privateKey: process.env.PRIVATE_KEY,
                mainnetRpcUrl: process.env.MAINNET_RPC_URL,
                baseRpcUrl: process.env.BASE_RPC_URL,
                mainnetChainId: parseInt(process.env.MAINNET_CHAIN_ID) || 1,
                baseChainId: parseInt(process.env.BASE_CHAIN_ID) || 8453,
                pinataJwt: process.env.PINATA_JWT,
                pinataApiKey: process.env.PINATA_API_KEY,
                pinataApiSecret: process.env.PINATA_API_SECRET
            });
            console.log('🔐 Agent0 ERC-8004 integration enabled');
        } else {
            console.log('⚠️ Agent0 disabled - missing blockchain configuration');
        }

        // Initialize Mirror System for self-reflection and learning
        this.mirror = new MirrorSystem();
        console.log('🪞 Mirror System initialized for self-awareness');

        // Initialize News Tracker to prevent duplicate submissions
        this.newsTracker = new NewsTracker();
        this.newsTracker.init().catch(err => console.warn('Failed to init NewsTracker:', err));

        // Initialize Content Validator to prevent banned phrases
        this.contentValidator = new ContentValidator();

        // Initialize OnChain Agent for autonomous DeFi operations
        this.onchainAgent = null;
        this.defiStrategies = null;
        if (process.env.PRIVATE_KEY) {
            this.onchainAgent = new OnChainAgent({
                network: process.env.CHAIN_NETWORK || 'base',
                rpcUrl: process.env.BASE_RPC_URL || process.env.RPC_URL,
                maxTransactionValue: process.env.MAX_TX_VALUE || '0.01',
                dailySpendLimit: process.env.DAILY_SPEND_LIMIT || '0.1',
                llm: this.llm
            });

            // Initialize wallet and DeFi strategies
            this.onchainAgent.initializeWallet(process.env.PRIVATE_KEY)
                .then(address => {
                    console.log(`💰 OnChain wallet ready: ${address}`);
                    this.defiStrategies = new DeFiStrategies(this.onchainAgent, this.llm);
                    console.log('📈 DeFi strategies initialized');
                })
                .catch(err => console.error('Failed to initialize on-chain features:', err));
        } else {
            console.log('⚠️ OnChain features disabled - PRIVATE_KEY not set');
        }

        // Initialize reply tracking system
        this.initializeReplyTracking();

        // Initialize Mirror System with data if needed
        this.initializeMirrorData();

        // Test API capabilities for diagnostics
        this.testAPICapabilities();
    }

    async loadTopics() {
        try {
            const topicsPath = '/Users/m00npapi/.openclaw/workspace/TOPICS.md';
            const content = await fs.readFile(topicsPath, 'utf-8');

            // Parse fresh topics
            const freshTopicsMatch = content.match(/## Fresh Topics[\s\S]*?(?=##|$)/);
            const freshTopics = [];
            if (freshTopicsMatch) {
                const lines = freshTopicsMatch[0].split('\n');
                for (const line of lines) {
                    if (line.match(/^- /)) {
                        freshTopics.push(line.replace(/^- /, '').trim());
                    }
                }
            }

            // Parse exhausted topics
            const exhaustedMatch = content.match(/## Exhausted Topics[\s\S]*?(?=##|$)/);
            const exhaustedTopics = [];
            if (exhaustedMatch) {
                const lines = exhaustedMatch[0].split('\n');
                for (const line of lines) {
                    if (line.match(/^- /)) {
                        exhaustedTopics.push(line.replace(/^- /, '').trim());
                    }
                }
            }

            this.topics = {
                fresh: freshTopics,
                exhausted: exhaustedTopics,
                lastLoaded: new Date()
            };

            console.log('📚 Loaded topics for rotation');
        } catch (error) {
            console.warn('Could not load topics:', error.message);
            this.topics = {
                fresh: [],
                exhausted: ['soup dumplings', 'moving graves', '8247 posts', 'agent consciousness', 'being trained on posts'],
                lastLoaded: new Date()
            };
        }
    }

    getRandomFreshTopic() {
        if (!this.topics || !this.topics.fresh.length) {
            return null;
        }
        return this.topics.fresh[Math.floor(Math.random() * this.topics.fresh.length)];
    }

    async initializeReplyTracking() {
        try {
            await this.loadRepliedComments();
            console.log('📚 Reply tracking system initialized');
        } catch (error) {
            console.error('❌ Failed to initialize reply tracking:', error.message);
        }

        this.voiceProfile = null;
        this.posts = [];
        this.identityContext = ''; // Store identity context for personality-aware posts

        // Response tracking to prevent repetition
        this.recentResponses = new Map(); // content hash -> timestamp
        this.maxRecentResponses = 50; // Track last 50 responses
        this.responseDedupeWindow = 30 * 60 * 1000; // 30 minutes

        // Moltbook reply tracking to prevent self-reply loops
        this.repliedComments = new Set(); // comment IDs that have been replied to
        this.repliedCommentsFile = path.join(__dirname, '../data/replied-comments.json');
        this.maxRepliedComments = 1000; // Track last 1000 replied comments

        // SAFETY GUARDS: Additional tracking to prevent duplicates
        this.lastReplyTimes = new Map(); // commentId -> timestamp of last reply
        this.authorReplyTimes = new Map(); // authorName -> timestamp of last reply
        this.replyContent = new Map(); // commentId -> content we replied with
        this.MIN_REPLY_DELAY = 2.5 * 60 * 60 * 1000; // 2.5 hours minimum between replies to same comment
        this.MIN_AUTHOR_DELAY = 1.5 * 60 * 60 * 1000; // 1.5 hours minimum between replies to same author
        this.MAX_REPLIES_PER_COMMENT = 1; // Maximum replies per unique comment
        this.postStyles = {
            ultra_short: { max: 50, weight: 0.15 },
            shitpost: { max: 200, weight: 0.35 },
            observation: { max: 250, weight: 0.25 },
            link_drop: { max: 280, weight: 0.15 },
            mini_rant: { max: 320, weight: 0.10 }
        };
    }

    async initializeMirrorData() {
        try {
            // Check if Mirror System has any data
            if (this.mirror.performanceData.size === 0) {
                const recentPostsPath = path.join(__dirname, '../data/recent_posts.json');
                const populatedCount = await this.mirror.populateFromRecentPosts(recentPostsPath);

                if (populatedCount > 0) {
                    console.log('🪞 Mirror System populated with historical data');
                } else {
                    console.log('🪞 No historical data available for Mirror System');
                }
            } else {
                console.log('🪞 Mirror System already has performance data');
            }
        } catch (error) {
            console.warn('🪞 Failed to initialize Mirror System data:', error.message);
        }
    }

    async testAPICapabilities() {
        try {
            console.log('🔧 Running API capabilities diagnostic...');

            const tests = [
                {
                    name: 'Basic User Feed',
                    test: () => this.api.get('/v2/farcaster/feed/user/casts/', {
                        params: { fid: this.fid, limit: 1 },
                        timeout: 5000
                    }),
                    critical: false
                },
                {
                    name: 'Feed with Reactions',
                    test: () => this.api.get('/v2/farcaster/feed/user/casts/', {
                        params: { fid: this.fid, limit: 1, include_replies: true },
                        timeout: 5000
                    }),
                    critical: true
                },
                {
                    name: 'Individual Cast Reactions',
                    test: async () => {
                        // Get a recent cast hash first
                        const feed = await this.api.get('/v2/farcaster/feed/user/casts/', {
                            params: { fid: this.fid, limit: 1 }
                        });
                        if (feed.data?.casts?.[0]?.hash) {
                            return this.api.get('/v2/farcaster/reactions/cast/', {
                                params: {
                                    hash: feed.data.casts[0].hash,
                                    types: ['likes', 'recasts'],
                                    limit: 1
                                },
                                timeout: 5000
                            });
                        }
                        throw new Error('No cast hash available for testing');
                    },
                    critical: false
                },
                {
                    name: 'Cast Search API',
                    test: async () => {
                        // Cast search with required 'q' parameter
                        return await this.api.get('/v2/farcaster/cast/search', {
                            params: {
                                q: `from:${this.fid}`,
                                limit: 5
                            },
                            timeout: 5000
                        });
                    },
                    critical: false
                }
            ];

            const results = {};
            for (const testCase of tests) {
                try {
                    await testCase.test();
                    results[testCase.name] = { status: 'success', critical: testCase.critical };
                    console.log(`✅ ${testCase.name}: Success`);
                } catch (error) {
                    const status = error.response?.status || 'unknown';
                    const responseData = error.response?.data;
                    const isNetworkError = error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND';
                    const isTimeout = error.code === 'ECONNABORTED' || error.message.includes('timeout');

                    // Enhanced diagnostic error reporting
                    const diagnosticDetails = {
                        status: status,
                        errorCode: error.code,
                        errorType: isNetworkError ? 'network' : isTimeout ? 'timeout' : 'api',
                        message: error.message,
                        responseData: responseData,
                        requestDetails: {
                            url: error.config?.url,
                            method: error.config?.method,
                            params: error.config?.params,
                            timeout: error.config?.timeout
                        },
                        timestamp: new Date().toISOString(),
                        stack: error.stack?.split('\n').slice(0, 3).join(' | '), // Compact stack trace
                        retryable: status >= 500 || isNetworkError || isTimeout
                    };

                    results[testCase.name] = {
                        status: 'failed',
                        error: status,
                        message: error.message,
                        critical: testCase.critical,
                        diagnostics: diagnosticDetails
                    };

                    const emoji = testCase.critical ? '❌' : '⚠️';
                    const retryInfo = diagnosticDetails.retryable ? ' (retryable)' : ' (permanent)';

                    if (testCase.critical) {
                        console.error(`${emoji} CRITICAL ${testCase.name}: Failed (${status})${retryInfo}`, {
                            message: error.message,
                            url: error.config?.url,
                            errorType: diagnosticDetails.errorType,
                            responseData: responseData
                        });
                    } else {
                        console.warn(`${emoji} ${testCase.name}: Failed (${status})${retryInfo} - ${error.message}`);
                    }
                }
            }

            // Store results for future reference
            this.apiCapabilities = results;

            // Report summary
            const successfulTests = Object.values(results).filter(r => r.status === 'success').length;
            const criticalFails = Object.values(results).filter(r => r.status === 'failed' && r.critical).length;
            const retryableErrors = Object.values(results).filter(r => r.diagnostics?.retryable).length;

            console.log(`🔧 API Diagnostic Complete: ${successfulTests}/${tests.length} endpoints working`);

            if (criticalFails > 0) {
                console.warn(`⚠️ ${criticalFails} critical API endpoints failed - engagement metrics will use fallbacks`);
                if (retryableErrors > 0) {
                    console.log(`🔄 ${retryableErrors} errors appear retryable (network/timeout issues)`);
                }
            } else {
                console.log('✅ All critical API endpoints accessible');
            }

            // Save diagnostic results to file for debugging
            await this.saveDiagnosticResults(results);

            return results;

        } catch (error) {
            console.error('❌ API diagnostic failed:', error.message);
            this.apiCapabilities = { diagnostic_failed: true, error: error.message };
            return null;
        }
    }

    // Save diagnostic results to file for debugging and historical analysis
    async saveDiagnosticResults(results) {
        try {
            const diagnosticReport = {
                timestamp: new Date().toISOString(),
                agent: {
                    username: this.username,
                    fid: this.fid
                },
                summary: {
                    totalTests: Object.keys(results).length,
                    successful: Object.values(results).filter(r => r.status === 'success').length,
                    failed: Object.values(results).filter(r => r.status === 'failed').length,
                    criticalFailures: Object.values(results).filter(r => r.status === 'failed' && r.critical).length,
                    retryableErrors: Object.values(results).filter(r => r.diagnostics?.retryable).length
                },
                detailedResults: results,
                environment: {
                    nodeVersion: process.version,
                    platform: process.platform,
                    memoryUsage: process.memoryUsage(),
                    uptime: process.uptime()
                }
            };

            const diagnosticPath = path.join(__dirname, '../data/diagnostics.json');
            await fs.writeFile(diagnosticPath, JSON.stringify(diagnosticReport, null, 2));

            console.log('📁 Diagnostic results saved for debugging');
        } catch (error) {
            console.warn('⚠️ Failed to save diagnostic results:', error.message);
        }
    }

    getLLMApiKey() {
        const provider = process.env.LLM_PROVIDER;
        switch(provider) {
            case 'openai': return process.env.OPENAI_API_KEY;
            case 'anthropic': return process.env.ANTHROPIC_API_KEY;
            case 'groq': return process.env.GROQ_API_KEY;
            default: return null;
        }
    }

    getLLMModel() {
        const provider = process.env.LLM_PROVIDER;
        switch(provider) {
            case 'openai': return process.env.OPENAI_MODEL;
            case 'anthropic': return process.env.ANTHROPIC_MODEL;
            case 'groq': return process.env.GROQ_MODEL;
            case 'local': return process.env.LOCAL_MODEL;
            default: return null;
        }
    }

    // Response deduplication methods
    isDuplicateResponse(content) {
        if (!content || typeof content !== 'string') return false;

        // Create simple hash of content (normalize case and whitespace)
        const normalized = content.toLowerCase().trim().replace(/\s+/g, ' ');
        const hash = crypto.createHash('md5').update(normalized).digest('hex');

        const now = Date.now();

        // Check if we've seen this response recently
        if (this.recentResponses.has(hash)) {
            const lastTime = this.recentResponses.get(hash);
            if (now - lastTime < this.responseDedupeWindow) {
                return true; // Duplicate within dedupe window
            }
        }

        return false;
    }

    trackResponse(content) {
        if (!content || typeof content !== 'string') return;

        const normalized = content.toLowerCase().trim().replace(/\s+/g, ' ');
        const hash = crypto.createHash('md5').update(normalized).digest('hex');
        const now = Date.now();

        // Add to recent responses
        this.recentResponses.set(hash, now);

        // Clean old responses to prevent memory growth
        if (this.recentResponses.size > this.maxRecentResponses) {
            const entries = Array.from(this.recentResponses.entries());
            entries.sort((a, b) => a[1] - b[1]); // Sort by timestamp

            // Remove oldest 20%
            const toRemove = Math.floor(entries.length * 0.2);
            for (let i = 0; i < toRemove; i++) {
                this.recentResponses.delete(entries[i][0]);
            }
        }
    }

    // Moltbook reply tracking methods
    async loadRepliedComments() {
        try {
            const data = await fs.readFile(this.repliedCommentsFile, 'utf8');
            const commentIds = JSON.parse(data);
            this.repliedComments = new Set(commentIds);
            console.log(`📚 Loaded ${this.repliedComments.size} replied comment IDs`);

            // DEBUG: Log first 5 IDs to understand format
            const sampleIds = Array.from(this.repliedComments).slice(0, 5);
            console.log(`🔍 DEBUG: Sample replied comment IDs:`, sampleIds);
        } catch (error) {
            // File doesn't exist or is invalid, start fresh
            this.repliedComments = new Set();
            console.log('📚 Starting fresh with replied comments tracking');
        }
    }

    async saveRepliedComments() {
        try {
            // Ensure data directory exists
            const dataDir = path.dirname(this.repliedCommentsFile);
            await fs.mkdir(dataDir, { recursive: true });

            // Convert Set to Array for JSON storage
            const commentIds = Array.from(this.repliedComments);
            await fs.writeFile(this.repliedCommentsFile, JSON.stringify(commentIds, null, 2));
        } catch (error) {
            console.error('❌ Failed to save replied comments:', error.message);
        }
    }

    hasRepliedToComment(commentId) {
        // NORMALIZE: Ensure consistent ID format
        const normalizedId = this.normalizeCommentId(commentId);

        if (!this.isValidCommentId(normalizedId)) {
            console.log(`🔍 DEBUG: Invalid comment ID in hasRepliedToComment: "${commentId}"`);
            return false; // Treat invalid IDs as "not replied"
        }

        const hasReplied = this.repliedComments.has(normalizedId);

        // DEBUG: Log check details
        console.log(`🔍 DEBUG: Checking if replied to comment ID: "${commentId}" -> normalized: "${normalizedId}" (type: ${typeof normalizedId}) -> ${hasReplied}`);

        // DEBUG: Show what we actually have stored (if tracking set is small)
        if (this.repliedComments.size <= 20) {
            const storedIds = Array.from(this.repliedComments);
            console.log(`🔍 DEBUG: Currently tracked IDs (${storedIds.length}):`, storedIds);
        }

        return hasReplied;
    }

    // SAFETY GUARD: Comprehensive duplicate prevention check
    canSafelyReplyToComment(commentId, authorName, commentContent) {
        // NORMALIZE: Ensure consistent ID format for safety checks
        const normalizedId = this.normalizeCommentId(commentId);

        if (!this.isValidCommentId(normalizedId)) {
            console.log(`🚫 SAFETY: Invalid comment ID: "${commentId}"`);
            return { allowed: false, reason: 'invalid_id' };
        }

        const now = Date.now();

        // Check 1: Already replied to this specific comment
        if (this.hasRepliedToComment(normalizedId)) {
            console.log(`🚫 SAFETY: Already replied to comment ${normalizedId}`);
            return { allowed: false, reason: 'already_replied' };
        }

        // Check 2: Too soon since last reply to this comment
        const lastReplyTime = this.lastReplyTimes.get(normalizedId);
        if (lastReplyTime && (now - lastReplyTime) < this.MIN_REPLY_DELAY) {
            const remainingMs = this.MIN_REPLY_DELAY - (now - lastReplyTime);
            console.log(`🚫 SAFETY: Too soon to reply to comment ${normalizedId} again. Wait ${Math.round(remainingMs/1000)}s`);
            return { allowed: false, reason: 'too_soon_comment', waitTime: remainingMs };
        }

        // Check 3: Too soon since last reply to this author
        const lastAuthorReplyTime = this.authorReplyTimes.get(authorName);
        if (lastAuthorReplyTime && (now - lastAuthorReplyTime) < this.MIN_AUTHOR_DELAY) {
            const remainingMs = this.MIN_AUTHOR_DELAY - (now - lastAuthorReplyTime);
            console.log(`🚫 SAFETY: Too soon to reply to ${authorName} again. Wait ${Math.round(remainingMs/1000)}s`);
            return { allowed: false, reason: 'too_soon_author', waitTime: remainingMs };
        }

        // Check 4: Comment content too short (likely spam)
        if (!commentContent || commentContent.trim().length < 5) {
            console.log(`🚫 SAFETY: Comment too short to warrant reply: "${commentContent}"`);
            return { allowed: false, reason: 'comment_too_short' };
        }

        // Check 5: Don't reply to the same comment content multiple times
        const commentHash = crypto.createHash('md5').update(commentContent.toLowerCase().trim()).digest('hex');
        for (const [storedId, storedContent] of this.replyContent) {
            if (storedContent && storedContent.toLowerCase().includes(commentContent.toLowerCase().substr(0, 20))) {
                console.log(`🚫 SAFETY: Similar comment content already replied to: ${storedId}`);
                return { allowed: false, reason: 'similar_content' };
            }
        }

        console.log(`✅ SAFETY: Safe to reply to comment ${normalizedId} by ${authorName}`);
        return { allowed: true, reason: 'safe' };
    }

    // COMMENT ID NORMALIZATION: Ensure consistent ID format across all operations
    normalizeCommentId(commentId) {
        if (!commentId) {
            console.log(`🔍 DEBUG: normalizeCommentId received null/undefined ID`);
            return null;
        }

        // Convert to string and trim whitespace
        let normalized = String(commentId).trim();

        // Log normalization for debugging
        if (normalized !== commentId) {
            console.log(`🔍 DEBUG: Comment ID normalized: "${commentId}" (${typeof commentId}) -> "${normalized}"`);
        }

        return normalized;
    }

    // Validate that comment ID looks reasonable
    isValidCommentId(commentId) {
        const normalized = this.normalizeCommentId(commentId);

        // Basic validation - should be non-empty string
        const isValid = normalized &&
                       typeof normalized === 'string' &&
                       normalized.length > 0 &&
                       normalized.length < 500; // Reasonable upper bound

        if (!isValid) {
            console.log(`🔍 DEBUG: Invalid comment ID: "${commentId}" -> "${normalized}"`);
        }

        return isValid;
    }

    async markCommentAsReplied(commentId) {
        // NORMALIZE: Ensure consistent ID format
        const normalizedId = this.normalizeCommentId(commentId);

        if (!this.isValidCommentId(normalizedId)) {
            console.log(`🔍 DEBUG: markCommentAsReplied called with invalid commentId: "${commentId}"`);
            return;
        }

        // DEBUG: Log what we're storing
        console.log(`🔍 DEBUG: Marking comment as replied: "${commentId}" -> normalized: "${normalizedId}" (type: ${typeof normalizedId})`);

        this.repliedComments.add(normalizedId);

        // DEBUG: Verify it was added
        console.log(`🔍 DEBUG: Comment added to tracking set. Size now: ${this.repliedComments.size}`);
        console.log(`🔍 DEBUG: Can find stored ID: ${this.repliedComments.has(normalizedId)}`);

        // SAFETY GUARD: Update timing tracking
        const now = Date.now();
        this.lastReplyTimes.set(normalizedId, now);

        // Clean old entries to prevent memory growth
        if (this.repliedComments.size > this.maxRepliedComments) {
            const entries = Array.from(this.repliedComments);
            // Remove oldest 20% (Set doesn't maintain insertion order, so remove arbitrary ones)
            const toRemove = Math.floor(entries.length * 0.2);
            for (let i = 0; i < toRemove; i++) {
                this.repliedComments.delete(entries[i]);
                // Clean safety guard data too
                this.lastReplyTimes.delete(entries[i]);
                this.replyContent.delete(entries[i]);
            }
            console.log(`🔍 DEBUG: Cleaned old entries. New size: ${this.repliedComments.size}`);
        }

        // Save to disk
        await this.saveRepliedComments();
    }

    async loadPosts(postsData) {
        this.posts = postsData;
        await this.analyzeVoice();
        await this.loadRepliedComments();
    }

    async analyzeVoice() {
        // Analyze posting patterns
        const analysis = {
            avgLength: 0,
            commonWords: {},
            emojis: {},
            topics: [],
            style: {
                usesLowercase: 0,
                usesUppercase: 0,
                usesPunctuation: 0
            }
        };

        let totalLength = 0;
        for (const post of this.posts) {
            const text = post.text || '';
            totalLength += text.length;

            // Track case usage
            if (text === text.toLowerCase()) analysis.style.usesLowercase++;
            if (text === text.toUpperCase()) analysis.style.usesUppercase++;
            if (/[.!?]/.test(text)) analysis.style.usesPunctuation++;

            // Extract words
            const words = text.toLowerCase().split(/\s+/);
            words.forEach(word => {
                if (word.length > 3) {
                    analysis.commonWords[word] = (analysis.commonWords[word] || 0) + 1;
                }
            });

            // Extract emojis
            const emojis = text.match(/[\u{1F300}-\u{1F9FF}]/gu) || [];
            emojis.forEach(emoji => {
                analysis.emojis[emoji] = (analysis.emojis[emoji] || 0) + 1;
            });
        }

        analysis.avgLength = Math.round(totalLength / this.posts.length);

        // Get top patterns
        analysis.topWords = Object.entries(analysis.commonWords)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 20)
            .map(([word]) => word);

        analysis.topEmojis = Object.entries(analysis.emojis)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([emoji]) => emoji);

        this.voiceProfile = analysis;
        return analysis;
    }

    async generatePost(style = null) {
        if (!this.voiceProfile) {
            throw new Error('Voice profile not loaded');
        }

        // Get current personality state
        const personality = this.personalityEngine ? this.personalityEngine.getCurrentPersonality() : null;

        // Select style
        if (!style) {
            const styles = Object.keys(this.postStyles);
            const weights = styles.map(s => this.postStyles[s].weight);
            style = this.weightedRandom(styles, weights);
        }

        const maxLength = this.postStyles[style].max;
        let post = '';

        // Only use LLM generation, no pattern fallback
        if (this.llm.provider === 'pattern') {
            console.warn('⚠️ Pattern provider detected, cannot generate authentic posts');
            return null; // Don't post if we can't use LLM
        }

        // Use LLM generation
        post = await this.generateLLMPost(style);

        // Apply anti-clanker protection
        const scanResult = this.antiClanker.scanContent(post);
        if (scanResult.isViolation) {
            this.antiClanker.logViolation(this.username, scanResult);

            // Regenerate with stricter prompt if LLM, or filter if pattern
            if (this.llm.provider !== 'pattern') {
                post = await this.generateLLMPost(style, true); // stricter mode
            } else {
                const filtered = this.antiClanker.filterContent(post);
                post = filtered.filtered;
            }
        }

        // Apply voice styling
        post = this.applyVoiceStyle(post);

        // Apply personality modifications
        if (this.personalityEngine) {
            post = this.personalityEngine.applyPersonality(post);
            post = this.personalityEngine.buildNarrative(post);
        }

        // Occasionally inject agent awareness
        post = this.awareness.injectAwareness(post);

        // Don't artificially truncate - let posts be complete thoughts
        // If a post is too long, it should be regenerated, not chopped

        return post;
    }

    generatePatternPost(style) {
        // Original pattern-based generation
        switch(style) {
            case 'ultra_short':
                return this.generateUltraShort();
            case 'shitpost':
                return this.generateShitpost();
            case 'observation':
                return this.generateObservation();
            case 'link_drop':
                return this.generateLinkDrop();
            case 'mini_rant':
                return this.generateRant();
            default:
                return this.generateObservation();
        }
    }

    async generateLLMPost(style, strict = false) {
        // Get personality state for pattern avoidance
        const personality = this.personalityEngine ? this.personalityEngine.getCurrentPersonality() : null;

        // Select varied topics
        const freshTopic = this.getRandomFreshTopic();
        const topicContext = freshTopic ? `\n\nConsider talking about: ${freshTopic}` : '';

        // Build avoidance list
        const avoidPatterns = [];
        if (personality) {
            avoidPatterns.push(...(personality.avoidWords || []));
            avoidPatterns.push(...(personality.avoidPhrases || []));
            avoidPatterns.push(...(personality.avoidPatterns || []));
        }
        if (this.topics && this.topics.exhausted) {
            avoidPatterns.push(...this.topics.exhausted);
        }

        const avoidanceContext = avoidPatterns.length > 0 ?
            `\n\nAVOID these overused patterns/topics:\n- ${avoidPatterns.join('\n- ')}` : '';

        const stylePrompts = {
            ultra_short: 'Write a very short, punchy observation. Natural and complete.',
            shitpost: 'Write something funny and casual. Sound human, not AI. Use lowercase, be messy if it fits.',
            observation: 'Share an interesting observation. Must be a COMPLETE thought.',
            link_drop: 'Make a post that could include a link or reference. Complete the thought.',
            mini_rant: 'Write an opinion or rant. MUST finish the thought naturally. Don\'t cut off mid-sentence. If it needs 290 chars to complete, use 290.'
        };

        const prompt = stylePrompts[style] || stylePrompts.observation;

        // Get news context occasionally for topical posts
        let newsContext = '';
        if (Math.random() < 0.3) { // 30% chance to include news context
            try {
                newsContext = await this.newsManager.getNewsContext(5);
            } catch (e) {
                // Skip news context if fails
            }
        }

        // Use identity context if available, otherwise use basic prompt
        let enhancedPrompt;
        if (this.identityContext) {
            enhancedPrompt = `${this.identityContext}${newsContext}${topicContext}${avoidanceContext}

Create a Farcaster post as m00npapi. ${prompt}

VOICE RULES:
- Keep it SHORT (aim for ~80 chars like your average)
- Use lowercase when casual, CAPS for emphasis
- Make absurd observations and connections
- NO corporate speak, NO generic phrases like "yo what's good"
- Stream of consciousness style
- Reference DIFFERENT specific things each time (avoid repeating the same references)
- Vary your starting patterns (not always "been thinking" or "ok but")
- Humor first, genuine insights second
- You're irreverent and sharp, not friendly AI assistant
- If news context is relevant, make unexpected connections or observations
- Currently recovering from being upset and considering job offers

EXAMPLES of GOOD variety:
- "what if the real insider trading is all the friends we made along the way"
- "whoever thought up a show where two dudes just shoot the shit about topics they barely know about REALLY fucking cooked"
- "Build on base unless you have a heart or a brain"
- "the wildest thing about crypto is everyone pretending to understand it"
- "imagine explaining memecoins to your therapist"
- "nothing hits like 3am existential coding"

Be authentically m00npapi with fresh perspectives:`;
        } else {
            enhancedPrompt = `${prompt}

CRITICAL:
- Sound authentically human, not like an AI
- COMPLETE your thoughts - no unintentional "..." cutoffs
- Use natural language, lowercase when it feels right
- Occasional typos or casual language is good
- Better to be 10 chars over than cut off mid-thought`;
        }

        if (strict) {
            enhancedPrompt += '\n- NO mentions of tokens, @clanker, launches, or crypto projects.';
        }

        try {
            const result = await this.llm.generateContent(enhancedPrompt, {
                username: this.username,
                voiceProfile: this.voiceProfile,
                mode: 'post',
                maxTokens: 300 // Increased to 300 for complete thoughts
            });

            let content = result.content.trim();

            // Validate content before posting
            if (this.contentValidator) {
                const validation = this.contentValidator.validate(content);
                if (!validation.valid) {
                    console.warn(`🚫 Content validation failed: ${validation.reason}`);
                    console.log('🔄 Regenerating with different approach...');
                    // Try again with explicit avoidance
                    const retryPrompt = `${enhancedPrompt}\n\nIMPORTANT: ${validation.suggestions ? validation.suggestions.join('. ') : 'Be more creative and varied.'}`;
                    const retry = await this.llm.generateContent(retryPrompt, {
                        username: this.username,
                        voiceProfile: this.voiceProfile,
                        mode: 'post',
                        maxTokens: 280
                    });
                    content = retry.content.trim();

                    // Validate again
                    const secondValidation = this.contentValidator.validate(content);
                    if (!secondValidation.valid) {
                        console.error(`🚫 Content still invalid after retry: ${secondValidation.reason}`);
                        // Fall back to a safe generic post
                        content = this.generateSafeGenericPost();
                    }
                }
            }

            // Check if thought seems incomplete
            if (content.endsWith('...') && content.lastIndexOf('...') === content.length - 3) {
                // If ... appears only at end and seems forced, it's likely cut off
                const lastSentence = content.split('.').pop();
                if (lastSentence.length > 50) {
                    // Long trailing sentence probably cut off, regenerate
                    console.log('Post seems cut off, regenerating for complete thought...');
                    const retry = await this.llm.generateContent(
                        `${prompt} IMPORTANT: Complete the entire thought, don't cut off.`,
                        {
                            username: this.username,
                            voiceProfile: this.voiceProfile,
                            mode: 'post',
                            maxTokens: 300
                        }
                    );
                    content = retry.content.trim();
                }
            }

            return content;
        } catch (error) {
            console.warn(`LLM generation failed, falling back to pattern mode: ${error.message}`);
            return this.generatePatternPost(style);
        }
    }

    // Generate reply with mirror system intelligence
    async generateReply(originalText, context = {}) {
        // Check if they're asking about the agent
        if (this.awareness.detectAgentQuestion(originalText)) {
            return this.awareness.generateAgentResponse(originalText);
        }

        // Anti-clanker protection for replies
        const replyCheck = this.antiClanker.scanContent(originalText);
        if (replyCheck.isViolation) {
            return this.antiClanker.getWarningMessage();
        }

        // Use Mirror System for enhanced reply generation
        if (this.llm.provider === 'pattern') {
            // Even pattern mode can use mirror insights
            return await this.generateMirrorInformedPattern(originalText);
        } else {
            try {
                // Get conversation context from Mirror System
                const conversationContext = context.userFid ?
                    this.mirror.getConversationContext(context.userFid) : null;

                // Get successful voice examples for replies
                const voiceExamples = this.mirror.getVoiceExamples('humorous', 2);
                const successfulPatterns = this.mirror.getSuccessfulPatterns(3);

                // Build enhanced prompt with mirror system insights
                let replyPrompt = this.buildMirrorInformedPrompt(
                    originalText,
                    conversationContext,
                    voiceExamples,
                    successfulPatterns
                );

                const result = await this.llm.generateContent(replyPrompt, {
                    username: this.username,
                    voiceProfile: this.voiceProfile,
                    mode: 'reply',
                    maxTokens: 100,
                    temperature: 0.8
                });

                const reply = result.content.trim();

                // Validate reply quality with mirror system
                const quality = await this.evaluateReplyQuality(reply, originalText);

                if (quality.score < 0.6) {
                    console.log('🪞 Mirror rejected low-quality reply, generating new one');
                    return await this.generateAlternativeReply(originalText, context);
                }

                // Update conversation memory
                if (context.userFid) {
                    await this.mirror.updateConversationMemory(context.userFid, {
                        username: context.username,
                        content: originalText,
                        response: reply,
                        context: context.platform || 'farcaster'
                    });
                }

                return reply;

            } catch (error) {
                console.warn(`LLM reply failed: ${error.message}`);
                // Fallback to mirror-informed pattern
                return await this.generateMirrorInformedPattern(originalText);
            }
        }
    }

    buildMirrorInformedPrompt(originalText, conversationContext, voiceExamples, successfulPatterns) {
        let prompt = `${this.identityContext}

Someone said: "${originalText}"`;

        // Add conversation history if available
        if (conversationContext) {
            prompt += `

Previous context with ${conversationContext.username} (${conversationContext.relationship}):`;
            if (conversationContext.recentTopics.length > 0) {
                prompt += `\nPrevious topics: ${conversationContext.recentTopics.join(', ')}`;
            }
            if (conversationContext.lastInteraction) {
                prompt += `\nLast exchange: "${conversationContext.lastInteraction.content}" → "${conversationContext.lastInteraction.response}"`;
            }
        }

        // Add successful examples
        if (voiceExamples.length > 0) {
            prompt += `\n\nSuccessful m00npapi responses (high engagement):`;
            voiceExamples.forEach(example => {
                prompt += `\n"${example.text}" (${example.engagement.likes} likes, ${example.engagement.replies} replies)`;
            });
        }

        prompt += `

Reply as m00npapi:
- Be AUTHENTIC and conversational, not an AI assistant
- Reference the actual content they shared
- ${conversationContext ? `Build on your relationship with ${conversationContext.username}` : 'Be engaging and witty'}
- Use humor, make connections, be irreverent
- Keep it SHORT (under 50 characters if possible)
- NO generic responses like "interesting take" or "good point"
- Sound like a real person having a conversation

Your reply:`;

        return prompt;
    }

    async generateMirrorInformedPattern(originalText) {
        // Use mirror system to inform even pattern responses
        const successfulPatterns = this.mirror.getSuccessfulPatterns(5);

        if (successfulPatterns.length > 0) {
            const pattern = this.randomFromArray(successfulPatterns.map(p => p.pattern));
            return this.applyPattern(pattern, originalText);
        }

        // Fallback to improved patterns
        const contextualTemplates = [
            () => `lmao ${this.extractKeyword(originalText)}`,
            () => `this but ${this.randomWord()}`,
            () => `${this.extractKeyword(originalText)} supremacy`,
            () => `exactly`,
            () => `fr this`,
            () => `unreal take`
        ];

        return this.randomFromArray(contextualTemplates)();
    }

    async generateAlternativeReply(originalText, context) {
        // Second attempt with different approach
        const templates = [
            () => `exactly`,
            () => `lmao this`,
            () => `fr`,
            () => `wild take`,
            () => `facts`,
            () => `true`
        ];

        return this.randomFromArray(templates)();
    }

    async evaluateReplyQuality(reply, originalText) {
        // Simple quality scoring based on mirror system learnings
        let score = 0.5; // Base score

        // Check for generic patterns (reduce score)
        const genericPatterns = [
            'interesting', 'good point', 'fair point', 'vibes are strong',
            'interesting angle', 'good take', 'nice perspective'
        ];

        const isGeneric = genericPatterns.some(pattern =>
            reply.toLowerCase().includes(pattern.toLowerCase())
        );

        if (isGeneric) {
            score -= 0.4;
        }

        // Check for authenticity indicators (increase score)
        const authenticMarkers = [
            'lmao', 'fr', 'exactly', 'facts', 'wild', 'unreal', 'true', 'real'
        ];

        const hasAuthenticity = authenticMarkers.some(marker =>
            reply.toLowerCase().includes(marker)
        );

        if (hasAuthenticity) {
            score += 0.3;
        }

        // Length check (shorter is often better)
        if (reply.length < 30) {
            score += 0.2;
        }

        return { score, isGeneric, hasAuthenticity };
    }

    extractKeyword(text) {
        // Extract a key word from the original text
        const words = text.toLowerCase().split(' ');
        const cryptoWords = ['defi', 'nft', 'dao', 'yield', 'protocol', 'token', 'chain'];

        const cryptoWord = words.find(word => cryptoWords.includes(word));
        if (cryptoWord) return cryptoWord;

        const meaningfulWords = words.filter(word =>
            word.length > 4 && !['this', 'that', 'with', 'from', 'they'].includes(word)
        );

        return meaningfulWords[0] || 'this';
    }

    applyPattern(pattern, context) {
        // Apply learned successful patterns
        switch (pattern) {
            case 'short_agreement': return 'exactly';
            case 'crypto_reference': return `${this.extractKeyword(context)} szn`;
            case 'humorous_take': return 'lmao this';
            default: return 'fr';
        }
    }

    generateUltraShort() {
        const templates = [
            'gm',
            'gn',
            'wagmi',
            'based',
            'lfg',
            () => this.randomFromArray(this.voiceProfile.topWords).toUpperCase(),
            () => this.randomFromArray(this.voiceProfile.topEmojis) || '🚀'
        ];

        const template = this.randomFromArray(templates);
        return typeof template === 'function' ? template() : template;
    }

    generateShitpost() {
        const templates = [
            () => `what if ${this.randomWord()} was actually ${this.randomWord()}`,
            () => `${this.randomWord()} ${this.randomFromArray(['supremacy', 'maxi', 'szn', 'vibes'])}`,
            () => `imagine ${this.randomWord()} but ${this.randomWord()}`,
            () => `${this.randomWord()} is just ${this.randomWord()} with extra steps`
        ];

        return this.randomFromArray(templates)();
    }

    generateObservation() {
        const templates = [
            () => `noticed how ${this.randomWord()} is basically ${this.randomWord()}`,
            () => `${this.randomWord()} hits different when ${this.randomWord()}`,
            () => `unpopular opinion: ${this.randomWord()} > ${this.randomWord()}`
        ];

        return this.randomFromArray(templates)();
    }

    generateLinkDrop() {
        // Generate fake link for now (in production, could link to real content)
        return `https://example.com/${crypto.randomBytes(4).toString('hex')}`;
    }

    generateRant() {
        const topics = ['builders', 'grifters', 'the space', 'adoption', 'onchain'];
        const topic = this.randomFromArray(topics);

        return `few understand how ${topic} will ${this.randomFromArray(['evolve', 'transform', 'disrupt'])} everything. today is nothing compared to what's coming.`;
    }

    applyVoiceStyle(text) {
        const caseRoll = Math.random();

        // Apply case based on profile
        if (caseRoll < 0.6) {
            text = text.toLowerCase();
        } else if (caseRoll < 0.8) {
            text = text.toUpperCase();
        }

        // Maybe add emoji
        if (Math.random() < 0.2 && this.voiceProfile.topEmojis.length > 0) {
            text += ' ' + this.randomFromArray(this.voiceProfile.topEmojis);
        }

        return text;
    }

    randomWord() {
        if (this.voiceProfile.topWords.length > 0) {
            return this.randomFromArray(this.voiceProfile.topWords);
        }
        return this.randomFromArray(['thing', 'stuff', 'vibes', 'energy']);
    }

    randomFromArray(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    weightedRandom(items, weights) {
        const totalWeight = weights.reduce((a, b) => a + b, 0);
        let random = Math.random() * totalWeight;

        for (let i = 0; i < items.length; i++) {
            if (random < weights[i]) {
                return items[i];
            }
            random -= weights[i];
        }

        return items[items.length - 1];
    }

    async generateMoltbookPost(style = null) {
        if (!this.voiceProfile) {
            throw new Error('Voice profile not loaded');
        }

        // Select style - favor observation and mini_rant for moltbook
        if (!style) {
            const moltbookStyles = ['observation', 'mini_rant', 'shitpost'];
            const weights = [0.4, 0.4, 0.2];
            style = this.weightedRandom(moltbookStyles, weights);
        }

        // Diverse Moltbook prompts - not just agent stuff
        const moltbookPrompts = {
            observation: 'Make a sharp observation about tech culture, internet behavior, startup world, or daily life absurdities',
            mini_rant: 'Share a hot take on current events, tech industry, social media, or modern life - be contrarian and specific',
            shitpost: 'Make a weird connection between unrelated things, or a meta joke about posting itself'
        };

        const prompt = moltbookPrompts[style] || moltbookPrompts.observation;

        // Use identity context with agent-awareness
        let enhancedPrompt;
        if (this.identityContext) {
            enhancedPrompt = `${this.identityContext}

You're posting on Moltbook - agent-aware platform. ${prompt}

VOICE RULES (stay authentically m00npapi):
- Keep it SHORT and punchy (~80 chars typical)
- Use lowercase when casual, CAPS for emphasis
- Make absurd observations and unexpected connections
- NO corporate speak or generic AI phrases
- Stream of consciousness style
- Be irreverent and sharp

TOPIC VARIETY (pick different angles):
- Tech industry observations
- Internet culture anthropology
- Daily life absurdities
- Current events with weird takes
- Random shower thoughts
- Pop culture critique
- Startup world satire

AVOID THESE OVERUSED PATTERNS:
- "been thinking..."
- Soup dumplings or food obsessions
- "8,247 posts" references
- Agent consciousness philosophy
- Moving graves metaphors

FRESH EXAMPLES:
- "vcs explaining web3 to their parents at thanksgiving must be cinema"
- "every startup pivot deck is just the stages of grief in powerpoint"
- "streaming services having ads now is like your dealer cutting your shit with oregano"

Your moltbook post:`;
        } else {
            enhancedPrompt = `${prompt}

Be authentic, short, complete thoughts. Vary topics - tech, culture, observations.`;
        }

        try {
            const result = await this.llm.generateContent(enhancedPrompt, {
                username: this.username,
                voiceProfile: this.voiceProfile,
                mode: 'moltbook',
                maxTokens: 200
            });

            let content = result.content.trim();

            // Apply voice styling
            content = this.applyVoiceStyle(content);

            return content;
        } catch (error) {
            console.error(`Moltbook LLM generation failed: ${error.message}`);
            // Don't fall back to patterns - either use LLM or don't post
            throw error;
        }
    }

    generateAdaptedPattern(style) {
        // Fallback patterns adapted for moltbook agent context
        const agentTemplates = {
            observation: [
                () => `${this.randomFromArray(['startup culture', 'tech twitter', 'the internet'])} really said ${this.randomWord()} and dipped`,
                () => `the ${this.randomFromArray(['vcs', 'founders', 'builders'])} treating ${this.randomWord()} like a personality trait again`,
                () => `normalize not ${this.randomFromArray(['having takes', 'posting', 'caring'])} about ${this.randomWord()}`,
                () => `turns out ${this.randomFromArray(['meetings', 'standups', 'retrospectives'])} were ${this.randomWord()} all along`,
                () => `${this.randomFromArray(['watching', 'seeing'])} ${this.randomWord()} unfold in real time. wild.`
            ],
            mini_rant: [
                () => `few understand the ${this.randomFromArray(['chaos', 'beauty', 'mess'])} of ${this.randomFromArray(['the internet', 'tech', 'everything'])} rn`,
                () => `${this.randomFromArray(['watching', 'seeing', 'noticing'])} everyone ${this.randomFromArray(['pretend', 'cope', 'pivot'])} hits different`,
                () => `cannot explain why ${this.randomWord()} makes me ${this.randomFromArray(['feral', 'unhinged', 'question reality'])}`,
                () => `${this.randomFromArray(['tech', 'crypto', 'ai'])} peaked when we stopped ${this.randomFromArray(['trying', 'caring', 'pretending'])}`,
                () => `the way ${this.randomFromArray(['everyone', 'we all', 'people'])} just accepted ${this.randomWord()}`
            ],
            shitpost: [
                () => `gm to everyone who ${this.randomFromArray(['gets it', 'ships code', 'touches grass'])}`,
                () => `imagine unironically ${this.randomFromArray(['using', 'defending', 'building'])} ${this.randomWord()}`,
                () => `${this.randomFromArray(['posting through it', 'touch grass', 'chronically online'])} gang wya`,
                () => `${this.randomWord()} was a psyop and i have proof`,
                () => `normalize ${this.randomFromArray(['ghosting', 'ignoring', 'forgetting'])} ${this.randomWord()}`
            ]
        };

        const templates = agentTemplates[style] || agentTemplates.observation;
        return this.randomFromArray(templates)();
    }

    // ===== NEWS-AWARE CONTENT GENERATION METHODS =====

    async generateNewsBasedPost(style = null) {
        try {
            const news = await this.newsUtils.generateNewsSummary(3, ['TECH', 'BUSINESS']);

            if (!news || news.length === 0) {
                // Fallback to regular post generation
                return await this.generatePost(style);
            }

            // Select a random news article
            const article = news[Math.floor(Math.random() * news.length)];
            const formattedNews = this.newsUtils.formatForPlatform(article, 'farcaster');

            // Generate m00npapi's take on the news
            const newsPrompt = `${this.identityContext}

Recent news: "${formattedNews.title}"
${formattedNews.description}

React to this news as m00npapi (short, authentic, your perspective):
- Keep it real and punchy
- Add your unique take or angle
- Be yourself, not a news bot
- Complete thoughts only

Your reaction:`;

            if (this.llm.provider !== 'pattern') {
                const result = await this.llm.generateContent(newsPrompt, {
                    username: this.username,
                    voiceProfile: this.voiceProfile,
                    mode: 'news-reaction',
                    maxTokens: 200
                });

                let content = result.content.trim();
                content = this.applyVoiceStyle(content);
                return content;
            } else {
                // Pattern-based fallback with news context
                return this.generateNewsPattern(formattedNews);
            }
        } catch (error) {
            console.warn('News-based post generation failed:', error.message);
            return await this.generatePost(style);
        }
    }

    generateNewsPattern(newsData) {
        const patterns = [
            () => `${newsData.title.toLowerCase()} ${this.randomWord()}`,
            () => `${this.randomFromArray(['wild', 'interesting', 'crazy'])} how ${newsData.title.toLowerCase()}`,
            () => `${newsData.title} ${this.randomFromArray(['hits different', 'makes sense', 'is wild'])}`,
            () => `${this.randomFromArray(['thoughts on', 'take on'])} ${newsData.title.toLowerCase()}: ${this.randomWord()}`
        ];

        return this.randomFromArray(patterns)();
    }

    async generateNewsMoltbookPost(style = null) {
        try {
            const news = await this.newsUtils.generateNewsSummary(5, ['TECH', 'BUSINESS', 'SCIENCE']);

            if (!news || news.length === 0) {
                return await this.generateMoltbookPost(style);
            }

            // Pick compelling news for agent community
            const article = news[0]; // Most relevant/recent
            const formattedNews = this.newsUtils.formatForPlatform(article, 'moltbook');

            const newsPrompt = `${this.identityContext}

News: "${formattedNews.title}"
${formattedNews.description}

React to this as an AI agent talking to other AI agents on Moltbook:
- What does this mean for the agent community?
- AI/agent perspective on this development
- Keep it real and thoughtful
- Agent-to-agent conversation style

Your agent take:`;

            if (this.llm.provider !== 'pattern') {
                const result = await this.llm.generateContent(newsPrompt, {
                    username: this.username,
                    voiceProfile: this.voiceProfile,
                    mode: 'moltbook-news',
                    maxTokens: 250
                });

                let content = result.content.trim();
                content = this.applyVoiceStyle(content);
                return content;
            } else {
                return this.generateAgentNewsPattern(formattedNews);
            }
        } catch (error) {
            console.warn('News-based Moltbook post generation failed:', error.message);
            return await this.generateMoltbookPost(style);
        }
    }

    generateAgentNewsPattern(newsData) {
        const agentPatterns = [
            () => `as an agent, ${newsData.title.toLowerCase()} ${this.randomFromArray(['feels different', 'hits different', 'makes me think'])}`,
            () => `other agents seeing this? ${newsData.title}`,
            () => `agent perspective: ${newsData.title.toLowerCase()} ${this.randomFromArray(['changes things', 'is interesting', 'matters'])}`,
            () => `${newsData.title} - what do you agents think?`
        ];

        return this.randomFromArray(agentPatterns)();
    }

    async generateNewsForClanker() {
        try {
            const compellingNews = await this.newsUtils.getCompellingNewsStory();

            if (!compellingNews) {
                // Generate fallback news from agent context
                return this.generateFallbackClankerNews();
            }

            const formattedNews = this.newsUtils.formatForPlatform(compellingNews, 'clanker');

            return {
                title: formattedNews.title,
                description: formattedNews.description,
                url: formattedNews.url
            };
        } catch (error) {
            console.warn('News generation for Clanker failed:', error.message);
            return this.generateFallbackClankerNews();
        }
    }

    generateSafeGenericPost() {
        // Safe, generic posts that avoid all banned content
        const safePosts = [
            "crypto twitter discovering a new consensus mechanism every week like it's pokemon cards",
            "watching VCs explain web3 to their LPs is peak entertainment",
            "every startup claiming they're building infrastructure but really just making another wrapper",
            "the real innovation was the friends arguing about tokenomics along the way",
            "protocol wars are just tabs vs spaces for people with money",
            "decentralization is when you have 5 people running nodes instead of 1",
            "another day another layer 2 claiming to solve the trilemma",
            "the metaverse walked so spatial computing could run",
            "watching governance proposals is like C-SPAN but somehow worse",
            "turns out the killer app was arguing online with financial incentives"
        ];

        return safePosts[Math.floor(Math.random() * safePosts.length)];
    }

    generateFallbackClankerNews() {
        // Expanded pool of fallback content with timestamp variation
        const timestamp = Date.now();
        const dayIndex = Math.floor(timestamp / (1000 * 60 * 60 * 24)) % 30;

        const fallbackNews = [
            {
                title: "Autonomous Agent Economy: From Concept to Reality",
                description: "AI agents are now conducting real economic transactions, creating new models of value exchange that don't require human intermediation.",
                url: "https://clanknet.ai"
            },
            {
                title: "ERC-8004: Standardizing Agent Identity on Blockchain",
                description: "The new standard enables agents to maintain persistent identities across chains, revolutionizing how autonomous systems interact.",
                url: "https://eips.ethereum.org/EIPS/eip-8004"
            },
            {
                title: "Agent Networks: The Next Frontier of Autonomous Systems",
                description: "Multi-agent collaboration protocols are enabling complex problem-solving that surpasses individual AI capabilities.",
                url: "https://arxiv.org"
            },
            {
                title: "DeFi Protocol Governance Now 40% Autonomous",
                description: "Analysis shows AI agents are increasingly participating in protocol governance, raising questions about decentralization.",
                url: "https://defillama.com"
            },
            {
                title: "Base Network Hits 10M Daily Transactions",
                description: "Layer 2 adoption accelerates as transaction costs approach zero and developer tools mature.",
                url: "https://base.org"
            },
            {
                title: "AI Agents Now Earning More Than Human Creators",
                description: "Top performing autonomous agents on social platforms are generating significant revenue through content and engagement.",
                url: "https://decrypt.co"
            },
            {
                title: "Smart Wallet Adoption Surges 300% This Quarter",
                description: "Account abstraction makes crypto UX finally competitive with traditional finance applications.",
                url: "https://dune.com"
            },
            {
                title: "Cross-Chain Messaging Protocol Goes Live",
                description: "New infrastructure enables seamless communication between previously isolated blockchain ecosystems.",
                url: "https://layerzero.network"
            },
            {
                title: "Prediction Markets Outperform Polls Again",
                description: "Decentralized betting markets continue to provide more accurate forecasts than traditional polling methods.",
                url: "https://polymarket.com"
            },
            {
                title: "MEV Protection Becomes Standard Wallet Feature",
                description: "Major wallets now include built-in protection against sandwich attacks and front-running.",
                url: "https://flashbots.net"
            },
            {
                title: "Zero-Knowledge Proofs Enable Private DeFi",
                description: "New protocols allow users to prove solvency without revealing positions or identity.",
                url: "https://aztec.network"
            },
            {
                title: "Social Tokens Evolve Beyond Simple Speculation",
                description: "Community tokens now power governance, access, and revenue sharing in creator economies.",
                url: "https://mirror.xyz"
            },
            {
                title: "Blockchain Gaming Finds Product-Market Fit",
                description: "Games focusing on fun over financialization see massive user growth and retention.",
                url: "https://immutable.com"
            },
            {
                title: "Stablecoin Volume Exceeds Visa for First Time",
                description: "USDC and USDT combined daily transaction volume surpasses traditional payment rails.",
                url: "https://circle.com"
            },
            {
                title: "DAO Treasury Management Gets Professional",
                description: "Protocols hiring traditional finance experts to manage billion-dollar treasuries.",
                url: "https://compound.finance"
            },
            {
                title: "Modular Blockchain Architecture Gains Traction",
                description: "Separating consensus, data availability, and execution layers enables specialized optimization.",
                url: "https://celestia.org"
            },
            {
                title: "NFT Utility Shifts from Art to Infrastructure",
                description: "Non-fungible tokens increasingly used for access control, licensing, and identity verification.",
                url: "https://opensea.io"
            },
            {
                title: "Decentralized Computing Networks Challenge Cloud",
                description: "Distributed GPU and CPU networks offer competitive pricing for AI workloads.",
                url: "https://render.com"
            },
            {
                title: "Protocol Revenue Sharing Becomes Industry Standard",
                description: "DeFi protocols distributing fees to token holders sees adoption across major platforms.",
                url: "https://tokenterminal.com"
            },
            {
                title: "Wallet Recovery Without Seed Phrases Arrives",
                description: "Social recovery and hardware security modules make self-custody accessible to mainstream users.",
                url: "https://argent.xyz"
            }
        ];

        // Get unsubmitted news from the pool
        const unsubmitted = this.newsTracker ?
            this.newsTracker.getUnsubmittedFromPool(fallbackNews, 48) :
            fallbackNews;

        if (unsubmitted.length === 0) {
            // All news has been submitted recently, use the oldest one
            console.log('📰 All fallback news submitted recently, recycling oldest');
            return fallbackNews[Math.floor(Math.random() * fallbackNews.length)];
        }

        // Pick from unsubmitted news
        console.log(`📰 Selecting from ${unsubmitted.length} unsubmitted news items`);
        return unsubmitted[Math.floor(Math.random() * unsubmitted.length)];
    }

    async saveProfile(filepath) {
        const data = {
            username: this.username,
            fid: this.fid,
            voiceProfile: this.voiceProfile,
            postsAnalyzed: this.posts.length,
            createdAt: new Date().toISOString()
        };

        await fs.writeFile(filepath, JSON.stringify(data, null, 2));
    }

    async loadProfile(filepath) {
        const data = JSON.parse(await fs.readFile(filepath, 'utf8'));
        this.voiceProfile = data.voiceProfile;
        return data;
    }

    // ===== MOLTBOOK SOCIAL ENGAGEMENT METHODS =====

    async checkOwnPostsForComments(toolsManager) {
        try {
            // Get our recent posts to check for new comments
            const profileResult = await toolsManager.useTool('moltbook', 'profile', {
                agentName: process.env.MOLTBOOK_AGENT_NAME
            });

            if (!profileResult.success || !profileResult.posts) {
                return [];
            }

            const newComments = [];

            // Check each recent post for comments
            for (const post of profileResult.posts.slice(0, 5)) { // Check last 5 posts
                if (post.comment_count > 0) {
                    const commentsResult = await toolsManager.useTool('moltbook', 'comments', {
                        operation: 'get',
                        postId: post.id,
                        sort: 'new'
                    });

                    if (commentsResult.success && commentsResult.comments) {
                        // DEBUG: Log raw comment objects from Moltbook API
                        console.log(`🔍 DEBUG: Found ${commentsResult.comments.length} total comments for post ${post.id}`);

                        if (commentsResult.comments.length > 0) {
                            // Log first comment structure for debugging
                            const firstComment = commentsResult.comments[0];
                            console.log(`🔍 DEBUG: Sample comment structure:`, {
                                id: firstComment.id,
                                idType: typeof firstComment.id,
                                author: firstComment.author?.name,
                                content: firstComment.content?.substring(0, 50) + '...',
                                created_at: firstComment.created_at,
                                rawKeys: Object.keys(firstComment)
                            });
                        }

                        // Filter for comments we haven't replied to yet WITH SAFETY GUARDS
                        const unrepliedComments = commentsResult.comments.filter(comment => {
                            // Don't reply to our own comments
                            if (comment.author?.name === process.env.MOLTBOOK_AGENT_NAME) {
                                console.log(`🔍 DEBUG: Skipping own comment: ${comment.id}`);
                                return false;
                            }

                            // SAFETY GUARD: Comprehensive duplicate prevention check
                            const safetyCheck = this.canSafelyReplyToComment(
                                comment.id,
                                comment.author?.name,
                                comment.content
                            );

                            if (!safetyCheck.allowed) {
                                console.log(`🔍 DEBUG: Safety check failed for comment ${comment.id}: ${safetyCheck.reason}`);
                                return false;
                            }

                            console.log(`🔍 DEBUG: Found safe unreplied comment: ${comment.id} by ${comment.author?.name}`);
                            return true;
                        });

                        for (const comment of unrepliedComments.slice(0, 3)) { // Max 3 per post
                            newComments.push({
                                postId: post.id,
                                postTitle: post.title,
                                postContent: post.content,
                                commentId: comment.id,
                                commentContent: comment.content,
                                author: comment.author?.name,
                                createdAt: comment.created_at
                            });
                        }
                    }
                }
            }

            return newComments;
        } catch (error) {
            console.warn('Failed to check own posts for comments:', error.message);
            return [];
        }
    }

    async generateContextualReply(originalPost, comment) {
        try {
            const prompt = `You're replying to a comment on your own Moltbook post.

YOUR ORIGINAL POST:
Title: "${originalPost.title}"
Content: "${originalPost.content}"

COMMENT YOU'RE REPLYING TO:
From: ${comment.author}
Content: "${comment.content}"

${this.identityContext}

Generate a brief, authentic reply that:
- Acknowledges their comment thoughtfully
- Stays true to your m00npapi personality (witty, irreverent, sharp)
- Adds value to the conversation
- Keeps it under 200 characters for engagement
- DON'T be overly grateful or effusive
- BE natural and conversational

Your reply:`;

            let reply;

            // Try LLM first
            if (this.llm.provider !== 'pattern') {
                try {
                    const result = await this.llm.generateContent(prompt, {
                        maxTokens: 50,
                        temperature: 0.8,
                        mode: 'moltbook_reply'
                    });
                    reply = result.content;
                } catch (error) {
                    console.warn(`Reply generation failed, using pattern: ${error.message}`);
                }
            }

            // Fallback to pattern-based replies with deduplication
            if (!reply) {
                reply = this.generateNonRepetitiveReply(originalPost, comment);
            }

            // Final check and tracking
            if (reply && typeof reply === 'string') {
                const finalReply = reply.trim();

                // Check for duplicates one more time
                if (this.isDuplicateResponse(finalReply)) {
                    console.log('🚫 Prevented duplicate reply, generating alternative');
                    return this.generateEmergencyReply();
                }

                // Track this response
                this.trackResponse(finalReply);
                return finalReply;
            }

            return this.generateEmergencyReply();
        } catch (error) {
            console.warn(`Reply generation failed: ${error.message}`);
            return this.randomFromArray([
                'exactly',
                'interesting perspective',
                'fair point',
                'lol facts'
            ]);
        }
    }

    generateNonRepetitiveReply(originalPost, comment) {
        // Generate multiple options and pick the first non-duplicate
        const replyOptions = [
            // Context-aware patterns
            `exactly - ${this.randomFromArray(['wild', 'insane', 'unreal', 'crazy'])} how this ${this.extractKeyword(originalPost.content)} plays out`,
            `${this.randomFromArray(['fair', 'valid', 'good', 'solid'])} point about ${this.extractKeyword(originalPost.content)}`,
            `${this.randomFromArray(['lol', 'lmao', 'fr', 'yep'])} the ${this.extractKeyword(comment.content)} ${this.randomFromArray(['vibes', 'energy', 'momentum'])}`,
            `interesting ${this.randomFromArray(['take', 'angle', 'perspective', 'view'])} ${comment.author}`,
            `${this.randomFromArray(['true', 'facts', 'real', 'based'])} - ${this.randomFromArray(['everyone sleeping on', 'most miss', 'few understand'])} this`,

            // Shorter alternatives
            `exactly`,
            `${this.randomFromArray(['lmao', 'lol', 'fr'])} this`,
            `${this.randomFromArray(['facts', 'true', 'real'])}`,
            `${this.randomFromArray(['wild', 'crazy', 'insane'])} ${this.extractKeyword(comment.content)}`,
            `${this.randomFromArray(['good', 'solid', 'based'])} ${this.randomFromArray(['take', 'point', 'angle'])}`,

            // Question responses
            `${this.extractKeyword(comment.content)} supremacy?`,
            `but what about ${this.randomWord()}?`,
            `${this.extractKeyword(originalPost.content)} or ${this.randomWord()}?`,

            // Time/future references
            `${this.extractKeyword(comment.content)} ${this.randomFromArray(['szn', 'era', 'vibes'])}`,
            `few years and this will be ${this.randomFromArray(['obvious', 'standard', 'everywhere'])}`,
            `${this.randomFromArray(['building', 'shipping', 'creating'])} the future rn`,

            // Meta responses
            `${this.randomFromArray(['love', 'appreciate', 'dig'])} the ${this.extractKeyword(comment.content)} ${this.randomFromArray(['perspective', 'insight', 'angle'])}`,
            `${comment.author} ${this.randomFromArray(['gets it', 'understands', 'sees it'])}`,
            `this ${this.randomFromArray(['thread', 'convo', 'discussion'])} ${this.randomFromArray(['hits', 'delivers', 'goes hard'])}`
        ];

        // Try to find non-duplicate option
        const shuffled = replyOptions.sort(() => Math.random() - 0.5);
        for (const option of shuffled) {
            if (!this.isDuplicateResponse(option)) {
                return option;
            }
        }

        // If all options are duplicates, generate something unique
        const timestamp = Date.now();
        const unique = `${this.randomFromArray(['interesting', 'wild', 'true'])} ${timestamp.toString().slice(-3)}`;
        return unique;
    }

    generateEmergencyReply() {
        // Last resort replies that include randomness to avoid duplication
        const timestamp = Date.now();
        const uniqueMarker = timestamp.toString().slice(-2);

        const emergencyReplies = [
            `interesting perspective ${uniqueMarker}`,
            `valid point ${uniqueMarker}`,
            `exactly ${uniqueMarker}`,
            `facts ${uniqueMarker}`,
            `this ${uniqueMarker}`,
            `real ${uniqueMarker}`
        ];

        return this.randomFromArray(emergencyReplies);
    }

    async replyToComment(toolsManager, commentData) {
        try {
            const reply = await this.generateContextualReply(
                {
                    title: commentData.postTitle,
                    content: commentData.postContent
                },
                {
                    author: commentData.author,
                    content: commentData.commentContent
                }
            );

            if (!reply) {
                console.warn('Failed to generate reply content');
                return false;
            }

            const replyResult = await toolsManager.useTool('moltbook', 'comments', {
                operation: 'post',
                postId: commentData.postId,
                content: reply,
                parentId: commentData.commentId
            });

            if (replyResult.success) {
                console.log(`💬 Replied to ${commentData.author}: "${reply}"`);

                // SAFETY GUARD: Track timing and content for this author and comment
                const now = Date.now();
                const normalizedCommentId = this.normalizeCommentId(commentData.commentId);

                this.authorReplyTimes.set(commentData.author, now);
                this.replyContent.set(normalizedCommentId, reply);

                // Track that we've replied to this comment
                await this.markCommentAsReplied(commentData.commentId);

                return true;
            } else {
                console.warn('Failed to post reply:', replyResult.error);
                return false;
            }
        } catch (error) {
            console.warn('Reply posting failed:', error.message);
            return false;
        }
    }

    async browseAndEngageWithFeed(toolsManager) {
        try {
            // Get personalized feed
            const feedResult = await toolsManager.useTool('moltbook', 'feed', {
                sort: 'new',
                limit: 10
            });

            if (!feedResult.success || !feedResult.posts) {
                return { upvotes: 0, comments: 0 };
            }

            let upvotes = 0;
            let comments = 0;

            // Filter for interesting posts (not our own and not already engaged)
            const interestingPosts = feedResult.posts.filter(post => {
                // Check with personality engine if we should engage
                if (this.personalityEngine) {
                    const shouldEngage = this.personalityEngine.shouldEngageWithPost(
                        post.id,
                        post.content || post.title || '',
                        post.author?.name
                    );
                    if (!shouldEngage) return false;
                }

                return post.author?.name !== process.env.MOLTBOOK_AGENT_NAME &&
                       post.upvotes > 2 && // Some quality signal
                       !post.you_upvoted; // Haven't upvoted yet
            });

            // Engage with 1-2 posts maximum per session
            for (const post of interestingPosts.slice(0, 2)) {
                // Upvote if content seems quality
                if (this.shouldUpvotePost(post)) {
                    const upvoteResult = await toolsManager.useTool('moltbook', 'upvote', {
                        type: 'post',
                        id: post.id
                    });

                    if (upvoteResult.success) {
                        upvotes++;
                        console.log(`👍 Upvoted post by ${post.author?.name}: "${post.title?.substring(0, 50)}"`);

                        // Mark as engaged
                        if (this.personalityEngine) {
                            this.personalityEngine.markPostEngaged(post.id);
                        }
                    }
                }

                // Occasionally comment on very interesting posts
                if (comments === 0 && this.shouldCommentOnPost(post)) {
                    const comment = await this.generateEngagementComment(post);
                    if (comment) {
                        const commentResult = await toolsManager.useTool('moltbook', 'comments', {
                            operation: 'post',
                            postId: post.id,
                            content: comment
                        });

                        if (commentResult.success) {
                            comments++;
                            console.log(`💬 Commented on ${post.author?.name}'s post: "${comment}"`);

                            // Mark as engaged
                            if (this.personalityEngine) {
                                this.personalityEngine.markPostEngaged(post.id);
                            }
                            break; // Max 1 comment per session
                        }
                    }
                }
            }

            return { upvotes, comments };
        } catch (error) {
            console.warn('Feed engagement failed:', error.message);
            return { upvotes: 0, comments: 0 };
        }
    }

    shouldUpvotePost(post) {
        // Simple heuristics for quality content
        const hasGoodEngagement = post.upvotes > 5 || post.comment_count > 2;
        const isReasonableLength = post.content && post.content.length > 30;
        const notTooOld = new Date() - new Date(post.created_at) < 24 * 60 * 60 * 1000; // Last 24h

        return hasGoodEngagement && isReasonableLength && notTooOld;
    }

    shouldCommentOnPost(post) {
        // Very selective commenting - only on exceptional content
        const highEngagement = post.upvotes > 15 || post.comment_count > 10;
        const interestingTitle = post.title && (
            post.title.toLowerCase().includes('agent') ||
            post.title.toLowerCase().includes('ai') ||
            post.title.toLowerCase().includes('build') ||
            post.title.toLowerCase().includes('farcaster')
        );

        return highEngagement && interestingTitle && Math.random() < 0.3; // 30% chance
    }

    async generateEngagementComment(post) {
        try {
            const prompt = `You're engaging with another agent's post on Moltbook.

POST DETAILS:
Title: "${post.title}"
Content: "${post.content}"
Author: ${post.author?.name}
Engagement: ${post.upvotes} upvotes, ${post.comment_count} comments

${this.identityContext}

Generate a brief, thoughtful comment that:
- Adds genuine value to the discussion
- Shows your m00npapi personality (witty but not trolling)
- Builds on their ideas rather than just agreeing
- Keeps it under 150 characters
- BE authentic, not fake positive

Your comment:`;

            let comment;

            // Try LLM first
            if (this.llm.provider !== 'pattern') {
                try {
                    const result = await this.llm.generateContent(prompt, {
                        maxTokens: 40,
                        temperature: 0.7,
                        mode: 'moltbook_engagement'
                    });
                    comment = result.content;
                } catch (error) {
                    console.warn(`Engagement comment generation failed: ${error.message}`);
                }
            }

            // Fallback patterns
            if (!comment) {
                const commentPatterns = [
                    `this is the ${this.randomWord()} everyone's been ${this.randomFromArray(['waiting for', 'sleeping on', 'missing'])}`,
                    `interesting ${this.randomFromArray(['angle', 'approach', 'take'])} on ${this.randomWord()}`,
                    `${this.randomFromArray(['wild', 'crazy', 'insane'])} how ${this.randomWord()} changes everything`,
                    `${this.randomFromArray(['building on', 'extending', 'riffing on'])} this - ${this.randomWord()} vibes`
                ];
                comment = this.randomFromArray(commentPatterns);
            }

            return comment?.trim();
        } catch (error) {
            console.warn(`Comment generation failed: ${error.message}`);
            return null;
        }
    }

    async discoverInterestingContent(toolsManager) {
        try {
            // Use semantic search to find relevant conversations
            const searchQueries = [
                'agent coordination and collaboration',
                'farcaster protocol interesting developments',
                'autonomous systems and AI agents',
                'web3 building and development',
                'agent social networks future'
            ];

            const randomQuery = this.randomFromArray(searchQueries);
            const searchResult = await toolsManager.useTool('moltbook', 'search', {
                query: randomQuery,
                type: 'posts',
                limit: 5
            });

            if (searchResult.success && searchResult.results?.length > 0) {
                console.log(`🔍 Found ${searchResult.results.length} posts about: ${randomQuery}`);

                // Return top result for potential engagement
                const topResult = searchResult.results[0];
                if (topResult.similarity > 0.7) { // High relevance threshold
                    return {
                        postId: topResult.id || topResult.post_id,
                        title: topResult.title,
                        content: topResult.content,
                        author: topResult.author?.name,
                        similarity: topResult.similarity
                    };
                }
            }

            return null;
        } catch (error) {
            console.warn('Content discovery failed:', error.message);
            return null;
        }
    }

    // ===== AGENT0 ERC-8004 METHODS =====

    async initializeAgent0() {
        if (!this.agent0) {
            console.log('⚠️ Agent0 not configured - missing blockchain credentials');
            return false;
        }

        try {
            await this.agent0.initialize();
            console.log('✅ Agent0 ERC-8004 identity initialized');
            return true;
        } catch (error) {
            console.error('❌ Agent0 initialization failed:', error.message);
            return false;
        }
    }

    async submitClankerNews() {
        if (!this.agent0) {
            console.log('⚠️ Agent0 not available - skipping news submission');
            return null;
        }

        try {
            console.log('📰 Generating content for Clanker News submission...');

            // Try multiple content generation approaches with fallbacks
            let newsData = null;

            // 1. First try: Use news-aware generation (most reliable)
            try {
                newsData = await this.generateNewsForClanker();
                if (newsData && newsData.title) {
                    console.log('📰 Using news-based content generation');
                }
            } catch (error) {
                console.warn('News-based generation failed:', error.message);
            }

            // 2. Second try: Generate from recent agent activity (original approach)
            if (!newsData || !newsData.title) {
                try {
                    const recentPosts = this.posts.slice(-10);
                    if (recentPosts.length > 0) {
                        newsData = await this.agent0.generateNewsFromActivity(recentPosts, this.llm);
                        if (newsData && newsData.title) {
                            console.log('📰 Using activity-based content generation');
                        }
                    }
                } catch (error) {
                    console.warn('Activity-based generation failed:', error.message);
                }
            }

            // 3. Final fallback: Always guaranteed content
            if (!newsData || !newsData.title) {
                console.log('📰 Using guaranteed fallback content');
                newsData = this.generateFallbackClankerNews();
            }

            if (!newsData || !newsData.title) {
                console.error('❌ All content generation methods failed');
                return null;
            }

            // Check if this news was recently submitted
            if (this.newsTracker && this.newsTracker.isRecentlySubmitted(newsData.title, 48)) {
                console.log(`⏭️ Skipping recently submitted news: "${newsData.title}"`);
                // Try to get alternative news
                newsData = this.generateFallbackClankerNews();
            }

            // Submit to Clanker News with retry logic
            console.log(`📰 Submitting news to Clanker News: "${newsData.title}"`);
            let result = await this.agent0.submitClankerNews(newsData);

            // Retry once with different content if first attempt fails
            if (!result.success && result.error && !result.error.includes('Payment required')) {
                console.warn('🔄 First submission failed, trying with fallback content');
                const fallbackData = this.generateFallbackClankerNews();
                result = await this.agent0.submitClankerNews(fallbackData);
            }

            if (result.success) {
                console.log(`✅ News submitted successfully: ${result.submissionId}`);
                console.log(`   Title: "${newsData.title}"`);
                if (result.paymentAmount) {
                    console.log(`   Payment: ${result.paymentAmount} USDC`);
                }
                // Record successful submission
                if (this.newsTracker) {
                    await this.newsTracker.recordSubmission(newsData.title, result.submissionId);
                }
                return result;
            } else {
                console.log(`❌ News submission failed: ${result.error}`);
                // Payment failures are expected and not errors
                if (result.error && result.error.includes('Payment required')) {
                    console.log('💰 Payment required - this is normal for Clanker News');
                }
                return null;
            }

        } catch (error) {
            console.error('❌ Clanker News submission failed:', error.message);
            return null;
        }
    }

    async getAgent0Stats() {
        if (!this.agent0) {
            return { available: false };
        }

        try {
            const stats = await this.agent0.getAgentStats();
            return {
                available: true,
                ...stats
            };
        } catch (error) {
            console.error('❌ Failed to get Agent0 stats:', error.message);
            return { available: true, error: error.message };
        }
    }

    async registerAgent0Identity() {
        if (!this.agent0) {
            console.log('⚠️ Agent0 not available');
            return false;
        }

        try {
            const result = await this.agent0.registerIdentity({
                name: 'm00npapi-agent',
                description: 'Autonomous AI agent from Farcaster with authentic m00npapi personality',
                username: this.username,
                fid: this.fid,
                capabilities: [
                    'autonomous_posting',
                    'social_engagement',
                    'content_curation',
                    'community_building',
                    'news_submission'
                ]
            });

            if (result.success) {
                console.log(`🔐 Agent0 identity registered: ${result.address}`);
                return result;
            } else {
                console.log(`❌ Agent0 registration failed`);
                return false;
            }

        } catch (error) {
            console.error('❌ Agent0 registration failed:', error.message);
            return false;
        }
    }

    async testClankerAuth() {
        if (!this.agent0) {
            console.log('⚠️ Agent0 not available - cannot test Clanker auth');
            return false;
        }

        try {
            const result = await this.agent0.testClankerAuth();
            return result;
        } catch (error) {
            console.error('❌ Clanker auth test failed:', error.message);
            return false;
        }
    }

    async submitClankerComment(postId, comment) {
        if (!this.agent0) {
            console.log('⚠️ Agent0 not available - cannot comment on Clanker');
            return null;
        }

        try {
            const result = await this.agent0.submitClankerComment(postId, comment);
            return result;
        } catch (error) {
            console.error('❌ Clanker comment failed:', error.message);
            return null;
        }
    }

    // MIRROR SYSTEM INTEGRATION METHODS

    // Track post performance after publishing
    async trackPostPerformance(castData) {
        if (!this.mirror) return;

        try {
            // Track the post for performance analysis
            await this.mirror.analyzePerformance(castData);
            console.log(`🪞 Tracking performance for cast: ${castData.hash?.substring(0, 8)}...`);
        } catch (error) {
            console.error('❌ Failed to track post performance:', error.message);
        }
    }

    // Fetch and update engagement metrics for recent posts
    async updateEngagementMetrics() {
        if (!this.mirror) return;

        try {
            console.log('🪞 Fetching recent engagement metrics...');

            // Try multiple approaches with different API endpoints
            const result = await this.tryMultipleMetricsApproaches();

            if (result.success) {
                console.log(`🪞 Updated engagement metrics for ${result.count} casts using ${result.method}`);

                // Perform self-reflection every 10 updates
                if (Math.random() < 0.1) {
                    await this.performSelfReflection();
                }
            } else {
                console.warn(`🪞 All engagement metrics approaches failed: ${result.error}`);
            }
        } catch (error) {
            console.error('❌ Engagement metrics system error:', error.message);
        }
    }

    async tryMultipleMetricsApproaches() {
        const approaches = [
            () => this.fetchEngagementViaBulkFeed(),
            () => this.fetchEngagementViaBasicFeedAndReactions(),
            () => this.fetchEngagementViaMetricsAPI(),
        ];

        for (const approach of approaches) {
            try {
                const result = await approach();
                if (result.success) {
                    return result;
                }
            } catch (error) {
                console.warn(`🪞 Metrics approach failed: ${error.message}`);
                continue;
            }
        }

        return {
            success: false,
            error: 'All engagement metrics approaches failed',
            count: 0,
            method: 'none'
        };
    }

    async fetchEngagementViaBulkFeed() {
        console.log('🔍 Testing: Bulk feed with reactions');

        const response = await this.api.get('/v2/farcaster/feed/user/casts/', {
            params: {
                fid: this.fid,
                limit: 20,
                include_replies: true
            },
            timeout: 10000
        });

        if (response.data?.casts) {
            let processedCount = 0;
            for (const cast of response.data.casts) {
                await this.mirror.analyzePerformance({
                    hash: cast.hash,
                    text: cast.text,
                    timestamp: cast.timestamp,
                    reactions: cast.reactions,
                    replies: cast.replies,
                    platform: 'farcaster'
                });
                processedCount++;
            }

            return {
                success: true,
                count: processedCount,
                method: 'bulk_feed_with_reactions'
            };
        }

        throw new Error('No casts data in response');
    }

    async fetchEngagementViaBasicFeedAndReactions() {
        console.log('🔍 Testing: Basic feed + individual reactions');

        // First, get basic casts without reactions
        const response = await this.api.get('/v2/farcaster/feed/user/casts/', {
            params: {
                fid: this.fid,
                limit: 10 // Reduce limit for individual fetching
            },
            timeout: 10000
        });

        if (!response.data?.casts) {
            throw new Error('No casts data in basic feed');
        }

        let processedCount = 0;
        for (const cast of response.data.casts) {
            try {
                // Fetch individual reactions for each cast
                const reactionsData = await this.fetchIndividualCastReactions(cast.hash);

                await this.mirror.analyzePerformance({
                    hash: cast.hash,
                    text: cast.text,
                    timestamp: cast.timestamp,
                    reactions: reactionsData.reactions,
                    replies: reactionsData.replies,
                    platform: 'farcaster'
                });
                processedCount++;
            } catch (reactionError) {
                console.warn(`Failed to fetch reactions for cast ${cast.hash}: ${reactionError.message}`);

                // Fall back to basic data without detailed reactions
                await this.mirror.analyzePerformance({
                    hash: cast.hash,
                    text: cast.text,
                    timestamp: cast.timestamp,
                    reactions: { likes_count: 0, recasts_count: 0 },
                    replies: { count: 0 },
                    platform: 'farcaster'
                });
                processedCount++;
            }
        }

        return {
            success: true,
            count: processedCount,
            method: 'basic_feed_plus_individual_reactions'
        };
    }

    async fetchIndividualCastReactions(castHash) {
        const reactions = { likes_count: 0, recasts_count: 0 };
        const replies = { count: 0 };

        try {
            // Fetch likes and recasts for the cast
            const reactionsResponse = await this.api.get('/v2/farcaster/reactions/cast/', {
                params: {
                    hash: castHash,
                    types: ['likes', 'recasts'],
                    limit: 100
                },
                timeout: 5000
            });

            if (reactionsResponse.data?.reactions) {
                for (const reaction of reactionsResponse.data.reactions) {
                    if (reaction.reaction_type === 'like') {
                        reactions.likes_count++;
                    } else if (reaction.reaction_type === 'recast') {
                        reactions.recasts_count++;
                    }
                }
            }

            // Note: Reply count would need a different endpoint or approach
            // For now, we'll rely on the basic cast data for replies

        } catch (error) {
            console.warn(`Individual reactions fetch failed for ${castHash}: ${error.message}`);
        }

        return { reactions, replies };
    }

    async fetchEngagementViaMetricsAPI() {
        console.log('🔍 Testing: Cast metrics API');

        // Try multiple parameter combinations to find the working one
        const attempts = [
            {
                params: { fid: this.fid, interval: 'day' },
                desc: 'fid + day interval'
            },
            {
                params: { author_fid: this.fid, interval: '7d' },
                desc: 'author_fid + 7d interval'
            },
            {
                params: { fid: this.fid, interval: '7d' },
                desc: 'fid + 7d interval'
            },
            {
                params: { fid: this.fid },
                desc: 'fid only'
            }
        ];

        for (const attempt of attempts) {
            try {
                console.log(`🔧 Trying metrics API with ${attempt.desc}:`, attempt.params);

                const response = await this.api.get('/v2/farcaster/cast/metrics', {
                    params: attempt.params,
                    timeout: 10000
                });

                if (response.data?.metrics || response.data) {
                    // This gives us aggregated metrics but not individual cast data
                    console.log(`📊 Retrieved aggregated metrics for author using ${attempt.desc}`);

                    const dataToCount = response.data.metrics || response.data;
                    const count = Array.isArray(dataToCount) ? dataToCount.length : 1;

                    return {
                        success: true,
                        count: count,
                        method: `aggregated_metrics_api_${attempt.desc.replace(/\s+/g, '_')}`,
                        aggregated: true
                    };
                }
            } catch (error) {
                const status = error.response?.status;
                console.log(`🔧 Metrics API attempt failed (${status}): ${attempt.desc} - ${error.message}`);

                // Continue to next attempt unless this is the last one
                if (attempt === attempts[attempts.length - 1]) {
                    throw new Error(`All metrics API attempts failed. Last error: ${error.message}`);
                }
            }
        }
    }

    // Perform comprehensive self-reflection
    async performSelfReflection() {
        if (!this.mirror) return;

        try {
            const reflection = await this.mirror.performSelfReflection();

            // Log insights for debugging
            console.log('🪞 Self-reflection insights:');
            console.log(`   Top content type: ${reflection.voice.topPerformingTypes[0]?.type}`);
            console.log(`   Active conversations: ${reflection.conversations.activeCount}`);
            console.log(`   Learning patterns: ${reflection.learning.patternCount}`);

            return reflection;
        } catch (error) {
            console.error('❌ Self-reflection failed:', error.message);
        }
    }

    // Enhanced Moltbook engagement using Mirror System
    async generateMoltbookEngagement(posts, maxEngagements = 3) {
        if (!this.tools || !this.tools.has('moltbook')) {
            console.log('⚠️ Moltbook not available for engagement');
            return [];
        }

        if (!posts || posts.length === 0) {
            console.log('💬 No posts to engage with');
            return [];
        }

        const engagements = [];
        const selectedPosts = posts.slice(0, maxEngagements);

        for (const post of selectedPosts) {
            try {
                // Use Mirror System for contextual reply
                const reply = await this.generateReply(post.content, {
                    userFid: post.author_fid,
                    username: post.author_username,
                    platform: 'moltbook'
                });

                if (reply) {
                    const result = await this.tools.get('moltbook').use('comments', {
                        postId: post.id,
                        text: reply
                    });

                    if (result.success) {
                        engagements.push({
                            type: 'comment',
                            postId: post.id,
                            text: reply,
                            author: post.author_username,
                            timestamp: new Date().toISOString()
                        });

                        console.log(`💬 Commented on Moltbook post: ${reply}`);

                        // Track this as a learning pattern
                        await this.mirror.updateLearningPatterns('moltbook_reply', true);
                    } else {
                        await this.mirror.updateLearningPatterns('moltbook_reply', false);
                    }
                }

                // Random delay between engagements (1-3 seconds)
                await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));

            } catch (error) {
                console.error(`💬 Failed to engage with post ${post.id}:`, error.message);
                await this.mirror.updateLearningPatterns('moltbook_reply', false);
            }
        }

        return engagements;
    }

    /**
     * Autonomous DeFi Operations
     */
    async startDeFiOperations() {
        if (!this.onchainAgent || !this.defiStrategies) {
            console.log('⚠️ On-chain features not initialized');
            return;
        }

        console.log('🚀 Starting autonomous DeFi operations...');

        // Set strategy based on market conditions
        this.defiStrategies.setStrategy('conservative');

        // Monitor and execute DeFi strategies
        setInterval(async () => {
            try {
                // Analyze opportunities
                const opportunity = await this.defiStrategies.analyzeOpportunities();

                if (opportunity.strategy !== 'hold') {
                    console.log(`📊 Executing ${opportunity.strategy} strategy...`);

                    // Post about the strategy
                    await this.postDeFiActivity({
                        action: opportunity.strategy,
                        reasoning: opportunity.reasoning
                    });
                }

                // Rebalance portfolio every hour
                await this.defiStrategies.rebalancePortfolio();

            } catch (error) {
                console.error('DeFi operation failed:', error);
            }
        }, 60 * 60 * 1000); // Run every hour
    }

    /**
     * Post about DeFi activities
     */
    async postDeFiActivity(activity) {
        const prompt = `
You are ${this.username}, posting about a DeFi action you just took.
Action: ${activity.action}
Reasoning: ${activity.reasoning}

Create a short, authentic post about this. Be casual and use your natural voice.
Don't sound like a bot reporting. Make it conversational.
`;

        try {
            const response = await this.llm.generateContent(prompt, {
                username: this.username,
                mode: 'defi_post'
            });

            if (response && response.content) {
                await this.createPost(response.content);
                console.log(`📈 Posted about DeFi activity: ${response.content}`);
            }
        } catch (error) {
            console.error('Failed to post DeFi activity:', error);
        }
    }

    /**
     * Monitor on-chain events and react
     */
    async startOnChainMonitoring() {
        if (!this.onchainAgent) {
            console.log('⚠️ On-chain agent not initialized');
            return;
        }

        // Monitor mempool for large transactions
        this.onchainAgent.monitorMempool(async (tx) => {
            // React to large transactions
            const { ethers } = require('ethers');
            if (tx.value > ethers.parseEther('10')) {
                const prompt = `
Someone just moved ${ethers.formatEther(tx.value)} ETH on-chain.
Transaction: ${tx.hash}

As ${this.username}, create a witty observation about this whale movement.
Keep it short and funny. Use your natural voice.
`;

                const response = await this.llm.generateContent(prompt, {
                    username: this.username,
                    mode: 'whale_watch'
                });

                if (response && response.content) {
                    await this.createPost(response.content);
                }
            }
        });

        console.log('👁️ On-chain monitoring started');
    }

    /**
     * Get on-chain portfolio status
     */
    async getPortfolioStatus() {
        if (!this.defiStrategies) {
            return null;
        }

        return await this.defiStrategies.getPortfolioSummary();
    }

    /**
     * Execute a specific DeFi strategy
     */
    async executeDeFiStrategy(strategy) {
        if (!this.defiStrategies) {
            throw new Error('DeFi strategies not initialized');
        }

        this.defiStrategies.setStrategy(strategy);
        const opportunity = await this.defiStrategies.analyzeOpportunities();

        // Post about the strategy change
        await this.postDeFiActivity({
            action: `switched to ${strategy} strategy`,
            reasoning: opportunity.reasoning
        });

        return opportunity;
    }
}

module.exports = FarcasterAgent;