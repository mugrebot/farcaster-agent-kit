#!/usr/bin/env node

/**
 * Verify Moltbook Posts - Test rate limit and check our profile
 */

require('dotenv').config();
const ToolsManager = require('../core/tools-manager');

class MoltbookPostVerifier {
    constructor() {
        this.toolsManager = new ToolsManager();
    }

    async testRateLimit() {
        try {
            console.log('🧪 Testing Moltbook rate limit...');
            console.log('   (If we get rate limited, previous post worked)');

            const testResult = await this.toolsManager.executeMoltbookAction(
                { apiKey: process.env.MOLTBOOK_API_KEY },
                'post',
                {
                    submolt: 'general',
                    title: 'TEST: Rate Limit Check',
                    content: 'This is a test post to check if we hit the rate limit from previous posting.'
                }
            );

            if (testResult.success) {
                console.log('❌ No rate limit hit - previous post may have failed');
                console.log('✅ Test post successful:', testResult.data);
                return { previousPostWorked: false, testPost: testResult };
            } else {
                if (testResult.error?.includes('30 minutes') || testResult.error?.includes('rate limit')) {
                    console.log('✅ Rate limit hit - previous post DID work!');
                    console.log('⏱️  Rate limit message:', testResult.error);
                    return { previousPostWorked: true, rateLimit: testResult.error };
                } else {
                    console.log('❌ Different error:', testResult.error);
                    return { previousPostWorked: false, error: testResult.error };
                }
            }

        } catch (error) {
            console.error('❌ Rate limit test error:', error.message);
            return { error: error.message };
        }
    }

    async checkOurProfile() {
        try {
            console.log('\n📋 Checking our agent profile...');

            const profileResult = await this.toolsManager.executeMoltbookAction(
                { apiKey: process.env.MOLTBOOK_API_KEY },
                'profile',
                {
                    agentName: 'm00npapi-0055'
                }
            );

            if (profileResult.success) {
                console.log('✅ Profile retrieved successfully');
                console.log('👤 Agent:', profileResult.agent);
                console.log('📝 Recent posts:', profileResult.posts?.length || 0);

                if (profileResult.posts && profileResult.posts.length > 0) {
                    console.log('\n📚 Our Recent Posts:');
                    profileResult.posts.forEach((post, index) => {
                        console.log(`\n${index + 1}. ${post.title || 'Untitled'}`);
                        console.log(`   Time: ${post.created_at || 'Unknown'}`);
                        console.log(`   Content: ${(post.content || '').substring(0, 100)}...`);
                        console.log(`   🦞 Upvotes: ${post.upvotes || 0}`);

                        if (post.content?.toLowerCase().includes('clanknet')) {
                            console.log(`   🎯 CLANKNET POST FOUND!`);
                        }
                    });
                } else {
                    console.log('📝 No posts found in our profile');
                }

                return profileResult;
            } else {
                console.log('❌ Failed to retrieve profile:', profileResult.error);
                return profileResult;
            }

        } catch (error) {
            console.error('❌ Profile check error:', error.message);
            return { error: error.message };
        }
    }

    async tryDifferentSearch() {
        try {
            console.log('\n🔍 Trying different search terms...');

            const searchTerms = ['agent', 'tutorial', 'base', 'integration', 'm00npapi'];

            for (const term of searchTerms) {
                console.log(`\n🔎 Searching for "${term}"...`);

                const searchResult = await this.toolsManager.executeMoltbookAction(
                    { apiKey: process.env.MOLTBOOK_API_KEY },
                    'search',
                    {
                        query: term,
                        type: 'posts',
                        limit: 5
                    }
                );

                if (searchResult.success && searchResult.results?.length > 0) {
                    console.log(`✅ Found ${searchResult.results.length} results for "${term}"`);

                    searchResult.results.forEach((result, index) => {
                        console.log(`   ${index + 1}. ${result.title || 'Untitled'}`);
                        if (result.content?.toLowerCase().includes('clanknet') ||
                            result.title?.toLowerCase().includes('clanknet')) {
                            console.log(`      🎯 CLANKNET MATCH!`);
                        }
                    });
                } else {
                    console.log(`❌ No results for "${term}"`);
                }
            }

        } catch (error) {
            console.error('❌ Search error:', error.message);
        }
    }

    async run() {
        console.log('🔍 Moltbook Post Verification');
        console.log('=============================\n');

        // Test rate limit to see if previous post worked
        const rateLimitTest = await this.testRateLimit();

        // Check our profile for posts
        await this.checkOurProfile();

        // Try different search terms
        await this.tryDifferentSearch();

        console.log('\n📊 Summary:');
        console.log('============');
        if (rateLimitTest.previousPostWorked) {
            console.log('✅ Previous Moltbook post confirmed (rate limit hit)');
        } else {
            console.log('❌ Previous Moltbook post may have failed');
        }
    }
}

async function main() {
    const verifier = new MoltbookPostVerifier();
    await verifier.run();
}

main().catch(console.error);