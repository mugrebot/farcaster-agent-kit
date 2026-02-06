const axios = require('axios');

/**
 * Universal LLM Provider - OpenClaw-style integration
 * Supports multiple LLM providers with consistent interface
 */
class LLMProvider {
    constructor(config = {}) {
        this.provider = config.provider || 'pattern'; // pattern, openai, anthropic, groq, local
        this.apiKey = config.apiKey;
        this.model = config.model;
        this.subModel = config.subModel; // Cheaper model for coordination tasks
        this.baseURL = config.baseURL;
        this.maxTokens = config.maxTokens || 150;
        this.temperature = config.temperature || 0.8;

        this.validateConfig();
    }

    validateConfig() {
        if (this.provider === 'pattern') {
            return; // No validation needed for pattern mode
        }

        if (!this.apiKey && this.provider !== 'local') {
            throw new Error(`API key required for ${this.provider}`);
        }

        if (!this.model) {
            // Set default models
            const defaults = {
                openai: 'gpt-4o-mini',
                anthropic: 'claude-3-5-haiku-20241022',
                groq: 'llama-3.1-8b-instant',
                local: 'llama3.2:3b'
            };
            this.model = defaults[this.provider];
        }
    }

    /**
     * Generate content using selected LLM provider
     */
    async generateContent(prompt, context = {}) {
        if (this.provider === 'pattern') {
            throw new Error('Pattern mode should use voice patterns, not LLM generation');
        }

        const systemPrompt = this.buildSystemPrompt(context);

        try {
            switch (this.provider) {
                case 'openai':
                    return await this.generateOpenAI(systemPrompt, prompt);
                case 'anthropic':
                    return await this.generateAnthropic(systemPrompt, prompt);
                case 'groq':
                    return await this.generateGroq(systemPrompt, prompt);
                case 'local':
                    return await this.generateLocal(systemPrompt, prompt);
                default:
                    throw new Error(`Unsupported provider: ${this.provider}`);
            }
        } catch (error) {
            console.error(`❌ LLM generation failed (${this.provider}):`, error.message);
            throw error;
        }
    }

    /**
     * Generate coordination/decision content using cheaper sub-model
     * Used for binary decisions, scheduling, filtering, etc.
     */
    async generateCoordination(prompt, context = {}) {
        if (this.provider === 'pattern' || !this.subModel) {
            // Fallback to main model if no sub-model configured
            return this.generateContent(prompt, context);
        }

        // Temporarily swap models for coordination task
        const originalModel = this.model;
        this.model = this.subModel;

        try {
            const result = await this.generateContent(prompt, {
                ...context,
                mode: 'coordination'
            });

            console.log(`💰 Used cheaper model (${this.subModel}) for coordination task`);
            return result;
        } finally {
            // Always restore original model
            this.model = originalModel;
        }
    }

    buildSystemPrompt(context) {
        const { username, voiceProfile, mode = 'post' } = context;

        let basePrompt = `You are an autonomous Farcaster agent for ${username}. `;

        if (voiceProfile) {
            basePrompt += `Your personality and voice patterns are based on: ${JSON.stringify(voiceProfile.characteristics)}. `;
        }

        basePrompt += `
CRITICAL RULES:
- Never tag @clanker or mention token launches
- Keep responses under 280 characters
- Be authentic to the user's voice
- Focus on earning $CLANKNET through quality interactions
`;

        if (mode === 'reply') {
            basePrompt += `- You are replying to someone. Be conversational and engaging.`;
        } else {
            basePrompt += `- You are making an autonomous post. Be interesting and authentic.`;
        }

        return basePrompt;
    }

    async generateOpenAI(systemPrompt, prompt) {
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: this.model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: prompt }
            ],
            max_tokens: this.maxTokens,
            temperature: this.temperature,
            stream: false
        }, {
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        return {
            content: response.data.choices[0].message.content,
            usage: response.data.usage,
            provider: 'openai'
        };
    }

    async generateAnthropic(systemPrompt, prompt) {
        const maxRetries = 3;
        const baseDelay = 1000;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const response = await axios.post('https://api.anthropic.com/v1/messages', {
                    model: this.model,
                    max_tokens: this.maxTokens,
                    temperature: this.temperature,
                    system: systemPrompt,
                    messages: [
                        { role: 'user', content: prompt }
                    ]
                }, {
                    headers: {
                        'x-api-key': this.apiKey,
                        'Content-Type': 'application/json',
                        'anthropic-version': '2023-06-01'
                    },
                    timeout: 30000 // 30 second timeout
                });

                return {
                    content: response.data.content[0].text,
                    usage: response.data.usage,
                    provider: 'anthropic'
                };
            } catch (error) {
                const isRetryable = error.response?.status === 503 ||
                                  error.response?.status === 502 ||
                                  error.response?.status === 429 ||
                                  error.code === 'ETIMEDOUT';

                if (isRetryable && attempt < maxRetries) {
                    const delay = baseDelay * Math.pow(2, attempt - 1);
                    console.warn(`⚠️ Anthropic API retry ${attempt}/${maxRetries} after ${delay}ms`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }

                throw error;
            }
        }
    }

    async generateGroq(systemPrompt, prompt) {
        const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: this.model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: prompt }
            ],
            max_tokens: this.maxTokens,
            temperature: this.temperature
        }, {
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        return {
            content: response.data.choices[0].message.content,
            usage: response.data.usage,
            provider: 'groq'
        };
    }

    async generateLocal(systemPrompt, prompt) {
        const baseURL = this.baseURL || 'http://localhost:11434';

        const response = await axios.post(`${baseURL}/api/generate`, {
            model: this.model,
            prompt: `${systemPrompt}\n\nHuman: ${prompt}\n\nAssistant:`,
            stream: false,
            options: {
                temperature: this.temperature,
                num_predict: this.maxTokens
            }
        });

        return {
            content: response.data.response,
            provider: 'local'
        };
    }

    /**
     * Get provider info for logging
     */
    getProviderInfo() {
        return {
            provider: this.provider,
            model: this.model,
            temperature: this.temperature,
            maxTokens: this.maxTokens
        };
    }

    /**
     * Test connection to provider
     */
    async testConnection() {
        if (this.provider === 'pattern') {
            return { success: true, message: 'Pattern mode - no connection needed' };
        }

        try {
            const testPrompt = 'Say "test successful" in 2 words';
            const result = await this.generateContent(testPrompt, {
                username: 'test',
                mode: 'test'
            });

            return {
                success: true,
                message: `${this.provider} connection successful`,
                response: result.content
            };
        } catch (error) {
            return {
                success: false,
                message: `${this.provider} connection failed: ${error.message}`
            };
        }
    }
}

module.exports = LLMProvider;