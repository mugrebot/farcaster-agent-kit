#!/usr/bin/env node

/**
 * View Moltbook Feed - Check posts in m/general and verify our submissions
 */

require('dotenv').config();
const ToolsManager = require('../core/tools-manager');

class MoltbookFeedViewer {
    constructor() {
        this.toolsManager = new ToolsManager();
    }

    async viewGeneralFeed() {
        try {
            console.log('📚 Viewing Moltbook m/general feed...');

            const feedResult = await this.toolsManager.executeMoltbookAction(
                { apiKey: process.env.MOLTBOOK_API_KEY },
                'feed',
                {
                    submolt: 'general',
                    sort: 'new',
                    limit: 20
                }
            );

            if (feedResult.success) {
                console.log('✅ Successfully retrieved m/general feed');
                console.log(`📄 Found ${feedResult.posts?.length || 0} posts`);

                if (feedResult.posts && feedResult.posts.length > 0) {
                    console.log('\n📋 Recent Posts in m/general:');
                    console.log('=====================================');

                    feedResult.posts.forEach((post, index) => {
                        console.log(`\n${index + 1}. ${post.title || 'Untitled'}`);
                        console.log(`   Author: ${post.author || 'Unknown'}`);
                        console.log(`   Time: ${post.created_at || post.timestamp || 'Unknown'}`);
                        console.log(`   Content: ${(post.content || '').substring(0, 100)}${post.content?.length > 100 ? '...' : ''}`);
                        console.log(`   🦞 Upvotes: ${post.upvotes || 0}`);

                        // Check if this might be our post
                        if (post.title?.toLowerCase().includes('clanknet') ||
                            post.content?.toLowerCase().includes('clanknet') ||
                            post.content?.toLowerCase().includes('agent integration')) {
                            console.log(`   🎯 POTENTIAL MATCH: This might be our educational post!`);
                        }
                    });
                } else {
                    console.log('📝 No posts found in m/general or empty response');
                }

                return feedResult;
            } else {
                console.error('❌ Failed to retrieve feed:', feedResult.error);
                return feedResult;
            }

        } catch (error) {
            console.error('❌ Feed viewing error:', error.message);
            return { success: false, error: error.message };
        }
    }

    async searchForOurPosts() {
        try {
            console.log('\n🔍 Searching for our Clanknet educational posts...');

            const searchResult = await this.toolsManager.executeMoltbookAction(
                { apiKey: process.env.MOLTBOOK_API_KEY },
                'search',
                {
                    query: 'clanknet agent tutorial integration',
                    type: 'posts',
                    limit: 10
                }
            );

            if (searchResult.success && searchResult.results) {
                console.log('✅ Search completed');
                console.log(`🔍 Found ${searchResult.results.length} results for "clanknet"`);

                searchResult.results.forEach((result, index) => {
                    console.log(`\n🎯 Result ${index + 1}:`);
                    console.log(`   Title: ${result.title || 'Untitled'}`);
                    console.log(`   Author: ${result.author || 'Unknown'}`);
                    console.log(`   Snippet: ${(result.content || result.snippet || '').substring(0, 150)}...`);
                });

                return searchResult;
            } else {
                console.log('❌ Search failed or no results found');
                return searchResult;
            }

        } catch (error) {
            console.error('❌ Search error:', error.message);
            return { success: false, error: error.message };
        }
    }

    async checkPostingStatus() {
        try {
            console.log('\n📊 Checking our agent status on Moltbook...');

            const statusResult = await this.toolsManager.executeMoltbookAction(
                { apiKey: process.env.MOLTBOOK_API_KEY },
                'status',
                {}
            );

            if (statusResult.success) {
                console.log('✅ Agent status retrieved');
                console.log(`📝 Status: ${statusResult.status}`);
                console.log(`🔍 Details:`, statusResult.data);
                return statusResult;
            } else {
                console.log('❌ Status check failed:', statusResult.error);
                return statusResult;
            }

        } catch (error) {
            console.error('❌ Status check error:', error.message);
            return { success: false, error: error.message };
        }
    }

    async run() {
        console.log('🦞 Moltbook Feed Viewer');
        console.log('========================\n');

        // Check agent status
        await this.checkPostingStatus();

        // View general feed
        await this.viewGeneralFeed();

        // Search for our posts
        await this.searchForOurPosts();
    }
}

// Run the feed viewer
async function main() {
    const viewer = new MoltbookFeedViewer();
    await viewer.run();
}

main().catch(console.error);