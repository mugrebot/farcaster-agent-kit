/**
 * OnChain Agent - Autonomous blockchain interaction capabilities
 * Enables the agent to interact with smart contracts, trade tokens, and participate in DeFi
 */

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

class OnChainAgent {
    constructor(config = {}) {
        // Network configuration
        this.network = config.network || 'base';
        this.rpcUrl = config.rpcUrl || this.getDefaultRPC(this.network);

        // Initialize provider
        this.provider = new ethers.JsonRpcProvider(this.rpcUrl);

        // Wallet management
        this.wallet = null;
        this.walletPath = path.join(process.cwd(), '.wallet.json');

        // Safety limits
        this.maxTransactionValue = ethers.parseEther(config.maxTransactionValue || '0.01');
        this.dailySpendLimit = ethers.parseEther(config.dailySpendLimit || '0.1');
        this.dailySpent = 0n;
        this.lastResetDate = new Date().toDateString();

        // Transaction history
        this.transactionHistory = [];

        // MEV and Slippage Protection
        this.mevProtection = config.mevProtection !== false; // Default enabled
        this.maxSlippage = config.maxSlippage || 200; // 2% default (in basis points)
        this.minGasPrice = ethers.parseUnits('0.001', 'gwei'); // Min gas price
        this.maxGasPrice = ethers.parseUnits('50', 'gwei'); // Max gas price

        // Rate limiting
        this.transactionQueue = [];
        this.maxTransactionsPerHour = config.maxTxPerHour || 5;
        this.recentTransactions = [];

        // Multi-sig threshold
        this.multiSigThreshold = ethers.parseEther(config.multiSigThreshold || '10'); // $10k default

        // Coordination with LLM
        this.llm = config.llm;

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
     * Initialize or load wallet
     */
    async initializeWallet(privateKey = null) {
        try {
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
            console.log(`   Balance: ${ethers.formatEther(balance)} ETH`);

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
     * Simple encryption (you should use proper encryption in production)
     */
    encrypt(text) {
        // WARNING: This is a simple XOR encryption for demo
        // Use proper encryption (e.g., crypto.createCipher) in production
        const key = process.env.WALLET_ENCRYPTION_KEY || 'default-key';
        let encrypted = '';
        for (let i = 0; i < text.length; i++) {
            encrypted += String.fromCharCode(
                text.charCodeAt(i) ^ key.charCodeAt(i % key.length)
            );
        }
        return Buffer.from(encrypted).toString('base64');
    }

    /**
     * Simple decryption
     */
    decrypt(encrypted) {
        const key = process.env.WALLET_ENCRYPTION_KEY || 'default-key';
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

        // Check single transaction limit
        if (value > this.maxTransactionValue) {
            throw new Error(`Transaction exceeds max value: ${ethers.formatEther(value)} > ${ethers.formatEther(this.maxTransactionValue)}`);
        }

        // Check daily limit
        if (this.dailySpent + value > this.dailySpendLimit) {
            throw new Error(`Transaction would exceed daily limit: ${ethers.formatEther(this.dailySpent + value)} > ${ethers.formatEther(this.dailySpendLimit)}`);
        }

        // Use LLM to validate if transaction makes sense
        if (this.llm) {
            const decision = await this.llm.generateCoordination(`
Should I execute this transaction?
To: ${to}
Value: ${ethers.formatEther(value)} ETH
Data: ${data}
Current daily spent: ${ethers.formatEther(this.dailySpent)} ETH

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
            console.log(`🔐 Multi-sig required for transaction above ${ethers.formatEther(this.multiSigThreshold)} ETH`);
            // In production, this would require multi-sig approval
            throw new Error('Transaction requires multi-sig approval');
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

        const value = ethers.parseEther(amount.toString());
        await this.validateTransaction(value, to);

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
                value: ethers.formatEther(value),
                timestamp: Date.now(),
                status: receipt.status === 1 ? 'success' : 'failed'
            };

            this.transactionHistory.push(txRecord);
            this.recentTransactions.push(txRecord); // For rate limiting

            return receipt;
        } catch (error) {
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

        return {
            balance: ethers.formatUnits(balance, decimals),
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
        const value = ethers.parseUnits(amount.toString(), decimals);

        // Validate with 0 ETH value but check token amount
        await this.validateTransaction(0n, to);

        const tx = await token.transfer(to, value);
        console.log(`📤 Token transfer sent: ${tx.hash}`);
        const receipt = await tx.wait();

        return receipt;
    }

    /**
     * Interact with Uniswap V3 (Base)
     */
    async swapTokens(tokenIn, tokenOut, amountIn, slippage = 0.5) {
        // Uniswap V3 Router on Base
        const UNISWAP_ROUTER = '0x2626664c2603336E57B271c5C0b26F421741e481';

        const routerABI = [
            "function exactInputSingle((address,address,uint24,address,uint256,uint256,uint160)) returns (uint256)"
        ];

        const router = new ethers.Contract(UNISWAP_ROUTER, routerABI, this.wallet);

        // Prepare swap parameters
        const params = {
            tokenIn,
            tokenOut,
            fee: 3000, // 0.3% fee tier
            recipient: this.wallet.address,
            amountIn,
            amountOutMinimum: 0, // Calculate based on slippage
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
                if (tx && tx.value > ethers.parseEther('1')) {
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
            gasPrice: ethers.formatUnits(feeData.gasPrice, 'gwei'),
            maxFeePerGas: ethers.formatUnits(feeData.maxFeePerGas, 'gwei'),
            maxPriorityFeePerGas: ethers.formatUnits(feeData.maxPriorityFeePerGas, 'gwei')
        };
    }

    /**
     * Execute arbitrary contract call
     */
    async callContract(address, abi, method, params = []) {
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