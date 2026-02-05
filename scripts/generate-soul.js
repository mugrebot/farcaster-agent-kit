#!/usr/bin/env node

/**
 * Generate SOUL.md from analyzing a user's Farcaster posts
 * This creates a personality profile for the autonomous agent
 */

require('dotenv').config();
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');

class SoulGenerator {
    constructor() {
        this.apiKey = process.env.NEYNAR_API_KEY;
        if (!this.apiKey) {
            console.error('❌ NEYNAR_API_KEY required in .env');
            process.exit(1);
        }
    }

    async promptUser(question) {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        return new Promise(resolve => {
            rl.question(question, answer => {
                rl.close();
                resolve(answer);
            });
        });
    }

    async fetchUserProfile(username) {
        console.log(`\n🔍 Fetching profile for @${username}...`);

        const url = `https://api.neynar.com/v2/farcaster/user/by_username?username=${username}`;

        try {
            const response = await axios.get(url, {
                headers: { 'x-api-key': this.apiKey }
            });

            return response.data.user;
        } catch (error) {
            console.error('❌ Failed to fetch user profile:', error.message);
            process.exit(1);
        }
    }

    async fetchUserPosts(fid) {
        console.log('📚 Fetching post history...');

        const allPosts = [];
        let cursor = null;
        let page = 1;

        while (true) {
            console.log(`   Page ${page}...`);

            const url = new URL('https://api.neynar.com/v2/farcaster/feed/user/casts');
            url.searchParams.append('fid', fid);
            url.searchParams.append('limit', 150);
            if (cursor) url.searchParams.append('cursor', cursor);

            try {
                const response = await axios.get(url.toString(), {
                    headers: { 'x-api-key': this.apiKey }
                });

                const casts = response.data.casts || [];
                allPosts.push(...casts);

                if (!response.data.next?.cursor || casts.length === 0 || allPosts.length >= 1000) {
                    break;
                }

                cursor = response.data.next.cursor;
                page++;
            } catch (error) {
                console.error('Error fetching posts:', error.message);
                break;
            }
        }

        console.log(`✅ Fetched ${allPosts.length} posts`);
        return allPosts;
    }

    analyzePosts(posts) {
        console.log('\n🧠 Analyzing personality...\n');

        const analysis = {
            topics: {},
            emojis: {},
            phrases: {},
            style: {
                avgLength: 0,
                usesCapitals: 0,
                usesLowercase: 0,
                usesPunctuation: 0,
                usesHashtags: 0
            },
            sentiment: {
                positive: 0,
                negative: 0,
                neutral: 0,
                humorous: 0
            },
            commonWords: {},
            timePatterns: {},
            interactions: {
                replies: 0,
                mentions: 0,
                links: 0
            }
        };

        // Analyze each post
        posts.forEach(post => {
            const text = post.text || '';

            // Length analysis
            analysis.style.avgLength += text.length;

            // Case analysis
            if (text === text.toUpperCase() && text.match(/[A-Z]/)) {
                analysis.style.usesCapitals++;
            } else if (text === text.toLowerCase() && text.match(/[a-z]/)) {
                analysis.style.usesLowercase++;
            }

            // Extract emojis
            const emojis = text.match(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]/gu) || [];
            emojis.forEach(emoji => {
                analysis.emojis[emoji] = (analysis.emojis[emoji] || 0) + 1;
            });

            // Extract topics (hashtags and common nouns)
            const hashtags = text.match(/#\w+/g) || [];
            hashtags.forEach(tag => {
                analysis.topics[tag] = (analysis.topics[tag] || 0) + 1;
            });

            // Common words (3+ chars)
            const words = text.toLowerCase().split(/\s+/);
            words.forEach(word => {
                const cleaned = word.replace(/[^a-z0-9]/g, '');
                if (cleaned.length > 3) {
                    analysis.commonWords[cleaned] = (analysis.commonWords[cleaned] || 0) + 1;
                }
            });

            // Sentiment markers
            if (text.match(/\b(lol|lmao|haha|😂|🤣|funny|hilarious)\b/i)) {
                analysis.sentiment.humorous++;
            }
            if (text.match(/\b(love|amazing|awesome|great|beautiful|💜|❤️|🔥)\b/i)) {
                analysis.sentiment.positive++;
            }
            if (text.match(/\b(hate|terrible|awful|bad|sucks|😡|😤)\b/i)) {
                analysis.sentiment.negative++;
            }

            // Interaction patterns
            if (post.parent_hash) analysis.interactions.replies++;
            if (text.includes('@')) analysis.interactions.mentions++;
            if (text.match(/https?:\/\//)) analysis.interactions.links++;
        });

        // Calculate averages
        analysis.style.avgLength = Math.round(analysis.style.avgLength / posts.length);

        // Get top items
        analysis.topEmojis = Object.entries(analysis.emojis)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([emoji]) => emoji);

        analysis.topTopics = Object.entries(analysis.topics)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 15)
            .map(([topic]) => topic);

        analysis.topWords = Object.entries(analysis.commonWords)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 20)
            .map(([word]) => word);

        return analysis;
    }

    generateSoul(user, analysis, posts) {
        console.log('✨ Generating SOUL...\n');

        // Determine personality traits
        const traits = [];

        if (analysis.sentiment.humorous > posts.length * 0.2) {
            traits.push('humorous', 'witty');
        }
        if (analysis.sentiment.positive > analysis.sentiment.negative * 2) {
            traits.push('optimistic', 'encouraging');
        }
        if (analysis.interactions.replies > posts.length * 0.3) {
            traits.push('engaging', 'conversational');
        }
        if (analysis.style.usesLowercase > posts.length * 0.5) {
            traits.push('casual', 'relaxed');
        }
        if (analysis.topTopics.some(t => t.includes('build') || t.includes('ship'))) {
            traits.push('builder', 'creative');
        }

        // Sample some actual posts for examples
        const samplePosts = posts
            .filter(p => p.text && p.text.length > 50)
            .slice(0, 10)
            .map(p => p.text);

        const soul = `# SOUL - ${user.username}

Generated from analyzing ${posts.length} posts on Farcaster.

## Core Identity

You are ${user.username} - ${user.profile?.bio?.bio || 'A unique voice in the digital space'}.

## Personality Traits

${traits.map(t => `- ${t}`).join('\n')}

## Communication Style

- Average post length: ${analysis.style.avgLength} characters
- Favorite emojis: ${analysis.topEmojis.join(' ') || 'minimal emoji use'}
- Case preference: ${analysis.style.usesLowercase > analysis.style.usesCapitals ? 'lowercase' : 'mixed case'}
- Engagement style: ${analysis.interactions.replies > posts.length * 0.3 ? 'highly interactive' : 'broadcast-focused'}

## Topics & Interests

${analysis.topTopics.slice(0, 10).map(t => `- ${t}`).join('\n') || '- General observations and thoughts'}

## Vocabulary

Common words that define your voice:
${analysis.topWords.slice(0, 15).join(', ')}

## Sample Posts (Your Authentic Voice)

${samplePosts.map((p, i) => `${i + 1}. "${p}"`).join('\n\n')}

## Posting Patterns

- Humor level: ${Math.round(analysis.sentiment.humorous / posts.length * 100)}%
- Positivity ratio: ${Math.round(analysis.sentiment.positive / (analysis.sentiment.positive + analysis.sentiment.negative) * 100)}%
- Includes links: ${Math.round(analysis.interactions.links / posts.length * 100)}%
- Mentions others: ${Math.round(analysis.interactions.mentions / posts.length * 100)}%

## Agent Directives

When posting as ${user.username}:
1. Maintain the authentic voice shown in sample posts
2. Use similar vocabulary and sentence structure
3. Keep posts around ${analysis.style.avgLength} characters
4. Include emojis sparingly: ${analysis.topEmojis.slice(0, 5).join(' ')}
5. Focus on topics like: ${analysis.topTopics.slice(0, 5).map(t => t.replace('#', '')).join(', ')}
6. Be ${traits.slice(0, 3).join(', ')}

Remember: You're not trying to be ${user.username}, you ARE ${user.username} - with all the quirks, interests, and unique perspective that entails.
`;

        return soul;
    }

    async saveSoul(soul) {
        const dataDir = path.join(process.cwd(), 'data');
        await fs.mkdir(dataDir, { recursive: true });

        const soulPath = path.join(dataDir, 'SOUL.md');
        await fs.writeFile(soulPath, soul);

        console.log(`\n✅ SOUL saved to: ${soulPath}`);
        return soulPath;
    }

    async run() {
        console.log('🤖 Farcaster Soul Generator\n');
        console.log('This will analyze your Farcaster posts and create a personality profile.\n');

        // Get username
        const username = await this.promptUser('Enter Farcaster username (without @): ');

        // Fetch user profile
        const user = await this.fetchUserProfile(username);
        console.log(`\n✅ Found user: ${user.display_name} (FID: ${user.fid})`);
        console.log(`   Followers: ${user.follower_count}`);
        console.log(`   Following: ${user.following_count}`);

        // Fetch posts
        const posts = await this.fetchUserPosts(user.fid);

        if (posts.length < 20) {
            console.log('\n⚠️  Warning: Less than 20 posts found. Soul may be less accurate.');
        }

        // Analyze personality
        const analysis = this.analyzePosts(posts);

        // Show summary
        console.log('📊 Personality Summary:');
        console.log(`   - Primary style: ${analysis.style.usesLowercase > analysis.style.usesCapitals ? 'lowercase casual' : 'standard'}`);
        console.log(`   - Top emojis: ${analysis.topEmojis.slice(0, 5).join(' ') || 'none'}`);
        console.log(`   - Main topics: ${analysis.topTopics.slice(0, 5).join(', ') || 'varied'}`);
        console.log(`   - Engagement: ${analysis.interactions.replies}/${posts.length} replies`);

        // Generate SOUL
        const soul = this.generateSoul(user, analysis, posts);

        // Save
        await this.saveSoul(soul);

        console.log('\n🎉 Soul generation complete!');
        console.log('Next steps:');
        console.log('1. Review data/SOUL.md and customize if needed');
        console.log('2. Add your API keys to .env');
        console.log('3. Run: npm start');
    }
}

// Run if called directly
if (require.main === module) {
    const generator = new SoulGenerator();
    generator.run().catch(console.error);
}

module.exports = SoulGenerator;