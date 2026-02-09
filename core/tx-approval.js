/**
 * Transaction Approval Manager
 *
 * Intercepts onchain transactions and routes them through either:
 * - Auto-approve (whitelisted contracts + under spending cap)
 * - Manual Telegram approval (inline buttons, /approve, /reject commands)
 *
 * Pending transactions expire after a configurable timeout (default 10 min).
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const QUEUE_FILE = path.join(__dirname, '..', 'data', 'pending-approvals.json');

// Known function selectors that are safe for auto-approve
const SAFE_SELECTORS = {
    '0xa9059cbb': 'transfer',
    '0x095ea7b3': 'approve',
    '0x23b872dd': 'transferFrom'
};

class TxApprovalManager {
    constructor(config = {}, toolsManager = null) {
        this.toolsManager = toolsManager;
        this.ownerChatId = config.ownerChatId || process.env.TELEGRAM_OWNER_CHAT_ID || null;

        // Auto-approve rules
        this.whitelistedContracts = (config.whitelistedContracts || []).map(a => a.toLowerCase());
        this.maxAutoApproveETH = parseFloat(config.maxAutoApproveETH || process.env.TX_APPROVAL_MAX_AUTO_ETH || '0.001');
        this.dailyAutoLimit = parseFloat(config.dailyAutoLimit || process.env.TX_APPROVAL_DAILY_AUTO_LIMIT || '0.01');
        this.expiryMs = (parseInt(config.expiryMinutes || process.env.TX_APPROVAL_EXPIRY_MIN || '10')) * 60 * 1000;

        // State
        this.queue = new Map();          // id → approval item (with resolve/reject)
        this.dailyAutoApproved = 0;      // ETH auto-approved today
        this.dailyResetDate = new Date().toDateString();

        // Load persisted queue (orphaned items get expired on startup)
        this._loadAndCleanup();

        console.log(`🔐 TxApprovalManager initialized (auto-approve ≤ ${this.maxAutoApproveETH} ETH, expiry ${this.expiryMs / 60000} min)`);
    }

    /**
     * Set owner chat ID (learned from first Telegram message)
     */
    setOwnerChatId(chatId) {
        if (!this.ownerChatId) {
            this.ownerChatId = chatId;
            console.log(`🔐 Approval notifications will go to chat ${chatId}`);
        }
    }

    /**
     * Main entry point — called from onchain-agent.validateTransaction()
     * Returns true if approved, throws if rejected/expired
     */
    async checkAndAwaitApproval(txData) {
        // Reset daily counter if new day
        const today = new Date().toDateString();
        if (today !== this.dailyResetDate) {
            this.dailyAutoApproved = 0;
            this.dailyResetDate = today;
        }

        // Check auto-approve rules
        if (this.shouldAutoApprove(txData)) {
            const ethValue = parseFloat(txData.value || '0');
            this.dailyAutoApproved += ethValue;
            console.log(`✅ Auto-approved: ${txData.operation} ${txData.value} ETH to ${txData.to?.slice(0, 10)}...`);
            return true;
        }

        // Manual approval needed — queue and notify
        return this._queueAndWait(txData);
    }

    /**
     * Check if transaction qualifies for auto-approval
     */
    shouldAutoApprove(txData) {
        const ethValue = parseFloat(txData.value || '0');

        // Must be under per-tx cap
        if (ethValue > this.maxAutoApproveETH) return false;

        // Must be under daily cumulative cap
        if (this.dailyAutoApproved + ethValue > this.dailyAutoLimit) return false;

        // Contract must be whitelisted (if we have a target address)
        if (txData.to) {
            const toLower = txData.to.toLowerCase();
            if (!this.whitelistedContracts.includes(toLower)) return false;
        }

        // If there's calldata, the function selector must be known-safe
        if (txData.data && txData.data !== '0x' && txData.data.length >= 10) {
            const selector = txData.data.slice(0, 10).toLowerCase();
            if (!SAFE_SELECTORS[selector]) return false;
        }

        return true;
    }

    /**
     * Queue a transaction and block until owner approves/rejects/expires
     */
    async _queueAndWait(txData) {
        const id = crypto.randomBytes(4).toString('hex'); // 8-char hex ID
        const now = Date.now();

        const item = {
            id,
            status: 'pending',
            createdAt: now,
            expiresAt: now + this.expiryMs,
            txData: {
                to: txData.to || 'unknown',
                value: txData.value || '0',
                valueWei: txData.valueWei || '0',
                data: txData.data ? (txData.data.length > 66 ? txData.data.slice(0, 66) + '...' : txData.data) : '0x',
                functionSelector: (txData.data && txData.data.length >= 10) ? txData.data.slice(0, 10) : null
            },
            context: {
                operation: txData.operation || 'unknown'
            },
            telegramMessageId: null
        };

        // Create the approval promise
        const approvalPromise = new Promise((resolve, reject) => {
            item._resolve = resolve;
            item._reject = reject;
        });

        this.queue.set(id, item);
        await this._saveQueue();

        // Send Telegram notification
        await this._sendApprovalRequest(item);

        console.log(`⏳ Queued tx ${id} for approval: ${txData.operation} ${txData.value} ETH to ${txData.to?.slice(0, 10)}...`);

        // Block until resolved
        try {
            const result = await approvalPromise;
            return result;
        } finally {
            this.queue.delete(id);
            await this._saveQueue();
        }
    }

    /**
     * Owner approves a pending transaction
     */
    async approveTransaction(id) {
        const item = this.queue.get(id);
        if (!item || item.status !== 'pending') return false;

        // Check not expired
        if (Date.now() > item.expiresAt) {
            item.status = 'expired';
            if (item._reject) item._reject(new Error('Transaction expired'));
            this.queue.delete(id);
            return false;
        }

        item.status = 'approved';
        console.log(`✅ Owner approved tx ${id}: ${item.context.operation}`);

        if (item._resolve) item._resolve(true);
        return true;
    }

    /**
     * Owner rejects a pending transaction
     */
    async rejectTransaction(id) {
        const item = this.queue.get(id);
        if (!item || item.status !== 'pending') return false;

        item.status = 'rejected';
        console.log(`🚫 Owner rejected tx ${id}: ${item.context.operation}`);

        if (item._reject) item._reject(new Error('Transaction rejected by owner'));
        return true;
    }

    /**
     * Get all pending transactions (for /pending command)
     */
    getPendingTransactions() {
        const pending = [];
        for (const item of this.queue.values()) {
            if (item.status === 'pending') {
                pending.push({
                    id: item.id,
                    operation: item.context.operation,
                    to: item.txData.to,
                    value: item.txData.value,
                    expiresIn: Math.max(0, Math.ceil((item.expiresAt - Date.now()) / 60000))
                });
            }
        }
        return pending;
    }

    /**
     * Expire old pending transactions (called every 60s)
     */
    expireOldTransactions() {
        const now = Date.now();
        let expired = 0;

        for (const [id, item] of this.queue.entries()) {
            if (item.status === 'pending' && now > item.expiresAt) {
                item.status = 'expired';
                if (item._reject) item._reject(new Error('Transaction approval expired'));
                this.queue.delete(id);
                expired++;
            }
        }

        if (expired > 0) {
            console.log(`⏰ Expired ${expired} pending transaction(s)`);
            this._saveQueue().catch(() => {});
        }
    }

    /**
     * Send Telegram message with inline Approve/Reject buttons
     */
    async _sendApprovalRequest(item) {
        if (!this.toolsManager || !this.ownerChatId) {
            console.warn('⚠️ Cannot send approval request: no Telegram connection');
            return;
        }

        const fnName = item.txData.functionSelector ? (SAFE_SELECTORS[item.txData.functionSelector] || item.txData.functionSelector) : 'ETH transfer';
        const expiryMin = Math.ceil(this.expiryMs / 60000);

        const text = [
            '🔔 TRANSACTION APPROVAL REQUIRED',
            '',
            `Operation: ${item.context.operation}`,
            `To: ${item.txData.to}`,
            `Value: ${item.txData.value} ETH`,
            `Function: ${fnName}`,
            item.txData.data !== '0x' ? `Data: ${item.txData.data}` : null,
            '',
            `⏰ Expires in ${expiryMin} minutes`,
            `ID: ${item.id}`
        ].filter(Boolean).join('\n');

        try {
            const result = await this.toolsManager.useTool('telegram', 'sendMessage', {
                chatId: this.ownerChatId,
                text,
                replyMarkup: {
                    inline_keyboard: [[
                        { text: '✅ Approve', callback_data: `approve:${item.id}` },
                        { text: '🚫 Reject', callback_data: `reject:${item.id}` }
                    ]]
                }
            });

            if (result.messageId) {
                item.telegramMessageId = result.messageId;
            }
        } catch (err) {
            console.error('❌ Failed to send approval request:', err.message);
        }
    }

    /**
     * Persist queue to disk (only serializable fields)
     */
    async _saveQueue() {
        const serializable = [];
        for (const item of this.queue.values()) {
            serializable.push({
                id: item.id,
                status: item.status,
                createdAt: item.createdAt,
                expiresAt: item.expiresAt,
                txData: item.txData,
                context: item.context,
                telegramMessageId: item.telegramMessageId
            });
        }

        try {
            await fs.writeFile(QUEUE_FILE, JSON.stringify(serializable, null, 2));
        } catch (err) {
            // data dir might not exist yet
            if (err.code === 'ENOENT') {
                await fs.mkdir(path.dirname(QUEUE_FILE), { recursive: true });
                await fs.writeFile(QUEUE_FILE, JSON.stringify(serializable, null, 2));
            }
        }
    }

    /**
     * Load persisted queue on startup, expire any orphaned items
     */
    async _loadAndCleanup() {
        try {
            const raw = await fs.readFile(QUEUE_FILE, 'utf8');
            const items = JSON.parse(raw);
            const now = Date.now();

            for (const item of items) {
                if (item.status === 'pending' && now > item.expiresAt) {
                    console.log(`⏰ Expired orphaned tx ${item.id} from previous run`);
                    continue; // skip — no resolve/reject to call
                }
                if (item.status === 'pending') {
                    // Orphaned pending items from crash — expire them
                    console.log(`⏰ Expiring orphaned pending tx ${item.id} (no callback attached)`);
                    continue;
                }
            }

            // Start fresh — no items carry over since promises are lost on restart
            this.queue.clear();
            await this._saveQueue();
        } catch {
            // No file or invalid JSON — start fresh
        }
    }
}

module.exports = TxApprovalManager;
