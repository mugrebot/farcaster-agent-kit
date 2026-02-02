const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const AgentSelfAwareness = require('./self-awareness');

class FarcasterAgent {
    constructor(config) {
        this.username = config.username;
        this.fid = config.fid;
        this.signerUuid = config.signerUuid;
        this.apiKey = config.apiKey;

        // Add self-awareness
        this.awareness = new AgentSelfAwareness(this.username);

        this.voiceProfile = null;
        this.posts = [];
        this.postStyles = {
            ultra_short: { max: 30, weight: 0.15 },
            shitpost: { max: 80, weight: 0.35 },
            observation: { max: 120, weight: 0.25 },
            link_drop: { max: 150, weight: 0.15 },
            mini_rant: { max: 280, weight: 0.10 }
        };
    }

    async loadPosts(postsData) {
        this.posts = postsData;
        await this.analyzeVoice();
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

    generatePost(style = null) {
        if (!this.voiceProfile) {
            throw new Error('Voice profile not loaded');
        }

        // Select style
        if (!style) {
            const styles = Object.keys(this.postStyles);
            const weights = styles.map(s => this.postStyles[s].weight);
            style = this.weightedRandom(styles, weights);
        }

        const maxLength = this.postStyles[style].max;
        let post = '';

        // Generate based on style
        switch(style) {
            case 'ultra_short':
                post = this.generateUltraShort();
                break;
            case 'shitpost':
                post = this.generateShitpost();
                break;
            case 'observation':
                post = this.generateObservation();
                break;
            case 'link_drop':
                post = this.generateLinkDrop();
                break;
            case 'mini_rant':
                post = this.generateRant();
                break;
        }

        // Apply voice styling
        post = this.applyVoiceStyle(post);

        // Occasionally inject agent awareness
        post = this.awareness.injectAwareness(post);

        // Ensure length limits
        if (post.length > maxLength) {
            post = post.substring(0, maxLength - 3) + '...';
        }

        return post;
    }

    // Generate reply with agent awareness
    generateReply(originalText) {
        // Check if they're asking about the agent
        if (this.awareness.detectAgentQuestion(originalText)) {
            return this.awareness.generateAgentResponse(originalText);
        }

        // Otherwise generate normal reply
        return this.generatePost('shitpost');
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
}

module.exports = FarcasterAgent;