/**
 * Secrets Client — IPC wrapper for communicating with the secrets proxy process.
 *
 * Used by the main agent process to request operations (sign, post, LLM calls)
 * without ever touching raw secrets.
 */

const { fork } = require('child_process');
const path = require('path');
const { ethers } = require('ethers');

class SecretsClient {
    constructor() {
        this.child = null;
        this.pending = new Map();
        this.nextId = 1;
        this.walletAddress = null;
        this.ready = false;
    }

    /**
     * Start the secrets proxy as a child process.
     * Returns a promise that resolves when the proxy signals ready.
     */
    async start() {
        return new Promise((resolve, reject) => {
            const proxyPath = path.join(__dirname, 'secrets-proxy.js');
            this.child = fork(proxyPath, [], {
                stdio: ['pipe', 'inherit', 'inherit', 'ipc'],
                env: process.env // Pass env to child — it will load secrets there
            });

            const timeout = setTimeout(() => {
                reject(new Error('Secrets proxy failed to start within 10s'));
            }, 10000);

            this.child.once('message', (msg) => {
                if (msg.ready) {
                    clearTimeout(timeout);
                    this.walletAddress = msg.walletAddress;
                    this.ready = true;
                    // Set up ongoing message handler
                    this.child.on('message', (msg) => this._handleMessage(msg));
                    resolve(this);
                }
            });

            this.child.on('error', (err) => {
                clearTimeout(timeout);
                reject(err);
            });

            this.child.on('exit', (code) => {
                this.ready = false;
                if (code !== 0) {
                    console.error(`🔐 Secrets proxy exited with code ${code}`);
                    // Reject all pending calls
                    for (const [id, { reject }] of this.pending) {
                        reject(new Error('Secrets proxy crashed'));
                    }
                    this.pending.clear();
                }
            });
        });
    }

    /**
     * Handle incoming IPC messages from the proxy.
     */
    _handleMessage(msg) {
        const { id, result, error } = msg;
        const pending = this.pending.get(id);
        if (!pending) return;
        this.pending.delete(id);
        if (error) {
            pending.reject(new Error(error));
        } else {
            pending.resolve(result);
        }
    }

    /**
     * Send a request to the secrets proxy and await the response.
     */
    async call(method, params = {}) {
        if (!this.ready || !this.child) {
            throw new Error('Secrets proxy not running');
        }

        return new Promise((resolve, reject) => {
            const id = this.nextId++;
            const timeout = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`Secrets proxy call '${method}' timed out after 30s`));
            }, 30000);

            this.pending.set(id, {
                resolve: (result) => { clearTimeout(timeout); resolve(result); },
                reject: (error) => { clearTimeout(timeout); reject(error); }
            });

            this.child.send({ id, method, params });
        });
    }

    // ─── Convenience methods ────────────────────────────────────────────────

    async getAddress() {
        const { address } = await this.call('getAddress');
        return address;
    }

    async sign(txData) {
        return this.call('sign', txData);
    }

    async signMessage(message) {
        return this.call('signMessage', { message });
    }

    async signTransaction(txData) {
        return this.call('signTransaction', txData);
    }

    async signTypedData(domain, types, message) {
        return this.call('signTypedData', { domain, types, message });
    }

    async neynarPost(text, options = {}) {
        return this.call('neynarPost', { text, ...options });
    }

    async neynarGet(endpoint) {
        return this.call('neynarGet', { endpoint });
    }

    async llmComplete(provider, messages, config = {}) {
        return this.call('llmComplete', { provider, messages, ...config });
    }

    async discordSend(channelId, content) {
        return this.call('discordSend', { channelId, content });
    }

    async telegramSend(chatId, text) {
        return this.call('telegramSend', { chatId, text });
    }

    async health() {
        return this.call('health');
    }

    /**
     * Create an ethers.Signer that routes all signing through the secrets proxy.
     * Use this wherever you previously used `new ethers.Wallet(privateKey, provider)`.
     */
    createSigner(provider) {
        return new ProxySigner(this, provider);
    }

    /**
     * Gracefully shut down the proxy.
     */
    async shutdown() {
        if (this.child) {
            this.child.kill('SIGTERM');
            this.child = null;
            this.ready = false;
        }
    }
}

/**
 * ProxySigner — ethers.Signer implementation that delegates all signing to the secrets proxy.
 *
 * Drop-in replacement for ethers.Wallet. All contract calls, sendTransaction(),
 * signMessage(), and signTypedData() route through IPC to the isolated proxy process.
 * The main agent process never touches raw private keys.
 */
class ProxySigner extends ethers.Signer {
    constructor(secretsClient, provider) {
        super();
        this._secretsClient = secretsClient;
        this._address = secretsClient.walletAddress;
        ethers.utils.defineReadOnly(this, 'provider', provider || null);
    }

    async getAddress() {
        return this._address;
    }

    async signMessage(message) {
        const msg = typeof message === 'string' ? message : ethers.utils.hexlify(message);
        const result = await this._secretsClient.signMessage(msg);
        return result.signature;
    }

    async signTransaction(transaction) {
        // Serialize BigNumber/BigInt fields to hex strings for IPC
        const tx = {};
        for (const [key, val] of Object.entries(transaction)) {
            if (ethers.BigNumber.isBigNumber(val)) {
                tx[key] = val.toHexString();
            } else if (typeof val === 'bigint') {
                tx[key] = '0x' + val.toString(16);
            } else {
                tx[key] = val;
            }
        }
        const result = await this._secretsClient.signTransaction(tx);
        return result.signedTransaction;
    }

    async _signTypedData(domain, types, value) {
        // Serialize BigInt/BigNumber values for IPC (JSON doesn't support BigInt)
        const serializedValue = {};
        for (const [key, val] of Object.entries(value)) {
            if (typeof val === 'bigint') {
                serializedValue[key] = val.toString();
            } else if (ethers.BigNumber.isBigNumber(val)) {
                serializedValue[key] = val.toString();
            } else {
                serializedValue[key] = val;
            }
        }
        const result = await this._secretsClient.signTypedData(domain, types, serializedValue);
        return result.signature;
    }

    // Alias for ethers v5 compatibility (some versions use signTypedData, others _signTypedData)
    async signTypedData(domain, types, value) {
        return this._signTypedData(domain, types, value);
    }

    connect(provider) {
        return new ProxySigner(this._secretsClient, provider);
    }
}

module.exports = SecretsClient;
