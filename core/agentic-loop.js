/**
 * AgenticLoop — Observe → Think → Plan → Act → Reflect cycle for the CLANKNET agent.
 *
 * Replaces fire-and-forget timer callbacks with a context-aware decision loop.
 * The agent decides WHAT to do and WHEN based on observations, not just timers.
 *
 * Runs on a configurable heartbeat (default: 60s).
 * Can be triggered by events for immediate response.
 */

const thinkingLevels = require('./thinking-levels');

class AgenticLoop {
    constructor(opts = {}) {
        this.llm = opts.llm;                         // LLMProvider instance
        this.eventBus = opts.eventBus;               // EventBus
        this.dispatcher = opts.dispatcher;             // RequestDispatcher
        this.agent = opts.agent;                       // FarcasterAgent
        this.toolsManager = opts.toolsManager;         // ToolsManager
        this.skillHub = opts.skillHub || null;         // SkillHub (Phase 4)

        this.heartbeatMs = opts.heartbeatMs || 60000;  // 60s default
        this.thinkingLevel = opts.thinkingLevel || 'medium';

        this._interval = null;
        this._running = false;
        this._lastRun = 0;
        this._runCount = 0;
        this._observations = {};
    }

    /**
     * Start the agentic loop heartbeat.
     */
    start() {
        if (this._interval) return;
        console.log(`🧠 Agentic loop started (heartbeat: ${this.heartbeatMs / 1000}s, thinking: ${this.thinkingLevel})`);

        this._interval = setInterval(() => this.tick(), this.heartbeatMs);

        // Listen for high-priority events that trigger immediate ticks
        if (this.eventBus) {
            this.eventBus.subscribe('message:inbound', () => this.trigger());
            this.eventBus.subscribe('tx:requested', () => this.trigger());
        }
    }

    /**
     * Stop the agentic loop.
     */
    stop() {
        if (this._interval) {
            clearInterval(this._interval);
            this._interval = null;
        }
        console.log('🧠 Agentic loop stopped');
    }

    /**
     * Trigger an immediate tick (debounced — won't run if last tick was <10s ago).
     */
    trigger() {
        if (Date.now() - this._lastRun < 10000) return; // 10s debounce
        this.tick();
    }

    /**
     * Set thinking level for this loop.
     */
    setThinkingLevel(level) {
        if (thinkingLevels.VALID_LEVELS.includes(level)) {
            this.thinkingLevel = level;
            console.log(`🧠 Thinking level set to: ${level}`);
        }
    }

    /**
     * Main tick: Observe → Think → Plan → Act → Reflect
     */
    async tick() {
        if (this._running) return; // mutex
        this._running = true;
        this._lastRun = Date.now();
        this._runCount++;

        try {
            // ── OBSERVE ──
            const observations = await this._observe();
            this._observations = observations;

            if (this.eventBus) {
                this.eventBus.publish('agent:think', { runCount: this._runCount, observations: Object.keys(observations) });
            }

            // ── THINK ──
            const intent = await this._think(observations);

            if (!intent || intent.action === 'idle') {
                return; // Nothing to do
            }

            // ── PLAN ──
            const plan = await this._plan(intent);

            // ── ACT ──
            const result = await this._act(plan);

            if (this.eventBus) {
                this.eventBus.publish('agent:act', { action: intent.action, result: !!result });
            }

            // ── REFLECT ──
            await this._reflect(intent, result);

            if (this.eventBus) {
                this.eventBus.publish('agent:reflect', { action: intent.action, success: !!result });
            }

        } catch (err) {
            console.error('🧠 Agentic loop error:', err.message);
            if (this.eventBus) {
                this.eventBus.publish('error', { source: 'agentic-loop', error: err.message });
            }
        } finally {
            this._running = false;
        }
    }

    // ── OBSERVE: Collect current state ──

    async _observe() {
        const now = Date.now();
        const observations = {};

        // Time context
        observations.time = {
            hour: new Date().getHours(),
            dayOfWeek: new Date().getDay(),
            uptimeMinutes: Math.floor(process.uptime() / 60),
            runCount: this._runCount,
        };

        // Pending messages from event bus
        if (this.eventBus) {
            const recentInbound = this.eventBus.getHistoryByType('message:inbound', 5);
            observations.pendingMessages = recentInbound.filter(e => now - e.ts < 120000).length;
        }

        // Recent posts
        if (this.eventBus) {
            const recentPosts = this.eventBus.getHistoryByType('post:published', 5);
            const lastPost = recentPosts[recentPosts.length - 1];
            observations.minutesSinceLastPost = lastPost
                ? Math.floor((now - lastPost.ts) / 60000)
                : 999; // No posts yet
        }

        // DeFi state
        if (this.agent?.onchainAgent) {
            try {
                observations.defiActive = true;
                observations.pendingApprovals = this.agent.onchainAgent.approvalManager
                    ? this.agent.onchainAgent.approvalManager.getPendingTransactions?.()?.length || 0
                    : 0;
            } catch {
                observations.defiActive = false;
            }
        }

        // Dispatcher state
        if (this.dispatcher) {
            observations.dispatcher = this.dispatcher.stats();
        }

        return observations;
    }

    // ── THINK: LLM evaluates observations and outputs structured intent ──

    async _think(observations) {
        if (!this.llm || this.llm.provider === 'pattern') {
            // Fallback: timer-based heuristic when no LLM
            return this._heuristicThink(observations);
        }

        const params = thinkingLevels.getParams(this.thinkingLevel);
        const prompt = this._buildThinkPrompt(observations);

        try {
            const result = await this.llm.generateContent(prompt, {
                username: this.agent?.username || 'agent',
                mode: 'coordination',
                maxTokens: params.maxTokens,
                temperature: params.temperature,
            });

            const raw = result.content?.trim();
            const jsonMatch = raw.match(/\{[\s\S]*\}/);
            if (!jsonMatch) return { action: 'idle', reason: 'No structured output' };

            const intent = JSON.parse(jsonMatch[0]);
            return {
                action: intent.action || 'idle',
                reason: intent.reason || '',
                priority: intent.priority || 'normal',
                params: intent.params || {},
            };
        } catch (err) {
            console.warn('🧠 Think phase failed:', err.message);
            return this._heuristicThink(observations);
        }
    }

    /**
     * Fallback heuristic when LLM is unavailable.
     */
    _heuristicThink(observations) {
        // Post if it's been a while
        if (observations.minutesSinceLastPost > 120) {
            return { action: 'post', reason: 'Time-based: >2h since last post', priority: 'normal', params: {} };
        }

        // Handle pending messages
        if (observations.pendingMessages > 0) {
            return { action: 'idle', reason: 'Messages handled by TG polling directly', priority: 'high', params: {} };
        }

        return { action: 'idle', reason: 'Nothing to do', priority: 'low', params: {} };
    }

    _buildThinkPrompt(observations) {
        return `You are an autonomous agent decision engine. Given the current observations, decide what action to take.

OBSERVATIONS:
${JSON.stringify(observations, null, 2)}

POSSIBLE ACTIONS:
- "post" — Create and publish a new Farcaster post
- "research" — Research a topic or token
- "engage" — Browse feeds and engage with content
- "reflect" — Self-reflect on recent performance
- "idle" — Do nothing this cycle

RULES:
- Only post if minutesSinceLastPost > 60
- Only engage if it's a reasonable hour (6-23)
- If dispatcher is busy (queued > 2), prefer idle
- Reflect every ~10 cycles
- Output ONLY valid JSON

Output format: {"action":"<action>","reason":"<brief reason>","priority":"normal|high|low","params":{}}`;
    }

    // ── PLAN: Decompose multi-step actions ──

    async _plan(intent) {
        // Most actions are single-step
        if (['idle', 'post', 'engage', 'reflect'].includes(intent.action)) {
            return [intent];
        }

        // Multi-step: research → might need skill discovery
        if (intent.action === 'research' && this.skillHub) {
            const skill = await this.skillHub.findSkill(intent.params.query || 'research');
            if (skill) {
                return [
                    { action: 'skill', params: { skillName: skill.name, input: intent.params }, priority: intent.priority },
                ];
            }
        }

        return [intent];
    }

    // ── ACT: Dispatch action via request dispatcher ──

    async _act(plan) {
        const results = [];

        for (const step of plan) {
            if (step.action === 'idle') continue;

            if (step.action === 'post' && this.dispatcher) {
                const id = this.dispatcher.submit({
                    method: 'post',
                    params: step.params,
                    priority: step.priority,
                });
                results.push({ stepAction: step.action, dispatchId: id });
            } else if (step.action === 'skill' && this.dispatcher) {
                const id = this.dispatcher.submit({
                    method: 'skill',
                    params: step.params,
                    priority: step.priority,
                });
                results.push({ stepAction: step.action, dispatchId: id });
            } else if (step.action === 'engage') {
                // Direct action — engagement doesn't need dispatcher
                results.push({ stepAction: 'engage', result: 'delegated' });
            } else if (step.action === 'reflect') {
                results.push({ stepAction: 'reflect', result: 'delegated' });
            }
        }

        return results.length > 0 ? results : null;
    }

    // ── REFLECT: Evaluate outcome ──

    async _reflect(intent, result) {
        if (intent.action === 'reflect' && this.agent?.performSelfReflection) {
            try {
                await this.agent.performSelfReflection();
            } catch {
                // Best-effort
            }
        }
        // Reflection data feeds into Mirror System via agent
    }

    /**
     * Get loop status for health checks.
     */
    status() {
        return {
            running: !!this._interval,
            thinkingLevel: this.thinkingLevel,
            runCount: this._runCount,
            lastRun: this._lastRun ? new Date(this._lastRun).toISOString() : null,
            observations: this._observations,
        };
    }
}

module.exports = AgenticLoop;
