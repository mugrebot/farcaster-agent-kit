/**
 * RequestDispatcher — Priority queue + routing for the CLANKNET agent gateway.
 *
 * Priority levels: critical > high > normal > low
 * Max concurrent: 4 requests
 * State machine per request: pending → processing → completed|failed
 */

const crypto = require('crypto');

const PRIORITY = { critical: 0, high: 1, normal: 2, low: 3 };
const DEFAULT_TIMEOUT = 60000;      // 60s
const LONG_TIMEOUT = 300000;        // 300s for browser/deploy

class RequestDispatcher {
    constructor(opts = {}) {
        this.maxConcurrent = opts.maxConcurrent || 4;
        this.eventBus = opts.eventBus || null;
        this.handlers = new Map();   // method → async handler fn
        this._queue = [];            // sorted by priority
        this._active = new Map();    // id → { request, timeout }
        this._results = new Map();   // id → { ok, payload|error, ts }
        this._maxResults = 200;
        this._processing = false;
    }

    /**
     * Register a handler for a method name.
     */
    registerHandler(method, handler) {
        this.handlers.set(method, handler);
    }

    /**
     * Submit a request. Returns request id.
     */
    submit(request) {
        const id = request.id || crypto.randomUUID();
        const priority = PRIORITY[request.priority] ?? PRIORITY.normal;
        const timeoutMs = (request.method === 'browser' || request.method === 'deploy')
            ? LONG_TIMEOUT : (request.timeout || DEFAULT_TIMEOUT);

        const entry = {
            id,
            method: request.method,
            params: request.params || {},
            priority,
            timeoutMs,
            status: 'pending',
            createdAt: Date.now(),
            session: request.session || null,
        };

        // Insert sorted by priority (lower number = higher priority)
        let inserted = false;
        for (let i = 0; i < this._queue.length; i++) {
            if (priority < this._queue[i].priority) {
                this._queue.splice(i, 0, entry);
                inserted = true;
                break;
            }
        }
        if (!inserted) this._queue.push(entry);

        if (this.eventBus) {
            this.eventBus.publish('gateway:request', { id, method: entry.method, priority: request.priority || 'normal' });
        }

        this._drain();
        return id;
    }

    /**
     * Get the current status/result of a request.
     */
    getStatus(id) {
        // Check active
        const active = this._active.get(id);
        if (active) return { id, status: 'processing' };

        // Check completed
        const result = this._results.get(id);
        if (result) return { id, status: result.ok ? 'completed' : 'failed', ...result };

        // Check queue
        const queued = this._queue.find(r => r.id === id);
        if (queued) return { id, status: 'pending', position: this._queue.indexOf(queued) };

        return null;
    }

    /**
     * Process queue — pull items up to maxConcurrent.
     */
    async _drain() {
        if (this._processing) return;
        this._processing = true;

        try {
            while (this._queue.length > 0 && this._active.size < this.maxConcurrent) {
                const entry = this._queue.shift();
                this._execute(entry);
            }
        } finally {
            this._processing = false;
        }
    }

    async _execute(entry) {
        entry.status = 'processing';
        const timer = setTimeout(() => {
            this._complete(entry.id, false, { error: `Timeout after ${entry.timeoutMs}ms` });
        }, entry.timeoutMs);

        this._active.set(entry.id, { request: entry, timeout: timer });

        try {
            const handler = this.handlers.get(entry.method);
            if (!handler) {
                throw new Error(`No handler for method: ${entry.method}`);
            }
            const result = await handler(entry.params, entry);
            this._complete(entry.id, true, result);
        } catch (err) {
            this._complete(entry.id, false, { error: err.message });
        }
    }

    _complete(id, ok, payload) {
        const active = this._active.get(id);
        if (active) {
            clearTimeout(active.timeout);
            this._active.delete(id);
        }

        const result = { ok, ...(ok ? { payload } : payload), ts: Date.now() };
        this._results.set(id, result);

        // Trim old results
        if (this._results.size > this._maxResults) {
            const oldest = this._results.keys().next().value;
            this._results.delete(oldest);
        }

        if (this.eventBus) {
            this.eventBus.publish('gateway:response', { id, ok, method: active?.request?.method });
        }

        // Continue draining
        this._drain();
        return result;
    }

    /**
     * Get queue stats.
     */
    stats() {
        return {
            queued: this._queue.length,
            active: this._active.size,
            completed: this._results.size,
        };
    }

    /**
     * Shutdown — reject all pending, clear timers.
     */
    shutdown() {
        for (const [id, { timeout }] of this._active) {
            clearTimeout(timeout);
            this._complete(id, false, { error: 'Dispatcher shutting down' });
        }
        this._queue = [];
    }
}

RequestDispatcher.PRIORITY = PRIORITY;

module.exports = RequestDispatcher;
