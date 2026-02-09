/**
 * Sub-Agent Manager — Central Nervous System (CNS) coordinator.
 *
 * Spawns, monitors, and communicates with sub-agent workers.
 * Sub-agents are isolated child processes with limited capabilities.
 * The CNS never delegates private keys, secrets, or approval authority.
 */

const { fork } = require('child_process');
const path = require('path');
const crypto = require('crypto');
const EventEmitter = require('events');

// Role definitions: what each sub-agent type is allowed to do
const ROLE_CAPABILITIES = {
    'news-curator': {
        capabilities: ['http-fetch', 'llm'],
        description: 'Finds and curates news for Clanker News submissions',
        maxLifetimeMs: 30 * 60 * 1000, // 30 min
    },
    'defi-monitor': {
        capabilities: ['llm'],
        description: 'Monitors DeFi positions, alerts on significant changes',
        maxLifetimeMs: 30 * 60 * 1000,
    },
    'content-creator': {
        capabilities: ['llm', 'workspace-write'],
        description: 'Generates content, dApps, code in sandboxed workspace',
        maxLifetimeMs: 30 * 60 * 1000,
    },
    'research': {
        capabilities: ['http-fetch', 'llm'],
        description: 'Deep research tasks (token analysis, market data)',
        maxLifetimeMs: 30 * 60 * 1000,
    },
};

const MAX_CONCURRENT_AGENTS = 4;
const MAX_IPC_MESSAGE_BYTES = 1 * 1024 * 1024; // 1MB

class SubAgentManager extends EventEmitter {
    constructor(config = {}) {
        super();
        this.agents = new Map(); // agentId → { process, role, status, spawnedAt, currentTask }
        this.secretsClient = config.secretsClient || null;
        this.workspacePath = config.workspacePath || path.join(__dirname, '..', 'workspace');
        this.workerPath = path.join(__dirname, 'sub-agent-worker.js');
        this._pendingResults = new Map(); // taskId → { resolve, reject, timeout }
    }

    /**
     * Spawn a new sub-agent worker.
     * Returns { agentId, role } on success.
     */
    async spawnAgent(role, overrides = {}) {
        // Validate role
        const roleDef = ROLE_CAPABILITIES[role];
        if (!roleDef) {
            const valid = Object.keys(ROLE_CAPABILITIES).join(', ');
            throw new Error(`Unknown role: ${role}. Valid roles: ${valid}`);
        }

        // Enforce max concurrent
        const activeCount = this.getActiveAgents().length;
        if (activeCount >= MAX_CONCURRENT_AGENTS) {
            throw new Error(`Max concurrent agents (${MAX_CONCURRENT_AGENTS}) reached. Stop one first.`);
        }

        const agentId = `${role}_${crypto.randomBytes(4).toString('hex')}`;

        // Fork with minimal environment — NO secrets
        const child = fork(this.workerPath, [], {
            stdio: ['pipe', 'inherit', 'inherit', 'ipc'],
            env: {
                NODE_ENV: process.env.NODE_ENV || 'production',
                // No secrets, no API keys, no private keys
            },
        });

        const agentInfo = {
            process: child,
            role,
            status: 'starting',
            spawnedAt: Date.now(),
            currentTask: null,
            taskCount: 0,
        };

        this.agents.set(agentId, agentInfo);

        // Set up IPC handler
        child.on('message', (msg) => this._handleWorkerMessage(agentId, msg));

        child.on('exit', (code) => {
            const info = this.agents.get(agentId);
            if (info) {
                info.status = 'exited';
                info.exitCode = code;
            }
            this.emit('agent-exit', { agentId, role, code });
            // Clean up after a delay
            setTimeout(() => this.agents.delete(agentId), 60000);
        });

        child.on('error', (err) => {
            console.error(`[CNS] Sub-agent ${agentId} error:`, err.message);
            const info = this.agents.get(agentId);
            if (info) info.status = 'error';
        });

        // Send init message
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`Sub-agent ${agentId} failed to start within 10s`));
                this.stopAgent(agentId);
            }, 10000);

            const readyHandler = (msg) => {
                if (msg.type === 'ready') {
                    clearTimeout(timeout);
                    child.removeListener('message', readyHandler);
                    agentInfo.status = 'idle';
                    this.emit('agent-ready', { agentId, role });
                    resolve({ agentId, role });
                }
            };

            child.on('message', readyHandler);

            child.send({
                type: 'init',
                config: {
                    role,
                    capabilities: overrides.capabilities || roleDef.capabilities,
                    maxLifetimeMs: overrides.maxLifetimeMs || roleDef.maxLifetimeMs,
                },
            });
        });
    }

    /**
     * Send a task to a sub-agent and await the result.
     */
    async sendTask(agentId, task, timeoutMs = 60000) {
        const info = this.agents.get(agentId);
        if (!info) throw new Error(`Agent ${agentId} not found`);
        if (info.status !== 'idle' && info.status !== 'busy') {
            throw new Error(`Agent ${agentId} is ${info.status}, cannot accept tasks`);
        }

        // Check IPC message size
        const taskStr = JSON.stringify(task);
        if (taskStr.length > MAX_IPC_MESSAGE_BYTES) {
            throw new Error(`Task too large (${taskStr.length} bytes, max ${MAX_IPC_MESSAGE_BYTES})`);
        }

        const taskId = `${agentId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        info.status = 'busy';
        info.currentTask = taskId;
        info.taskCount++;

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this._pendingResults.delete(taskId);
                info.status = 'idle';
                info.currentTask = null;
                reject(new Error(`Task ${taskId} timed out after ${timeoutMs}ms`));
            }, timeoutMs);

            this._pendingResults.set(taskId, {
                resolve: (result) => { clearTimeout(timeout); resolve(result); },
                reject: (err) => { clearTimeout(timeout); reject(err); },
            });

            info.process.send({ type: 'task', taskId, task });
        });
    }

    /**
     * Gracefully stop a sub-agent.
     */
    async stopAgent(agentId) {
        const info = this.agents.get(agentId);
        if (!info || !info.process) return false;

        try {
            info.process.send({ type: 'shutdown' });
        } catch {
            // IPC may already be closed
        }

        // Force kill after 5s if still alive
        setTimeout(() => {
            try {
                if (info.process && !info.process.killed) {
                    info.process.kill('SIGKILL');
                }
            } catch { /* already dead */ }
        }, 5000);

        info.status = 'stopping';
        return true;
    }

    /**
     * Stop all sub-agents.
     */
    async stopAll() {
        const ids = [...this.agents.keys()];
        await Promise.all(ids.map(id => this.stopAgent(id)));
    }

    /**
     * List active (non-exited) sub-agents.
     */
    getActiveAgents() {
        const active = [];
        for (const [id, info] of this.agents) {
            if (info.status !== 'exited') {
                active.push({
                    agentId: id,
                    role: info.role,
                    status: info.status,
                    uptime: Math.round((Date.now() - info.spawnedAt) / 1000),
                    taskCount: info.taskCount,
                    currentTask: info.currentTask,
                });
            }
        }
        return active;
    }

    /**
     * Get status of a specific agent.
     */
    getAgentStatus(agentId) {
        const info = this.agents.get(agentId);
        if (!info) return null;
        return {
            agentId,
            role: info.role,
            status: info.status,
            uptime: Math.round((Date.now() - info.spawnedAt) / 1000),
            taskCount: info.taskCount,
            currentTask: info.currentTask,
        };
    }

    /**
     * Get available roles and their descriptions.
     */
    static getRoles() {
        return Object.entries(ROLE_CAPABILITIES).map(([role, def]) => ({
            role,
            capabilities: def.capabilities,
            description: def.description,
        }));
    }

    // ─── Internal IPC handling ───────────────────────────────────────────────

    _handleWorkerMessage(agentId, msg) {
        if (!msg || !msg.type) return;

        const info = this.agents.get(agentId);
        if (!info) return;

        switch (msg.type) {
            case 'task-result': {
                const pending = this._pendingResults.get(msg.taskId);
                if (pending) {
                    this._pendingResults.delete(msg.taskId);
                    info.status = 'idle';
                    info.currentTask = null;
                    pending.resolve(msg.result);
                }
                break;
            }

            case 'llm-request': {
                // Route LLM call through secrets proxy
                this._handleLLMRequest(agentId, msg);
                break;
            }

            case 'workspace-write': {
                // Validate and write to workspace
                this._handleWorkspaceWrite(agentId, msg);
                break;
            }

            case 'shutdown': {
                info.status = 'exited';
                this.emit('agent-shutdown', { agentId, role: info.role, taskCount: msg.taskCount });
                break;
            }
        }
    }

    async _handleLLMRequest(agentId, msg) {
        const info = this.agents.get(agentId);
        if (!info) return;

        try {
            let content;
            if (this.secretsClient && this.secretsClient.ready) {
                const result = await this.secretsClient.llmComplete('anthropic', [
                    { role: 'user', content: msg.prompt }
                ], msg.config || {});
                content = result.content || result;
            } else {
                content = '[LLM unavailable — secrets proxy not connected]';
            }

            info.process.send({
                type: 'llm-result',
                requestId: msg.requestId,
                content: typeof content === 'string' ? content : JSON.stringify(content),
            });
        } catch (err) {
            info.process.send({
                type: 'llm-result',
                requestId: msg.requestId,
                error: err.message,
            });
        }
    }

    async _handleWorkspaceWrite(agentId, msg) {
        const info = this.agents.get(agentId);
        if (!info) return;

        // Only content-creator role can write
        if (!ROLE_CAPABILITIES[info.role]?.capabilities.includes('workspace-write')) {
            console.warn(`[CNS] Agent ${agentId} (${info.role}) attempted workspace write — denied`);
            return;
        }

        const fsPromises = require('fs').promises;
        const filePath = path.resolve(this.workspacePath, msg.path);

        // Jail check
        if (!filePath.startsWith(path.resolve(this.workspacePath))) {
            console.warn(`[CNS] Agent ${agentId} workspace escape attempt: ${msg.path}`);
            return;
        }

        // Size check
        if (msg.content && msg.content.length > 50000) {
            console.warn(`[CNS] Agent ${agentId} workspace write too large: ${msg.content.length}`);
            return;
        }

        try {
            await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
            await fsPromises.writeFile(filePath, msg.content, 'utf8');
            console.log(`[CNS] Sub-agent ${agentId} wrote: workspace/${msg.path}`);
        } catch (err) {
            console.error(`[CNS] Workspace write failed for ${agentId}:`, err.message);
        }
    }
}

module.exports = SubAgentManager;
