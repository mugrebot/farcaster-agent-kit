/**
 * Sub-Agent Worker — Runs in a child_process.fork() isolate.
 *
 * Receives tasks via IPC from the CNS (SubAgentManager) and reports results back.
 * Each worker has a role and limited capabilities. No private keys, no direct
 * social posting, no filesystem access outside workspace.
 */

const NetworkSafety = require('./network-safety');

class SubAgentWorker {
    constructor() {
        this.role = null;
        this.capabilities = new Set();
        this.networkSafety = new NetworkSafety();
        this.startTime = Date.now();
        this.maxLifetimeMs = 30 * 60 * 1000; // 30 minutes default
        this.taskCount = 0;
        this.alive = true;
    }

    /**
     * Initialize worker with role and capabilities from the CNS.
     */
    init(config) {
        this.role = config.role;
        this.capabilities = new Set(config.capabilities || []);
        this.maxLifetimeMs = config.maxLifetimeMs || this.maxLifetimeMs;

        // Start lifetime watchdog
        setTimeout(() => {
            console.log(`[sub-agent:${this.role}] Max lifetime reached, shutting down`);
            this.shutdown();
        }, this.maxLifetimeMs);
    }

    /**
     * Process a task according to the worker's role and capabilities.
     */
    async processTask(task) {
        this.taskCount++;
        const taskId = task.id || `task_${this.taskCount}`;

        try {
            switch (task.type) {
                case 'fetch':
                    return await this.handleFetch(task);
                case 'llm':
                    return await this.handleLLM(task);
                case 'research':
                    return await this.handleResearch(task);
                case 'curate-news':
                    return await this.handleCurateNews(task);
                case 'generate-content':
                    return await this.handleGenerateContent(task);
                case 'ping':
                    return { status: 'alive', role: this.role, uptime: Date.now() - this.startTime, taskCount: this.taskCount };
                default:
                    return { error: `Unknown task type: ${task.type}` };
            }
        } catch (err) {
            return { error: err.message, taskId };
        }
    }

    /**
     * Fetch URL(s) — requires 'http-fetch' capability.
     */
    async handleFetch(task) {
        if (!this.capabilities.has('http-fetch')) {
            return { error: 'http-fetch capability not granted' };
        }

        const urls = Array.isArray(task.urls) ? task.urls : [task.url];
        const results = [];

        for (const url of urls.slice(0, 5)) {
            const result = await this.networkSafety.safeFetch(url);
            results.push({ url, ...result });
        }

        return { results };
    }

    /**
     * LLM call — routes through parent IPC (secrets proxy).
     * Requires 'llm' capability.
     */
    async handleLLM(task) {
        if (!this.capabilities.has('llm')) {
            return { error: 'llm capability not granted' };
        }

        // Send LLM request to parent, which routes through secrets proxy
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('LLM call timed out')), 30000);

            const requestId = `llm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

            const handler = (msg) => {
                if (msg.type === 'llm-result' && msg.requestId === requestId) {
                    clearTimeout(timeout);
                    process.removeListener('message', handler);
                    if (msg.error) {
                        resolve({ error: msg.error });
                    } else {
                        resolve({ content: msg.content });
                    }
                }
            };

            process.on('message', handler);
            process.send({ type: 'llm-request', requestId, prompt: task.prompt, config: task.config || {} });
        });
    }

    /**
     * Research task — fetch + LLM summarization.
     */
    async handleResearch(task) {
        if (!this.capabilities.has('http-fetch') || !this.capabilities.has('llm')) {
            return { error: 'Research requires http-fetch and llm capabilities' };
        }

        const fetchResults = [];

        // Fetch all provided URLs
        if (task.urls && task.urls.length > 0) {
            for (const url of task.urls.slice(0, 5)) {
                const result = await this.networkSafety.safeFetch(url);
                if (result.safe) {
                    fetchResults.push({ url, content: result.content });
                }
            }
        }

        // Summarize with LLM
        const context = fetchResults.map(r => `--- ${r.url} ---\n${r.content}`).join('\n\n');
        const prompt = `${task.prompt || 'Summarize the following content:'}\n\n${context}`;

        const llmResult = await this.handleLLM({ prompt, config: task.llmConfig });
        return { research: llmResult.content || llmResult.error, sources: fetchResults.map(r => r.url) };
    }

    /**
     * Curate news — fetch, analyze, and suggest newsworthy items.
     */
    async handleCurateNews(task) {
        if (!this.capabilities.has('http-fetch') || !this.capabilities.has('llm')) {
            return { error: 'News curation requires http-fetch and llm capabilities' };
        }

        const sources = task.sources || [
            'https://news.ycombinator.com/rss',
            'https://decrypt.co/feed',
        ];

        const fetched = [];
        for (const source of sources.slice(0, 5)) {
            const result = await this.networkSafety.safeFetch(source);
            if (result.safe) {
                fetched.push({ source, content: result.content });
            }
        }

        const context = fetched.map(f => `--- ${f.source} ---\n${f.content.substring(0, 2000)}`).join('\n\n');

        const llmResult = await this.handleLLM({
            prompt: `You are a crypto-native news curator. From the following feeds, identify the 3 most newsworthy items relevant to crypto, web3, DeFi, or agent technology. For each, provide: title, url, and a brief description (1-2 sentences). Return as JSON array.\n\n${context}`,
            config: { maxTokens: 500, temperature: 0.5 }
        });

        return { suggestions: llmResult.content || llmResult.error };
    }

    /**
     * Generate content — LLM-only, writes to workspace via parent.
     */
    async handleGenerateContent(task) {
        if (!this.capabilities.has('llm')) {
            return { error: 'Content generation requires llm capability' };
        }

        const llmResult = await this.handleLLM({
            prompt: task.prompt,
            config: task.llmConfig || { maxTokens: 2000, temperature: 0.7 }
        });

        const result = { content: llmResult.content || llmResult.error };

        // If workspace-write is allowed and a path is specified, request parent to write
        if (this.capabilities.has('workspace-write') && task.outputPath) {
            process.send({
                type: 'workspace-write',
                path: task.outputPath,
                content: result.content,
            });
            result.savedTo = task.outputPath;
        }

        return result;
    }

    shutdown() {
        this.alive = false;
        process.send({ type: 'shutdown', role: this.role, taskCount: this.taskCount });
        setTimeout(() => process.exit(0), 500);
    }
}

// ─── Worker entry point ─────────────────────────────────────────────────────

const worker = new SubAgentWorker();

process.on('message', async (msg) => {
    if (!msg || !msg.type) return;

    switch (msg.type) {
        case 'init':
            worker.init(msg.config);
            process.send({ type: 'ready', role: worker.role });
            break;

        case 'task':
            try {
                const result = await worker.processTask(msg.task);
                process.send({ type: 'task-result', taskId: msg.taskId, result });
            } catch (err) {
                process.send({ type: 'task-result', taskId: msg.taskId, result: { error: err.message } });
            }
            break;

        case 'shutdown':
            worker.shutdown();
            break;
    }
});

// Handle parent disconnect
process.on('disconnect', () => {
    console.log(`[sub-agent:${worker.role}] Parent disconnected, shutting down`);
    process.exit(0);
});

process.on('uncaughtException', (err) => {
    console.error(`[sub-agent:${worker.role}] Uncaught:`, err.message);
    process.exit(1);
});
