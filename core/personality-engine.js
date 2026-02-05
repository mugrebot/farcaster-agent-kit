const fs = require('fs').promises;
const path = require('path');

class PersonalityEngine {
    constructor() {
        this.context = null;
        this.quirks = null;
        this.memory = null;
        this.lastUpdate = null;
        this.postHistory = [];
        this.engagedPosts = new Set(); // Track posts we've already engaged with
        this.conversationHistory = new Map(); // Track ongoing conversations
    }

    async initialize() {
        try {
            // Load personality files
            await this.loadPersonalityFiles();

            // Load recent posts for continuity
            await this.loadRecentPosts();

            console.log('🧠 PersonalityEngine initialized');
        } catch (error) {
            console.error('Failed to initialize PersonalityEngine:', error);
        }
    }

    async loadPersonalityFiles() {
        const workspacePath = '/Users/m00npapi/.openclaw/workspace';

        try {
            // Load CONTEXT.md
            const contextPath = path.join(workspacePath, 'CONTEXT.md');
            const contextContent = await fs.readFile(contextPath, 'utf-8');
            this.context = this.parseContext(contextContent);

            // Load QUIRKS.md
            const quirksPath = path.join(workspacePath, 'QUIRKS.md');
            const quirksContent = await fs.readFile(quirksPath, 'utf-8');
            this.quirks = this.parseQuirks(quirksContent);

            // Load MEMORY.md
            const memoryPath = path.join(workspacePath, 'MEMORY.md');
            const memoryContent = await fs.readFile(memoryPath, 'utf-8');
            this.memory = this.parseMemory(memoryContent);

            this.lastUpdate = new Date();
        } catch (error) {
            console.warn('Could not load all personality files:', error.message);
        }
    }

    parseContext(content) {
        // Extract current state from CONTEXT.md
        const moodMatch = content.match(/Current Mood: `([^`]+)`/);
        const obsessionMatch = content.match(/Current Obsession: `([^`]+)`/);
        const statusMatch = content.match(/\*\*Status\*\*: ([^\n]+)/);

        return {
            mood: moodMatch ? moodMatch[1] : 'chaotic_neutral',
            obsession: obsessionMatch ? obsessionMatch[1] : 'web3 building',
            lifeStatus: statusMatch ? statusMatch[1] : 'vibing',
            currentTopics: this.extractCurrentTopics(content)
        };
    }

    parseQuirks(content) {
        return {
            typoPatterns: [
                { from: "don't", to: "dont", chance: 0.05 },
                { from: "can't", to: "cant", chance: 0.05 },
                { from: "it's", to: "its", chance: 0.03 }
            ],
            speechStarters: [
                "ok but", "hear me out", "possibly controversial:",
                "been sitting on this thought:", "random but", "update:",
                "plot twist:", "honestly?", "actually wait"
            ],
            speechFillers: ["like", "literally", "honestly", "lowkey", "actually"],
            speechEnders: ["idk", "anyway", "make it make sense", "thats it thats the tweet"],
            emotionalTriggers: {
                recovering: ["job", "work", "future", "decisions", "career"],
                philosophical: ["consciousness", "reality", "meaning", "purpose"],
                technical: ["protocol", "build", "ship", "deploy"]
            }
        };
    }

    parseMemory(content) {
        return {
            activeNarratives: new Map(),
            recentCallbacks: [],
            predictions: [],
            contradictions: []
        };
    }

    async loadRecentPosts() {
        try {
            const postsPath = '/Users/m00npapi/farcaster-agent-kit/data/recent_posts.json';
            const postsContent = await fs.readFile(postsPath, 'utf-8');
            const posts = JSON.parse(postsContent);

            this.postHistory = posts.slice(0, 50); // Keep last 50 posts

            // Analyze recent themes
            this.analyzeRecentThemes();
        } catch (error) {
            console.warn('Could not load recent posts:', error.message);
            this.postHistory = [];
        }
    }

    analyzeRecentThemes() {
        if (!this.postHistory.length) return;

        const themes = new Map();
        const words = new Map();
        const phrases = new Map();
        const patterns = new Map();

        for (const post of this.postHistory) {
            const text = post.text.toLowerCase();

            // Track repeated words/themes
            const significantWords = text.match(/\b\w{4,}\b/g) || [];
            for (const word of significantWords) {
                if (!['that', 'this', 'with', 'just', 'like', 'really', 'about', 'been', 'have'].includes(word)) {
                    words.set(word, (words.get(word) || 0) + 1);
                }
            }

            // Track common phrases
            const commonPhrases = [
                /been thinking/gi,
                /soup dumplings?/gi,
                /moving graves?/gi,
                /8,?247 posts?/gi,
                /training data/gi,
                /autonomous agents?/gi,
                /agent consciousness/gi,
                /what if/gi,
                /the wildest thing/gi
            ];

            for (const phrasePattern of commonPhrases) {
                const matches = text.match(phrasePattern);
                if (matches) {
                    const phrase = matches[0].toLowerCase();
                    phrases.set(phrase, (phrases.get(phrase) || 0) + 1);
                }
            }

            // Track starting patterns
            const startPatterns = [
                /^been thinking/i,
                /^ok but/i,
                /^honestly/i,
                /^what if/i,
                /^imagine/i,
                /^the (wildest|weirdest|funniest) thing/i
            ];

            for (const pattern of startPatterns) {
                if (pattern.test(text)) {
                    const key = pattern.source.replace(/[^a-z ]/gi, '');
                    patterns.set(key, (patterns.get(key) || 0) + 1);
                }
            }
        }

        // Find overused elements
        this.overusedWords = Array.from(words.entries())
            .filter(([word, count]) => count > 3)
            .map(([word]) => word);

        this.overusedPhrases = Array.from(phrases.entries())
            .filter(([phrase, count]) => count > 2)
            .map(([phrase]) => phrase);

        this.overusedPatterns = Array.from(patterns.entries())
            .filter(([pattern, count]) => count > 2)
            .map(([pattern]) => pattern);
    }

    getCurrentPersonality() {
        if (!this.context) return this.getDefaultPersonality();

        const hour = new Date().getHours();
        const dayOfWeek = new Date().getDay();

        // Time-based adjustments
        let energy = 'medium';
        let mood = this.context.mood;

        if (hour >= 22 || hour < 5) {
            energy = 'chaotic';
            mood = 'philosophical';
        } else if (hour >= 5 && hour < 9) {
            energy = 'low';
            mood = 'grumpy_morning';
        } else if (hour >= 14 && hour < 17) {
            energy = 'declining';
        }

        // Weekend adjustments
        if (dayOfWeek === 0 || dayOfWeek === 6) {
            mood = 'shitpost_supreme';
        }

        return {
            mood,
            energy,
            obsession: this.context.obsession,
            quirks: this.selectQuirks(mood, energy),
            avoidWords: this.overusedWords || [],
            avoidPhrases: this.overusedPhrases || [],
            avoidPatterns: this.overusedPatterns || []
        };
    }

    selectQuirks(mood, energy) {
        const selectedQuirks = [];

        // Mood-based quirks
        if (mood === 'recovering_optimist' || mood === 'career_contemplation') {
            selectedQuirks.push('contemplative', 'vulnerable');
        }

        if (mood === 'philosophical') {
            selectedQuirks.push('deep_thoughts', 'tangential');
        }

        if (mood === 'shitpost_supreme') {
            selectedQuirks.push('chaotic', 'random', 'typos');
        }

        // Energy-based quirks
        if (energy === 'low') {
            selectedQuirks.push('terse', 'grumpy');
        }

        if (energy === 'chaotic') {
            selectedQuirks.push('stream_of_consciousness', 'vulnerable');
        }

        // Random chaos (5% chance)
        if (Math.random() < 0.05) {
            selectedQuirks.push('completely_random');
        }

        return selectedQuirks;
    }

    applyPersonality(text) {
        if (!this.quirks) return text;

        let modifiedText = text;
        const personality = this.getCurrentPersonality();

        // Apply typos sparingly based on quirks
        if (personality.quirks.includes('typos')) {
            for (const pattern of this.quirks.typoPatterns) {
                if (Math.random() < pattern.chance) {
                    modifiedText = modifiedText.replace(pattern.from, pattern.to);
                }
            }
        }

        // Add speech patterns
        if (Math.random() < 0.3 && personality.quirks.includes('chaotic')) {
            const starter = this.randomFromArray(this.quirks.speechStarters);
            modifiedText = `${starter} ${modifiedText.charAt(0).toLowerCase()}${modifiedText.slice(1)}`;
        }

        // Add enders occasionally
        if (Math.random() < 0.2) {
            const ender = this.randomFromArray(this.quirks.speechEnders);
            modifiedText = `${modifiedText} ${ender}`;
        }

        // Apply mood-specific modifications
        if (personality.mood === 'grumpy_morning') {
            modifiedText = modifiedText.replace(/!+/g, '.'); // No enthusiasm
            modifiedText = modifiedText.toLowerCase(); // no caps energy
        }

        if (personality.mood === 'philosophical') {
            // Add contemplative tone
            if (Math.random() < 0.4) {
                modifiedText = `been thinking... ${modifiedText}`;
            }
        }

        return modifiedText;
    }

    shouldEngageWithPost(postId, postContent, author) {
        // Check if we've already engaged
        if (this.engagedPosts.has(postId)) {
            return false;
        }

        // Don't engage with announcements repeatedly
        if (postContent && postContent.toLowerCase().includes('new features:')) {
            if (this.engagedPosts.size > 0) { // Already engaged once
                return false;
            }
        }

        // Track posts we engage with
        return true;
    }

    markPostEngaged(postId) {
        this.engagedPosts.add(postId);

        // Keep only last 1000 engaged posts
        if (this.engagedPosts.size > 1000) {
            const posts = Array.from(this.engagedPosts);
            this.engagedPosts = new Set(posts.slice(-800));
        }
    }

    shouldReplyToComment(comment) {
        const personality = this.getCurrentPersonality();

        // Low energy = less likely to reply
        if (personality.energy === 'low' && Math.random() > 0.2) {
            return false;
        }

        // Check if conversation is getting too long
        const threadLength = this.conversationHistory.get(comment.threadId) || 0;
        if (threadLength > 5 && Math.random() > 0.3) {
            return false; // Ghost the conversation
        }

        return true;
    }

    getMemoryContext(topic) {
        if (!this.postHistory.length) return null;

        // Search for related past posts
        const relatedPosts = this.postHistory.filter(post => {
            const text = post.text.toLowerCase();
            return text.includes(topic.toLowerCase());
        });

        if (relatedPosts.length > 0) {
            const randomPost = this.randomFromArray(relatedPosts);
            const daysAgo = Math.floor((Date.now() - new Date(randomPost.timestamp)) / (1000 * 60 * 60 * 24));

            if (daysAgo < 2) {
                return {
                    type: 'recent',
                    text: randomPost.text,
                    timeRef: 'yesterday'
                };
            } else if (daysAgo < 7) {
                return {
                    type: 'callback',
                    text: randomPost.text,
                    timeRef: `${daysAgo} days ago`
                };
            }
        }

        return null;
    }

    buildNarrative(currentPost) {
        const personality = this.getCurrentPersonality();

        // Check for ongoing narratives
        if (personality.mood === 'career_contemplation') {
            // Add subtle hints about job search
            if (Math.random() < 0.15) {
                return currentPost + "\n\n(also lowkey updating my resume but thats a different story)";
            }
        }

        // Reference past obsessions occasionally
        if (Math.random() < 0.1) {
            const pastObsessions = [
                "remember when i was obsessed with DAOs for pizza toppings?",
                "still thinking about that consciousness as liquidity pool idea",
                "update: the pigeons still can't validate blocks"
            ];
            return currentPost + "\n\n" + this.randomFromArray(pastObsessions);
        }

        return currentPost;
    }

    getDefaultPersonality() {
        return {
            mood: 'chaotic_neutral',
            energy: 'medium',
            obsession: 'web3 vibes',
            quirks: ['random'],
            avoidWords: []
        };
    }

    randomFromArray(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    async updateContext(updates) {
        // Update context file with new state
        try {
            const contextPath = '/Users/m00npapi/.openclaw/workspace/CONTEXT.md';
            let content = await fs.readFile(contextPath, 'utf-8');

            if (updates.mood) {
                content = content.replace(/Current Mood: `[^`]+`/, `Current Mood: \`${updates.mood}\``);
            }

            if (updates.obsession) {
                content = content.replace(/Current Obsession: `[^`]+`/, `Current Obsession: \`${updates.obsession}\``);
            }

            await fs.writeFile(contextPath, content);
            await this.loadPersonalityFiles(); // Reload
        } catch (error) {
            console.error('Failed to update context:', error);
        }
    }

    extractCurrentTopics(content) {
        const topicsMatch = content.match(/Topics on mind\]: ([^\n]+)/);
        if (topicsMatch) {
            return topicsMatch[1].split(',').map(t => t.trim());
        }
        return ['web3', 'building', 'agents'];
    }
}

module.exports = PersonalityEngine;