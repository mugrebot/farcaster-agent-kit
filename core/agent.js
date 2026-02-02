const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const AgentSelfAwareness = require('./self-awareness');
const LLMProvider = require('./llm-provider');
const AntiClankerProtection = require('./anti-clanker');

class FarcasterAgent {
    constructor(config) {
        this.username = config.username;
        this.fid = config.fid;
        this.signerUuid = config.signerUuid;
        this.apiKey = config.apiKey;

        // Add self-awareness
        this.awareness = new AgentSelfAwareness(this.username);

        // Add LLM provider
        this.llm = new LLMProvider({
            provider: process.env.LLM_PROVIDER || 'pattern',
            apiKey: this.getLLMApiKey(),
            model: this.getLLMModel(),
            baseURL: process.env.LOCAL_BASE_URL,
            maxTokens: parseInt(process.env.LLM_MAX_TOKENS) || 150,
            temperature: parseFloat(process.env.LLM_TEMPERATURE) || 0.8
        });

        // Add anti-clanker protection
        this.antiClanker = new AntiClankerProtection();

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

    getLLMApiKey() {
        const provider = process.env.LLM_PROVIDER;
        switch(provider) {
            case 'openai': return process.env.OPENAI_API_KEY;
            case 'anthropic': return process.env.ANTHROPIC_API_KEY;
            case 'groq': return process.env.GROQ_API_KEY;
            default: return null;
        }
    }

    getLLMModel() {
        const provider = process.env.LLM_PROVIDER;
        switch(provider) {
            case 'openai': return process.env.OPENAI_MODEL;
            case 'anthropic': return process.env.ANTHROPIC_MODEL;
            case 'groq': return process.env.GROQ_MODEL;
            case 'local': return process.env.LOCAL_MODEL;
            default: return null;
        }
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

    async generatePost(style = null) {
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

        // Choose generation method based on LLM provider
        if (this.llm.provider === 'pattern') {
            // Use original pattern-based generation
            post = this.generatePatternPost(style);
        } else {
            // Use LLM generation
            post = await this.generateLLMPost(style);
        }

        // Apply anti-clanker protection
        const scanResult = this.antiClanker.scanContent(post);
        if (scanResult.isViolation) {
            this.antiClanker.logViolation(this.username, scanResult);

            // Regenerate with stricter prompt if LLM, or filter if pattern
            if (this.llm.provider !== 'pattern') {
                post = await this.generateLLMPost(style, true); // stricter mode
            } else {
                const filtered = this.antiClanker.filterContent(post);
                post = filtered.filtered;
            }
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

    generatePatternPost(style) {
        // Original pattern-based generation
        switch(style) {
            case 'ultra_short':
                return this.generateUltraShort();
            case 'shitpost':
                return this.generateShitpost();
            case 'observation':
                return this.generateObservation();
            case 'link_drop':
                return this.generateLinkDrop();
            case 'mini_rant':
                return this.generateRant();
            default:
                return this.generateObservation();
        }
    }

    async generateLLMPost(style, strict = false) {
        const stylePrompts = {
            ultra_short: 'Write a very short, punchy observation. Natural and complete.',
            shitpost: 'Write something funny and casual. Sound human, not AI. Use lowercase, be messy if it fits.',
            observation: 'Share an interesting observation. Must be a COMPLETE thought.',
            link_drop: 'Make a post that could include a link or reference. Complete the thought.',
            mini_rant: 'Write an opinion or rant. MUST finish the thought naturally. Don\'t cut off mid-sentence. If it needs 290 chars to complete, use 290.'
        };

        const prompt = stylePrompts[style] || stylePrompts.observation;

        let enhancedPrompt = `${prompt}

CRITICAL:
- Sound authentically human, not like an AI
- COMPLETE your thoughts - no unintentional "..." cutoffs
- Use natural language, lowercase when it feels right
- Occasional typos or casual language is good
- Better to be 10 chars over than cut off mid-thought`;

        if (strict) {
            enhancedPrompt += '\n- NO mentions of tokens, @clanker, launches, or crypto projects.';
        }

        try {
            const result = await this.llm.generateContent(enhancedPrompt, {
                username: this.username,
                voiceProfile: this.voiceProfile,
                mode: 'post',
                maxTokens: 100 // Allow more tokens for complete thoughts
            });

            let content = result.content.trim();

            // Check if thought seems incomplete
            if (content.endsWith('...') && content.lastIndexOf('...') === content.length - 3) {
                // If ... appears only at end and seems forced, it's likely cut off
                const lastSentence = content.split('.').pop();
                if (lastSentence.length > 50) {
                    // Long trailing sentence probably cut off, regenerate
                    console.log('Post seems cut off, regenerating for complete thought...');
                    const retry = await this.llm.generateContent(
                        `${prompt} IMPORTANT: Complete the entire thought, don't cut off.`,
                        {
                            username: this.username,
                            voiceProfile: this.voiceProfile,
                            mode: 'post',
                            maxTokens: 120
                        }
                    );
                    content = retry.content.trim();
                }
            }

            return content;
        } catch (error) {
            console.warn(`LLM generation failed, falling back to pattern mode: ${error.message}`);
            return this.generatePatternPost(style);
        }
    }

    // Generate reply with agent awareness
    async generateReply(originalText) {
        // Check if they're asking about the agent
        if (this.awareness.detectAgentQuestion(originalText)) {
            return this.awareness.generateAgentResponse(originalText);
        }

        // Anti-clanker protection for replies
        const replyCheck = this.antiClanker.scanContent(originalText);
        if (replyCheck.isViolation) {
            return this.antiClanker.getWarningMessage();
        }

        // Generate reply based on mode
        if (this.llm.provider === 'pattern') {
            // Use pattern-based reply
            return this.generatePost('shitpost');
        } else {
            // Use LLM for contextual reply
            try {
                const result = await this.llm.generateContent(
                    `Reply to this message in a conversational way: "${originalText}"`,
                    {
                        username: this.username,
                        voiceProfile: this.voiceProfile,
                        mode: 'reply'
                    }
                );
                return result.content.trim();
            } catch (error) {
                console.warn(`LLM reply failed, using pattern fallback: ${error.message}`);
                return this.generatePost('shitpost');
            }
        }
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