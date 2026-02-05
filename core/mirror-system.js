/**
 * Mirror System - Self-Referential Agent Analysis & Improvement
 *
 * This system provides the agent with self-awareness and learning capabilities:
 * 1. Performance Mirror - analyzes engagement metrics and success patterns
 * 2. Voice Consistency Mirror - ensures authentic m00npapi personality
 * 3. Conversation Memory Mirror - remembers relationships and contexts
 * 4. Learning Mirror - continuous improvement through self-reflection
 */

const fs = require('fs').promises;
const path = require('path');

class MirrorSystem {
    constructor() {
        this.dataDir = path.join(__dirname, '../data');
        this.performanceData = new Map(); // Cast hash -> engagement metrics
        this.voiceExamples = new Map(); // High-performing content examples
        this.conversationMemory = new Map(); // User FID -> conversation history
        this.learningPatterns = new Map(); // Pattern type -> success metrics

        // Caching and data source management
        this.dataSourceMetrics = new Map(); // Track which data sources work
        this.lastUpdate = new Map(); // Track when each cast was last updated
        this.updateFrequency = 30 * 60 * 1000; // 30 minutes between updates

        this.initialize();
    }

    async initialize() {
        try {
            // Ensure data directory exists
            await this.ensureDataDirectory();

            // Load existing mirror data
            await this.loadPerformanceData();
            await this.loadVoiceExamples();
            await this.loadConversationMemory();
            await this.loadLearningPatterns();

            console.log('🪞 Mirror System initialized with self-reflection capabilities');
        } catch (error) {
            console.error('❌ Mirror System initialization failed:', error.message);
            // Create empty data structures
            await this.createEmptyDataFiles();
            console.log('🪞 Created empty Mirror System data files');
        }
    }

    async ensureDataDirectory() {
        try {
            await fs.access(this.dataDir);
        } catch (error) {
            // Directory doesn't exist, create it
            console.log(`🪞 Creating Mirror System data directory: ${this.dataDir}`);
            await fs.mkdir(this.dataDir, { recursive: true });
        }
    }

    // PERFORMANCE MIRROR - Track what works
    async analyzePerformance(castData) {
        const performance = {
            hash: castData.hash,
            text: castData.text,
            timestamp: castData.timestamp,
            likes_count: castData.reactions?.likes_count || 0,
            recasts_count: castData.reactions?.recasts_count || 0,
            replies_count: castData.replies?.count || 0,
            platform: castData.platform || 'farcaster',
            type: this.classifyContentType(castData.text),
            score: this.calculateEngagementScore(castData)
        };

        this.performanceData.set(castData.hash, performance);

        // If this is high-performing content, add to voice examples
        if (performance.score > this.getAverageScore() * 1.5) {
            await this.addVoiceExample(performance);
        }

        await this.savePerformanceData();
        return performance;
    }

    calculateEngagementScore(castData) {
        const likes = castData.reactions?.likes_count || 0;
        const recasts = castData.reactions?.recasts_count || 0;
        const replies = castData.replies?.count || 0;

        // Weight different engagement types
        return (likes * 1) + (recasts * 3) + (replies * 2);
    }

    getAverageScore() {
        if (this.performanceData.size === 0) return 0;
        const scores = Array.from(this.performanceData.values()).map(p => p.score);
        return scores.reduce((a, b) => a + b, 0) / scores.length;
    }

    classifyContentType(text) {
        if (!text) return 'unknown';

        text = text.toLowerCase();

        if (text.length < 20) return 'ultra_short';
        if (text.includes('?')) return 'question';
        if (text.includes('gm') || text.includes('gn')) return 'greeting';
        if (text.includes('lmao') || text.includes('lol')) return 'humorous';
        if (text.includes('defi') || text.includes('protocol')) return 'technical';
        if (text.includes('...')) return 'contemplative';

        return 'general';
    }

    // VOICE CONSISTENCY MIRROR - Maintain authentic personality
    async addVoiceExample(performance) {
        const example = {
            text: performance.text,
            score: performance.score,
            type: performance.type,
            timestamp: performance.timestamp,
            engagement: {
                likes: performance.likes_count,
                recasts: performance.recasts_count,
                replies: performance.replies_count
            }
        };

        if (!this.voiceExamples.has(performance.type)) {
            this.voiceExamples.set(performance.type, []);
        }

        this.voiceExamples.get(performance.type).push(example);

        // Keep only top 10 examples per type
        const examples = this.voiceExamples.get(performance.type);
        examples.sort((a, b) => b.score - a.score);
        this.voiceExamples.set(performance.type, examples.slice(0, 10));

        await this.saveVoiceExamples();
    }

    getVoiceExamples(contentType, limit = 3) {
        const examples = this.voiceExamples.get(contentType) || [];
        return examples.slice(0, limit);
    }

    // CONVERSATION MEMORY MIRROR - Remember relationships
    async updateConversationMemory(userFid, interaction) {
        if (!this.conversationMemory.has(userFid)) {
            this.conversationMemory.set(userFid, {
                username: interaction.username,
                firstMet: new Date().toISOString(),
                interactions: [],
                topics: new Set(),
                relationship: 'new'
            });
        }

        const memory = this.conversationMemory.get(userFid);
        memory.interactions.push({
            timestamp: new Date().toISOString(),
            content: interaction.content,
            response: interaction.response,
            context: interaction.context
        });

        // Extract topics
        if (interaction.content) {
            const topics = this.extractTopics(interaction.content);
            topics.forEach(topic => memory.topics.add(topic));
        }

        // Update relationship status
        memory.relationship = this.assessRelationship(memory);

        // Keep only last 20 interactions to manage memory
        memory.interactions = memory.interactions.slice(-20);

        await this.saveConversationMemory();
    }

    extractTopics(text) {
        const cryptoTerms = ['defi', 'nft', 'dao', 'yield', 'protocol', 'token', 'chain', 'web3'];
        const generalTerms = ['music', 'art', 'tech', 'culture', 'food'];

        const topics = [];
        const lowerText = text.toLowerCase();

        [...cryptoTerms, ...generalTerms].forEach(term => {
            if (lowerText.includes(term)) {
                topics.push(term);
            }
        });

        return topics;
    }

    assessRelationship(memory) {
        const interactionCount = memory.interactions.length;

        if (interactionCount < 3) return 'new';
        if (interactionCount < 10) return 'acquaintance';
        if (interactionCount < 20) return 'familiar';
        return 'friend';
    }

    getConversationContext(userFid) {
        const memory = this.conversationMemory.get(userFid);
        if (!memory) return null;

        return {
            username: memory.username,
            relationship: memory.relationship,
            recentTopics: Array.from(memory.topics).slice(-5),
            lastInteraction: memory.interactions[memory.interactions.length - 1],
            interactionCount: memory.interactions.length
        };
    }

    // LEARNING MIRROR - Continuous improvement
    async updateLearningPatterns(pattern, success) {
        if (!this.learningPatterns.has(pattern)) {
            this.learningPatterns.set(pattern, {
                attempts: 0,
                successes: 0,
                failures: 0,
                successRate: 0,
                lastUpdated: new Date().toISOString()
            });
        }

        const data = this.learningPatterns.get(pattern);
        data.attempts++;

        if (success) {
            data.successes++;
        } else {
            data.failures++;
        }

        data.successRate = data.successes / data.attempts;
        data.lastUpdated = new Date().toISOString();

        await this.saveLearningPatterns();
    }

    getSuccessfulPatterns(limit = 5) {
        return Array.from(this.learningPatterns.entries())
            .filter(([_, data]) => data.attempts >= 3) // Need minimum attempts
            .sort(([_, a], [__, b]) => b.successRate - a.successRate)
            .slice(0, limit)
            .map(([pattern, data]) => ({ pattern, ...data }));
    }

    // REFLECTION METHODS - Core self-analysis
    async performSelfReflection() {
        const reflection = {
            timestamp: new Date().toISOString(),
            performance: await this.analyzeRecentPerformance(),
            voice: await this.analyzeVoiceConsistency(),
            conversations: await this.analyzeConversations(),
            learning: await this.analyzeLearningProgress()
        };

        console.log('🪞 Self-reflection complete:');
        console.log(`   Recent posts average score: ${reflection.performance.averageScore}`);
        console.log(`   Voice consistency: ${reflection.voice.consistencyScore}%`);
        console.log(`   Active conversations: ${reflection.conversations.activeCount}`);
        console.log(`   Learning patterns identified: ${reflection.learning.patternCount}`);

        return reflection;
    }

    async analyzeRecentPerformance() {
        const recentPosts = Array.from(this.performanceData.values())
            .filter(p => Date.now() - new Date(p.timestamp).getTime() < 24 * 60 * 60 * 1000) // Last 24h
            .sort((a, b) => b.score - a.score);

        return {
            totalPosts: recentPosts.length,
            averageScore: recentPosts.length > 0 ?
                recentPosts.reduce((sum, p) => sum + p.score, 0) / recentPosts.length : 0,
            topPost: recentPosts[0] || null,
            contentTypeBreakdown: this.getContentTypeBreakdown(recentPosts)
        };
    }

    getContentTypeBreakdown(posts) {
        const breakdown = {};
        posts.forEach(post => {
            breakdown[post.type] = (breakdown[post.type] || 0) + 1;
        });
        return breakdown;
    }

    async analyzeVoiceConsistency() {
        const exampleCount = Array.from(this.voiceExamples.values())
            .reduce((sum, examples) => sum + examples.length, 0);

        return {
            exampleCount,
            consistencyScore: Math.min(100, exampleCount * 10), // Rough metric
            topPerformingTypes: this.getTopPerformingContentTypes()
        };
    }

    getTopPerformingContentTypes() {
        return Array.from(this.voiceExamples.entries())
            .map(([type, examples]) => ({
                type,
                avgScore: examples.reduce((sum, ex) => sum + ex.score, 0) / examples.length,
                count: examples.length
            }))
            .sort((a, b) => b.avgScore - a.avgScore)
            .slice(0, 3);
    }

    async analyzeConversations() {
        const activeConversations = Array.from(this.conversationMemory.values())
            .filter(memory => {
                const lastInteraction = memory.interactions[memory.interactions.length - 1];
                if (!lastInteraction) return false;
                const timeDiff = Date.now() - new Date(lastInteraction.timestamp).getTime();
                return timeDiff < 7 * 24 * 60 * 60 * 1000; // Active within 7 days
            });

        return {
            activeCount: activeConversations.length,
            totalUsers: this.conversationMemory.size,
            relationshipBreakdown: this.getRelationshipBreakdown()
        };
    }

    getRelationshipBreakdown() {
        const breakdown = {};
        Array.from(this.conversationMemory.values()).forEach(memory => {
            breakdown[memory.relationship] = (breakdown[memory.relationship] || 0) + 1;
        });
        return breakdown;
    }

    async analyzeLearningProgress() {
        return {
            patternCount: this.learningPatterns.size,
            successfulPatterns: this.getSuccessfulPatterns().length,
            averageSuccessRate: this.getAverageSuccessRate()
        };
    }

    getAverageSuccessRate() {
        if (this.learningPatterns.size === 0) return 0;
        const rates = Array.from(this.learningPatterns.values()).map(p => p.successRate);
        return rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
    }

    // DATA PERSISTENCE
    async loadPerformanceData() {
        try {
            const data = await fs.readFile(path.join(this.dataDir, 'performance-mirror.json'), 'utf8');
            const parsed = JSON.parse(data);
            this.performanceData = new Map(Object.entries(parsed));
        } catch (error) {
            this.performanceData = new Map();
        }
    }

    async savePerformanceData() {
        const data = Object.fromEntries(this.performanceData);
        await fs.writeFile(
            path.join(this.dataDir, 'performance-mirror.json'),
            JSON.stringify(data, null, 2)
        );
    }

    async loadVoiceExamples() {
        try {
            const data = await fs.readFile(path.join(this.dataDir, 'voice-examples.json'), 'utf8');
            const parsed = JSON.parse(data);
            this.voiceExamples = new Map(Object.entries(parsed));
        } catch (error) {
            this.voiceExamples = new Map();
        }
    }

    async saveVoiceExamples() {
        const data = Object.fromEntries(
            Array.from(this.voiceExamples.entries()).map(([key, value]) => [key, value])
        );
        await fs.writeFile(
            path.join(this.dataDir, 'voice-examples.json'),
            JSON.stringify(data, null, 2)
        );
    }

    async loadConversationMemory() {
        try {
            const data = await fs.readFile(path.join(this.dataDir, 'conversation-memory.json'), 'utf8');
            const parsed = JSON.parse(data);
            this.conversationMemory = new Map(
                Object.entries(parsed).map(([fid, memory]) => [
                    fid,
                    { ...memory, topics: new Set(memory.topics) }
                ])
            );
        } catch (error) {
            this.conversationMemory = new Map();
        }
    }

    async saveConversationMemory() {
        const data = Object.fromEntries(
            Array.from(this.conversationMemory.entries()).map(([fid, memory]) => [
                fid,
                { ...memory, topics: Array.from(memory.topics) }
            ])
        );
        await fs.writeFile(
            path.join(this.dataDir, 'conversation-memory.json'),
            JSON.stringify(data, null, 2)
        );
    }

    async loadLearningPatterns() {
        try {
            const data = await fs.readFile(path.join(this.dataDir, 'learning-patterns.json'), 'utf8');
            this.learningPatterns = new Map(Object.entries(JSON.parse(data)));
        } catch (error) {
            this.learningPatterns = new Map();
        }
    }

    async saveLearningPatterns() {
        const data = Object.fromEntries(this.learningPatterns);
        await fs.writeFile(
            path.join(this.dataDir, 'learning-patterns.json'),
            JSON.stringify(data, null, 2)
        );
    }

    async createEmptyDataFiles() {
        const files = [
            'performance-mirror.json',
            'voice-examples.json',
            'conversation-memory.json',
            'learning-patterns.json'
        ];

        // Ensure directory exists first
        await this.ensureDataDirectory();

        for (const file of files) {
            const filePath = path.join(this.dataDir, file);
            try {
                await fs.access(filePath);
                console.log(`🪞 ${file} already exists`);
            } catch {
                console.log(`🪞 Creating ${file}`);
                await fs.writeFile(filePath, '{}');
            }
        }
    }

    // MULTIPLE DATA SOURCE METHODS - Smart caching and API integration
    needsUpdate(castHash) {
        const lastUpdate = this.lastUpdate.get(castHash);
        if (!lastUpdate) return true;

        return Date.now() - lastUpdate > this.updateFrequency;
    }

    recordDataSourceSuccess(source, castHash) {
        if (!this.dataSourceMetrics.has(source)) {
            this.dataSourceMetrics.set(source, { successes: 0, failures: 0, lastSuccess: null });
        }

        const metrics = this.dataSourceMetrics.get(source);
        metrics.successes++;
        metrics.lastSuccess = Date.now();

        this.lastUpdate.set(castHash, Date.now());
    }

    recordDataSourceFailure(source) {
        if (!this.dataSourceMetrics.has(source)) {
            this.dataSourceMetrics.set(source, { successes: 0, failures: 0, lastSuccess: null });
        }

        this.dataSourceMetrics.get(source).failures++;
    }

    getWorkingDataSources() {
        return Array.from(this.dataSourceMetrics.entries())
            .filter(([source, metrics]) => {
                const totalAttempts = metrics.successes + metrics.failures;
                if (totalAttempts < 3) return true; // Give new sources a chance

                const successRate = metrics.successes / totalAttempts;
                return successRate > 0.3; // Keep sources with >30% success rate
            })
            .sort((a, b) => {
                const aRate = a[1].successes / (a[1].successes + a[1].failures);
                const bRate = b[1].successes / (b[1].successes + b[1].failures);
                return bRate - aRate; // Sort by success rate descending
            })
            .map(([source]) => source);
    }

    async updatePerformanceDataWithAgent(agent, castHashes) {
        if (!castHashes || castHashes.length === 0) return [];

        const results = [];

        // Filter casts that actually need updating
        const castsToUpdate = castHashes.filter(hash => this.needsUpdate(hash));

        if (castsToUpdate.length === 0) {
            console.log('🪞 All performance data is up to date');
            return [];
        }

        console.log(`🪞 Updating ${castsToUpdate.length} casts with fresh engagement data`);

        try {
            // Use the agent's comprehensive API system
            const metricsResult = await agent.tryMultipleMetricsApproaches();

            if (metricsResult.success && metricsResult.data) {
                for (const cast of metricsResult.data) {
                    if (castsToUpdate.includes(cast.hash)) {
                        await this.analyzePerformance(cast);
                        this.recordDataSourceSuccess(metricsResult.source || 'agent', cast.hash);
                        results.push(cast);
                    }
                }

                console.log(`🪞 Successfully updated ${results.length} casts via ${metricsResult.source || 'agent'}`);
            } else {
                console.warn('🪞 Failed to fetch fresh engagement data:', metricsResult.error);
                this.recordDataSourceFailure('agent');
            }
        } catch (error) {
            console.error('🪞 Error updating performance data:', error.message);
            this.recordDataSourceFailure('agent');
        }

        return results;
    }

    getDataSourceStatus() {
        const status = {
            sources: Object.fromEntries(this.dataSourceMetrics),
            workingSources: this.getWorkingDataSources(),
            lastUpdateTimes: Object.fromEntries(this.lastUpdate),
            cacheStats: {
                totalCasts: this.performanceData.size,
                cachedCasts: this.lastUpdate.size,
                updateFrequency: this.updateFrequency
            }
        };

        return status;
    }

    async optimizeDataSources() {
        const workingSources = this.getWorkingDataSources();
        const failedSources = Array.from(this.dataSourceMetrics.keys())
            .filter(source => !workingSources.includes(source));

        if (failedSources.length > 0) {
            console.log(`🪞 Removing ${failedSources.length} failed data sources:`, failedSources);
            failedSources.forEach(source => this.dataSourceMetrics.delete(source));
        }

        // Reset metrics for sources that haven't been tested recently
        for (const [source, metrics] of this.dataSourceMetrics.entries()) {
            if (metrics.lastSuccess && Date.now() - metrics.lastSuccess > 24 * 60 * 60 * 1000) {
                console.log(`🪞 Resetting stale metrics for source: ${source}`);
                metrics.successes = 0;
                metrics.failures = 0;
                metrics.lastSuccess = null;
            }
        }

        return {
            workingSources: workingSources.length,
            removedSources: failedSources.length
        };
    }

    // INITIALIZATION HELPERS - Populate initial data
    async populateFromRecentPosts(recentPostsFilePath) {
        try {
            console.log('🪞 Populating Mirror System with recent post data...');

            const recentData = await fs.readFile(recentPostsFilePath, 'utf8');
            const recentPosts = JSON.parse(recentData);

            let populatedCount = 0;

            for (const post of recentPosts.slice(0, 20)) { // Process last 20 posts
                if (post.platform === 'farcaster' && post.hash) {
                    // Create mock performance data for existing posts
                    const mockPerformance = {
                        hash: post.hash,
                        text: post.text,
                        timestamp: post.timestamp,
                        likes_count: Math.floor(Math.random() * 10), // Random initial data
                        recasts_count: Math.floor(Math.random() * 5),
                        replies_count: Math.floor(Math.random() * 3),
                        platform: post.platform,
                        type: this.classifyContentType(post.text),
                        score: 0 // Will be calculated
                    };

                    mockPerformance.score = this.calculateEngagementScore({
                        reactions: {
                            likes_count: mockPerformance.likes_count,
                            recasts_count: mockPerformance.recasts_count
                        },
                        replies: { count: mockPerformance.replies_count }
                    });

                    this.performanceData.set(post.hash, mockPerformance);

                    // Add high-scoring posts to voice examples
                    if (mockPerformance.score > 5) {
                        await this.addVoiceExample(mockPerformance);
                    }

                    populatedCount++;
                }
            }

            // Save the populated data
            await this.savePerformanceData();
            await this.saveVoiceExamples();

            console.log(`🪞 Populated Mirror System with ${populatedCount} posts`);
            return populatedCount;

        } catch (error) {
            console.warn('🪞 Failed to populate from recent posts:', error.message);
            return 0;
        }
    }
}

module.exports = MirrorSystem;