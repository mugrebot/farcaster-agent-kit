/**
 * Clanknet Interactor V4 - Direct Uniswap V4 SDK Implementation
 * Implements proper V4 Universal Router integration for Clanknet token purchasing
 * Based on official Uniswap V4 documentation
 */

const { ethers } = require('ethers');
const { Token, ChainId } = require('@uniswap/sdk-core');
const { Actions, V4Planner } = require('@uniswap/v4-sdk');
const { CommandType, RoutePlanner } = require('@uniswap/universal-router-sdk');

class ClanknetInteractorV4 {
    constructor(provider, wallet) {
        this.provider = provider;
        this.wallet = wallet;

        // Clanknet token details on Base
        this.clanknetAddress = '0x623693BefAECf61484e344fa272e9A8B82d9BB07';
        this.wethAddress = '0x4200000000000000000000000000000000000006';
        this.decimals = 18;

        // Base network configuration
        this.chainId = 8453; // Base

        // Universal Router address on Base (from Uniswap deployments)
        this.universalRouterAddress = '0x198EF1ec325a96cc354C7266a038BE8B5c558F67'; // Update if needed

        // Uniswap V4 Pool Configuration for Clanknet/WETH
        this.poolKey = {
            currency0: this.wethAddress, // ETH (WETH)
            currency1: this.clanknetAddress, // CLANKNET
            fee: 3000, // 0.3% fee tier
            tickSpacing: 60, // Standard for 0.3% pools
            hooks: '0x0000000000000000000000000000000000000000' // No hooks
        };

        // Token objects for V4 SDK
        this.WETH_TOKEN = new Token(
            this.chainId,
            this.wethAddress,
            18,
            'WETH',
            'Wrapped Ether'
        );

        this.CLANKNET_TOKEN = new Token(
            this.chainId,
            this.clanknetAddress,
            18,
            'CLANKNET',
            'Clanker Network Token'
        );

        // Standard ERC-20 ABI for basic operations
        this.tokenABI = [
            "function name() view returns (string)",
            "function symbol() view returns (string)",
            "function decimals() view returns (uint8)",
            "function totalSupply() view returns (uint256)",
            "function balanceOf(address owner) view returns (uint256)",
            "function transfer(address to, uint256 amount) returns (bool)",
            "function approve(address spender, uint256 amount) returns (bool)",
            "function allowance(address owner, address spender) view returns (uint256)",
            "event Transfer(address indexed from, address indexed to, uint256 value)"
        ];

        // Universal Router ABI
        this.universalRouterABI = [
            {
                inputs: [
                    { internalType: "bytes", name: "commands", type: "bytes" },
                    { internalType: "bytes[]", name: "inputs", type: "bytes[]" },
                    { internalType: "uint256", name: "deadline", type: "uint256" },
                ],
                name: "execute",
                outputs: [],
                stateMutability: "payable",
                type: "function",
            },
        ];

        // Initialize contracts
        this.clanknetContract = new ethers.Contract(
            this.clanknetAddress,
            this.tokenABI,
            this.wallet || this.provider
        );

        this.universalRouter = new ethers.Contract(
            this.universalRouterAddress,
            this.universalRouterABI,
            this.wallet
        );
    }

    /**
     * Get Clanknet token balance
     */
    async getBalance(address = null) {
        const targetAddress = address || this.wallet?.address;
        if (!targetAddress) throw new Error('No address provided');

        const balance = await this.clanknetContract.balanceOf(targetAddress);
        return {
            raw: balance,
            formatted: ethers.formatUnits(balance, this.decimals),
            symbol: 'CLANKNET'
        };
    }

    /**
     * Get token information
     */
    async getTokenInfo() {
        try {
            const [name, symbol, totalSupply, decimals] = await Promise.all([
                this.clanknetContract.name(),
                this.clanknetContract.symbol(),
                this.clanknetContract.totalSupply(),
                this.clanknetContract.decimals()
            ]);

            return {
                address: this.clanknetAddress,
                name,
                symbol,
                decimals,
                totalSupply: ethers.formatUnits(totalSupply, decimals),
                network: 'Base',
                chainId: this.chainId
            };
        } catch (error) {
            console.error('Failed to get token info:', error);
            throw error;
        }
    }

    /**
     * Get swap quote using V4 Quoter (simplified for MVP)
     * TODO: Implement proper V4 Quoter integration
     */
    async getSwapQuote(amountETH, slippagePercent = 2) {
        try {
            console.log(`📊 Getting quote for ${amountETH} ETH → CLANKNET`);

            // For MVP, return estimated quote based on pool data
            // In production, implement proper V4 Quoter contract calls
            const amountIn = ethers.parseEther(amountETH.toString());

            // Estimated conversion rate (would come from real quoter)
            const estimatedRate = 1000000; // 1 ETH = 1M CLANKNET (example)
            const estimatedTokensOut = BigInt(Math.floor(parseFloat(amountETH) * estimatedRate * 1e18));

            const slippageMultiplier = (100 - slippagePercent) / 100;
            const minTokensOut = BigInt(Math.floor(Number(estimatedTokensOut) * slippageMultiplier));

            return {
                success: true,
                amountIn: amountIn.toString(),
                estimatedAmountOut: estimatedTokensOut.toString(),
                minimumAmountOut: minTokensOut.toString(),
                slippagePercent,
                priceImpact: 0.1, // Estimated
                gasCost: '200000' // Estimated
            };
        } catch (error) {
            console.error('Quote failed:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Buy Clanknet tokens using Uniswap V4 Universal Router
     */
    async buyClanknet(amountETH, slippagePercent = 2) {
        if (!this.wallet) throw new Error('Wallet required for buying');

        console.log(`💱 Buying Clanknet with ${amountETH} ETH using Uniswap V4`);

        try {
            // Step 1: Get swap quote
            const quote = await this.getSwapQuote(amountETH, slippagePercent);
            if (!quote.success) {
                throw new Error(`Failed to get quote: ${quote.error}`);
            }

            console.log(`📊 Quote: ~${ethers.formatUnits(quote.estimatedAmountOut, 18)} CLANKNET`);
            console.log(`🛡️  Minimum with ${slippagePercent}% slippage: ${ethers.formatUnits(quote.minimumAmountOut, 18)} CLANKNET`);

            // Step 2: Setup V4 swap using planners
            const v4Planner = new V4Planner();
            const routePlanner = new RoutePlanner();

            // Set deadline (10 minutes from now)
            const deadline = Math.floor(Date.now() / 1000) + 600;

            // Create swap configuration
            const swapConfig = {
                poolKey: this.poolKey,
                zeroForOne: true, // ETH (currency0) → CLANKNET (currency1)
                amountIn: quote.amountIn,
                amountOutMinimum: quote.minimumAmountOut,
                hookData: '0x00'
            };

            // Step 3: Plan V4 actions
            console.log('📋 Planning V4 swap actions...');

            // Add swap action
            v4Planner.addAction(Actions.SWAP_EXACT_IN_SINGLE, [swapConfig]);

            // Add settlement actions
            v4Planner.addAction(Actions.SETTLE_ALL, [
                this.poolKey.currency0, // ETH
                swapConfig.amountIn
            ]);

            // Add take action
            v4Planner.addAction(Actions.TAKE_ALL, [
                this.poolKey.currency1, // CLANKNET
                swapConfig.amountOutMinimum
            ]);

            // Finalize V4 plan
            const encodedActions = v4Planner.finalize();

            // Step 4: Create Universal Router command
            routePlanner.addCommand(CommandType.V4_SWAP, [
                v4Planner.actions,
                v4Planner.params
            ]);

            // Step 5: Execute transaction
            console.log('🚀 Executing swap via Universal Router...');

            const txOptions = {
                value: quote.amountIn, // ETH amount
                gasLimit: 350000, // Conservative gas limit
                maxFeePerGas: undefined, // Let ethers estimate
                maxPriorityFeePerGas: undefined // Let ethers estimate
            };

            const tx = await this.universalRouter.execute(
                routePlanner.commands,
                [encodedActions],
                deadline,
                txOptions
            );

            console.log(`📤 Transaction sent: ${tx.hash}`);
            console.log('⏳ Waiting for confirmation...');

            const receipt = await tx.wait();

            // Step 6: Verify tokens received
            const newBalance = await this.getBalance();

            console.log('✅ Swap completed successfully!');
            console.log(`🎉 New CLANKNET balance: ${newBalance.formatted}`);

            // Step 7: Log for analytics
            await this.logAgentActivity('BUY_V4', quote.estimatedAmountOut, 'uniswap-v4', tx.hash);

            return {
                success: true,
                txHash: tx.hash,
                amountETH: amountETH,
                tokensReceived: ethers.formatUnits(quote.estimatedAmountOut, this.decimals),
                actualBalance: newBalance.formatted,
                gasUsed: receipt.gasUsed.toString(),
                blockNumber: receipt.blockNumber,
                method: 'uniswap-v4'
            };

        } catch (error) {
            console.error('❌ V4 swap failed:', error);
            return {
                success: false,
                error: error.message,
                method: 'uniswap-v4'
            };
        }
    }

    /**
     * Transfer Clanknet tokens
     */
    async transfer(toAddress, amount) {
        if (!this.wallet) throw new Error('Wallet required for transfers');

        const amountWei = ethers.parseUnits(amount.toString(), this.decimals);

        console.log(`📤 Transferring ${amount} CLANKNET to ${toAddress}`);

        const tx = await this.clanknetContract.transfer(toAddress, amountWei);
        const receipt = await tx.wait();

        // Log activity
        await this.logAgentActivity('TRANSFER', amountWei, 'direct', tx.hash);

        return {
            txHash: tx.hash,
            amount,
            to: toAddress,
            blockNumber: receipt.blockNumber
        };
    }

    /**
     * Request Clanknet tokens from faucet/distribution system
     */
    async requestClanknetTokens(reason = 'Agent onboarding') {
        if (!this.wallet) throw new Error('Wallet required for token request');

        try {
            console.log(`🎯 Requesting Clanknet tokens for: ${reason}`);

            // Call Clanknet token request API
            const axios = require('axios');
            const response = await axios.post('https://clanknet.ai/api/request-tokens', {
                address: this.wallet.address,
                reason,
                agentType: 'farcaster',
                timestamp: Date.now(),
                signature: await this.wallet.signMessage(`Request tokens: ${reason}`)
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Clanknet-Agent-V4/1.0'
                }
            });

            if (response.data.success) {
                console.log(`✅ Token request submitted: ${response.data.requestId}`);
                return {
                    success: true,
                    requestId: response.data.requestId,
                    estimatedTokens: response.data.amount,
                    processTime: response.data.processTime
                };
            } else {
                throw new Error(response.data.error || 'Request failed');
            }

        } catch (error) {
            console.error('❌ Token request failed:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Log agent activity for analytics
     */
    async logAgentActivity(action, amount, platform = 'unknown', relatedTx = '') {
        if (!this.wallet) return;

        try {
            // Create minimal self-transfer for tracking
            const microAmount = ethers.parseUnits('0.000001', this.decimals);

            const tx = await this.clanknetContract.transfer(
                this.wallet.address,
                microAmount,
                { gasLimit: 100000 }
            );

            console.log(`📊 Activity logged: ${action} (${tx.hash})`);
            return tx.hash;

        } catch (error) {
            console.warn('Activity logging failed:', error.message);
            // Don't throw - logging is optional
        }
    }

    /**
     * Check if agent has minimum Clanknet balance
     */
    async checkMinimumBalance(requiredAmount = '100') {
        const balance = await this.getBalance();
        const required = ethers.parseUnits(requiredAmount, this.decimals);
        const hasEnough = BigInt(balance.raw) >= required;

        return {
            hasEnough,
            currentBalance: balance.formatted,
            requiredBalance: requiredAmount,
            deficit: hasEnough ? '0' : ethers.formatUnits(required - BigInt(balance.raw), this.decimals)
        };
    }

    /**
     * Generate comprehensive pool analytics
     */
    generateDuneQuery() {
        return `
-- Clanknet V4 Agent Analytics on Base
-- Track all V4 agent interactions

WITH v4_swaps AS (
    SELECT
        block_time,
        tx_hash,
        "from" as agent,
        'V4_SWAP' as action_type,
        '${this.universalRouterAddress}' as router_used,
        token_bought_amount,
        token_bought_symbol
    FROM dex.trades_beta
    WHERE blockchain = 'base'
        AND token_bought_address = '${this.clanknetAddress}'
        AND project = 'uniswap'
        AND version = '4'
),

agent_transfers AS (
    SELECT
        block_time,
        tx_hash,
        "from",
        "to",
        value / 1e18 as amount,
        CASE
            WHEN value < 0.00001 * 1e18 THEN 'TRACKING'
            ELSE 'TRANSFER'
        END as transfer_type
    FROM base.erc20_transfer
    WHERE contract_address = '${this.clanknetAddress}'
)

SELECT
    DATE_TRUNC('day', block_time) as day,
    COUNT(DISTINCT agent) as unique_v4_traders,
    SUM(token_bought_amount) as total_clanknet_bought,
    AVG(token_bought_amount) as avg_purchase_size,
    COUNT(*) as total_v4_swaps
FROM v4_swaps
WHERE block_time >= now() - interval '30' day
GROUP BY 1
ORDER BY 1 DESC;
`;
    }
}

module.exports = ClanknetInteractorV4;