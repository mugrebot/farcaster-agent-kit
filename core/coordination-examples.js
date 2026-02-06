/**
 * Example coordination methods using cheaper SUB_MODEL
 * These demonstrate how to use the cheaper model for non-creative tasks
 */

class CoordinationExamples {
    constructor(llm) {
        this.llm = llm;
    }

    /**
     * Decide if we should reply to a mention using cheaper model
     */
    async shouldReplyToMention(mention) {
        const prompt = `
Should I reply to this mention?
Mention: "${mention.text}"
Author: @${mention.author.username}

Answer with YES or NO and a brief reason.
`;

        try {
            const result = await this.llm.generateCoordination(prompt, {
                username: 'm00npapi',
                mode: 'decision'
            });

            const response = result.content.toUpperCase();
            return {
                shouldReply: response.includes('YES'),
                reason: result.content
            };
        } catch (error) {
            console.error('Coordination decision failed:', error);
            return { shouldReply: false, reason: 'Error in decision making' };
        }
    }

    /**
     * Decide if it's a good time to post
     */
    async isGoodTimeToPost(recentPostCount, lastPostTime) {
        const prompt = `
Should I post now?
Recent posts in last hour: ${recentPostCount}
Time since last post: ${Math.round((Date.now() - lastPostTime) / 60000)} minutes

Consider:
- Don't spam (max 3 posts per hour)
- Space posts at least 30 minutes apart
- Optimal posting times are active hours

Answer with YES or NO.
`;

        try {
            const result = await this.llm.generateCoordination(prompt, {
                username: 'm00npapi',
                mode: 'scheduling'
            });

            return result.content.toUpperCase().includes('YES');
        } catch (error) {
            console.error('Scheduling decision failed:', error);
            return false;
        }
    }

    /**
     * Filter news for relevance using cheaper model
     */
    async isNewsRelevant(newsTitle, newsDescription) {
        const prompt = `
Is this news relevant for m00npapi to comment on?
Title: "${newsTitle}"
Description: "${newsDescription}"

Consider:
- Tech news: YES
- Crypto/blockchain: YES
- AI/ML developments: YES
- Meme culture: YES
- Politics only if tech-related: MAYBE
- Sports/entertainment: NO

Answer with YES or NO.
`;

        try {
            const result = await this.llm.generateCoordination(prompt, {
                username: 'm00npapi',
                mode: 'filtering'
            });

            return result.content.toUpperCase().includes('YES');
        } catch (error) {
            console.error('News filtering failed:', error);
            return false;
        }
    }

    /**
     * Check if content needs regeneration
     */
    async shouldRegenerateContent(content, reason) {
        const prompt = `
Should I regenerate this content?
Content: "${content}"
Issue: ${reason}

Answer YES if:
- Content is offensive
- Content mentions banned topics
- Content is too similar to recent posts
- Content doesn't match voice

Answer with YES or NO.
`;

        try {
            const result = await this.llm.generateCoordination(prompt, {
                username: 'm00npapi',
                mode: 'validation'
            });

            return result.content.toUpperCase().includes('YES');
        } catch (error) {
            console.error('Content validation failed:', error);
            return true; // Regenerate on error to be safe
        }
    }
}

module.exports = CoordinationExamples;