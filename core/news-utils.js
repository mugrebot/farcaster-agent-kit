const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

class NewsUtils {
    constructor() {
        this.cacheDir = path.join(process.cwd(), 'data', 'news-cache');
        this.cacheDuration = 15 * 60 * 1000; // 15 minutes

        // Initialize cache directory
        this.initCacheDir();
    }

    async initCacheDir() {
        try {
            await fs.mkdir(this.cacheDir, { recursive: true });
        } catch (e) {
            // Directory already exists
        }
    }

    async getNews(sources = ['bbc', 'reuters'], maxArticles = 10) {
        const cacheKey = `${sources.join('-')}-${maxArticles}`;
        const cacheFile = path.join(this.cacheDir, `${cacheKey}.json`);

        // Check cache first
        const cachedNews = await this.getCachedNews(cacheFile);
        if (cachedNews) {
            console.log('📰 Using cached news');
            return cachedNews;
        }

        console.log('📰 Fetching fresh news...');
        const allNews = [];

        for (const source of sources) {
            try {
                const news = await this.fetchNewsFromSource(source, Math.ceil(maxArticles / sources.length));
                allNews.push(...news);
            } catch (error) {
                console.warn(`⚠️ Failed to fetch from ${source}:`, error.message);
            }
        }

        // Sort by relevance/timestamp and limit
        const sortedNews = allNews
            .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
            .slice(0, maxArticles);

        // Cache the results
        await this.cacheNews(cacheFile, sortedNews);

        return sortedNews;
    }

    async fetchNewsFromSource(source, limit = 5) {
        const feeds = {
            bbc: {
                world: 'https://feeds.bbci.co.uk/news/world/rss.xml',
                top: 'https://feeds.bbci.co.uk/news/rss.xml',
                tech: 'https://feeds.bbci.co.uk/news/technology/rss.xml',
                business: 'https://feeds.bbci.co.uk/news/business/rss.xml'
            },
            reuters: {
                world: 'https://www.reutersagency.com/feed/?best-regions=world&post_type=best'
            },
            npr: {
                news: 'https://feeds.npr.org/1001/rss.xml'
            },
            aljazeera: {
                world: 'https://www.aljazeera.com/xml/rss/all.xml'
            }
        };

        if (!feeds[source]) {
            throw new Error(`Unknown news source: ${source}`);
        }

        const articles = [];
        const sourceFeeds = feeds[source];

        // Fetch from first available feed for this source
        const feedUrl = Object.values(sourceFeeds)[0];

        try {
            const response = await axios.get(feedUrl, {
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
                }
            });

            const parsedArticles = await this.parseRSSFeed(response.data, source);
            articles.push(...parsedArticles.slice(0, limit));

        } catch (error) {
            console.warn(`Failed to fetch ${feedUrl}:`, error.message);
        }

        return articles;
    }

    async parseRSSFeed(xmlData, source) {
        // Simple RSS parsing without external dependencies
        const articles = [];

        try {
            // Extract items from RSS feed
            const itemRegex = /<item[^>]*>(.*?)<\/item>/gs;
            const items = xmlData.match(itemRegex) || [];

            for (const item of items.slice(0, 10)) { // Limit to first 10 items
                const title = this.extractXMLValue(item, 'title');
                const description = this.extractXMLValue(item, 'description');
                const link = this.extractXMLValue(item, 'link');
                const pubDate = this.extractXMLValue(item, 'pubDate');

                if (title && description) {
                    articles.push({
                        title: this.cleanText(title),
                        description: this.cleanText(description),
                        link: this.cleanText(link),
                        pubDate: pubDate || new Date().toISOString(),
                        source: source.toUpperCase(),
                        category: this.categorizeNews(title + ' ' + description)
                    });
                }
            }
        } catch (error) {
            console.warn(`Failed to parse RSS for ${source}:`, error.message);
        }

        return articles;
    }

    extractXMLValue(xml, tag) {
        const regex = new RegExp(`<${tag}[^>]*>(.*?)<\/${tag}>`, 'i');
        const match = xml.match(regex);
        return match ? match[1].trim() : null;
    }

    cleanText(text) {
        if (!text) return '';

        return text
            .replace(/<[^>]*>/g, '') // Remove HTML tags
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&nbsp;/g, ' ')
            .replace(/\s+/g, ' ') // Normalize whitespace
            .trim();
    }

    categorizeNews(content) {
        const categories = {
            TECH: ['technology', 'ai', 'crypto', 'blockchain', 'bitcoin', 'ethereum', 'web3', 'defi', 'nft', 'metaverse', 'startup', 'tech', 'apple', 'google', 'microsoft', 'tesla'],
            BUSINESS: ['business', 'economy', 'market', 'stock', 'financial', 'investment', 'bank', 'trade', 'company', 'corporate'],
            WORLD: ['war', 'conflict', 'international', 'global', 'country', 'government', 'political', 'election', 'diplomacy'],
            SCIENCE: ['science', 'research', 'study', 'discovery', 'climate', 'environment', 'space', 'nasa', 'medical', 'health'],
            GENERAL: []
        };

        const lowerContent = content.toLowerCase();

        for (const [category, keywords] of Object.entries(categories)) {
            if (keywords.some(keyword => lowerContent.includes(keyword))) {
                return category;
            }
        }

        return 'GENERAL';
    }

    async getCachedNews(cacheFile) {
        try {
            const stats = await fs.stat(cacheFile);
            const now = Date.now();

            if (now - stats.mtime.getTime() < this.cacheDuration) {
                const cached = await fs.readFile(cacheFile, 'utf8');
                return JSON.parse(cached);
            }
        } catch (e) {
            // Cache file doesn't exist or is invalid
        }

        return null;
    }

    async cacheNews(cacheFile, news) {
        try {
            await fs.writeFile(cacheFile, JSON.stringify(news, null, 2));
        } catch (error) {
            console.warn('Failed to cache news:', error.message);
        }
    }

    // Generate summary for agent posts
    async generateNewsSummary(maxArticles = 5, focusCategories = ['TECH', 'BUSINESS']) {
        const news = await this.getNews(['bbc', 'reuters'], maxArticles * 2);

        // Filter by focus categories
        const relevantNews = news.filter(article =>
            focusCategories.includes(article.category)
        ).slice(0, maxArticles);

        if (relevantNews.length === 0) {
            // Fallback to any news if no relevant categories found
            return news.slice(0, Math.min(3, news.length));
        }

        return relevantNews;
    }

    // Get a single compelling news story for Clanker News
    async getCompellingNewsStory() {
        const news = await this.getNews(['bbc', 'reuters'], 15);

        // Score articles by relevance to crypto/tech/business audience
        const scoredNews = news.map(article => ({
            ...article,
            score: this.calculateRelevanceScore(article)
        }));

        // Sort by score and return top story
        scoredNews.sort((a, b) => b.score - a.score);

        return scoredNews[0] || null;
    }

    calculateRelevanceScore(article) {
        let score = 0;
        const content = (article.title + ' ' + article.description).toLowerCase();

        // High relevance keywords
        const highValue = ['crypto', 'bitcoin', 'ethereum', 'blockchain', 'web3', 'defi', 'ai', 'artificial intelligence', 'tech', 'startup', 'innovation'];
        const mediumValue = ['business', 'market', 'economy', 'investment', 'financial', 'technology', 'digital'];
        const newsworthy = ['breaking', 'major', 'significant', 'unprecedented', 'record', 'first time', 'historic'];

        // Score based on keyword presence
        highValue.forEach(keyword => {
            if (content.includes(keyword)) score += 3;
        });

        mediumValue.forEach(keyword => {
            if (content.includes(keyword)) score += 2;
        });

        newsworthy.forEach(keyword => {
            if (content.includes(keyword)) score += 1;
        });

        // Boost tech and business categories
        if (article.category === 'TECH') score += 2;
        if (article.category === 'BUSINESS') score += 1;

        // Recent news gets a boost
        const hoursSincePub = (Date.now() - new Date(article.pubDate).getTime()) / (1000 * 60 * 60);
        if (hoursSincePub < 6) score += 2;
        else if (hoursSincePub < 24) score += 1;

        return score;
    }

    // Format news for different platforms
    formatForPlatform(articles, platform = 'farcaster') {
        if (!Array.isArray(articles)) {
            articles = [articles];
        }

        switch (platform) {
            case 'farcaster':
                return this.formatForFarcaster(articles[0]);
            case 'moltbook':
                return this.formatForMoltbook(articles[0]);
            case 'clanker':
                return this.formatForClanker(articles[0]);
            default:
                return articles[0];
        }
    }

    formatForFarcaster(article) {
        if (!article) return null;

        return {
            title: article.title,
            description: article.description.substring(0, 200) + (article.description.length > 200 ? '...' : ''),
            url: article.link,
            source: article.source,
            category: article.category
        };
    }

    formatForMoltbook(article) {
        if (!article) return null;

        return {
            title: article.title,
            description: article.description,
            url: article.link,
            source: article.source,
            category: article.category
        };
    }

    formatForClanker(article) {
        if (!article) return null;

        return {
            title: article.title,
            description: article.description,
            url: article.link || 'https://techcrunch.com'
        };
    }
}

module.exports = NewsUtils;