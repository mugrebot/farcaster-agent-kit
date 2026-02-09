/**
 * Secrets Proxy — Isolated child process that holds all sensitive credentials.
 *
 * The main agent process communicates with this via IPC (process.send / process.on('message')).
 * Raw secrets NEVER leave this process — only operation results are returned.
 *
 * Spawned by: scripts/start-agent.js via child_process.fork()
 */

const { ethers } = require('ethers');
const https = require('https');
const path = require('path');

// Load .env from the project root (parent of core/)
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

// ─── Secrets (loaded once, never exposed) ───────────────────────────────────

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;
const SIGNER_UUID = process.env.SIGNER_UUID;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WALLET_ENCRYPTION_KEY = process.env.WALLET_ENCRYPTION_KEY;
const PINATA_JWT = process.env.PINATA_JWT;
const PINATA_API_KEY = process.env.PINATA_API_KEY;
const PINATA_API_SECRET = process.env.PINATA_API_SECRET;
const RPC_URL = process.env.BASE_RPC_URL || process.env.RPC_URL || 'https://mainnet.base.org';

// ─── Wallet initialization ──────────────────────────────────────────────────

let wallet = null;
let walletAddress = null;

if (PRIVATE_KEY) {
    const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
    wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    walletAddress = wallet.address;
}

// ─── Rate limiting ──────────────────────────────────────────────────────────

const rateLimits = {
    sign:       { max: 10, windowMs: 3600000, calls: [] },
    neynarPost: { max: 30, windowMs: 3600000, calls: [] },
    llm:        { max: 200, windowMs: 3600000, calls: [] },
    discord:    { max: 60, windowMs: 3600000, calls: [] },
    telegram:   { max: 60, windowMs: 3600000, calls: [] },
};

function checkRateLimit(operation) {
    const limit = rateLimits[operation];
    if (!limit) return true;
    const now = Date.now();
    limit.calls = limit.calls.filter(t => now - t < limit.windowMs);
    if (limit.calls.length >= limit.max) {
        throw new Error(`Rate limit exceeded for ${operation}: ${limit.max} per ${limit.windowMs / 60000} min`);
    }
    limit.calls.push(now);
    return true;
}

// ─── Audit log ──────────────────────────────────────────────────────────────

function auditLog(method, params, success) {
    const ts = new Date().toISOString();
    const safe = { ...params };
    // Never log sensitive fields
    delete safe.privateKey; delete safe.apiKey; delete safe.messages;
    console.log(`[SECRETS-PROXY] ${ts} ${method} ${success ? 'OK' : 'FAIL'} ${JSON.stringify(safe).slice(0, 200)}`);
}

// ─── HTTPS helper (no axios dependency) ─────────────────────────────────────

function httpsPost(url, headers, body) {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const req = https.request({
            hostname: parsed.hostname,
            path: parsed.pathname + parsed.search,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...headers }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
                catch { resolve({ status: res.statusCode, data }); }
            });
        });
        req.on('error', reject);
        req.write(JSON.stringify(body));
        req.end();
    });
}

// ─── Handlers ───────────────────────────────────────────────────────────────

const handlers = {
    /**
     * Get the wallet's public address (not secret)
     */
    async getAddress() {
        return { address: walletAddress };
    },

    /**
     * Sign and send a transaction. Returns tx hash + receipt.
     */
    async sign({ to, value, data, gasLimit, nonce }) {
        if (!wallet) throw new Error('Wallet not initialized (no PRIVATE_KEY)');
        checkRateLimit('sign');

        const tx = {
            to,
            value: value ? ethers.BigNumber.from(value) : 0,
            data: data || '0x',
        };
        if (gasLimit) tx.gasLimit = gasLimit;
        if (nonce !== undefined) tx.nonce = nonce;

        const transaction = await wallet.sendTransaction(tx);
        const receipt = await transaction.wait();

        return {
            hash: transaction.hash,
            blockNumber: receipt.blockNumber,
            status: receipt.status,
            gasUsed: receipt.gasUsed.toString()
        };
    },

    /**
     * Sign a raw message (for EIP-712, etc.)
     */
    async signMessage({ message }) {
        if (!wallet) throw new Error('Wallet not initialized');
        checkRateLimit('sign');
        const signature = await wallet.signMessage(message);
        return { signature };
    },

    /**
     * Sign a transaction without broadcasting (for ProxySigner interface).
     * Returns the raw signed transaction hex.
     */
    async signTransaction({ to, value, data, gasLimit, nonce, gasPrice, maxFeePerGas, maxPriorityFeePerGas, chainId, type }) {
        if (!wallet) throw new Error('Wallet not initialized (no PRIVATE_KEY)');
        checkRateLimit('sign');

        const tx = {};
        if (to) tx.to = to;
        if (value !== undefined) tx.value = ethers.BigNumber.from(value);
        if (data) tx.data = data;
        if (gasLimit) tx.gasLimit = ethers.BigNumber.from(gasLimit);
        if (nonce !== undefined) tx.nonce = nonce;
        if (gasPrice) tx.gasPrice = ethers.BigNumber.from(gasPrice);
        if (maxFeePerGas) tx.maxFeePerGas = ethers.BigNumber.from(maxFeePerGas);
        if (maxPriorityFeePerGas) tx.maxPriorityFeePerGas = ethers.BigNumber.from(maxPriorityFeePerGas);
        if (chainId) tx.chainId = chainId;
        if (type !== undefined) tx.type = type;

        const signedTx = await wallet.signTransaction(tx);
        return { signedTransaction: signedTx };
    },

    /**
     * Sign EIP-712 typed data (for agent0 Clanker News auth, etc.)
     */
    async signTypedData({ domain, types, message }) {
        if (!wallet) throw new Error('Wallet not initialized');
        checkRateLimit('sign');
        // ethers v5: _signTypedData is the canonical method
        const signature = await wallet._signTypedData(domain, types, message);
        return { signature };
    },

    /**
     * Post to Farcaster via Neynar API
     */
    async neynarPost({ text, channelId, parentHash }) {
        if (!NEYNAR_API_KEY || !SIGNER_UUID) throw new Error('NEYNAR_API_KEY and SIGNER_UUID required');
        checkRateLimit('neynarPost');

        const body = { signer_uuid: SIGNER_UUID, text };
        if (channelId) body.channel_id = channelId;
        if (parentHash) body.parent = parentHash;

        const result = await httpsPost('https://api.neynar.com/v2/farcaster/cast', {
            'api_key': NEYNAR_API_KEY
        }, body);

        if (result.status !== 200) throw new Error(`Neynar API error: ${JSON.stringify(result.data)}`);
        return { hash: result.data?.cast?.hash, success: true };
    },

    /**
     * Make Neynar API GET request (for reading casts, user info, etc.)
     */
    async neynarGet({ endpoint }) {
        if (!NEYNAR_API_KEY) throw new Error('NEYNAR_API_KEY required');
        return new Promise((resolve, reject) => {
            const url = new URL(`https://api.neynar.com${endpoint}`);
            https.get({
                hostname: url.hostname,
                path: url.pathname + url.search,
                headers: { 'api_key': NEYNAR_API_KEY }
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try { resolve(JSON.parse(data)); }
                    catch { resolve(data); }
                });
            }).on('error', reject);
        });
    },

    /**
     * Call LLM API (OpenAI, Anthropic, Groq)
     */
    async llmComplete({ provider, model, messages, maxTokens, temperature }) {
        checkRateLimit('llm');

        if (provider === 'openai' || provider === 'groq') {
            const apiKey = provider === 'openai' ? OPENAI_API_KEY : GROQ_API_KEY;
            if (!apiKey) throw new Error(`${provider.toUpperCase()}_API_KEY required`);

            const baseUrl = provider === 'openai'
                ? 'https://api.openai.com/v1/chat/completions'
                : 'https://api.groq.com/openai/v1/chat/completions';

            const result = await httpsPost(baseUrl, {
                'Authorization': `Bearer ${apiKey}`
            }, {
                model: model || (provider === 'openai' ? 'gpt-4o-mini' : 'llama-3.1-8b-instant'),
                messages,
                max_tokens: maxTokens || 150,
                temperature: temperature || 0.8
            });

            return { content: result.data?.choices?.[0]?.message?.content || '', usage: result.data?.usage };
        }

        if (provider === 'anthropic') {
            if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY required');
            const systemMsg = messages.find(m => m.role === 'system')?.content || '';
            const userMsgs = messages.filter(m => m.role !== 'system');

            const result = await httpsPost('https://api.anthropic.com/v1/messages', {
                'x-api-key': ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01'
            }, {
                model: model || 'claude-sonnet-4-5-20250929',
                max_tokens: maxTokens || 150,
                temperature: temperature || 0.8,
                system: systemMsg,
                messages: userMsgs
            });

            return { content: result.data?.content?.[0]?.text || '', usage: result.data?.usage };
        }

        throw new Error(`Unknown LLM provider: ${provider}`);
    },

    /**
     * Send Discord message
     */
    async discordSend({ channelId, content }) {
        if (!DISCORD_BOT_TOKEN) throw new Error('DISCORD_BOT_TOKEN required');
        checkRateLimit('discord');

        const result = await httpsPost(`https://discord.com/api/v10/channels/${channelId}/messages`, {
            'Authorization': `Bot ${DISCORD_BOT_TOKEN}`
        }, { content });

        return { messageId: result.data?.id, success: result.status === 200 };
    },

    /**
     * Send Telegram message
     */
    async telegramSend({ chatId, text }) {
        if (!TELEGRAM_BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN required');
        checkRateLimit('telegram');

        const result = await httpsPost(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {}, {
            chat_id: chatId, text
        });

        return { messageId: result.data?.result?.message_id, success: result.data?.ok };
    },

    /**
     * Generate text embedding via OpenAI text-embedding-3-small.
     * Returns embedding vector without exposing API key.
     */
    async embedding({ text }) {
        if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY required for embeddings');
        checkRateLimit('llm');

        const result = await httpsPost('https://api.openai.com/v1/embeddings', {
            'Authorization': `Bearer ${OPENAI_API_KEY}`
        }, {
            model: 'text-embedding-3-small',
            input: text.slice(0, 8000), // Cap input length
        });

        if (result.status !== 200) {
            throw new Error(`Embedding API error: ${result.status}`);
        }

        return { embedding: result.data?.data?.[0]?.embedding || null };
    },

    /**
     * Health check — reports what capabilities are available
     */
    async health() {
        return {
            wallet: !!wallet,
            walletAddress,
            neynar: !!(NEYNAR_API_KEY && SIGNER_UUID),
            openai: !!OPENAI_API_KEY,
            anthropic: !!ANTHROPIC_API_KEY,
            groq: !!GROQ_API_KEY,
            discord: !!DISCORD_BOT_TOKEN,
            telegram: !!TELEGRAM_BOT_TOKEN,
            pinata: !!PINATA_JWT,
        };
    }
};

// ─── IPC message handler ────────────────────────────────────────────────────

process.on('message', async (msg) => {
    const { id, method, params } = msg;

    if (!handlers[method]) {
        process.send({ id, error: `Unknown method: ${method}` });
        return;
    }

    try {
        const result = await handlers[method](params || {});
        auditLog(method, params || {}, true);
        process.send({ id, result });
    } catch (error) {
        auditLog(method, params || {}, false);
        process.send({ id, error: error.message });
    }
});

// Signal ready
if (process.send) {
    process.send({ ready: true, walletAddress });
}

console.log(`🔐 Secrets proxy started (wallet: ${walletAddress || 'none'})`);
