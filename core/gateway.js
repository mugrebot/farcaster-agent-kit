/**
 * Gateway — WebSocket + HTTP control plane for the CLANKNET agent.
 *
 * ws://127.0.0.1:18789  — typed WS protocol
 * HTTP POST /request     — submit a request
 * HTTP GET  /status/:id  — check request status
 * HTTP GET  /health      — health check
 *
 * WS protocol: {type:"req", id, method, params} → {type:"res", id, ok, payload|error}
 * Methods: post, reply, chat, deploy, defi, research, skill, browser, health
 */

const http = require('http');
const crypto = require('crypto');

class Gateway {
    constructor(opts = {}) {
        this.port = opts.port || 18789;
        this.host = opts.host || '127.0.0.1';
        this.dispatcher = opts.dispatcher;
        this.eventBus = opts.eventBus || null;
        this._server = null;
        this._wss = null;
        this._clients = new Set();
        this._started = false;
    }

    /**
     * Start the gateway server.
     */
    async start() {
        if (this._started) return;

        const WebSocket = require('ws');

        this._server = http.createServer((req, res) => this._handleHTTP(req, res));
        this._wss = new WebSocket.Server({ server: this._server });

        this._wss.on('connection', (ws) => {
            this._clients.add(ws);
            ws.on('message', (data) => this._handleWS(ws, data));
            ws.on('close', () => this._clients.delete(ws));
            ws.on('error', () => this._clients.delete(ws));
        });

        return new Promise((resolve, reject) => {
            this._server.listen(this.port, this.host, () => {
                this._started = true;
                console.log(`🌐 Gateway listening on ws://${this.host}:${this.port}`);
                resolve();
            });
            this._server.on('error', (err) => {
                if (err.code === 'EADDRINUSE') {
                    console.warn(`⚠️  Gateway port ${this.port} in use, skipping`);
                    resolve(); // non-fatal
                } else {
                    reject(err);
                }
            });
        });
    }

    // ── HTTP handler ──

    _handleHTTP(req, res) {
        // CORS
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        const url = new URL(req.url, `http://${req.headers.host}`);

        if (req.method === 'GET' && url.pathname === '/health') {
            return this._sendJSON(res, 200, {
                ok: true,
                uptime: process.uptime(),
                clients: this._clients.size,
                dispatcher: this.dispatcher?.stats() || {},
            });
        }

        if (req.method === 'GET' && url.pathname.startsWith('/status/')) {
            const id = url.pathname.slice(8);
            const status = this.dispatcher?.getStatus(id);
            if (!status) return this._sendJSON(res, 404, { error: 'Not found' });
            return this._sendJSON(res, 200, status);
        }

        if (req.method === 'POST' && url.pathname === '/request') {
            return this._readBody(req, (body) => {
                try {
                    const { method, params, priority, session } = JSON.parse(body);
                    if (!method) return this._sendJSON(res, 400, { error: 'Missing method' });

                    const id = this.dispatcher.submit({ method, params, priority, session });
                    return this._sendJSON(res, 202, { id, status: 'pending' });
                } catch (err) {
                    return this._sendJSON(res, 400, { error: err.message });
                }
            });
        }

        this._sendJSON(res, 404, { error: 'Not found' });
    }

    // ── WebSocket handler ──

    async _handleWS(ws, raw) {
        let msg;
        try {
            msg = JSON.parse(raw.toString());
        } catch {
            return this._wsSend(ws, { type: 'error', error: 'Invalid JSON' });
        }

        if (msg.type !== 'req') {
            return this._wsSend(ws, { type: 'error', error: 'Expected type:"req"' });
        }

        const { id, method, params, priority, session } = msg;
        if (!method) {
            return this._wsSend(ws, { type: 'error', id, error: 'Missing method' });
        }

        // Special case: health doesn't go through dispatcher
        if (method === 'health') {
            return this._wsSend(ws, {
                type: 'res', id, ok: true,
                payload: { uptime: process.uptime(), clients: this._clients.size, dispatcher: this.dispatcher?.stats() }
            });
        }

        // Submit to dispatcher and wait for result
        const reqId = id || crypto.randomUUID();
        const dispatchId = this.dispatcher.submit({
            id: reqId, method, params, priority, session
        });

        // Poll for result (simpler than callback wiring)
        const pollStart = Date.now();
        const maxWait = (method === 'browser' || method === 'deploy') ? 300000 : 60000;
        const poll = setInterval(() => {
            const status = this.dispatcher.getStatus(dispatchId);
            if (!status || (status.status !== 'completed' && status.status !== 'failed')) {
                if (Date.now() - pollStart > maxWait) {
                    clearInterval(poll);
                    this._wsSend(ws, { type: 'res', id: reqId, ok: false, error: 'Timeout' });
                }
                return;
            }
            clearInterval(poll);
            this._wsSend(ws, {
                type: 'res',
                id: reqId,
                ok: status.ok ?? status.status === 'completed',
                ...(status.payload ? { payload: status.payload } : {}),
                ...(status.error ? { error: status.error } : {}),
            });
        }, 100);
    }

    /**
     * Broadcast an event to all connected WS clients.
     */
    broadcast(event) {
        const data = JSON.stringify({ type: 'event', ...event });
        for (const ws of this._clients) {
            try { ws.send(data); } catch { /* dead socket */ }
        }
    }

    // ── Helpers ──

    _sendJSON(res, status, obj) {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(obj));
    }

    _readBody(req, cb) {
        let body = '';
        req.on('data', chunk => {
            body += chunk;
            if (body.length > 1e6) { req.destroy(); } // 1MB limit
        });
        req.on('end', () => cb(body));
    }

    _wsSend(ws, obj) {
        try { ws.send(JSON.stringify(obj)); } catch { /* dead socket */ }
    }

    /**
     * Graceful shutdown.
     */
    async close() {
        if (!this._started) return;
        this._started = false;

        for (const ws of this._clients) {
            try { ws.close(1001, 'Server shutting down'); } catch {}
        }
        this._clients.clear();

        if (this._wss) this._wss.close();
        if (this._server) {
            return new Promise(resolve => this._server.close(resolve));
        }
    }
}

module.exports = Gateway;
