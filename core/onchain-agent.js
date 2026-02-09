/**
 * OnChain Agent - Autonomous blockchain interaction capabilities
 * Enables the agent to interact with smart contracts, trade tokens, and participate in DeFi
 */

const { ethers } = require('ethers');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class OnChainAgent {
    constructor(config = {}) {
        // Network configuration
        this.network = config.network || 'base';
        this.rpcUrl = config.rpcUrl || this.getDefaultRPC(this.network);

        // Initialize provider
        this.provider = new ethers.providers.JsonRpcProvider(this.rpcUrl);

        // Wallet management
        this.wallet = null;
        this.walletPath = path.join(process.cwd(), '.wallet.json');

        // Safety limits
        this.maxTransactionValue = ethers.utils.parseEther(config.maxTransactionValue || '0.01');
        this.dailySpendLimit = ethers.utils.parseEther(config.dailySpendLimit || '0.1');
        this.dailySpent = 0n;
        this.lastResetDate = new Date().toDateString();

        // Transaction history
        this.transactionHistory = [];

        // MEV and Slippage Protection
        this.mevProtection = config.mevProtection !== false; // Default enabled
        this.maxSlippage = config.maxSlippage || 200; // 2% default (in basis points)
        this.minGasPrice = ethers.utils.parseUnits('0.001', 'gwei'); // Min gas price
        this.maxGasPrice = ethers.utils.parseUnits('50', 'gwei'); // Max gas price

        // Rate limiting
        this.transactionQueue = [];
        this.maxTransactionsPerHour = config.maxTxPerHour || 5;
        this.recentTransactions = [];

        // Circuit breaker — trips after consecutive failures, auto-resets after cooldown
        this.circuitBreaker = {
            failures: 0,
            maxFailures: config.circuitBreakerMax || 3,
            cooldownMs: config.circuitBreakerCooldown || 30 * 60 * 1000, // 30 min
            trippedAt: null
        };

        // Multi-sig threshold
        this.multiSigThreshold = ethers.utils.parseEther(config.multiSigThreshold || '10'); // $10k default

        // Coordination with LLM
        this.llm = config.llm;

        // Transaction approval manager (injected by AgentRunner after init)
        this.approvalManager = null;
        this._currentOperation = null;

        console.log(`🔗 OnChain Agent initialized on ${this.network}`);
    }

    /**
     * Get default RPC URL for network
     */
    getDefaultRPC(network) {
        const rpcs = {
            'base': 'https://mainnet.base.org',
            'base-sepolia': 'https://sepolia.base.org',
            'ethereum': 'https://eth.llamarpc.com',
            'sepolia': 'https://sepolia.infura.io/v3/YOUR_INFURA_KEY',
            'optimism': 'https://mainnet.optimism.io',
            'arbitrum': 'https://arb1.arbitrum.io/rpc'
        };
        return rpcs[network] || rpcs['base'];
    }

    /**
     * Initialize or load wallet.
     * When secretsClient is set, uses ProxySigner (private key stays in proxy process).
     */
    async initializeWallet(privateKey = null) {
        try {
            // Proxy mode: signing routed through isolated secrets process
            if (this.secretsClient && this.secretsClient.ready) {
                this.wallet = this.secretsClient.createSigner(this.provider);
                const address = await this.wallet.getAddress();
                console.log(`💰 Wallet initialized via secrets proxy: ${address}`);

                const balance = await this.provider.getBalance(address);
                console.log(`   Balance: ${ethers.utils.formatEther(balance)} ETH`);
                return address;
            }

            // Direct mode (no proxy): legacy behavior
            if (privateKey) {
                // Create wallet from private key
                this.wallet = new ethers.Wallet(privateKey, this.provider);
                await this.saveWallet(privateKey);
                console.log(`💰 Wallet initialized: ${this.wallet.address}`);
            } else if (fs.existsSync(this.walletPath)) {
                // Load existing wallet
                const encryptedWallet = JSON.parse(fs.readFileSync(this.walletPath, 'utf8'));
                const privateKey = this.decrypt(encryptedWallet.encryptedKey);
                this.wallet = new ethers.Wallet(privateKey, this.provider);
                console.log(`💰 Wallet loaded: ${this.wallet.address}`);
            } else {
                // Generate new wallet
                this.wallet = ethers.Wallet.createRandom(this.provider);
                await this.saveWallet(this.wallet.privateKey);
                console.log(`💰 New wallet created: ${this.wallet.address}`);
                console.log(`⚠️  Fund this address to enable on-chain interactions`);
            }

            // Get balance
            const balance = await this.provider.getBalance(this.wallet.address);
            console.log(`   Balance: ${ethers.utils.formatEther(balance)} ETH`);

            return this.wallet.address;
        } catch (error) {
            console.error('Failed to initialize wallet:', error);
            throw error;
        }
    }

    /**
     * Save wallet (encrypted)
     */
    async saveWallet(privateKey) {
        const encrypted = this.encrypt(privateKey);
        fs.writeFileSync(this.walletPath, JSON.stringify({
            encryptedKey: encrypted,
            address: this.wallet.address,
            network: this.network
        }, null, 2));
    }

    /**
     * AES-256-GCM encryption for wallet private keys
     */
    encrypt(text) {
        const keyHex = process.env.WALLET_ENCRYPTION_KEY;
        if (!keyHex) {
            throw new Error('WALLET_ENCRYPTION_KEY environment variable is required for wallet encryption');
        }
        const key = crypto.createHash('sha256').update(keyHex).digest();
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag().toString('hex');
        return JSON.stringify({ iv: iv.toString('hex'), data: encrypted, tag: authTag });
    }

    /**
     * AES-256-GCM decryption for wallet private keys
     */
    decrypt(encryptedStr) {
        const keyHex = process.env.WALLET_ENCRYPTION_KEY;
        if (!keyHex) {
            throw new Error('WALLET_ENCRYPTION_KEY environment variable is required for wallet decryption');
        }
        const key = crypto.createHash('sha256').update(keyHex).digest();
        let parsed;
        try {
            parsed = JSON.parse(encryptedStr);
        } catch {
            // Legacy XOR format — migrate on next save
            console.warn('⚠️ Legacy wallet encryption detected. Will re-encrypt on next save.');
            return this._decryptLegacy(encryptedStr);
        }
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(parsed.iv, 'hex'));
        decipher.setAuthTag(Buffer.from(parsed.tag, 'hex'));
        let decrypted = decipher.update(parsed.data, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }

    /**
     * Legacy XOR decryption for migration only — will be removed
     */
    _decryptLegacy(encrypted) {
        const key = process.env.WALLET_ENCRYPTION_KEY || '';
        const text = Buffer.from(encrypted, 'base64').toString();
        let decrypted = '';
        for (let i = 0; i < text.length; i++) {
            decrypted += String.fromCharCode(
                text.charCodeAt(i) ^ key.charCodeAt(i % key.length)
            );
        }
        return decrypted;
    }

    /**
     * Check and reset daily spend limit
     */
    checkDailyLimit() {
        const today = new Date().toDateString();
        if (today !== this.lastResetDate) {
            this.dailySpent = 0n;
            this.lastResetDate = today;
        }
    }

    /**
     * Validate transaction against safety limits
     */
    async validateTransaction(value, to, data = '0x') {
        this.checkDailyLimit();

        // Circuit breaker check
        if (this.circuitBreaker.trippedAt) {
            const elapsed = Date.now() - this.circuitBreaker.trippedAt;
            if (elapsed < this.circuitBreaker.cooldownMs) {
                const remaining = Math.ceil((this.circuitBreaker.cooldownMs - elapsed) / 60000);
                throw new Error(`Circuit breaker active: ${this.circuitBreaker.failures} consecutive failures. Resumes in ${remaining} min.`);
            }
            // Cooldown expired — reset
            this.circuitBreaker.failures = 0;
            this.circuitBreaker.trippedAt = null;
            console.log('🔄 Circuit breaker reset after cooldown');
        }

        // Check single transaction limit
        if (value > this.maxTransactionValue) {
            throw new Error(`Transaction exceeds max value: ${ethers.utils.formatEther(value)} > ${ethers.utils.formatEther(this.maxTransactionValue)}`);
        }

        // Check daily limit
        if (this.dailySpent + value > this.dailySpendLimit) {
            throw new Error(`Transaction would exceed daily limit: ${ethers.utils.formatEther(this.dailySpent + value)} > ${ethers.utils.formatEther(this.dailySpendLimit)}`);
        }

        // Use LLM to validate if transaction makes sense
        if (this.llm) {
            const decision = await this.llm.generateCoordination(`
Should I execute this transaction?
To: ${to}
Value: ${ethers.utils.formatEther(value)} ETH
Data: ${data}
Current daily spent: ${ethers.utils.formatEther(this.dailySpent)} ETH

Consider:
- Is this a known contract/address?
- Does the value seem reasonable?
- Is this aligned with m00npapi's goals?

Answer YES or NO with reasoning.
`, { mode: 'transaction_validation' });

            if (!decision.content.toUpperCase().includes('YES')) {
                throw new Error(`Transaction rejected by safety check: ${decision.content}`);
            }
        }

        // Check rate limiting
        if (!this.checkRateLimit()) {
            throw new Error('Rate limit exceeded: Too many transactions per hour');
        }

        // Check if multi-sig required
        if (value > this.multiSigThreshold) {
            console.log(`🔐 Multi-sig required for transaction above ${ethers.utils.formatEther(this.multiSigThreshold)} ETH`);
            throw new Error('Transaction requires multi-sig approval');
        }

        // Owner approval gate (Telegram-based)
        if (this.approvalManager) {
            const approved = await this.approvalManager.checkAndAwaitApproval({
                to,
                value: ethers.utils.formatEther(value),
                valueWei: value.toString(),
                data,
                operation: this._currentOperation || 'unknown'
            });
            if (!approved) throw new Error('Transaction rejected by owner');
        }

        return true;
    }

    /**
     * Check rate limiting
     */
    checkRateLimit() {
        const now = Date.now();
        const oneHourAgo = now - 3600000;

        // Filter recent transactions
        this.recentTransactions = this.recentTransactions.filter(tx => tx.timestamp > oneHourAgo);

        if (this.recentTransactions.length >= this.maxTransactionsPerHour) {
            return false;
        }

        return true;
    }

    /**
     * Apply MEV protection
     */
    async applyMEVProtection(tx) {
        if (!this.mevProtection) return tx;

        // Use Flashbots-style private mempool (would need Flashbots integration)
        // For now, use gas optimization and timing strategies

        // 1. Use optimal gas price
        const gasPrice = await this.getOptimalGasPrice();
        tx.gasPrice = gasPrice;

        // 2. Add random delay (0-3 seconds) to avoid timing attacks
        const delay = Math.random() * 3000;
        await new Promise(resolve => setTimeout(resolve, delay));

        // 3. Set tight gas limit to minimize MEV extraction
        if (!tx.gasLimit) {
            tx.gasLimit = await this.provider.estimateGas(tx);
            tx.gasLimit = tx.gasLimit * 110n / 100n; // Add 10% buffer
        }

        console.log('🛡️ MEV protection applied');
        return tx;
    }

    /**
     * Get optimal gas price
     */
    async getOptimalGasPrice() {
        const feeData = await this.provider.getFeeData();
        let gasPrice = feeData.gasPrice;

        // Clamp between min and max
        if (gasPrice < this.minGasPrice) {
            gasPrice = this.minGasPrice;
        } else if (gasPrice > this.maxGasPrice) {
            gasPrice = this.maxGasPrice;
        }

        return gasPrice;
    }

    /**
     * Calculate slippage protection
     */
    calculateSlippageProtection(expectedAmount, slippageBps = null) {
        const slippage = slippageBps || this.maxSlippage;
        const minAmount = expectedAmount * BigInt(10000 - slippage) / 10000n;
        return minAmount;
    }

    /**
     * Send ETH transaction
     */
    async sendETH(to, amount) {
        if (!this.wallet) throw new Error('Wallet not initialized');

        const value = ethers.utils.parseEther(amount.toString());
        this._currentOperation = 'sendETH';
        await this.validateTransaction(value, to);
        this._currentOperation = null;

        try {
            let tx = {
                to,
                value,
                gasLimit: 21000
            };

            // Apply MEV protection
            tx = await this.applyMEVProtection(tx);

            const transaction = await this.wallet.sendTransaction(tx);

            console.log(`📤 Transaction sent: ${transaction.hash}`);
            const receipt = await transaction.wait();

            // Update daily spent
            this.dailySpent += value;

            // Record transaction
            const txRecord = {
                hash: transaction.hash,
                type: 'send_eth',
                to,
                value: ethers.utils.formatEther(value),
                timestamp: Date.now(),
                status: receipt.status === 1 ? 'success' : 'failed'
            };

            this.transactionHistory.push(txRecord);
            this.recentTransactions.push(txRecord); // For rate limiting

            // Circuit breaker: reset on success
            this.circuitBreaker.failures = 0;

            return receipt;
        } catch (error) {
            // Circuit breaker: record failure
            this.circuitBreaker.failures++;
            if (this.circuitBreaker.failures >= this.circuitBreaker.maxFailures) {
                this.circuitBreaker.trippedAt = Date.now();
                console.error(`🔴 Circuit breaker TRIPPED after ${this.circuitBreaker.failures} consecutive failures. Cooldown: ${this.circuitBreaker.cooldownMs / 60000} min`);
            }
            console.error('Transaction failed:', error);
            throw error;
        }
    }

    /**
     * Interact with ERC20 token
     */
    async interactWithToken(tokenAddress, abi = null) {
        if (!this.wallet) throw new Error('Wallet not initialized');

        // Default ERC20 ABI if not provided
        const defaultABI = [
            "function balanceOf(address owner) view returns (uint256)",
            "function transfer(address to, uint256 amount) returns (bool)",
            "function approve(address spender, uint256 amount) returns (bool)",
            "function symbol() view returns (string)",
            "function decimals() view returns (uint8)"
        ];

        const contract = new ethers.Contract(
            tokenAddress,
            abi || defaultABI,
            this.wallet
        );

        return contract;
    }

    /**
     * Get token balance
     */
    async getTokenBalance(tokenAddress) {
        const token = await this.interactWithToken(tokenAddress);
        const balance = await token.balanceOf(this.wallet.address);
        const symbol = await token.symbol();
        const decimals = await token.decimals();
        if (decimals > 18) throw new Error(`Suspicious token ${tokenAddress}: decimals=${decimals} (max expected: 18)`);

        return {
            balance: ethers.utils.formatUnits(balance, decimals),
            symbol,
            raw: balance
        };
    }

    /**
     * Transfer tokens
     */
    async transferToken(tokenAddress, to, amount) {
        const token = await this.interactWithToken(tokenAddress);
        const decimals = await token.decimals();
        if (decimals > 18) throw new Error(`Suspicious token ${tokenAddress}: decimals=${decimals} (max expected: 18)`);
        const value = ethers.utils.parseUnits(amount.toString(), decimals);

        // Validate with 0 ETH value but check token amount
        this._currentOperation = `transferToken(${tokenAddress.slice(0, 10)}...)`;
        await this.validateTransaction(0n, to);
        this._currentOperation = null;

        const tx = await token.transfer(to, value);
        console.log(`📤 Token transfer sent: ${tx.hash}`);
        const receipt = await tx.wait();

        return receipt;
    }

    /**
     * Interact with Uniswap V3 (Base)
     */
    async swapTokens(tokenIn, tokenOut, amountIn, slippageBps = 200) {
        this._currentOperation = 'swapTokens';
        // Uniswap V3 Router on Base
        const UNISWAP_ROUTER = '0x2626664c2603336E57B271c5C0b26F421741e481';

        const routerABI = [
            "function exactInputSingle((address,address,uint24,address,uint256,uint256,uint160)) returns (uint256)"
        ];

        const router = new ethers.Contract(UNISWAP_ROUTER, routerABI, this.wallet);

        // Calculate minimum output with slippage protection
        const minAmountOut = this.calculateSlippageProtection(amountIn, slippageBps);

        const params = {
            tokenIn,
            tokenOut,
            fee: 3000, // 0.3% fee tier
            recipient: this.wallet.address,
            amountIn,
            amountOutMinimum: minAmountOut,
            sqrtPriceLimitX96: 0
        };

        // Approve router to spend tokens
        const tokenContract = await this.interactWithToken(tokenIn);
        await tokenContract.approve(UNISWAP_ROUTER, amountIn);

        // Execute swap
        const tx = await router.exactInputSingle(params);
        const receipt = await tx.wait();

        console.log(`🔄 Swap executed: ${tx.hash}`);
        return receipt;
    }

    /**
     * Monitor mempool for opportunities
     */
    async monitorMempool(callback) {
        console.log('👁️ Starting mempool monitoring...');

        this.provider.on('pending', async (txHash) => {
            try {
                const tx = await this.provider.getTransaction(txHash);
                if (tx && tx.value > ethers.utils.parseEther('1')) {
                    // Large transaction detected
                    if (callback) {
                        await callback(tx);
                    }
                }
            } catch (error) {
                // Transaction might be already mined
            }
        });
    }

    /**
     * Get gas price recommendation
     */
    async getGasPrice() {
        const feeData = await this.provider.getFeeData();
        return {
            gasPrice: ethers.utils.formatUnits(feeData.gasPrice, 'gwei'),
            maxFeePerGas: ethers.utils.formatUnits(feeData.maxFeePerGas, 'gwei'),
            maxPriorityFeePerGas: ethers.utils.formatUnits(feeData.maxPriorityFeePerGas, 'gwei')
        };
    }

    /**
     * Execute arbitrary contract call
     */
    async callContract(address, abi, method, params = []) {
        this._currentOperation = `callContract(${method})`;
        const contract = new ethers.Contract(address, abi, this.wallet);

        // Estimate gas
        const gasEstimate = await contract[method].estimateGas(...params);

        // Execute with 10% buffer on gas
        const tx = await contract[method](...params, {
            gasLimit: gasEstimate * 110n / 100n
        });

        const receipt = await tx.wait();
        return receipt;
    }

    /**
     * Get transaction history
     */
    getHistory() {
        return this.transactionHistory;
    }
}

module.exports = OnChainAgent;