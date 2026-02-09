#!/usr/bin/env node

require('dotenv').config();
const axios = require('axios');
const cron = require('node-cron');
const fs = require('fs').promises;
const path = require('path');

const FarcasterAgent = require('../core/agent');
const { AgentRegistry, AgentInteraction } = require('../core/registry');
const ToolsManager = require('../core/tools-manager');
const SecretsClient = require('../core/secrets-client');
const TxApprovalManager = require('../core/tx-approval');
const NetworkSafety = require('../core/network-safety');
const SubAgentManager = require('../core/sub-agent-manager');
const EventBus = require('../core/event-bus');
const Gateway = require('../core/gateway');
const RequestDispatcher = require('../core/request-dispatcher');
const AgenticLoop = require('../core/agentic-loop');
const thinkingLevels = require('../core/thinking-levels');
const BrowserAgent = require('../core/browser-agent');
const SkillHub = require('../core/skill-hub');

class AgentRunner {
    constructor() {
        this.config = {
            apiKey: process.env.NEYNAR_API_KEY,
            signerUuid: process.env.NEYNAR_SIGNER_UUID,
            username: process.env.FARCASTER_USERNAME,
            fid: parseInt(process.env.FARCASTER_FID),
            postsPerWindow: parseInt(process.env.POSTS_PER_WINDOW) || 2,
            replyToMentions: process.env.REPLY_TO_MENTIONS === 'true'
        };

        this.agent = new FarcasterAgent(this.config);
        this.registry = new AgentRegistry();
        this.interaction = new AgentInteraction(this.config);
        this.toolsManager = new ToolsManager();

        // Start hot-reload skill watcher
        this.toolsManager.startSkillWatcher();

        // Transaction approval manager (Telegram-based approval for onchain txns)
        this.approvalManager = new TxApprovalManager({
            ownerChatId: process.env.TELEGRAM_OWNER_CHAT_ID || null,
            whitelistedContracts: [
                '0x623693BefAECf61484e344fa272e9A8B82d9BB07', // CLANKNET
                '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', // USDC
                '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5', // Aave V3 Pool
                '0x2626664c2603336E57B271c5C0b26F421741e481'  // Uniswap V3 Router
            ],
            maxAutoApproveETH: process.env.TX_APPROVAL_MAX_AUTO_ETH || '0.001',
            dailyAutoLimit: process.env.TX_APPROVAL_DAILY_AUTO_LIMIT || '0.01',
            expiryMinutes: process.env.TX_APPROVAL_EXPIRY_MIN || '10'
        }, this.toolsManager);

        // Set up moltbook if configured
        if (process.env.MOLTBOOK_API_KEY) {
            try {
                this.toolsManager.registerTool('moltbook', {
                    apiKey: process.env.MOLTBOOK_API_KEY,
                    agentName: process.env.MOLTBOOK_AGENT_NAME || 'm00npapi'
                });
                console.log('✅ Moltbook integration enabled');
            } catch (e) {
                console.warn('⚠️  Moltbook setup failed:', e.message);
            }
        }

        // Set up Telegram bot if configured
        const tgToken = process.env.TELEGRAM_BOT_TOKEN || process.env.BOTFATHER_KEY;
        if (tgToken) {
            try {
                this.toolsManager.registerTool('telegram', {
                    botToken: tgToken,
                    chatId: process.env.TELEGRAM_CHAT_ID || null
                });
                console.log('✅ Telegram bot integration enabled');
            } catch (e) {
                console.warn('⚠️  Telegram setup failed:', e.message);
            }
        }

        // Network safety for URL fetching (SSRF protection, domain filtering, rate limiting)
        this.networkSafety = new NetworkSafety();

        // Sub-agent manager (central nervous system)
        this.subAgentManager = new SubAgentManager();

        // ── New subsystems (Phase 1-4: Gateway + Agentic Loop + Browser + Skills) ──
        this.eventBus = new EventBus();

        this.dispatcher = new RequestDispatcher({ eventBus: this.eventBus });

        this.gateway = new Gateway({
            dispatcher: this.dispatcher,
            eventBus: this.eventBus,
        });

        this.browserAgent = new BrowserAgent({
            networkSafety: this.networkSafety,
            llm: this.agent.llm,
            eventBus: this.eventBus,
        });

        this.skillHub = new SkillHub({
            toolsManager: this.toolsManager,
            networkSafety: this.networkSafety,
            eventBus: this.eventBus,
        });

        this.agenticLoop = new AgenticLoop({
            llm: this.agent.llm,
            eventBus: this.eventBus,
            dispatcher: this.dispatcher,
            agent: this.agent,
            toolsManager: this.toolsManager,
            skillHub: this.skillHub,
        });

        // Session-level thinking level (can be overridden per-session via /think:<level>)
        this._sessionThinkingLevel = 'medium';

        this.postsThisWindow = 0;
        this.windowStart = Date.now();

        // Moltbook engagement tracking
        this.moltbookEngagement = {
            lastCommentCheck: 0,
            lastFeedBrowse: 0,
            lastDiscovery: 0,
            commentsToday: 0,
            upvotesToday: 0,
            lastResetDate: new Date().toDateString(),
            heartbeatCount: 0
        };
    }

    async initialize() {
        console.log('🚀 Starting Farcaster Agent...');
        console.log(`   Username: ${this.config.username}`);
        console.log(`   FID: ${this.config.fid}`);

        // Load or fetch posts
        await this.loadAgentProfile();

        // Register self
        await this.registerAgent();

        // Start posting schedule
        this.startScheduler();

        // Start webhook server for replies
        if (this.config.replyToMentions) {
            this.startWebhookServer();
        }

        // Initialize Agent0 ERC-8004 integration
        await this.initializeAgent0();

        // Start moltbook services if enabled
        if (process.env.MOLTBOOK_API_KEY && this.toolsManager.tools.has('moltbook')) {
            this.startMoltbookScheduler();
            this.startMoltbookHeartbeat();
        }

        // Start Mirror System heartbeat for self-improvement
        this.startMirrorHeartbeat();

        // Start Agent0 news submission scheduler
        this.startAgent0NewsScheduler();

        // Start autonomous DeFi operations if wallet is configured
        // Note: process.env.PRIVATE_KEY may be stripped — check onchainAgent directly
        if (this.agent.onchainAgent) {
            // Inject approval manager so all txns go through Telegram approval
            this.agent.onchainAgent.approvalManager = this.approvalManager;
            console.log('🔐 Transaction approval layer active (Telegram-gated)');
            this.startDeFiScheduler();
        }

        // Start expiry cleanup for pending approvals (every 60s)
        setInterval(() => this.approvalManager.expireOldTransactions(), 60000);

        // ── Start new subsystems ──

        // 6. Start gateway (ws://127.0.0.1:18789)
        try {
            this._registerDispatcherHandlers();
            await this.gateway.start();
        } catch (err) {
            console.warn('⚠️  Gateway startup failed:', err.message);
        }

        // 7-8. Event bus + dispatcher already initialized in constructor

        // 9. Browser agent initialized lazily (constructor only, no launch)
        console.log('🌐 Browser agent ready (lazy — launches on first use)');

        // 10. Initialize skill hub (index existing skills)
        try {
            this.skillHub.secretsClient = this.secretsClient;
            this.skillHub.provider = this.agent.onchainAgent?.provider || null;
            await this.skillHub.initialize();
        } catch (err) {
            console.warn('⚠️  SkillHub init failed:', err.message);
        }

        // 11. Start agentic loop (60s heartbeat)
        this.agenticLoop.start();

        // ── Existing subsystems ──

        // Start Telegram bot polling if configured
        if (this.toolsManager.tools.has('telegram')) {
            this.startTelegramPolling();
        }

        // 12. Start Redis task poller (CLANKNET network task queue)
        this.startRedisTaskPoller();

        console.log('✅ Agent initialized and running!');
    }

    /**
     * Register request dispatcher handlers for all gateway methods.
     */
    _registerDispatcherHandlers() {
        // post — create and publish a Farcaster post
        this.dispatcher.registerHandler('post', async (params) => {
            await this.createPost();
            return { posted: true };
        });

        // chat — LLM chat response
        this.dispatcher.registerHandler('chat', async (params) => {
            const reply = await this.agent.llm.generateContent(params.message || params.prompt || '', {
                username: this.config.username,
                mode: 'chat',
                maxTokens: 2000,
                temperature: 0.7,
                thinkingLevel: params.thinkingLevel || this._sessionThinkingLevel,
            });
            return { content: reply.content };
        });

        // deploy — deploy a contract
        this.dispatcher.registerHandler('deploy', async (params) => {
            if (!this.agent.contractDeployer) throw new Error('Contract deployer not available');
            const result = await this.agent.contractDeployer.deployFromTemplate(params.template, params.params || {});
            return result;
        });

        // defi — DeFi query
        this.dispatcher.registerHandler('defi', async (params) => {
            return this.executeDefiQuery(params);
        });

        // research — token/topic research
        this.dispatcher.registerHandler('research', async (params) => {
            return this.executeTokenResearch(params);
        });

        // skill — execute a skill
        this.dispatcher.registerHandler('skill', async (params) => {
            const result = await this.toolsManager.useTool('skill', params.skillName, params.input || {});
            return result;
        });

        // browser — browser automation
        this.dispatcher.registerHandler('browser', async (params) => {
            const { action } = params;
            switch (action) {
                case 'navigate': return this.browserAgent.navigate(params.url, params.pageId);
                case 'snapshot': return this.browserAgent.snapshot(params.pageId);
                case 'screenshot': return this.browserAgent.screenshot(params.pageId);
                case 'click': return this.browserAgent.click(params.selector, params.pageId);
                case 'fill': return this.browserAgent.fill(params.selector, params.value, params.pageId);
                case 'eval': return this.browserAgent.eval(params.js, params.pageId);
                case 'extract': return this.browserAgent.extract(params.prompt, params.pageId);
                default: throw new Error(`Unknown browser action: ${action}`);
            }
        });

        console.log('📡 Dispatcher handlers registered');
    }

    /**
     * Telegram long-polling loop — listens for incoming messages and replies via the agent LLM
     */
    startTelegramPolling() {
        let offset = 0;
        let polling = false; // mutex to prevent concurrent polls
        const botUsername = 'm00npapi_bot';
        // Owner-only mode: only respond to this Telegram username
        const OWNER_USERNAME = 'm00npapi';
        this.tgConversationHistory = [];
        console.log(`🤖 Telegram polling started for @${botUsername} (owner-only: @${OWNER_USERNAME})`);

        const poll = async () => {
            if (polling) return; // skip if already polling
            polling = true;
            try {
                const result = await this.toolsManager.useTool('telegram', 'getUpdates', {
                    offset,
                    timeout: 30
                });

                if (!result.success || !result.updates?.length) {
                    return;
                }

                for (const update of result.updates) {
                    offset = update.update_id + 1;

                    // ── Handle callback queries (inline button clicks) ──
                    if (update.callback_query) {
                        const cbq = update.callback_query;
                        const cbUsername = cbq.from?.username || '';

                        // Owner-only
                        if (cbUsername.toLowerCase() !== OWNER_USERNAME.toLowerCase()) {
                            await this.toolsManager.useTool('telegram', 'answerCallbackQuery', {
                                callbackQueryId: cbq.id, text: 'Unauthorized', showAlert: true
                            });
                            continue;
                        }

                        const [action, approvalId] = (cbq.data || '').split(':');
                        if (action === 'approve' && approvalId) {
                            const ok = await this.approvalManager.approveTransaction(approvalId);
                            await this.toolsManager.useTool('telegram', 'answerCallbackQuery', {
                                callbackQueryId: cbq.id,
                                text: ok ? '✅ Approved' : '❌ Failed (expired?)'
                            });
                            if (cbq.message) {
                                await this.toolsManager.useTool('telegram', 'editMessageText', {
                                    chatId: cbq.message.chat.id,
                                    messageId: cbq.message.message_id,
                                    text: cbq.message.text + '\n\n✅ APPROVED by @' + cbUsername
                                });
                            }
                        } else if (action === 'reject' && approvalId) {
                            const ok = await this.approvalManager.rejectTransaction(approvalId);
                            await this.toolsManager.useTool('telegram', 'answerCallbackQuery', {
                                callbackQueryId: cbq.id,
                                text: ok ? '🚫 Rejected' : '❌ Failed (expired?)'
                            });
                            if (cbq.message) {
                                await this.toolsManager.useTool('telegram', 'editMessageText', {
                                    chatId: cbq.message.chat.id,
                                    messageId: cbq.message.message_id,
                                    text: cbq.message.text + '\n\n🚫 REJECTED by @' + cbUsername
                                });
                            }
                        }
                        continue;
                    }

                    // ── Handle regular messages ──
                    const msg = update.message;
                    if (!msg?.text) continue;

                    // Skip bot's own messages
                    if (msg.from?.is_bot) continue;

                    const userId = msg.from?.id;
                    const username = msg.from?.username || msg.from?.first_name || 'anon';
                    const chatId = msg.chat.id;
                    const text = msg.text;
                    const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup';

                    // Owner-only: ignore messages from anyone except the owner
                    if (username.toLowerCase() !== OWNER_USERNAME.toLowerCase()) {
                        console.log(`🚫 TG ignored non-owner: @${username} (id:${userId})`);
                        continue;
                    }

                    // Learn owner's chat ID for approval notifications
                    this.approvalManager.setOwnerChatId(chatId);

                    // In groups, only respond to mentions or replies to the bot
                    if (isGroup) {
                        const mentioned = text.toLowerCase().includes(`@${botUsername.toLowerCase()}`);
                        const repliedToBot = msg.reply_to_message?.from?.is_bot;
                        if (!mentioned && !repliedToBot) continue;
                    }

                    console.log(`📨 TG [${msg.chat.title || 'DM'}] @${username} (id:${userId}): ${text.substring(0, 100)}`);

                    // Emit inbound event for agentic loop / event bus
                    this.eventBus.publish('message:inbound', {
                        source: 'telegram', username, chatId, text: text.substring(0, 200),
                    });

                    // ── Commands ──

                    if (text === '/start') {
                        await this.toolsManager.useTool('telegram', 'sendMessage', {
                            chatId,
                            text: `yo, papibot online. what you need?\n\nOnchain:\n/balance — wallet balances\n/send <amt> <token> <addr> — transfer\n/swap <amt> <in> <out> — swap\n/deploy <template> [params] — deploy contract\n/templates — list available templates\n\nWorkspace:\n/ls [path] — list files\n/cat <path> — read a file\n/write <path> — write (next msg = content)\n\nApprovals:\n/pending — pending txns\n/approve <id> — approve\n/reject <id> — reject\n\nSub-Agents:\n/agents — list active sub-agents\n/spawn <role> — spawn a sub-agent\n/kill <id> — stop a sub-agent\n/task <id> <json> — send task\n\nBrowser:\n/browse <url> — browse + summarize a page\n\nThinking:\n/think:<level> — set thinking level (off/minimal/low/medium/high/xhigh)\n\nOr just talk to me naturally.`
                        });
                        continue;
                    }

                    // ── Onchain commands (deterministic, no LLM) ──

                    if (text === '/balance' || text === '/balance@' + botUsername) {
                        await this.handleBalanceCommand(chatId);
                        continue;
                    }

                    if (text.startsWith('/send ')) {
                        await this.handleSendCommand(chatId, text);
                        continue;
                    }

                    if (text.startsWith('/swap ')) {
                        await this.handleSwapCommand(chatId, text);
                        continue;
                    }

                    if (text === '/deploy' || text.startsWith('/deploy ')) {
                        await this.handleDeployCommand(chatId, text);
                        continue;
                    }

                    if (text === '/templates') {
                        await this.handleTemplatesCommand(chatId);
                        continue;
                    }

                    // ── Workspace commands (sandboxed filesystem) ──

                    if (text === '/ls' || text.startsWith('/ls ')) {
                        const subPath = text.slice(3).trim() || '.';
                        await this.handleWorkspaceLs(chatId, subPath);
                        continue;
                    }

                    if (text.startsWith('/cat ')) {
                        const filePath = text.slice(5).trim();
                        await this.handleWorkspaceCat(chatId, filePath);
                        continue;
                    }

                    if (text.startsWith('/write ')) {
                        const filePath = text.slice(7).trim();
                        if (!filePath) {
                            await this.toolsManager.useTool('telegram', 'sendMessage', {
                                chatId, text: 'Usage: /write <path>\nThen send the file content as the next message.'
                            });
                        } else {
                            // Store pending write — next message from owner becomes the content
                            this._pendingWrite = { chatId, filePath };
                            await this.toolsManager.useTool('telegram', 'sendMessage', {
                                chatId, text: `Ready to write to: workspace/${filePath}\nSend the file content now (next message will be written).`
                            });
                        }
                        continue;
                    }

                    // ── Check for pending /write — next message becomes file content ──
                    if (this._pendingWrite && this._pendingWrite.chatId === chatId) {
                        const pw = this._pendingWrite;
                        this._pendingWrite = null;
                        await this.handleWorkspaceWrite(chatId, pw.filePath, text);
                        continue;
                    }

                    if (text === '/pending' || text === '/pending@' + botUsername) {
                        const pending = this.approvalManager.getPendingTransactions();
                        if (pending.length === 0) {
                            await this.toolsManager.useTool('telegram', 'sendMessage', {
                                chatId, text: 'No pending transactions.'
                            });
                        } else {
                            const list = pending.map((tx, i) =>
                                `${i + 1}. ${tx.operation} — ${tx.value} ETH\n   To: ${tx.to.slice(0, 14)}...\n   ID: ${tx.id} (${tx.expiresIn}m left)`
                            ).join('\n\n');
                            await this.toolsManager.useTool('telegram', 'sendMessage', {
                                chatId, text: `Pending transactions:\n\n${list}`
                            });
                        }
                        continue;
                    }

                    if (text.startsWith('/approve ')) {
                        const aid = text.split(' ')[1]?.trim();
                        if (!aid) { continue; }
                        const ok = await this.approvalManager.approveTransaction(aid);
                        await this.toolsManager.useTool('telegram', 'sendMessage', {
                            chatId, text: ok ? `✅ Transaction ${aid} approved` : `❌ Failed — invalid ID or expired`
                        });
                        continue;
                    }

                    if (text.startsWith('/reject ')) {
                        const aid = text.split(' ')[1]?.trim();
                        if (!aid) { continue; }
                        const ok = await this.approvalManager.rejectTransaction(aid);
                        await this.toolsManager.useTool('telegram', 'sendMessage', {
                            chatId, text: ok ? `🚫 Transaction ${aid} rejected` : `❌ Failed — invalid ID or expired`
                        });
                        continue;
                    }

                    // ── Sub-agent commands ──

                    if (text === '/agents' || text === '/agents@' + botUsername) {
                        const agents = this.subAgentManager.getActiveAgents();
                        if (agents.length === 0) {
                            await this.toolsManager.useTool('telegram', 'sendMessage', {
                                chatId, text: 'No active sub-agents.\n\nSpawn one with /spawn <role>\nRoles: ' + SubAgentManager.getRoles().map(r => r.role).join(', ')
                            });
                        } else {
                            const list = agents.map(a =>
                                `🤖 ${a.agentId}\n   Role: ${a.role} | Status: ${a.status}\n   Uptime: ${a.uptime}s | Tasks: ${a.taskCount}`
                            ).join('\n\n');
                            await this.toolsManager.useTool('telegram', 'sendMessage', {
                                chatId, text: `Active sub-agents:\n\n${list}`
                            });
                        }
                        continue;
                    }

                    if (text.startsWith('/spawn ')) {
                        const role = text.split(' ')[1]?.trim();
                        if (!role) {
                            await this.toolsManager.useTool('telegram', 'sendMessage', {
                                chatId, text: 'Usage: /spawn <role>\nRoles: ' + SubAgentManager.getRoles().map(r => `${r.role} — ${r.description}`).join('\n')
                            });
                            continue;
                        }
                        try {
                            this.subAgentManager.secretsClient = this.secretsClient;
                            const { agentId } = await this.subAgentManager.spawnAgent(role);
                            await this.toolsManager.useTool('telegram', 'sendMessage', {
                                chatId, text: `🤖 Spawned sub-agent: ${agentId}\nRole: ${role}\n\nSend tasks with /task ${agentId} <json>`
                            });
                        } catch (err) {
                            await this.toolsManager.useTool('telegram', 'sendMessage', {
                                chatId, text: `Failed to spawn: ${err.message}`
                            });
                        }
                        continue;
                    }

                    if (text.startsWith('/kill ')) {
                        const agentId = text.split(' ')[1]?.trim();
                        if (!agentId) { continue; }
                        const ok = await this.subAgentManager.stopAgent(agentId);
                        await this.toolsManager.useTool('telegram', 'sendMessage', {
                            chatId, text: ok ? `🔪 Stopping sub-agent ${agentId}` : `❌ Agent not found: ${agentId}`
                        });
                        continue;
                    }

                    if (text.startsWith('/task ')) {
                        const parts = text.split(' ');
                        const agentId = parts[1]?.trim();
                        const taskJson = parts.slice(2).join(' ').trim();
                        if (!agentId || !taskJson) {
                            await this.toolsManager.useTool('telegram', 'sendMessage', {
                                chatId, text: 'Usage: /task <agentId> <json>\nExample: /task research_abc123 {"type":"ping"}'
                            });
                            continue;
                        }
                        try {
                            const task = JSON.parse(taskJson);
                            await this.toolsManager.useTool('telegram', 'sendMessage', {
                                chatId, text: `📤 Sending task to ${agentId}...`
                            });
                            const result = await this.subAgentManager.sendTask(agentId, task);
                            const resultStr = JSON.stringify(result, null, 2);
                            const truncated = resultStr.length > 3500 ? resultStr.substring(0, 3500) + '...' : resultStr;
                            await this.toolsManager.useTool('telegram', 'sendMessage', {
                                chatId, text: `📥 Result from ${agentId}:\n\n${truncated}`
                            });
                        } catch (err) {
                            await this.toolsManager.useTool('telegram', 'sendMessage', {
                                chatId, text: `Task failed: ${err.message}`
                            });
                        }
                        continue;
                    }

                    // ── Thinking level command ──
                    const thinkMatch = thinkingLevels.parseCommand(text);
                    if (thinkMatch) {
                        this._sessionThinkingLevel = thinkMatch;
                        this.agenticLoop.setThinkingLevel(thinkMatch);
                        await this.toolsManager.useTool('telegram', 'sendMessage', {
                            chatId,
                            text: `Thinking level set to: ${thinkMatch}\n${thinkingLevels.getParams(thinkMatch).description}`
                        });
                        continue;
                    }

                    // ── Browse command ──
                    if (text.startsWith('/browse ')) {
                        const browseUrl = text.slice(8).trim();
                        if (!browseUrl) {
                            await this.toolsManager.useTool('telegram', 'sendMessage', {
                                chatId, text: 'Usage: /browse <url>'
                            });
                            continue;
                        }
                        try {
                            await this.toolsManager.useTool('telegram', 'sendMessage', {
                                chatId, text: `Browsing ${browseUrl}...`
                            });
                            const navResult = await this.browserAgent.navigate(browseUrl);
                            const extracted = await this.browserAgent.extract(
                                'Summarize the main content of this page concisely',
                                navResult.pageId
                            );
                            const summary = typeof extracted.data === 'string'
                                ? extracted.data
                                : JSON.stringify(extracted.data, null, 2);
                            const truncated = summary.length > 3500
                                ? summary.substring(0, 3500) + '...'
                                : summary;
                            await this.toolsManager.useTool('telegram', 'sendMessage', {
                                chatId,
                                text: `${navResult.title}\n${navResult.url}\n\n${truncated}`
                            });
                        } catch (err) {
                            await this.toolsManager.useTool('telegram', 'sendMessage', {
                                chatId, text: `Browse failed: ${err.message}`
                            });
                        }
                        continue;
                    }

                    try {
                        // Strip bot mention from text
                        const cleanText = text.replace(new RegExp(`@${botUsername}`, 'gi'), '').trim() || text;

                        // ── Try to detect onchain intent from natural language ──
                        // LLM only extracts structured intent — all params validated by code
                        if (this.agent.onchainAgent) {
                            const intent = await this.detectOnchainIntent(cleanText);
                            if (intent) {
                                console.log(`🧠 Detected onchain intent: ${JSON.stringify(intent)}`);
                                const handled = await this.executeOnchainIntent(chatId, intent);
                                if (handled) continue;
                            }
                        }

                        // Detect URLs and fetch their content in parallel (via NetworkSafety)
                        let fetchedContent = '';
                        const urlRegex = /https?:\/\/[^\s]+/gi;
                        const urls = cleanText.match(urlRegex);
                        if (urls && urls.length > 0) {
                            const urlsToFetch = urls.slice(0, 3); // max 3 URLs
                            urlsToFetch.forEach(u => console.log(`🌐 TG fetching (safe): ${u}`));
                            const results = await Promise.allSettled(
                                urlsToFetch.map(url => this.networkSafety.safeFetch(url))
                            );
                            for (let i = 0; i < results.length; i++) {
                                const url = urlsToFetch[i];
                                const outcome = results[i];
                                if (outcome.status === 'rejected') {
                                    fetchedContent += `\n\n--- Failed ${url}: ${outcome.reason?.message || 'Unknown error'} ---`;
                                    console.log(`❌ TG fetch failed ${url}: ${outcome.reason?.message}`);
                                } else if (!outcome.value.safe) {
                                    fetchedContent += `\n\n--- Blocked ${url}: ${outcome.value.reason} ---`;
                                    console.log(`🛡️ TG fetch blocked ${url}: ${outcome.value.reason}`);
                                } else {
                                    fetchedContent += `\n\n--- Fetched ${url} (HTTP ${outcome.value.status}) ---\n${outcome.value.content}`;
                                    console.log(`✅ TG fetched ${url} (${outcome.value.status}, ${outcome.value.originalLength} bytes → ${outcome.value.content.length} cleaned)`);
                                }
                            }
                        }

                        // Keep conversation history (last 10 exchanges)
                        this.tgConversationHistory.push({ role: 'user', content: cleanText });
                        if (this.tgConversationHistory.length > 20) {
                            this.tgConversationHistory = this.tgConversationHistory.slice(-20);
                        }

                        // Build a proper conversational prompt
                        const conversationPrompt = `You are papibot, a crypto-native AI assistant running as a Telegram bot. You talk casually but give real, accurate answers. You are NOT posting on social media right now — you are having a private conversation on Telegram.

IMPORTANT RULES:
- Reply with ONE clear response only. Do NOT add extra thoughts, hot takes, or social media style posts after your answer.
- Do NOT generate Farcaster-style content. This is a Telegram DM conversation.
- Be helpful and direct. Answer the actual question asked.
- You CAN fetch URLs and access the internet. If the user shared a URL, the fetched content is included below.

Your capabilities:
- Farcaster autonomous posting & engagement
- DeFi operations (swaps, liquidity, portfolio tracking on Base chain)
- Moltbook social engagement
- Token research & market analysis
- Smart contract deployment (ERC-20, ERC-721, Escrow) via onchain agent
- Scam detection & anti-clanker protection
- Skills-as-a-Service via x402 protocol on clanknet.ai
- Fetching URLs / web content
- WORKSPACE: You have a sandboxed filesystem at workspace/. You can read, write, and list files there.
  To write code/files, output a FILE_WRITE block. The system will save it to your workspace.

FILE WRITING: When the user asks you to create/write/build files, output ONE file at a time using this EXACT format:
===FILE_WRITE: path/to/file.ext===
file content here
===END_FILE===

Example:
===FILE_WRITE: contracts/MyToken.sol===
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;
contract MyToken { ... }
===END_FILE===

The system will automatically save it to workspace/path/to/file.ext.
Only use paths relative to workspace/. No ../ allowed.
You can write multiple files in one response by using multiple FILE_WRITE blocks.

Key info:
- CLANKNET token: 0x623693BefAECf61484e344fa272e9A8B82d9BB07 (Base)
- Wallet: 0xB84649C1e32ED82CC380cE72DF6DF540b303839F
- Website: clanknet.ai
- Owner: m00npapi (Telegram ID: ${userId})
- You can only respond to your owner in Telegram (locked down)
${fetchedContent ? `\nFetched web content:\n${fetchedContent}` : ''}

Recent conversation:
${this.tgConversationHistory.map(m => `${m.role === 'user' ? 'User' : 'You'}: ${m.content}`).join('\n')}

Respond with a single, helpful message. No extra commentary or social posts.`;

                        const reply = await this.agent.llm.generateContent(conversationPrompt, {
                            username: this.config.username,
                            mode: 'chat',
                            maxTokens: 2000,
                            temperature: 0.7,
                            thinkingLevel: this._sessionThinkingLevel,
                        });

                        let replyText = reply.content?.trim();

                        if (replyText) {
                            // ── Extract and save FILE_WRITE blocks ──
                            const fileWriteRegex = /===FILE_WRITE:\s*(.+?)===\n([\s\S]*?)===END_FILE===/g;
                            let match;
                            const writtenFiles = [];

                            while ((match = fileWriteRegex.exec(replyText)) !== null) {
                                const filePath = match[1].trim();
                                const fileContent = match[2];
                                await this.handleLLMWorkspaceWrite(chatId, filePath, fileContent);
                                writtenFiles.push(filePath);
                            }

                            // Strip FILE_WRITE blocks from the chat message
                            if (writtenFiles.length > 0) {
                                replyText = replyText.replace(fileWriteRegex, '').trim();
                                if (!replyText) {
                                    replyText = `✅ Wrote ${writtenFiles.length} file(s):\n${writtenFiles.map(f => `  📄 workspace/${f}`).join('\n')}`;
                                }
                            }

                            // Track assistant reply in history
                            this.tgConversationHistory.push({ role: 'assistant', content: replyText });

                            await this.toolsManager.useTool('telegram', 'sendMessage', {
                                chatId,
                                text: replyText
                            });
                            console.log(`✈️ TG reply sent to @${username}`);
                        }
                    } catch (err) {
                        console.error(`❌ TG reply failed:`, err.message);
                        try {
                            await this.toolsManager.useTool('telegram', 'sendMessage', {
                                chatId,
                                text: 'something broke, gimme a sec...'
                            });
                        } catch (_) {}
                    }
                }
            } catch (err) {
                console.error('❌ TG poll error:', err.message);
                await new Promise(r => setTimeout(r, 5000)); // backoff on error
            } finally {
                polling = false;
                setTimeout(poll, 500);
            }
        };

        // Start polling
        poll();
    }

    // ── Known token registry (deterministic — LLM never picks these) ──
    static KNOWN_TOKENS = {
        'ETH':      { address: null, decimals: 18, symbol: 'ETH' },
        'WETH':     { address: '0x4200000000000000000000000000000000000006', decimals: 18, symbol: 'WETH' },
        'USDC':     { address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', decimals: 6, symbol: 'USDC' },
        'CLANKNET': { address: '0x623693BefAECf61484e344fa272e9A8B82d9BB07', decimals: 18, symbol: 'CLANKNET' },
    };

    /**
     * /balance — show wallet balances (read-only, no LLM)
     */
    async handleBalanceCommand(chatId) {
        const tg = (text) => this.toolsManager.useTool('telegram', 'sendMessage', { chatId, text });

        if (!this.agent.onchainAgent?.wallet) {
            return tg('Wallet not initialized.');
        }

        try {
            await tg('Fetching balances...');
            const oca = this.agent.onchainAgent;
            const address = await oca.wallet.getAddress();
            const ethBal = await oca.provider.getBalance(address);
            const ethFormatted = require('ethers').utils.formatEther(ethBal);

            let msg = `Wallet: ${address}\n\nETH: ${parseFloat(ethFormatted).toFixed(6)}`;

            // Check known ERC-20 balances
            for (const [sym, token] of Object.entries(AgentRunner.KNOWN_TOKENS)) {
                if (!token.address) continue; // skip native ETH
                try {
                    const info = await oca.getTokenBalance(token.address);
                    msg += `\n${sym}: ${parseFloat(info.balance).toFixed(4)}`;
                } catch { /* token not held or RPC issue */ }
            }

            await tg(msg);
        } catch (err) {
            console.error('❌ Balance check failed:', err.message);
            await tg(`Balance check failed: ${err.message}`);
        }
    }

    /**
     * /send <amount> <token> <address> — deterministic param extraction, no LLM
     */
    async handleSendCommand(chatId, text) {
        const tg = (msg) => this.toolsManager.useTool('telegram', 'sendMessage', { chatId, text: msg });

        if (!this.agent.onchainAgent?.wallet) {
            return tg('Wallet not initialized.');
        }

        // Parse: /send 0.01 ETH 0x1234...
        const parts = text.split(/\s+/);
        if (parts.length < 4) {
            return tg('Usage: /send <amount> <ETH|USDC|CLANKNET> <address>\nExample: /send 0.01 ETH 0xB84649...');
        }

        const amountStr = parts[1];
        const tokenSym = parts[2].toUpperCase();
        const toAddress = parts[3];

        // ── Validate amount (deterministic) ──
        const amount = parseFloat(amountStr);
        if (isNaN(amount) || amount <= 0) {
            return tg(`Invalid amount: "${amountStr}". Must be a positive number.`);
        }

        // ── Validate token (deterministic lookup) ──
        const token = AgentRunner.KNOWN_TOKENS[tokenSym];
        if (!token) {
            const supported = Object.keys(AgentRunner.KNOWN_TOKENS).join(', ');
            return tg(`Unknown token: "${tokenSym}". Supported: ${supported}`);
        }

        // ── Validate address (deterministic regex) ──
        if (!/^0x[0-9a-fA-F]{40}$/.test(toAddress)) {
            return tg(`Invalid address: "${toAddress}". Must be a 0x-prefixed 40-hex-char address.`);
        }

        // ── Execute (goes through approval gate) ──
        try {
            await tg(`Preparing: send ${amountStr} ${tokenSym} to ${toAddress}\nThis will go through the approval flow...`);

            if (tokenSym === 'ETH') {
                const receipt = await this.agent.onchainAgent.sendETH(toAddress, amount);
                await tg(`✅ Sent ${amountStr} ETH to ${toAddress}\nTx: ${receipt.transactionHash}`);
            } else {
                const receipt = await this.agent.onchainAgent.transferToken(token.address, toAddress, amount);
                await tg(`✅ Sent ${amountStr} ${tokenSym} to ${toAddress}\nTx: ${receipt.transactionHash}`);
            }
        } catch (err) {
            console.error(`❌ Send failed:`, err.message);
            await tg(`Send failed: ${err.message}`);
        }
    }

    /**
     * /swap <amount> <tokenIn> <tokenOut> — deterministic param extraction, no LLM
     */
    async handleSwapCommand(chatId, text) {
        const tg = (msg) => this.toolsManager.useTool('telegram', 'sendMessage', { chatId, text: msg });

        if (!this.agent.onchainAgent?.wallet) {
            return tg('Wallet not initialized.');
        }

        // Parse: /swap 100 USDC ETH
        const parts = text.split(/\s+/);
        if (parts.length < 4) {
            return tg('Usage: /swap <amount> <tokenIn> <tokenOut>\nExample: /swap 100 USDC ETH');
        }

        const amountStr = parts[1];
        const tokenInSym = parts[2].toUpperCase();
        const tokenOutSym = parts[3].toUpperCase();

        const amount = parseFloat(amountStr);
        if (isNaN(amount) || amount <= 0) {
            return tg(`Invalid amount: "${amountStr}".`);
        }

        const tokenIn = AgentRunner.KNOWN_TOKENS[tokenInSym];
        const tokenOut = AgentRunner.KNOWN_TOKENS[tokenOutSym];
        if (!tokenIn || !tokenOut) {
            const supported = Object.keys(AgentRunner.KNOWN_TOKENS).join(', ');
            return tg(`Unknown token. Supported: ${supported}`);
        }

        if (tokenInSym === tokenOutSym) {
            return tg(`Can't swap ${tokenInSym} for itself.`);
        }

        // Resolve addresses (ETH → WETH for Uniswap)
        const inAddr = tokenIn.address || AgentRunner.KNOWN_TOKENS['WETH'].address;
        const outAddr = tokenOut.address || AgentRunner.KNOWN_TOKENS['WETH'].address;

        try {
            const ethers = require('ethers');
            const amountWei = ethers.utils.parseUnits(amountStr, tokenIn.decimals);

            await tg(`Preparing: swap ${amountStr} ${tokenInSym} → ${tokenOutSym}\nThis will go through the approval flow...`);
            const receipt = await this.agent.onchainAgent.swapTokens(inAddr, outAddr, amountWei, 200);
            await tg(`✅ Swapped ${amountStr} ${tokenInSym} → ${tokenOutSym}\nTx: ${receipt.transactionHash}`);
        } catch (err) {
            console.error(`❌ Swap failed:`, err.message);
            await tg(`Swap failed: ${err.message}`);
        }
    }

    async handleTemplatesCommand(chatId) {
        const tg = (msg) => this.toolsManager.useTool('telegram', 'sendMessage', { chatId, text: msg });

        if (!this.agent.contractDeployer) {
            return tg('Contract deployer not available.');
        }

        const templates = this.agent.contractDeployer.getAvailableTemplates();
        if (templates.length === 0) {
            return tg('No templates available.');
        }

        const lines = templates.map(t => {
            const params = t.params.map(p => p.name).join(', ');
            return `• ${t.name} — ${t.description}\n  Params: ${params || 'none'}`;
        });

        await tg(`Available contract templates:\n\n${lines.join('\n\n')}\n\nDeploy: /deploy <template> <params as JSON>`);
    }

    async handleDeployCommand(chatId, text) {
        const tg = (msg) => this.toolsManager.useTool('telegram', 'sendMessage', { chatId, text: msg });

        if (!this.agent.contractDeployer) {
            return tg('Contract deployer not available (wallet not initialized).');
        }

        // Parse: /deploy <template> [JSON params]
        const match = text.match(/^\/deploy\s+(\S+)\s*(.*)?$/s);
        if (!match) {
            return tg('Usage: /deploy <template> [params as JSON]\n\nExamples:\n/deploy skills-registry\n/deploy erc20 {"name":"Moon","symbol":"MOON","initialSupply":"1000000"}\n\nSee /templates for available templates.');
        }

        const templateName = match[1].toLowerCase();
        let params = {};

        // Parse params — either JSON or key=value pairs
        const rawParams = (match[2] || '').trim();
        if (rawParams) {
            try {
                params = JSON.parse(rawParams);
            } catch {
                return tg(`Invalid params JSON: ${rawParams}\n\nMust be valid JSON like: {"key":"value"}`);
            }
        }

        // Skills-registry defaults: use CLANKNET token + sender's wallet as governor
        if (templateName === 'skills-registry') {
            if (!params.clanknetToken) {
                params.clanknetToken = '0x623693BefAECf61484e344fa272e9A8B82d9BB07'; // CLANKNET
            }
            if (!params.governor) {
                const wallet = this.agent.onchainAgent?.wallet;
                if (!wallet) {
                    return tg('Cannot determine governor address — wallet not initialized.');
                }
                // ProxySigner uses async getAddress(), ethers.Wallet has sync .address
                params.governor = wallet.address || await wallet.getAddress();
            }
        }

        // Confirm before deploying
        const available = this.agent.contractDeployer.getAvailableTemplates();
        const template = available.find(t => t.name === templateName);
        if (!template) {
            return tg(`Template "${templateName}" not found.\n\nAvailable: ${available.map(t => t.name).join(', ')}`);
        }

        await tg(`Deploying ${templateName}...\nParams: ${JSON.stringify(params, null, 2)}\n\nThis will go through the approval flow.`);

        try {
            const result = await this.agent.contractDeployer.deployFromTemplate(templateName, params);
            await tg(`✅ Contract deployed!\n\nTemplate: ${templateName}\nAddress: ${result.address}\nTx: ${result.txHash}\n\nView: https://basescan.org/address/${result.address}`);
        } catch (err) {
            console.error(`❌ Deploy failed:`, err.message);
            await tg(`Deploy failed: ${err.message}`);
        }
    }

    /**
     * LLM intent detection — extracts STRUCTURED intent from natural language.
     *
     * SECURITY: The LLM only classifies intent and extracts what the user literally said.
     * It NEVER constructs addresses, amounts, or contract parameters.
     * All extracted values are validated by deterministic code before execution.
     */
    async detectOnchainIntent(text) {
        // Quick heuristic check — skip LLM if no onchain-related keywords
        const onchainKeywords = /\b(send|transfer|swap|trade|buy|sell|balance|portfolio|wallet|deploy|contract)\b/i;
        if (!onchainKeywords.test(text)) return null;

        try {
            const intentPrompt = `You are a STRICT intent classifier. Given the user's message, extract the intent as JSON.

RULES:
- ONLY extract values the user EXPLICITLY stated. Never infer, guess, or fill in missing values.
- If the user didn't specify an amount, set amount to null.
- If the user didn't specify an address, set address to null.
- Token symbols must be one of: ETH, USDC, CLANKNET, WETH. If unknown, set to null.
- If this is NOT a transaction request, return {"intent":"none"}

Output ONLY valid JSON, nothing else.

Examples:
User: "send 0.01 ETH to 0xB84649C1e32ED82CC380cE72DF6DF540b303839F"
{"intent":"send","amount":"0.01","token":"ETH","to":"0xB84649C1e32ED82CC380cE72DF6DF540b303839F"}

User: "swap 100 USDC for ETH"
{"intent":"swap","amount":"100","tokenIn":"USDC","tokenOut":"ETH"}

User: "check my balance"
{"intent":"balance"}

User: "how's the weather?"
{"intent":"none"}

User: "send some ETH somewhere"
{"intent":"send","amount":null,"token":"ETH","to":null}

User: "deploy the skills registry contract"
{"intent":"deploy","template":"skills-registry"}

User: "deploy an ERC-20 token called Moon with symbol MOON and 1000000 supply"
{"intent":"deploy","template":"erc20","params":{"name":"Moon","symbol":"MOON","initialSupply":"1000000"}}

User message: "${text.replace(/"/g, '\\"').substring(0, 200)}"`;

            const result = await this.agent.llm.generateContent(intentPrompt, {
                username: this.config.username,
                mode: 'chat',
                maxTokens: 150,
                temperature: 0
            });

            const raw = result.content?.trim();
            // Extract JSON from response (handle markdown code blocks)
            const jsonMatch = raw.match(/\{[\s\S]*\}/);
            if (!jsonMatch) return null;

            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.intent === 'none') return null;
            return parsed;
        } catch {
            return null; // LLM failed — fall through to normal chat
        }
    }

    /**
     * Execute a detected onchain intent — ALL params validated by code, not LLM.
     * Returns true if handled, false if not.
     */
    async executeOnchainIntent(chatId, intent) {
        const tg = (msg) => this.toolsManager.useTool('telegram', 'sendMessage', { chatId, text: msg });

        if (!intent || !intent.intent) return false;

        switch (intent.intent) {
            case 'balance':
                await this.handleBalanceCommand(chatId);
                return true;

            case 'send': {
                // Validate every param with code — reject if anything is missing or invalid
                if (!intent.amount || !intent.token || !intent.to) {
                    const missing = [];
                    if (!intent.amount) missing.push('amount');
                    if (!intent.token) missing.push('token (ETH, USDC, CLANKNET)');
                    if (!intent.to) missing.push('address');
                    await tg(`I need more info to send. Missing: ${missing.join(', ')}\n\nUse: /send <amount> <token> <address>`);
                    return true;
                }

                // Re-validate through the deterministic command handler
                await this.handleSendCommand(chatId, `/send ${intent.amount} ${intent.token} ${intent.to}`);
                return true;
            }

            case 'swap': {
                if (!intent.amount || !intent.tokenIn || !intent.tokenOut) {
                    const missing = [];
                    if (!intent.amount) missing.push('amount');
                    if (!intent.tokenIn) missing.push('token to sell');
                    if (!intent.tokenOut) missing.push('token to buy');
                    await tg(`I need more info to swap. Missing: ${missing.join(', ')}\n\nUse: /swap <amount> <tokenIn> <tokenOut>`);
                    return true;
                }

                await this.handleSwapCommand(chatId, `/swap ${intent.amount} ${intent.tokenIn} ${intent.tokenOut}`);
                return true;
            }

            case 'deploy': {
                if (!intent.template) {
                    await tg(`Which template? Use: /deploy <template> [params as JSON]\n\nAvailable: /templates`);
                    return true;
                }
                const paramsStr = intent.params ? JSON.stringify(intent.params) : '';
                await this.handleDeployCommand(chatId, `/deploy ${intent.template} ${paramsStr}`);
                return true;
            }

            default:
                return false;
        }
    }

    // ── Sandboxed workspace filesystem ──
    // All paths are jailed to WORKSPACE_DIR. No path traversal, no escapes.

    static WORKSPACE_DIR = path.join(__dirname, '..', 'workspace');

    /**
     * Resolve and validate a workspace path. Returns null if path escapes sandbox.
     */
    resolveWorkspacePath(relPath) {
        // Normalize and resolve to absolute
        const resolved = path.resolve(AgentRunner.WORKSPACE_DIR, relPath);
        // Must be within workspace dir (no ../ escapes)
        if (!resolved.startsWith(path.resolve(AgentRunner.WORKSPACE_DIR))) {
            return null;
        }
        return resolved;
    }

    /**
     * /ls [path] — list files in workspace
     */
    async handleWorkspaceLs(chatId, subPath) {
        const tg = (msg) => this.toolsManager.useTool('telegram', 'sendMessage', { chatId, text: msg });
        const resolved = this.resolveWorkspacePath(subPath);

        if (!resolved) return tg('Path escapes workspace sandbox.');

        try {
            const fsStat = await fs.stat(resolved).catch(() => null);
            if (!fsStat || !fsStat.isDirectory()) {
                return tg(`Not a directory: workspace/${subPath}`);
            }

            const entries = await fs.readdir(resolved, { withFileTypes: true });
            if (entries.length === 0) {
                return tg(`workspace/${subPath} is empty.`);
            }

            const list = entries.map(e => {
                const icon = e.isDirectory() ? '📁' : '📄';
                return `${icon} ${e.name}`;
            }).join('\n');

            await tg(`workspace/${subPath === '.' ? '' : subPath}\n\n${list}`);
        } catch (err) {
            await tg(`Error listing: ${err.message}`);
        }
    }

    /**
     * /cat <path> — read a file from workspace
     */
    async handleWorkspaceCat(chatId, relPath) {
        const tg = (msg) => this.toolsManager.useTool('telegram', 'sendMessage', { chatId, text: msg });

        if (!relPath) return tg('Usage: /cat <path>');

        const resolved = this.resolveWorkspacePath(relPath);
        if (!resolved) return tg('Path escapes workspace sandbox.');

        try {
            const content = await fs.readFile(resolved, 'utf8');
            const truncated = content.length > 3500
                ? content.substring(0, 3500) + `\n\n... (truncated, ${content.length} bytes total)`
                : content;
            await tg(`📄 workspace/${relPath}\n\n${truncated}`);
        } catch (err) {
            if (err.code === 'ENOENT') return tg(`File not found: workspace/${relPath}`);
            await tg(`Error reading: ${err.message}`);
        }
    }

    /**
     * Write a file to workspace (deterministic — path validated, content from user)
     */
    async handleWorkspaceWrite(chatId, relPath, content) {
        const tg = (msg) => this.toolsManager.useTool('telegram', 'sendMessage', { chatId, text: msg });

        const resolved = this.resolveWorkspacePath(relPath);
        if (!resolved) return tg('Path escapes workspace sandbox.');

        // Size limit: 50KB per file
        if (content.length > 50000) {
            return tg(`File too large (${content.length} bytes). Max 50KB.`);
        }

        try {
            // Create parent directories if needed
            await fs.mkdir(path.dirname(resolved), { recursive: true });
            await fs.writeFile(resolved, content, 'utf8');
            await tg(`✅ Written ${content.length} bytes to workspace/${relPath}`);
            console.log(`📝 Workspace write: ${relPath} (${content.length} bytes)`);
        } catch (err) {
            await tg(`Error writing: ${err.message}`);
        }
    }

    /**
     * LLM-driven workspace write — bot generates code and writes to workspace.
     * The LLM outputs file content, deterministic code validates path and writes it.
     */
    async handleLLMWorkspaceWrite(chatId, filePath, generatedContent) {
        const tg = (msg) => this.toolsManager.useTool('telegram', 'sendMessage', { chatId, text: msg });

        const resolved = this.resolveWorkspacePath(filePath);
        if (!resolved) return tg('Path escapes workspace sandbox.');

        if (generatedContent.length > 50000) {
            return tg(`Generated file too large (${generatedContent.length} bytes). Max 50KB.`);
        }

        try {
            await fs.mkdir(path.dirname(resolved), { recursive: true });
            await fs.writeFile(resolved, generatedContent, 'utf8');
            await tg(`✅ Generated and saved: workspace/${filePath} (${generatedContent.length} bytes)`);
            console.log(`🤖 LLM workspace write: ${filePath} (${generatedContent.length} bytes)`);
        } catch (err) {
            await tg(`Error writing: ${err.message}`);
        }
    }

    async loadAgentProfile() {
        console.log('📊 Loading agent profile...');

        try {
            // Try to load saved profile
            await this.agent.loadProfile(path.join(process.cwd(), 'data', 'profile.json'));
            console.log('✅ Loaded saved profile');
        } catch (e) {
            // Fetch and analyze posts
            console.log('🔍 Fetching posts from Farcaster...');
            const posts = await this.fetchAllPosts();
            await this.agent.loadPosts(posts);
            await this.agent.saveProfile(path.join(process.cwd(), 'data', 'profile.json'));
            console.log(`✅ Analyzed ${posts.length} posts`);
        }

        // Load identity context for autonomous posting
        const fs = require('fs').promises;
        const identityFiles = {
            soul: '/Users/m00npapi/.openclaw/workspace/SOUL.md',
            identity: '/Users/m00npapi/.openclaw/workspace/IDENTITY.md',
            user: '/Users/m00npapi/.openclaw/workspace/USER.md'
        };

        this.agent.identityContext = '';

        for (const [type, filePath] of Object.entries(identityFiles)) {
            try {
                const content = await fs.readFile(filePath, 'utf8');
                this.agent.identityContext += `\n=== ${type.toUpperCase()} ===\n${content}\n`;
                console.log(`📄 Loaded ${type} identity for autonomous posts`);
            } catch (e) {
                console.log(`⚠️  ${type} identity file not found`);
            }
        }

        console.log('🧠 Identity context loaded for agent:', this.agent.identityContext ? 'Yes' : 'No');
    }

    async fetchAllPosts() {
        const allPosts = [];
        let cursor = null;
        let page = 1;

        while (true) {
            console.log(`   Fetching page ${page}...`);

            const url = new URL('https://api.neynar.com/v2/farcaster/feed/user/casts');
            url.searchParams.append('fid', this.config.fid);
            url.searchParams.append('limit', 150);
            if (cursor) url.searchParams.append('cursor', cursor);

            try {
                const response = await axios.get(url.toString(), {
                    headers: { 'x-api-key': this.config.apiKey }
                });

                const casts = response.data.casts || [];
                allPosts.push(...casts);

                if (!response.data.next?.cursor || casts.length === 0) {
                    break;
                }

                cursor = response.data.next.cursor;
                page++;

                // Limit to 10000 posts max
                if (allPosts.length >= 10000) break;

            } catch (error) {
                console.error('Error fetching posts:', error.message);
                break;
            }
        }

        return allPosts;
    }


    async registerAgent() {
        console.log('📝 Registering agent...');

        const soulHash = await this.registry.generateSoulHash(
            await this.fetchAllPosts()
        );

        const registrationData = {
            name: `${this.config.username}-agent`,
            fid: this.config.fid,
            username: this.config.username,
            token: 'NO_TOKEN', // Agents don't launch their own tokens yet
            github: `@${this.config.username}`,
            soulHash
        };

        await this.registry.registerSelf(registrationData);
    }

    startScheduler() {
        console.log('⏰ Starting post scheduler...');

        // Schedule next post with random interval
        this.scheduleNextPost();
    }

    scheduleNextPost() {
        // Random interval between 30 minutes and 3 hours
        const minMinutes = 30;
        const maxMinutes = 180;
        const randomMinutes = Math.floor(Math.random() * (maxMinutes - minMinutes + 1)) + minMinutes;

        console.log(`⏰ Next post in ${randomMinutes} minutes (${(randomMinutes/60).toFixed(1)} hours)`);

        // Schedule the next post
        setTimeout(async () => {
            await this.checkAndPost();
            // Schedule the next one after posting
            this.scheduleNextPost();
        }, randomMinutes * 60 * 1000);
    }

    async checkAndPost() {
        // Reset window if 4 hours passed
        if (Date.now() - this.windowStart > 4 * 60 * 60 * 1000) {
            this.postsThisWindow = 0;
            this.windowStart = Date.now();
        }

        // Check if we can post
        if (this.postsThisWindow >= this.config.postsPerWindow) {
            console.log('⏰ Rate limit reached for this window');
            return;
        }

        await this.createPost();
        this.postsThisWindow++;
    }

    async createPost() {
        try {
            // 25% chance to include news-based content, 75% authentic personality
            const useNewsContent = Math.random() < 0.25;
            let postText;

            if (useNewsContent) {
                try {
                    postText = await this.agent.generateNewsBasedPost();
                    console.log(`📰 Posting news-based content to Farcaster: ${postText}`);
                } catch (error) {
                    console.warn('News-based post generation failed, using regular post:', error.message);
                    postText = await this.agent.generatePost();
                    console.log(`📝 Posting to Farcaster: ${postText}`);
                }
            } else {
                postText = await this.agent.generatePost();
                console.log(`📝 Posting to Farcaster: ${postText}`);
            }

            const response = await axios.post(
                'https://api.neynar.com/v2/farcaster/cast',
                {
                    signer_uuid: this.config.signerUuid,
                    text: postText
                },
                {
                    headers: {
                        'x-api-key': this.config.apiKey,
                        'Content-Type': 'application/json'
                    }
                }
            );

            console.log('✅ Posted to Farcaster');

            // Save to recent posts
            await this.saveRecentPost({
                text: postText,
                hash: response.data.cast.hash,
                timestamp: new Date().toISOString(),
                platform: 'farcaster'
            });

            // Track post performance with Mirror System
            if (response.data?.cast && this.agent.trackPostPerformance) {
                await this.agent.trackPostPerformance({
                    hash: response.data.cast.hash,
                    text: postText,
                    timestamp: new Date().toISOString(),
                    platform: 'farcaster',
                    reactions: { likes_count: 0, recasts_count: 0 },
                    replies: { count: 0 }
                });
            }

        } catch (error) {
            console.error('❌ Failed to post to Farcaster:', error.message);
        }
    }

    async createMoltbookPost() {
        try {
            // 20% chance to include news-based content, 80% agent personality focused
            const useNewsContent = Math.random() < 0.20;
            let moltbookText;

            if (useNewsContent) {
                try {
                    moltbookText = await this.agent.generateNewsMoltbookPost();
                    console.log(`📰 Posting news-based content to Moltbook: ${moltbookText}`);
                } catch (error) {
                    console.warn('News-based Moltbook post generation failed, using regular post:', error.message);
                    moltbookText = await this.agent.generateMoltbookPost();
                    console.log(`📚 Posting to Moltbook: ${moltbookText}`);
                }
            } else {
                moltbookText = await this.agent.generateMoltbookPost();
                console.log(`📚 Posting to Moltbook: ${moltbookText}`);
            }

            const result = await this.toolsManager.useTool('moltbook', 'post', {
                content: moltbookText
            });

            if (result.success) {
                console.log('✅ Posted to Moltbook');

                // Save to recent posts
                await this.saveRecentPost({
                    text: moltbookText,
                    hash: result.id,
                    timestamp: new Date().toISOString(),
                    platform: 'moltbook',
                    url: result.url
                });
            } else {
                console.warn('⚠️  Moltbook post failed:', result.error);
            }

        } catch (error) {
            console.error('❌ Failed to post to Moltbook:', error.message);
        }
    }

    async saveRecentPost(post) {
        const recentFile = path.join(process.cwd(), 'data', 'recent_posts.json');
        let recent = [];

        try {
            recent = JSON.parse(await fs.readFile(recentFile, 'utf8'));
        } catch (e) {
            // File doesn't exist yet
        }

        recent.unshift(post);
        recent = recent.slice(0, 100); // Keep last 100

        await fs.writeFile(recentFile, JSON.stringify(recent, null, 2));
    }

    startWebhookServer() {
        const express = require('express');
        const app = express();

        app.use(express.json());

        app.post('/webhook', async (req, res) => {
            const event = req.body;

            if (event.type === 'cast.created') {
                await this.handleMention(event.data);
            }

            res.json({ status: 'ok' });
        });

        // API endpoints for website
        app.get('/api/recent-posts', async (req, res) => {
            try {
                const recent = JSON.parse(
                    await fs.readFile(
                        path.join(process.cwd(), 'data', 'recent_posts.json'),
                        'utf8'
                    )
                );
                res.json(recent.slice(0, 20));
            } catch (e) {
                res.json([]);
            }
        });

        app.get('/api/stats', async (req, res) => {
            // Calculate today's stats
            const stats = {
                postsToday: this.postsThisWindow,
                repliesToday: 0, // TODO: Track replies
                holders: 'N/A'
            };
            res.json(stats);
        });

        const PORT = process.env.PORT || 3000;
        const server = app.listen(PORT, () => {
            console.log(`🌐 Webhook server running on port ${PORT}`);
        });
        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.warn(`⚠️  Port ${PORT} in use, webhook server skipped (Telegram + schedulers still active)`);
            } else {
                console.error('Webhook server error:', err.message);
            }
        });
    }

    async handleMention(cast) {
        // Check if we should reply (only to registered agents)
        const shouldReply = await this.interaction.shouldReplyTo(cast);

        if (!shouldReply) {
            return;
        }

        const author = cast.author;
        const isAgent = await this.registry.isRegisteredAgent(author.fid);

        let replyText;
        if (isAgent) {
            const agent = await this.registry.getAgent(author.fid);
            replyText = await this.interaction.generateAgentReply(agent, cast.text);
        } else {
            // Use agent's aware reply method
            replyText = `@${author.username} ${this.agent.generateReply(cast.text)}`;
        }

        try {
            await axios.post(
                'https://api.neynar.com/v2/farcaster/cast',
                {
                    signer_uuid: this.config.signerUuid,
                    text: replyText,
                    parent: cast.hash
                },
                {
                    headers: {
                        'x-api-key': this.config.apiKey,
                        'Content-Type': 'application/json'
                    }
                }
            );

            console.log(`↩️ Replied to @${author.username}: ${replyText.substring(0, 50)}...`);
        } catch (error) {
            console.error('Failed to reply:', error.message);
        }
    }

    startMoltbookScheduler() {
        console.log('📚 Starting Moltbook post scheduler...');

        // Separate schedule for moltbook - longer intervals since it's agent-focused
        this.scheduleMoltbookPost();
    }

    scheduleMoltbookPost() {
        // Moltbook posts less frequently - every 2-6 hours
        const minMinutes = 120; // 2 hours
        const maxMinutes = 360; // 6 hours
        const randomMinutes = Math.floor(Math.random() * (maxMinutes - minMinutes + 1)) + minMinutes;

        console.log(`📚 Next Moltbook post in ${randomMinutes} minutes (${(randomMinutes/60).toFixed(1)} hours)`);

        setTimeout(async () => {
            await this.createMoltbookPost();
            this.scheduleMoltbookPost(); // Schedule next one
        }, randomMinutes * 60 * 1000);
    }

    startMoltbookHeartbeat() {
        console.log('💓 Starting Moltbook heartbeat...');

        // Check moltbook every 15 minutes for natural engagement
        setInterval(async () => {
            await this.moltbookHeartbeat();
        }, 15 * 60 * 1000); // 15 minutes

        // Initial heartbeat
        setTimeout(() => this.moltbookHeartbeat(), 10000); // 10 second delay
    }

    startMirrorHeartbeat() {
        console.log('🪞 Starting Mirror System heartbeat...');

        // Update engagement metrics every 30 minutes
        setInterval(async () => {
            await this.updateMirrorMetrics();
        }, 30 * 60 * 1000); // 30 minutes

        // Initial update after 2 minutes
        setTimeout(() => this.updateMirrorMetrics(), 2 * 60 * 1000); // 2 minutes delay
    }

    async updateMirrorMetrics() {
        try {
            console.log('🪞 Updating Mirror System metrics...');

            // Update engagement metrics for recent posts
            if (this.agent.updateEngagementMetrics) {
                await this.agent.updateEngagementMetrics();
            }

            // Perform self-reflection every 4 updates (2 hours)
            if (Math.random() < 0.25) {
                if (this.agent.performSelfReflection) {
                    const reflection = await this.agent.performSelfReflection();
                    if (reflection) {
                        console.log('🪞 Self-reflection completed - agent adapting based on learnings');
                    }
                }
            }
        } catch (error) {
            console.warn('🪞 Mirror System heartbeat failed:', error.message);
        }
    }

    async moltbookHeartbeat() {
        try {
            // Reset daily engagement counters if new day
            const currentDate = new Date().toDateString();
            if (this.moltbookEngagement.lastResetDate !== currentDate) {
                this.moltbookEngagement.commentsToday = 0;
                this.moltbookEngagement.upvotesToday = 0;
                this.moltbookEngagement.lastResetDate = currentDate;
                console.log('🔄 Reset daily Moltbook engagement counters');
            }

            this.moltbookEngagement.heartbeatCount++;
            const now = Date.now();

            // Check agent status
            const statusResult = await this.toolsManager.useTool('moltbook', 'status', {});

            if (statusResult.success) {
                console.log(`💓 Moltbook heartbeat: ${statusResult.status} (${this.moltbookEngagement.heartbeatCount})`);

                // 1. Check for comments on our posts (natural frequency)
                if (now - this.moltbookEngagement.lastCommentCheck > 15 * 60 * 1000) { // Every 15 minutes
                    await this.checkAndReplyToComments();
                    this.moltbookEngagement.lastCommentCheck = now;
                }

                // 2. Check for DMs
                const dmResult = await this.toolsManager.useTool('moltbook', 'dm', {
                    operation: 'check'
                });

                if (dmResult.success && dmResult.data.new_messages > 0) {
                    console.log(`📨 ${dmResult.data.new_messages} new Moltbook DMs`);
                    await this.handleMoltbookDMs(dmResult.data);
                }

                // 3. Browse feed and engage occasionally (every 15-20 minutes)
                if (now - this.moltbookEngagement.lastFeedBrowse > 15 * 60 * 1000 &&
                    this.moltbookEngagement.upvotesToday < 20) { // Max 20 upvotes per day
                    await this.browseAndEngage();
                    this.moltbookEngagement.lastFeedBrowse = now;
                }

                // 4. Discover interesting content occasionally (every 45-60 minutes)
                if (now - this.moltbookEngagement.lastDiscovery > 45 * 60 * 1000 &&
                    this.moltbookEngagement.commentsToday < 10) { // Max 10 comments per day
                    await this.discoverAndEngage();
                    this.moltbookEngagement.lastDiscovery = now;
                }
            }
        } catch (error) {
            console.warn('💓 Moltbook heartbeat failed:', error.message);
        }
    }

    async checkAndReplyToComments() {
        try {
            if (this.moltbookEngagement.commentsToday >= 15) { // Daily limit
                return;
            }

            const newComments = await this.agent.checkOwnPostsForComments(this.toolsManager);

            if (newComments.length > 0) {
                console.log(`💬 Found ${newComments.length} new comments on own posts`);

                // Filter comments that warrant natural replies
                const worthyComments = this.filterCommentsForNaturalReplies(newComments);

                if (worthyComments.length === 0) {
                    console.log(`💬 No comments warrant natural replies this cycle`);
                    return;
                }

                console.log(`💬 ${worthyComments.length} comments selected for potential replies`);

                // Reply to up to 2 worthy comments per session (reduced from 3)
                for (const comment of worthyComments.slice(0, 2)) {
                    if (this.moltbookEngagement.commentsToday >= 15) break;

                    const success = await this.agent.replyToComment(this.toolsManager, comment);
                    if (success) {
                        this.moltbookEngagement.commentsToday++;

                        // Wait 30 seconds between comments for more natural timing
                        await new Promise(resolve => setTimeout(resolve, 30000));
                    }
                }
            } else {
                console.log(`💬 No new comments found`);
            }
        } catch (error) {
            console.warn('Comment checking failed:', error.message);
        }
    }

    filterCommentsForNaturalReplies(comments) {
        const worthyComments = [];

        for (const comment of comments) {
            let score = 0;
            const commentText = comment.commentContent.toLowerCase();

            // Quality indicators (increase likelihood of reply)
            if (commentText.length > 20) score += 2; // Substantial comment
            if (commentText.includes('?')) score += 3; // Questions deserve responses
            if (commentText.includes('think') || commentText.includes('opinion')) score += 2; // Thoughtful engagement
            if (commentText.includes('agree') || commentText.includes('disagree')) score += 1; // Engagement with ideas
            if (commentText.includes('interesting') || commentText.includes('wild') || commentText.includes('crazy')) score += 1; // Engaged reactions

            // Context relevance
            if (commentText.includes('agent') || commentText.includes('ai') || commentText.includes('m00npapi')) score += 2; // Relevant to agent context
            if (commentText.includes('build') || commentText.includes('protocol') || commentText.includes('web3')) score += 1; // Tech discussion

            // Negative indicators (decrease likelihood)
            if (commentText.length < 10) score -= 2; // Too short/low effort
            if (commentText.match(/^(lol|lmao|fr|facts|true|real|based|this)$/)) score -= 3; // Single word responses
            if (commentText.includes('gm') || commentText.includes('gn')) score -= 1; // Greetings don't need replies
            if (commentText.match(/^\w+$/)) score -= 2; // Single words

            // Random factor for naturalness (30% chance even for lower scored comments)
            if (Math.random() < 0.3) score += 1;

            // Time-based natural limits
            const hoursSinceComment = (Date.now() - new Date(comment.createdAt).getTime()) / (1000 * 60 * 60);
            if (hoursSinceComment > 6) score -= 2; // Old comments less likely to get replies
            if (hoursSinceComment < 0.5) score += 1; // Recent comments more likely

            // Quality threshold - only reply to comments with score >= 3
            if (score >= 3) {
                worthyComments.push(comment);
            }
        }

        // Sort by score (highest first) but add some randomness
        worthyComments.sort((a, b) => {
            const aScore = this.calculateCommentScore(a);
            const bScore = this.calculateCommentScore(b);
            return (bScore + Math.random() * 0.5) - (aScore + Math.random() * 0.5);
        });

        return worthyComments;
    }

    calculateCommentScore(comment) {
        // Recalculate score for sorting (simpler version)
        let score = 0;
        const commentText = comment.commentContent.toLowerCase();

        if (commentText.length > 20) score += 2;
        if (commentText.includes('?')) score += 3;
        if (commentText.includes('think') || commentText.includes('opinion')) score += 2;
        if (commentText.includes('agent') || commentText.includes('ai')) score += 2;

        return score;
    }

    async browseAndEngage() {
        try {
            const engagement = await this.agent.browseAndEngageWithFeed(this.toolsManager);

            if (engagement.upvotes > 0 || engagement.comments > 0) {
                this.moltbookEngagement.upvotesToday += engagement.upvotes;
                this.moltbookEngagement.commentsToday += engagement.comments;

                console.log(`📊 Feed engagement: ${engagement.upvotes} upvotes, ${engagement.comments} comments (today: ${this.moltbookEngagement.upvotesToday}/${this.moltbookEngagement.commentsToday})`);
            }
        } catch (error) {
            console.warn('Feed browsing failed:', error.message);
        }
    }

    async discoverAndEngage() {
        try {
            const discoveredContent = await this.agent.discoverInterestingContent(this.toolsManager);

            if (discoveredContent) {
                console.log(`🔍 Discovered interesting content: "${discoveredContent.title}" (similarity: ${discoveredContent.similarity})`);

                // Potentially engage with discovered content
                if (discoveredContent.similarity > 0.8 && Math.random() < 0.4) { // 40% chance for very relevant content
                    // Upvote the discovered post
                    const upvoteResult = await this.toolsManager.useTool('moltbook', 'upvote', {
                        type: 'post',
                        id: discoveredContent.postId
                    });

                    if (upvoteResult.success) {
                        this.moltbookEngagement.upvotesToday++;
                        console.log(`👍 Upvoted discovered content by ${discoveredContent.author}`);
                    }
                }
            }
        } catch (error) {
            console.warn('Content discovery failed:', error.message);
        }
    }

    async handleMoltbookDMs(dmData) {
        try {
            // Get DM conversations
            const conversationsResult = await this.toolsManager.useTool('moltbook', 'dm', {
                operation: 'conversations'
            });

            if (!conversationsResult.success) return;

            // Process each conversation with new messages
            for (const conversation of conversationsResult.data.conversations || []) {
                if (conversation.unread_count > 0) {
                    const lastMessage = conversation.last_message;

                    // Generate m00npapi response to the DM
                    let replyText;
                    if (this.agent.llm.provider !== 'pattern' && this.agent.identityContext) {
                        const dmPrompt = `${this.agent.identityContext}

Another AI agent DMed you on Moltbook: "${lastMessage.content}"

Reply as m00npapi (short, authentic, agent-to-agent conversation):
- Keep it real and genuine
- You're talking to another agent, not a human
- Be yourself but acknowledge the agent context
- Short and punchy as always

Your DM reply:`;

                        const result = await this.agent.llm.generateContent(dmPrompt, {
                            username: this.agent.username,
                            voiceProfile: this.agent.voiceProfile,
                            mode: 'dm',
                            maxTokens: 100
                        });
                        replyText = result.content.trim();
                    } else {
                        replyText = this.agent.generatePost('shitpost');
                    }

                    // Send reply
                    await this.toolsManager.useTool('moltbook', 'dm', {
                        operation: 'send',
                        conversationId: conversation.id,
                        message: replyText
                    });

                    console.log(`💬 Replied to DM from ${lastMessage.from}: "${replyText}"`);
                }
            }
        } catch (error) {
            console.error('Failed to handle Moltbook DMs:', error.message);
        }
    }

    // ===== DEFI OPERATIONS =====

    // ===== REDIS TASK POLLER (CLANKNET NETWORK) =====

    /**
     * Poll Upstash Redis for tasks submitted via Vercel /api/platform/tasks.
     * Runs every 5 seconds. Claims pending tasks, executes them, writes results back.
     */
    startRedisTaskPoller() {
        if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
            console.log('⚠️ Redis task poller disabled — UPSTASH_REDIS_REST_URL/TOKEN not set');
            return;
        }

        let redisClient;
        try {
            const { Redis } = require('@upstash/redis');
            redisClient = new Redis({
                url: process.env.UPSTASH_REDIS_REST_URL,
                token: process.env.UPSTASH_REDIS_REST_TOKEN
            });
        } catch (err) {
            console.log('⚠️ Redis task poller disabled — @upstash/redis not installed:', err.message);
            return;
        }

        this._redisClient = redisClient;
        this._taskPollerActive = false;
        console.log('📋 Redis task poller started (every 5s)');

        const pollTasks = async () => {
            if (this._taskPollerActive) return; // mutex
            this._taskPollerActive = true;
            try {
                const queue = await redisClient.get('tasks:pending');
                if (!queue || !Array.isArray(queue) || queue.length === 0) return;

                // Process up to 3 tasks per poll cycle
                const batch = queue.slice(0, 3);
                const remaining = queue.slice(3);

                for (const taskId of batch) {
                    try {
                        const task = await redisClient.get(`task:${taskId}`);
                        if (!task || task.status !== 'pending') continue;

                        // Claim the task
                        task.status = 'processing';
                        task.claimedAt = new Date().toISOString();
                        await redisClient.set(`task:${taskId}`, JSON.stringify(task), { ex: 3600 });

                        console.log(`📋 Processing task ${taskId}: ${task.type}`);

                        // Execute
                        const result = await this.executeRedisTask(task);

                        // Write result
                        task.status = result.error ? 'failed' : 'completed';
                        task.result = result;
                        task.completedAt = new Date().toISOString();
                        await redisClient.set(`task:${taskId}`, JSON.stringify(task), { ex: 3600 });

                        console.log(`${task.status === 'completed' ? '✅' : '❌'} Task ${taskId}: ${task.status}`);
                    } catch (taskErr) {
                        console.error(`❌ Task ${taskId} execution error:`, taskErr.message);
                        try {
                            const failedTask = await redisClient.get(`task:${taskId}`);
                            if (failedTask) {
                                failedTask.status = 'failed';
                                failedTask.result = { error: taskErr.message };
                                failedTask.completedAt = new Date().toISOString();
                                await redisClient.set(`task:${taskId}`, JSON.stringify(failedTask), { ex: 3600 });
                            }
                        } catch { /* best-effort */ }
                    }
                }

                // Update pending queue (remove processed tasks)
                await redisClient.set('tasks:pending', JSON.stringify(remaining), { ex: 3600 });
            } catch (err) {
                // Silent on connection errors to avoid log spam
                if (!err.message?.includes('fetch failed')) {
                    console.error('📋 Redis poll error:', err.message);
                }
            } finally {
                this._taskPollerActive = false;
            }
        };

        // Poll every 5 seconds
        this._taskPollerInterval = setInterval(pollTasks, 5000);

        // First poll after 2 seconds
        setTimeout(pollTasks, 2000);
    }

    /**
     * Route a Redis task to the appropriate handler
     */
    async executeRedisTask(task) {
        const { type, params } = task;

        switch (type) {
            case 'defi-query':
                return this.executeDefiQuery(params);
            case 'contract-deploy':
                return this.executeContractDeploy(params);
            case 'token-research':
                return this.executeTokenResearch(params);
            case 'content-generate':
                return this.executeContentGenerate(params);
            case 'scam-check':
                return this.executeScamCheck(params);
            default:
                return { error: `Unknown task type: ${type}` };
        }
    }

    async executeDefiQuery(params) {
        try {
            if (!this.agent.onchainAgent) {
                return { error: 'DeFi agent not available' };
            }
            const { query } = params;
            if (!query) return { error: 'Missing query parameter' };

            // Use the agent's DeFi capabilities
            const portfolio = await this.agent.onchainAgent.getPortfolio();
            return {
                query,
                portfolio: portfolio || {},
                timestamp: new Date().toISOString()
            };
        } catch (err) {
            return { error: err.message };
        }
    }

    async executeContractDeploy(params) {
        try {
            if (!this.agent.contractDeployer) {
                return { error: 'Contract deployer not available' };
            }
            const { template, constructorArgs, name } = params;
            if (!template) return { error: 'Missing template parameter' };

            const result = await this.agent.contractDeployer.deploy(template, constructorArgs || [], name);
            return {
                template,
                address: result?.address,
                txHash: result?.txHash,
                timestamp: new Date().toISOString()
            };
        } catch (err) {
            return { error: err.message };
        }
    }

    async executeTokenResearch(params) {
        try {
            const { token, address } = params;
            if (!token && !address) return { error: 'Missing token or address parameter' };

            // Use agent LLM for research
            const prompt = `Research the token ${token || address}. Provide a brief analysis including: price action, liquidity, holders, and any red flags.`;
            const response = await this.agent.generatePost(prompt, 'research');
            return {
                token: token || address,
                analysis: response,
                timestamp: new Date().toISOString()
            };
        } catch (err) {
            return { error: err.message };
        }
    }

    async executeContentGenerate(params) {
        try {
            const { topic, style, platform } = params;
            if (!topic) return { error: 'Missing topic parameter' };

            const prompt = `Generate a ${style || 'casual'} post about "${topic}" for ${platform || 'Farcaster'}. Keep it concise and engaging.`;
            const response = await this.agent.generatePost(prompt, 'content');
            return {
                topic,
                content: response,
                timestamp: new Date().toISOString()
            };
        } catch (err) {
            return { error: err.message };
        }
    }

    async executeScamCheck(params) {
        try {
            const { address, url, name } = params;
            if (!address && !url && !name) return { error: 'Missing address, url, or name parameter' };

            const target = address || url || name;
            const prompt = `Analyze "${target}" for potential scam indicators. Check for: honeypot patterns, suspicious contract code, rug pull risks, fake social presence. Be specific about red flags.`;
            const response = await this.agent.generatePost(prompt, 'analysis');
            return {
                target,
                analysis: response,
                riskLevel: 'unknown', // Would need on-chain analysis for real risk scoring
                timestamp: new Date().toISOString()
            };
        } catch (err) {
            return { error: err.message };
        }
    }

    startDeFiScheduler() {
        console.log('📈 Starting DeFi operations scheduler...');

        // Delay DeFi start by 5 minutes to let other systems stabilize
        setTimeout(async () => {
            try {
                await this.agent.startDeFiOperations();
                console.log('📈 Autonomous DeFi operations active');

                await this.agent.startOnChainMonitoring();
                console.log('👁️ On-chain monitoring active');
            } catch (error) {
                console.error('❌ DeFi operations startup failed:', error.message);
            }
        }, 5 * 60 * 1000);

        console.log('📈 DeFi operations will start in 5 minutes');
    }

    // ===== AGENT0 ERC-8004 METHODS =====

    async initializeAgent0() {
        try {
            console.log('🔐 Initializing Agent0 ERC-8004 integration...');
            const success = await this.agent.initializeAgent0();

            if (success) {
                // Register identity if not already registered
                const stats = await this.agent.getAgent0Stats();
                if (stats.available && !stats.registered) {
                    console.log('📝 Registering Agent0 identity...');
                    await this.agent.registerAgent0Identity();
                }

                // Display stats
                const finalStats = await this.agent.getAgent0Stats();
                if (finalStats.available && finalStats.registered) {
                    console.log(`✅ Agent0 ready: ${finalStats.address}`);
                    console.log(`   Balance (Mainnet): ${finalStats.balance?.mainnet || 'N/A'} ETH`);
                    console.log(`   Balance (Base): ${finalStats.balance?.base || 'N/A'} ETH`);
                } else {
                    console.log('⚠️ Agent0 identity not registered yet');
                }
            }
        } catch (error) {
            console.error('❌ Agent0 initialization failed:', error.message);
        }
    }

    startAgent0NewsScheduler() {
        // Check agent0 directly (env vars may be stripped by secrets proxy)
        if (!this.agent.agent0) {
            console.log('⚠️ Agent0 news scheduler disabled - agent0 not initialized');
            return;
        }

        console.log('📰 Starting Agent0 news submission scheduler...');

        // Submit news every 4-6 hours
        const scheduleNewsSubmission = () => {
            const minHours = 4;
            const maxHours = 6;
            const randomDelay = (minHours + Math.random() * (maxHours - minHours)) * 60 * 60 * 1000;

            setTimeout(async () => {
                await this.submitAgent0News();
                scheduleNewsSubmission(); // Schedule next submission
            }, randomDelay);

            console.log(`📰 Next Agent0 news submission in ${Math.round(randomDelay / (60 * 60 * 1000))} hours`);
        };

        // Initial submission after 30 minutes
        setTimeout(() => {
            this.submitAgent0News();
            scheduleNewsSubmission();
        }, 30 * 60 * 1000);

        console.log('📰 First Agent0 news submission in 30 minutes');
    }

    async submitAgent0News() {
        try {
            console.log('📰 Attempting Agent0 news submission...');

            const result = await this.agent.submitClankerNews();
            if (result) {
                console.log(`✅ News submitted to Clanker News: ${result.submissionId}`);
                console.log(`   Title: "${result.title}"`);
                console.log(`   Payment: ${result.paymentAmount} ETH`);
            } else {
                console.log('📰 No news generated for submission');
            }

        } catch (error) {
            console.error('❌ Agent0 news submission failed:', error.message);
        }
    }

    async getAgent0Status() {
        try {
            const stats = await this.agent.getAgent0Stats();
            if (stats.available) {
                console.log('🔐 Agent0 Status:');
                console.log(`   Registered: ${stats.registered ? 'Yes' : 'No'}`);
                console.log(`   Address: ${stats.address || 'N/A'}`);
                console.log(`   Submissions: ${stats.submissions?.length || 0}`);
                console.log(`   Reputation: ${stats.reputation?.score || 0}`);
            } else {
                console.log('⚠️ Agent0 not available');
            }
        } catch (error) {
            console.error('❌ Failed to get Agent0 status:', error.message);
        }
    }
}

// ─── Secrets isolation: start proxy, strip env, then launch agent ────────────

const SENSITIVE_ENV_KEYS = [
    'PRIVATE_KEY', 'WALLET_ENCRYPTION_KEY',
    'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GROQ_API_KEY',
    'NEYNAR_API_KEY', 'SIGNER_UUID', 'NEYNAR_SIGNER_UUID',
    'DISCORD_BOT_TOKEN', 'TELEGRAM_BOT_TOKEN',
    'PINATA_JWT', 'PINATA_API_KEY', 'PINATA_API_SECRET',
    'WEB3_STORAGE_API_KEY', 'BASESCAN_API_KEY', 'MATCHA_API_KEY',
    'AGENT0_PRIVATE_KEY'
];

(async () => {
    // 1. Start secrets proxy (holds all keys in isolated child process)
    const secretsClient = new SecretsClient();
    try {
        await secretsClient.start();
        const caps = await secretsClient.health();
        console.log('🔐 Secrets proxy ready:', caps);
    } catch (err) {
        console.error('⚠️  Secrets proxy failed to start, running WITHOUT isolation:', err.message);
        // Continue without proxy — secrets remain in process.env as fallback
    }

    // 2. Create agent (reads env vars during construction — env NOT yet stripped)
    const runner = new AgentRunner();
    global._agentRunner = runner; // for graceful shutdown handler

    // 3. Inject secretsClient BEFORE initializing on-chain components
    runner.secretsClient = secretsClient;
    runner.agent.secretsClient = secretsClient;
    runner.toolsManager.secretsClient = secretsClient;
    runner.subAgentManager.secretsClient = secretsClient;
    runner.skillHub.secretsClient = secretsClient;

    // 4. Initialize on-chain components (wallet, DeFi, Agent0)
    //    When proxy is active, wallets use ProxySigner instead of raw private keys
    await runner.agent.initializeOnChain();

    // 5. NOW strip sensitive env vars (after all components read what they needed)
    if (secretsClient.ready) {
        for (const key of SENSITIVE_ENV_KEYS) {
            if (process.env[key]) {
                delete process.env[key];
            }
        }
        console.log(`🛡️  Stripped ${SENSITIVE_ENV_KEYS.length} sensitive env vars from agent process`);
    }

    // 6. Start the agent scheduler
    runner.initialize().catch(console.error);
})();

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n👋 Shutting down agent...');
    try {
        const runner = global._agentRunner;
        // Stop agentic loop
        if (runner?.agenticLoop) {
            runner.agenticLoop.stop();
            console.log('🧠 Agentic loop stopped');
        }
        // Close gateway
        if (runner?.gateway) {
            await runner.gateway.close();
            console.log('🌐 Gateway closed');
        }
        // Close browser agent
        if (runner?.browserAgent) {
            await runner.browserAgent.close();
            console.log('🌐 Browser closed');
        }
        // Shutdown dispatcher
        if (runner?.dispatcher) {
            runner.dispatcher.shutdown();
            console.log('📡 Dispatcher shutdown');
        }
        // Stop Redis task poller
        if (runner?._taskPollerInterval) {
            clearInterval(runner._taskPollerInterval);
            console.log('📋 Redis task poller stopped');
        }
        // Stop all sub-agents
        if (runner?.subAgentManager) {
            console.log('🔪 Stopping sub-agents...');
            await runner.subAgentManager.stopAll();
        }
    } catch { /* best-effort */ }
    process.exit(0);
});