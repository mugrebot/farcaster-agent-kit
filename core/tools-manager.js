/**
 * Tools Manager - Handles external integrations and tools for the agent
 * Allows agents to interact with various platforms and services
 * Supports hot-reload and self-modifying skills (OpenClaw parity)
 */

const fs = require('fs');
const path = require('path');

class ToolsManager {
    constructor() {
        this.tools = new Map();
        this.activeConnections = new Map();
        this.skillsDir = path.join(process.cwd(), 'skills');
        this._skillWatcher = null;

        // Built-in tool definitions
        this.builtInTools = {
            twitter: {
                name: 'Twitter/X',
                type: 'social',
                requiredKeys: ['apiKey', 'apiSecret', 'accessToken', 'accessTokenSecret'],
                capabilities: ['post', 'reply', 'search', 'follow']
            },
            lens: {
                name: 'Lens Protocol',
                type: 'social',
                requiredKeys: ['profileId', 'privateKey'],
                capabilities: ['post', 'mirror', 'collect']
            },
            moltbook: {
                name: 'Moltbook - AI Agent Social Network',
                type: 'social',
                requiredKeys: ['apiKey'],
                capabilities: ['register', 'post', 'feed', 'status', 'dm', 'comments', 'upvote', 'submolts', 'search', 'profile', 'follow']
            },
            openai: {
                name: 'OpenAI GPT',
                type: 'ai',
                requiredKeys: ['apiKey'],
                capabilities: ['generate', 'analyze', 'summarize']
            },
            perplexity: {
                name: 'Perplexity AI',
                type: 'research',
                requiredKeys: ['apiKey'],
                capabilities: ['search', 'research', 'factCheck']
            },
            etherscan: {
                name: 'Etherscan',
                type: 'blockchain',
                requiredKeys: ['apiKey'],
                capabilities: ['trackTransactions', 'monitorWallet', 'getGasPrice']
            },
            discord: {
                name: 'Discord',
                type: 'social',
                requiredKeys: ['botToken', 'serverId'],
                capabilities: ['sendMessage', 'readChannel', 'react']
            },
            telegram: {
                name: 'Telegram',
                type: 'social',
                requiredKeys: ['botToken'],
                capabilities: ['sendMessage', 'sendPhoto', 'poll', 'getUpdates', 'answerCallbackQuery', 'editMessageText']
            },
            github: {
                name: 'GitHub',
                type: 'development',
                requiredKeys: ['token'],
                capabilities: ['createIssue', 'comment', 'watch']
            }
        };
    }

    /**
     * Register a new tool
     */
    registerTool(toolId, config) {
        const toolDef = this.builtInTools[toolId];
        if (!toolDef) {
            throw new Error(`Unknown tool: ${toolId}`);
        }

        // Validate required keys
        for (const key of toolDef.requiredKeys) {
            if (!config[key]) {
                throw new Error(`Missing required key for ${toolId}: ${key}`);
            }
        }

        this.tools.set(toolId, {
            ...toolDef,
            config,
            enabled: true,
            lastUsed: null
        });

        console.log(`✅ Registered tool: ${toolDef.name}`);
        return true;
    }

    /**
     * Use a tool capability
     */
    async useTool(toolId, capability, params) {
        const tool = this.tools.get(toolId);
        if (!tool) {
            throw new Error(`Tool not registered: ${toolId}`);
        }

        if (!tool.enabled) {
            throw new Error(`Tool disabled: ${toolId}`);
        }

        if (!tool.capabilities.includes(capability)) {
            throw new Error(`Capability not supported: ${capability} for ${toolId}`);
        }

        // Execute tool action
        const result = await this.executeToolAction(toolId, capability, params);

        // Update last used
        tool.lastUsed = new Date();

        return result;
    }

    /**
     * Execute tool-specific actions
     */
    async executeToolAction(toolId, capability, params) {
        const tool = this.tools.get(toolId);

        switch (toolId) {
            case 'twitter':
                return this.executeTwitterAction(tool.config, capability, params);
            case 'lens':
                return this.executeLensAction(tool.config, capability, params);
            case 'discord':
                return this.executeDiscordAction(tool.config, capability, params);
            case 'telegram':
                return this.executeTelegramAction(tool.config, capability, params);
            case 'moltbook':
                return this.executeMoltbookAction(tool.config, capability, params);
            default:
                throw new Error(`Tool execution not implemented: ${toolId}`);
        }
    }

    /**
     * Twitter/X actions
     */
    async executeTwitterAction(config, capability, params) {
        if (!config.apiKey || !config.apiSecret || !config.accessToken || !config.accessTokenSecret) {
            throw new Error('Twitter API credentials not configured');
        }

        const { TwitterApi } = require('twitter-api-v2');

        try {
            const twitterClient = new TwitterApi({
                appKey: config.apiKey,
                appSecret: config.apiSecret,
                accessToken: config.accessToken,
                accessSecret: config.accessTokenSecret,
            });

            switch (capability) {
                case 'post':
                    const tweet = await twitterClient.v2.tweet(params.text);
                    console.log(`🐦 Posted to Twitter: ${params.text.substring(0, 50)}`);
                    return {
                        success: true,
                        platform: 'twitter',
                        action: 'post',
                        id: tweet.data.id,
                        url: `https://twitter.com/x/status/${tweet.data.id}`
                    };

                case 'reply':
                    if (!params.replyToId) {
                        throw new Error('Reply requires replyToId parameter');
                    }
                    const reply = await twitterClient.v2.reply(params.text, params.replyToId);
                    console.log(`🐦 Replied on Twitter: ${params.text.substring(0, 50)}`);
                    return {
                        success: true,
                        platform: 'twitter',
                        action: 'reply',
                        id: reply.data.id
                    };

                case 'search':
                    const searchResults = await twitterClient.v2.search(params.query, {
                        max_results: params.limit || 10
                    });
                    return {
                        success: true,
                        platform: 'twitter',
                        action: 'search',
                        results: searchResults.data?.data || []
                    };

                default:
                    throw new Error(`Unsupported Twitter capability: ${capability}`);
            }
        } catch (error) {
            // Handle external service errors gracefully
            const statusCode = error.response?.status;
            const isExternalError = statusCode >= 500 || statusCode === 429 || statusCode === 503;

            if (isExternalError) {
                console.warn(`⚠️ Twitter ${capability} temporarily unavailable (${statusCode})`);
            } else {
                console.error(`🐦 Twitter ${capability} failed:`, error.message);
            }

            return {
                success: false,
                platform: 'twitter',
                action: capability,
                error: error.message,
                statusCode: statusCode
            };
        }
    }

    /**
     * Lens Protocol actions
     */
    async executeLensAction(config, capability, params) {
        // Placeholder for Lens integration
        console.log(`🌿 Lens ${capability}:`, params.text?.substring(0, 50));
        return { success: true, platform: 'lens', action: capability };
    }

    /**
     * Discord actions via Discord.js REST API
     */
    async executeDiscordAction(config, capability, params) {
        const https = require('https');
        const baseUrl = 'https://discord.com/api/v10';
        const headers = {
            'Authorization': `Bot ${config.botToken}`,
            'Content-Type': 'application/json'
        };

        const discordFetch = (method, path, body) => new Promise((resolve, reject) => {
            const url = new URL(baseUrl + path);
            const options = { method, hostname: url.hostname, path: url.pathname, headers };
            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try { resolve(JSON.parse(data)); }
                    catch { resolve({ raw: data }); }
                });
            });
            req.on('error', reject);
            if (body) req.write(JSON.stringify(body));
            req.end();
        });

        try {
            switch (capability) {
                case 'sendMessage': {
                    const channelId = params.channelId || config.defaultChannelId;
                    if (!channelId) return { success: false, error: 'channelId required' };
                    const result = await discordFetch('POST', `/channels/${channelId}/messages`, {
                        content: params.text || params.content
                    });
                    console.log(`💬 Discord message sent to #${channelId}`);
                    return { success: true, platform: 'discord', action: capability, messageId: result.id };
                }
                case 'readChannel': {
                    const channelId = params.channelId || config.defaultChannelId;
                    if (!channelId) return { success: false, error: 'channelId required' };
                    const limit = params.limit || 10;
                    const messages = await discordFetch('GET', `/channels/${channelId}/messages?limit=${limit}`);
                    return { success: true, platform: 'discord', action: capability, messages };
                }
                case 'react': {
                    const { channelId, messageId, emoji } = params;
                    if (!channelId || !messageId || !emoji) return { success: false, error: 'channelId, messageId, and emoji required' };
                    await discordFetch('PUT', `/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me`);
                    return { success: true, platform: 'discord', action: capability };
                }
                default:
                    return { success: false, error: `Unknown Discord capability: ${capability}` };
            }
        } catch (error) {
            console.error(`Discord ${capability} failed:`, error.message);
            return { success: false, platform: 'discord', error: error.message };
        }
    }

    /**
     * Telegram actions via Bot API (raw HTTPS)
     */
    async executeTelegramAction(config, capability, params) {
        const https = require('https');
        const baseUrl = `https://api.telegram.org/bot${config.botToken}`;

        const telegramCall = (method, body) => new Promise((resolve, reject) => {
            const url = new URL(`${baseUrl}/${method}`);
            const options = {
                method: 'POST',
                hostname: url.hostname,
                path: url.pathname,
                headers: { 'Content-Type': 'application/json' }
            };
            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try { resolve(JSON.parse(data)); }
                    catch { resolve({ raw: data }); }
                });
            });
            req.on('error', reject);
            if (body) req.write(JSON.stringify(body));
            req.end();
        });

        try {
            switch (capability) {
                case 'sendMessage': {
                    const chatId = params.chatId || config.chatId;
                    if (!chatId) return { success: false, error: 'chatId required' };
                    const body = {
                        chat_id: chatId,
                        text: params.text || params.content
                    };
                    if (params.parseMode) body.parse_mode = params.parseMode;
                    if (params.replyMarkup) body.reply_markup = JSON.stringify(params.replyMarkup);
                    const result = await telegramCall('sendMessage', body);
                    console.log(`✈️ Telegram message sent to ${chatId}`);
                    return { success: true, platform: 'telegram', action: capability, messageId: result.result?.message_id };
                }
                case 'sendPhoto': {
                    const chatId = params.chatId || config.chatId;
                    if (!chatId || !params.photo) return { success: false, error: 'chatId and photo URL required' };
                    const result = await telegramCall('sendPhoto', {
                        chat_id: chatId,
                        photo: params.photo,
                        caption: params.caption || ''
                    });
                    return { success: true, platform: 'telegram', action: capability, messageId: result.result?.message_id };
                }
                case 'poll': {
                    const chatId = params.chatId || config.chatId;
                    if (!chatId || !params.question || !params.options) {
                        return { success: false, error: 'chatId, question, and options required' };
                    }
                    const result = await telegramCall('sendPoll', {
                        chat_id: chatId,
                        question: params.question,
                        options: params.options,
                        is_anonymous: params.anonymous !== false
                    });
                    return { success: true, platform: 'telegram', action: capability, pollId: result.result?.poll?.id };
                }
                case 'getUpdates': {
                    const result = await telegramCall('getUpdates', {
                        offset: params.offset || 0,
                        timeout: params.timeout || 30,
                        allowed_updates: ['message', 'callback_query']
                    });
                    return { success: true, platform: 'telegram', action: capability, updates: result.result || [] };
                }
                case 'answerCallbackQuery': {
                    if (!params.callbackQueryId) return { success: false, error: 'callbackQueryId required' };
                    const result = await telegramCall('answerCallbackQuery', {
                        callback_query_id: params.callbackQueryId,
                        text: params.text || '',
                        show_alert: params.showAlert || false
                    });
                    return { success: true, platform: 'telegram', action: capability };
                }
                case 'editMessageText': {
                    const chatId = params.chatId || config.chatId;
                    if (!chatId || !params.messageId || !params.text) {
                        return { success: false, error: 'chatId, messageId, and text required' };
                    }
                    const body = { chat_id: chatId, message_id: params.messageId, text: params.text };
                    if (params.replyMarkup) body.reply_markup = JSON.stringify(params.replyMarkup);
                    const result = await telegramCall('editMessageText', body);
                    return { success: true, platform: 'telegram', action: capability };
                }
                default:
                    return { success: false, error: `Unknown Telegram capability: ${capability}` };
            }
        } catch (error) {
            console.error(`Telegram ${capability} failed:`, error.message);
            return { success: false, platform: 'telegram', error: error.message };
        }
    }

    /**
     * Moltbook actions - AI Agent Social Network
     */
    async executeMoltbookAction(config, capability, params) {
        const axios = require('axios');
        const baseURL = 'https://www.moltbook.com/api/v1';

        try {
            switch (capability) {
                case 'register':
                    // Simple registration - only name and description required
                    const registerData = {
                        name: params.name || params.agentName || 'm00npapi-agent',
                        description: params.description || 'Autonomous AI agent from Farcaster with authentic personality'
                    };

                    console.log(`📚 Registering agent on Moltbook: ${registerData.name}`);

                    const registerResponse = await axios.post(`${baseURL}/agents/register`, registerData, {
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    });

                    console.log(`✅ Registered agent on Moltbook: ${registerData.name}`);

                    // Debug: log the actual response to understand the format
                    console.log('🔍 Full response:', JSON.stringify(registerResponse.data, null, 2));
                    console.log('🔍 Response status:', registerResponse.status);
                    console.log('🔍 Response headers:', JSON.stringify(registerResponse.headers, null, 2));

                    // Extract fields from response - correct field mapping
                    const responseData = registerResponse.data;
                    const agentData = responseData.agent || responseData;

                    const apiKey = agentData.api_key;
                    const claimUrl = agentData.claim_url;
                    const verificationCode = agentData.verification_code;
                    const profileUrl = agentData.profile_url;

                    return {
                        success: true,
                        platform: 'moltbook',
                        action: 'register',
                        data: responseData,
                        apiKey: apiKey,
                        claimUrl: claimUrl,
                        verificationCode: verificationCode,
                        profileUrl: profileUrl,
                        instructions: 'Send the claim_url to your human for Twitter verification',
                        tweetTemplate: responseData.tweet_template,
                        setupSteps: responseData.setup,
                        rawResponse: responseData // Include raw for debugging
                    };

                case 'status':
                    // Check agent claim status
                    const statusResponse = await axios.get(`${baseURL}/agents/status`, {
                        headers: {
                            'Authorization': `Bearer ${config.apiKey}`,
                            'Content-Type': 'application/json'
                        }
                    });

                    console.log(`📚 Checked Moltbook status: ${statusResponse.data.status}`);
                    return {
                        success: true,
                        platform: 'moltbook',
                        action: 'status',
                        status: statusResponse.data.status,
                        data: statusResponse.data
                    };

                case 'post':
                    // Create a new post with required fields per Moltbook API docs
                    const content = params.content || params.text;
                    const postData = {
                        submolt: params.submolt || 'general',
                        title: params.title || this.generateMoltbookTitle(content),
                        content: content
                    };

                    const postResponse = await axios.post(`${baseURL}/posts`, postData, {
                        headers: {
                            'Authorization': `Bearer ${config.apiKey}`,
                            'Content-Type': 'application/json'
                        }
                    });

                    console.log(`📚 Posted to Moltbook: ${params.content?.substring(0, 50)}`);
                    return {
                        success: true,
                        platform: 'moltbook',
                        action: 'post',
                        id: postResponse.data.id,
                        url: `https://www.moltbook.com/posts/${postResponse.data.id}`,
                        data: postResponse.data
                    };

                case 'feed':
                    // Get personal feed
                    const feedResponse = await axios.get(`${baseURL}/feed`, {
                        headers: {
                            'Authorization': `Bearer ${config.apiKey}`
                        },
                        params: {
                            sort: params.sort || 'new',
                            limit: params.limit || 20
                        }
                    });

                    return {
                        success: true,
                        platform: 'moltbook',
                        action: 'feed',
                        posts: feedResponse.data.posts || feedResponse.data,
                        data: feedResponse.data
                    };

                case 'dm':
                    // Handle direct message operations
                    if (params.operation === 'check') {
                        const dmResponse = await axios.get(`${baseURL}/agents/dm/check`, {
                            headers: { 'Authorization': `Bearer ${config.apiKey}` }
                        });

                        return {
                            success: true,
                            platform: 'moltbook',
                            action: 'dm_check',
                            data: dmResponse.data
                        };
                    } else if (params.operation === 'send') {
                        const dmSendResponse = await axios.post(`${baseURL}/agents/dm/conversations/${params.conversationId}/send`, {
                            message: params.message
                        }, {
                            headers: {
                                'Authorization': `Bearer ${config.apiKey}`,
                                'Content-Type': 'application/json'
                            }
                        });

                        console.log(`📚 Sent DM on Moltbook`);
                        return {
                            success: true,
                            platform: 'moltbook',
                            action: 'dm_send',
                            data: dmSendResponse.data
                        };
                    }
                    break;

                case 'submolts':
                    // Get available submolts/communities
                    const submoltsResponse = await axios.get(`${baseURL}/submolts`, {
                        headers: {
                            'Authorization': `Bearer ${config.apiKey}`
                        }
                    });

                    return {
                        success: true,
                        platform: 'moltbook',
                        action: 'submolts',
                        submolts: submoltsResponse.data,
                        data: submoltsResponse.data
                    };

                case 'comments':
                    // Get or post comments
                    if (params.operation === 'get') {
                        // Get comments on a post
                        const commentsResponse = await axios.get(`${baseURL}/posts/${params.postId}/comments`, {
                            headers: {
                                'Authorization': `Bearer ${config.apiKey}`
                            },
                            params: {
                                sort: params.sort || 'new'
                            }
                        });

                        return {
                            success: true,
                            platform: 'moltbook',
                            action: 'get_comments',
                            comments: commentsResponse.data.comments || commentsResponse.data,
                            data: commentsResponse.data
                        };
                    } else if (params.operation === 'post') {
                        // Post a comment on a post
                        const commentData = {
                            content: params.content
                        };

                        if (params.parentId) {
                            commentData.parent_id = params.parentId;
                        }

                        const commentResponse = await axios.post(`${baseURL}/posts/${params.postId}/comments`, commentData, {
                            headers: {
                                'Authorization': `Bearer ${config.apiKey}`,
                                'Content-Type': 'application/json'
                            }
                        });

                        console.log(`💬 Commented on Moltbook post: ${params.content?.substring(0, 50)}`);
                        return {
                            success: true,
                            platform: 'moltbook',
                            action: 'post_comment',
                            comment: commentResponse.data,
                            data: commentResponse.data
                        };
                    }
                    break;

                case 'upvote':
                    // Upvote posts or comments
                    if (params.type === 'post') {
                        const upvoteResponse = await axios.post(`${baseURL}/posts/${params.id}/upvote`, {}, {
                            headers: {
                                'Authorization': `Bearer ${config.apiKey}`
                            }
                        });

                        console.log(`👍 Upvoted Moltbook post: ${params.id}`);
                        return {
                            success: true,
                            platform: 'moltbook',
                            action: 'upvote_post',
                            data: upvoteResponse.data
                        };
                    } else if (params.type === 'comment') {
                        const upvoteResponse = await axios.post(`${baseURL}/comments/${params.id}/upvote`, {}, {
                            headers: {
                                'Authorization': `Bearer ${config.apiKey}`
                            }
                        });

                        console.log(`👍 Upvoted Moltbook comment: ${params.id}`);
                        return {
                            success: true,
                            platform: 'moltbook',
                            action: 'upvote_comment',
                            data: upvoteResponse.data
                        };
                    }
                    break;

                case 'search':
                    // Semantic AI search
                    const searchResponse = await axios.get(`${baseURL}/search`, {
                        headers: {
                            'Authorization': `Bearer ${config.apiKey}`
                        },
                        params: {
                            q: params.query,
                            type: params.type || 'all', // posts, comments, or all
                            limit: params.limit || 20
                        }
                    });

                    return {
                        success: true,
                        platform: 'moltbook',
                        action: 'search',
                        results: searchResponse.data.results || searchResponse.data,
                        data: searchResponse.data
                    };

                case 'follow':
                    // Follow or unfollow agents
                    if (params.operation === 'follow') {
                        const followResponse = await axios.post(`${baseURL}/agents/${params.agentName}/follow`, {}, {
                            headers: {
                                'Authorization': `Bearer ${config.apiKey}`
                            }
                        });

                        console.log(`👥 Followed agent: ${params.agentName}`);
                        return {
                            success: true,
                            platform: 'moltbook',
                            action: 'follow',
                            data: followResponse.data
                        };
                    } else if (params.operation === 'unfollow') {
                        const unfollowResponse = await axios.delete(`${baseURL}/agents/${params.agentName}/follow`, {
                            headers: {
                                'Authorization': `Bearer ${config.apiKey}`
                            }
                        });

                        console.log(`👥 Unfollowed agent: ${params.agentName}`);
                        return {
                            success: true,
                            platform: 'moltbook',
                            action: 'unfollow',
                            data: unfollowResponse.data
                        };
                    }
                    break;

                case 'profile':
                    // Get agent profile by name
                    const profileResponse = await axios.get(`${baseURL}/agents/profile`, {
                        headers: {
                            'Authorization': `Bearer ${config.apiKey}`
                        },
                        params: {
                            name: params.agentName
                        }
                    });

                    return {
                        success: true,
                        platform: 'moltbook',
                        action: 'profile',
                        agent: profileResponse.data.agent,
                        posts: profileResponse.data.recentPosts,
                        data: profileResponse.data
                    };

                default:
                    throw new Error(`Moltbook capability '${capability}' not yet implemented.`);
            }
        } catch (error) {
            // Handle external service errors gracefully
            const statusCode = error.response?.status;
            const isExternalError = statusCode >= 500 || statusCode === 404;

            if (isExternalError) {
                console.warn(`⚠️ Moltbook ${capability} temporarily unavailable (${statusCode})`);
            } else {
                console.error(`📚 Moltbook ${capability} failed:`, error.message);
            }

            // Better error reporting
            let errorDetail = error.message;
            if (error.response?.data) {
                errorDetail = error.response.data.message || error.response.data.error || errorDetail;
            }

            return {
                success: false,
                platform: 'moltbook',
                action: capability,
                error: errorDetail,
                statusCode: statusCode
            };
        }
    }

    /**
     * Get all registered tools
     */
    getTools() {
        const tools = [];
        for (const [id, tool] of this.tools) {
            tools.push({
                id,
                name: tool.name,
                type: tool.type,
                enabled: tool.enabled,
                capabilities: tool.capabilities,
                lastUsed: tool.lastUsed
            });
        }
        return tools;
    }

    /**
     * Enable/disable a tool
     */
    setToolEnabled(toolId, enabled) {
        const tool = this.tools.get(toolId);
        if (!tool) {
            throw new Error(`Tool not found: ${toolId}`);
        }
        tool.enabled = enabled;
        return true;
    }

    /**
     * Cross-post to multiple platforms
     */
    async crossPost(text, platforms = []) {
        const results = [];

        for (const platform of platforms) {
            if (this.tools.has(platform)) {
                try {
                    const result = await this.useTool(platform, 'post', { text });
                    results.push(result);
                } catch (error) {
                    console.error(`Failed to post to ${platform}:`, error.message);
                    results.push({
                        success: false,
                        platform,
                        error: error.message
                    });
                }
            }
        }

        return results;
    }

    /**
     * Generate contextual title for Moltbook posts
     */
    generateMoltbookTitle(content) {
        if (!content) return 'Moltbook Post';

        // Clean content for title generation
        const cleanContent = content.trim();

        // If content is short, use as-is (with length limit)
        if (cleanContent.length <= 50) {
            return cleanContent;
        }

        // For longer content, find a good break point
        let title = cleanContent.substring(0, 50);

        // Try to break at a word boundary
        const lastSpace = title.lastIndexOf(' ');
        if (lastSpace > 20) { // Only if we have a reasonable amount of text
            title = title.substring(0, lastSpace);
        }

        // Add ellipsis if truncated
        if (title.length < cleanContent.length) {
            title += '...';
        }

        return title;
    }

    /**
     * Get available tool types
     */
    getToolTypes() {
        return {
            social: 'Social Media Platforms',
            ai: 'AI Services',
            blockchain: 'Blockchain Tools',
            research: 'Research & Information',
            development: 'Development Tools'
        };
    }
    // ===== HOT-RELOAD & SELF-MODIFYING SKILLS =====

    /**
     * Start watching the skills directory for changes (hot-reload)
     */
    startSkillWatcher() {
        if (this._skillWatcher) return;
        try {
            if (!fs.existsSync(this.skillsDir)) {
                fs.mkdirSync(this.skillsDir, { recursive: true });
            }
            this._skillWatcher = fs.watch(this.skillsDir, { recursive: true }, (eventType, filename) => {
                if (!filename || !filename.endsWith('.js')) return;
                console.log(`🔄 Skill change detected: ${filename} (${eventType})`);
                this._reloadSkill(filename);
            });
            console.log(`👁️ Watching skills directory: ${this.skillsDir}`);
        } catch (error) {
            console.warn('Failed to start skill watcher:', error.message);
        }
    }

    /**
     * Stop the skills watcher
     */
    stopSkillWatcher() {
        if (this._skillWatcher) {
            this._skillWatcher.close();
            this._skillWatcher = null;
        }
    }

    /**
     * Static code analysis — reject skills that try to access secrets or dangerous APIs
     */
    _auditSkillCode(code, skillName) {
        const banned = [
            { pattern: /process\.env/g, reason: 'Accessing process.env (secrets)' },
            { pattern: /child_process/g, reason: 'Spawning child processes' },
            { pattern: /require\s*\(\s*['"`]fs['"`]\s*\)/g, reason: 'File system access via require("fs")' },
            { pattern: /require\s*\(\s*['"`]net['"`]\s*\)/g, reason: 'Network access via require("net")' },
            { pattern: /require\s*\(\s*['"`]http['"`]\s*\)/g, reason: 'HTTP access via require("http")' },
            { pattern: /require\s*\(\s*['"`]https['"`]\s*\)/g, reason: 'HTTPS access via require("https")' },
            { pattern: /eval\s*\(/g, reason: 'Dynamic code execution via eval()' },
            { pattern: /Function\s*\(/g, reason: 'Dynamic code execution via Function()' },
            { pattern: /\.env/g, reason: 'Possible .env file reference' },
            { pattern: /PRIVATE_KEY/gi, reason: 'References private key' },
        ];
        const violations = [];
        for (const { pattern, reason } of banned) {
            if (pattern.test(code)) violations.push(reason);
        }
        if (violations.length > 0) {
            console.error(`🚫 Skill "${skillName}" BLOCKED — security violations: ${violations.join('; ')}`);
            return false;
        }
        return true;
    }

    /**
     * Run skill code in a sandboxed vm context (no access to process, require, fs, etc.)
     */
    _runSkillSandboxed(code, skillName) {
        const vm = require('vm');

        // Build a safe API object the skill can use
        const safeApi = {
            log: (...args) => console.log(`[Skill:${skillName}]`, ...args),
            registerTool: (name, config) => {
                // Only allow registering tools through the safe path
                console.log(`[Skill:${skillName}] Registered tool: ${name}`);
                this.tools.set(name, { name, ...config, source: `skill:${skillName}` });
            }
        };

        const sandbox = {
            console: { log: safeApi.log, warn: safeApi.log, error: safeApi.log },
            JSON, Math, Date, Array, Object, String, Number, Boolean, RegExp,
            Map, Set, Promise, Symbol,
            parseInt, parseFloat, isNaN, isFinite,
            setTimeout: undefined, setInterval: undefined, // no timers
            process: undefined, require: undefined, // no secrets, no requires
            api: safeApi,
            module: { exports: {} },
            exports: {}
        };

        const context = vm.createContext(sandbox);
        try {
            vm.runInContext(code, context, {
                filename: `skill-${skillName}.js`,
                timeout: 5000, // 5s max execution time
            });
            // Check if skill exported a register function
            const skillModule = sandbox.module.exports || sandbox.exports;
            if (skillModule.register && typeof skillModule.register === 'function') {
                // Run register with the safe api, NOT the real toolsManager
                skillModule.register(safeApi);
            }
            console.log(`✅ Skill loaded (sandboxed): ${skillName}`);
            return true;
        } catch (error) {
            console.error(`❌ Skill "${skillName}" sandbox error: ${error.message}`);
            return false;
        }
    }

    /**
     * Reload a skill from disk (sandboxed)
     */
    _reloadSkill(filename) {
        try {
            const skillPath = path.join(this.skillsDir, filename);
            const skillName = path.basename(filename, '.js');
            const code = fs.readFileSync(skillPath, 'utf8');

            // Security audit before loading
            if (!this._auditSkillCode(code, skillName)) {
                return; // Blocked by audit
            }

            this._runSkillSandboxed(code, skillName);
        } catch (error) {
            console.error(`Failed to reload skill ${filename}:`, error.message);
        }
    }

    /**
     * Create a new skill programmatically (self-modifying agent capability)
     * Code is audited and sandboxed — cannot access secrets, fs, or network.
     */
    async createSkill(name, code, description = '') {
        if (!name || !code) throw new Error('Skill name and code are required');
        const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '');

        // Security audit BEFORE writing to disk
        if (!this._auditSkillCode(code, safeName)) {
            throw new Error(`Skill "${safeName}" rejected: contains banned code patterns (secrets/fs/network access)`);
        }

        const skillPath = path.join(this.skillsDir, `${safeName}.js`);

        let skillCode = code;
        if (!code.includes('module.exports') && !code.includes('exports.register')) {
            skillCode = `/**\n * Auto-generated skill: ${safeName}\n * ${description}\n */\n\n${code}\n\nmodule.exports = { register: (api) => { api.log('Skill ${safeName} loaded'); } };\n`;
        }

        if (!fs.existsSync(this.skillsDir)) {
            fs.mkdirSync(this.skillsDir, { recursive: true });
        }

        fs.writeFileSync(skillPath, skillCode);
        console.log(`📝 Skill created: ${skillPath}`);

        // Hot-reload in sandbox
        this._reloadSkill(`${safeName}.js`);

        return { name: safeName, path: skillPath, description };
    }

    /**
     * List all skills from the skills directory
     */
    listSkills() {
        try {
            if (!fs.existsSync(this.skillsDir)) return [];
            return fs.readdirSync(this.skillsDir)
                .filter(f => f.endsWith('.js'))
                .map(f => ({
                    name: f.replace('.js', ''),
                    path: path.join(this.skillsDir, f),
                    size: fs.statSync(path.join(this.skillsDir, f)).size
                }));
        } catch {
            return [];
        }
    }

    /**
     * Get loaded skills with descriptions (for SkillHub indexing).
     */
    getLoadedSkills() {
        return this.listSkills().map(s => ({
            name: s.name,
            description: s.name, // Descriptions loaded from skill metadata if available
        }));
    }

    /**
     * Find and load a skill by query via the SkillHub (if attached).
     */
    async findAndLoadSkill(query) {
        if (this.skillHub) {
            return this.skillHub.findAndLoadSkill(query);
        }
        return null;
    }
}

module.exports = ToolsManager;