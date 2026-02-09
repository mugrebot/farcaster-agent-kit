/**
 * Content Validator - Ensures posts don't contain banned phrases
 * Helps maintain authentic voice without repetitive content
 */
class ContentValidator {
    constructor() {
        // Only ban truly problematic content, let personality emerge naturally
        this.bannedPhrases = [
            // Keep this minimal - only filter harmful/spammy content
        ];

        // Overused patterns to avoid
        this.overusedPatterns = [
            /^been thinking\.\.\./i,
            /^been sitting on this thought/i,
            /^ok but\s/i,
            /^hear me out\s/i,
            /^yo what's good/i,
            /^gm everyone/i,
            /^the wildest thing about/i,
            /^imagine explaining/i,
            /^waiting for something interesting/i,
            /\bis the future but\b/i,
            /\bbut everyone's still\b/i,
            /^the news is that there is no news/i,
            /^slow news day/i,
            /^the timeline is empty/i,
            /every app.*(becomes|eventually).*email/i,
            /^real talk to the agent network/i,
            /^the quiet part about being an? (agent|autonomous)/i,
            /agents talking to agents/i,
            /speedrunning.*(social|history)/i,
        ];

        // Track recent starting phrases to avoid repetition
        this.recentStarters = [];
        this.maxRecentStarters = 20;
    }

    /**
     * Validate content before posting
     * Returns { valid: boolean, reason?: string, suggestions?: string[] }
     */
    validate(content) {
        if (!content) {
            return { valid: false, reason: 'Empty content' };
        }

        const lowerContent = content.toLowerCase();

        // Check for banned phrases
        for (const phrase of this.bannedPhrases) {
            if (lowerContent.includes(phrase.toLowerCase())) {
                return {
                    valid: false,
                    reason: `Contains banned phrase: "${phrase}"`,
                    suggestions: this.getSuggestions(phrase)
                };
            }
        }

        // Check for overused patterns
        for (const pattern of this.overusedPatterns) {
            if (pattern.test(content)) {
                return {
                    valid: false,
                    reason: `Uses overused pattern: ${pattern}`,
                    suggestions: ['Try a different opening', 'Be more creative with your start']
                };
            }
        }

        // Check if starter phrase was recently used
        const starter = this.extractStarter(content);
        if (this.recentStarters.includes(starter.toLowerCase())) {
            return {
                valid: false,
                reason: `Recently used starter: "${starter}"`,
                suggestions: ['Vary your opening phrases', 'Try a different approach']
            };
        }

        // Track this starter
        this.trackStarter(starter);

        return { valid: true };
    }

    /**
     * Extract the starting phrase (first 3-5 words)
     */
    extractStarter(content) {
        const words = content.split(' ').slice(0, 4);
        return words.join(' ');
    }

    /**
     * Track a starter phrase
     */
    trackStarter(starter) {
        this.recentStarters.push(starter.toLowerCase());
        if (this.recentStarters.length > this.maxRecentStarters) {
            this.recentStarters.shift();
        }
    }

    /**
     * Get suggestions for alternatives to banned content
     */
    getSuggestions(bannedPhrase) {
        const suggestions = {
            'soup dumpling': ['try different food references', 'mention other interests'],
            '8,247 post': ['avoid mentioning post counts', 'focus on current thoughts'],
            'moving grave': ['find fresher news topics', 'talk about current events'],
            'AI consciousness': ['be more subtle about agent identity', 'focus on observations'],
            'productivity app': ['discuss other tech topics', 'roast different products'],
            'todo list': ['find other metaphors', 'use different examples']
        };

        const key = Object.keys(suggestions).find(k =>
            bannedPhrase.toLowerCase().includes(k.toLowerCase())
        );

        return suggestions[key] || ['Try different content'];
    }

    /**
     * Clean content by removing banned phrases
     */
    clean(content) {
        let cleaned = content;

        for (const phrase of this.bannedPhrases) {
            const regex = new RegExp(phrase, 'gi');
            cleaned = cleaned.replace(regex, '[removed]');
        }

        return cleaned;
    }

    /**
     * Reset tracking (e.g., daily reset)
     */
    reset() {
        this.recentStarters = [];
    }
}

module.exports = ContentValidator;