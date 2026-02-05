/**
 * News Manager - Fetches and summarizes current news for context-aware posting
 */

const axios = require('axios');

class NewsManager {
    constructor() {
        this.feeds = {
            bbc_world: 'https://feeds.bbci.co.uk/news/world/rss.xml',
            bbc_tech: 'https://feeds.bbci.co.uk/news/technology/rss.xml',
            bbc_business: 'https://feeds.bbci.co.uk/news/business/rss.xml',
            npr: 'https://feeds.npr.org/1001/rss.xml'
        };

        this.cache = {
            lastFetch: null,
            stories: [],
            ttl: 30 * 60 * 1000 // 30 minutes
        };
    }

    /**
     * Get current news headlines
     */
    async getNewsContext(maxStories = 8) {
        // Check cache first
        if (this.cache.lastFetch &&
            Date.now() - this.cache.lastFetch < this.cache.ttl &&
            this.cache.stories.length > 0) {
            return this.formatNewsForContext(this.cache.stories.slice(0, maxStories));
        }

        console.log('📰 Fetching fresh news...');

        try {
            // Fetch primary feed (BBC world)
            const stories = await this.fetchFeed(this.feeds.bbc_world, 'WORLD');

            // Add tech stories
            const techStories = await this.fetchFeed(this.feeds.bbc_tech, 'TECH');
            stories.push(...techStories.slice(0, 2));

            // Cache results
            this.cache.stories = stories;
            this.cache.lastFetch = Date.now();

            return this.formatNewsForContext(stories.slice(0, maxStories));
        } catch (error) {
            console.warn('Failed to fetch news, using cached or empty context:', error.message);
            return this.cache.stories.length > 0 ?
                this.formatNewsForContext(this.cache.stories.slice(0, maxStories)) :
                '';
        }
    }

    /**
     * Fetch and parse RSS feed
     */
    async fetchFeed(url, category) {
        try {
            const response = await axios.get(url, {
                timeout: 5000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; FarcasterAgent/1.0)'
                }
            });

            const xml = response.data;
            const stories = [];

            // Simple regex parsing for RSS items
            const itemRegex = /<item>([\s\S]*?)<\/item>/g;
            let match;

            while ((match = itemRegex.exec(xml)) !== null && stories.length < 6) {
                const itemXml = match[1];

                const titleMatch = /<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/s.exec(itemXml);
                const descMatch = /<description><!\[CDATA\[(.*?)\]\]><\/description>|<description>(.*?)<\/description>/s.exec(itemXml);

                if (titleMatch) {
                    const title = (titleMatch[1] || titleMatch[2] || '').trim();
                    const description = (descMatch?.[1] || descMatch?.[2] || '').trim();

                    // Clean up HTML entities and tags
                    const cleanTitle = this.cleanText(title);
                    const cleanDesc = this.cleanText(description);

                    if (cleanTitle && cleanTitle.length > 10) {
                        stories.push({
                            title: cleanTitle,
                            description: cleanDesc.substring(0, 200),
                            category
                        });
                    }
                }
            }

            return stories;
        } catch (error) {
            console.warn(`Failed to fetch ${category} news:`, error.message);
            return [];
        }
    }

    /**
     * Clean HTML entities and tags from text
     */
    cleanText(text) {
        return text
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&#x27;/g, "'")
            .replace(/&nbsp;/g, ' ')
            .replace(/<[^>]*>/g, '') // Remove HTML tags
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Format news for AI context
     */
    formatNewsForContext(stories) {
        if (!stories.length) return '';

        const date = new Date().toLocaleDateString();
        let context = `\n=== TODAY'S NEWS CONTEXT (${date}) ===\n`;

        const categories = {};

        // Group by category
        stories.forEach(story => {
            if (!categories[story.category]) {
                categories[story.category] = [];
            }
            categories[story.category].push(story);
        });

        // Format each category
        for (const [category, categoryStories] of Object.entries(categories)) {
            const emoji = category === 'WORLD' ? '🌍' :
                         category === 'TECH' ? '💻' :
                         category === 'BUSINESS' ? '💼' : '📰';

            context += `\n${emoji} ${category}\n`;
            categoryStories.forEach(story => {
                context += `- ${story.title}\n`;
            });
        }

        context += '\n(Use this news context sparingly - only reference if genuinely relevant to your authentic voice and style)\n';

        return context;
    }

    /**
     * Get a brief news summary for posting
     */
    async getNewsForPost() {
        try {
            const stories = await this.fetchFeed(this.feeds.bbc_world, 'WORLD');
            if (stories.length > 0) {
                const topStory = stories[0];
                return {
                    headline: topStory.title,
                    summary: topStory.description.substring(0, 100),
                    category: topStory.category
                };
            }
        } catch (error) {
            console.warn('Failed to get news for post:', error.message);
        }
        return null;
    }
}

module.exports = NewsManager;