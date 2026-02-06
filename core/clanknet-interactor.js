/**
 * Clanknet Interactor - Specialized module for interacting with Clanknet token
 * Includes on-chain event logging for Dune Analytics tracking
 */

const { ethers } = require('ethers');

class ClanknetInteractor {
    constructor(provider, wallet) {
        this.provider = provider;
        this.wallet = wallet;

        // Clanknet token contract on Base
        this.tokenAddress = '0x623693BefAECf61484e344fa272e9A8B82d9BB07';
        this.decimals = 18;

        // Uniswap V3 contracts on Base
        this.uniswapRouter = '0x2626664c2603336E57B271c5C0b26F421741e481';
        this.wethAddress = '0x4200000000000000000000000000000000000006';

        // Standard ERC-20 ABI
        this.tokenABI = [
            "function name() view returns (string)",
            "function symbol() view returns (string)",
            "function decimals() view returns (uint8)",
            "function totalSupply() view returns (uint256)",
            "function balanceOf(address owner) view returns (uint256)",
            "function transfer(address to, uint256 amount) returns (bool)",
            "function approve(address spender, uint256 amount) returns (bool)",
            "function allowance(address owner, address spender) view returns (uint256)",
            "event Transfer(address indexed from, address indexed to, uint256 value)",
            "event Approval(address indexed owner, address indexed spender, uint256 value)"
        ];

        // Extended ABI for agent tracking
        this.extendedABI = [
            ...this.tokenABI,
            "event AgentInteraction(address indexed agent, string action, uint256 amount, string platform, bytes32 trackingId)"
        ];

        // Initialize contract
        this.contract = new ethers.Contract(
            this.tokenAddress,
            this.extendedABI,
            this.wallet || this.provider
        );
    }

    /**
     * Get token information
     */
    async getTokenInfo() {
        try {
            const [name, symbol, totalSupply, decimals] = await Promise.all([
                this.contract.name(),
                this.contract.symbol(),
                this.contract.totalSupply(),
                this.contract.decimals()
            ]);

            return {
                address: this.tokenAddress,
                name,
                symbol,
                decimals,
                totalSupply: ethers.formatUnits(totalSupply, decimals),
                network: 'Base'
            };
        } catch (error) {
            console.error('Failed to get token info:', error);
            throw error;
        }
    }

    /**
     * Get balance of Clanknet tokens
     */
    async getBalance(address = null) {
        const targetAddress = address || this.wallet?.address;
        if (!targetAddress) throw new Error('No address provided');

        const balance = await this.contract.balanceOf(targetAddress);
        return {
            raw: balance,
            formatted: ethers.formatUnits(balance, this.decimals),
            symbol: 'CLANKNET'
        };
    }

    /**
     * Buy Clanknet tokens using ETH via Uniswap
     */
    async buyClanknet(amountETH, slippagePercent = 2) {
        if (!this.wallet) throw new Error('Wallet required for buying');

        console.log(`💱 Buying Clanknet with ${amountETH} ETH`);

        // Uniswap V3 Router interface
        const routerABI = [
            "function exactInputSingle((address,address,uint24,address,uint256,uint256,uint160)) payable returns (uint256)"
        ];

        const router = new ethers.Contract(this.uniswapRouter, routerABI, this.wallet);

        // Get initial balance for tracking
        const initialBalance = await this.getBalance();

        // Prepare swap parameters
        const params = {
            tokenIn: this.wethAddress,
            tokenOut: this.tokenAddress,
            fee: 3000, // 0.3% pool fee
            recipient: this.wallet.address,
            amountIn: ethers.parseEther(amountETH.toString()),
            amountOutMinimum: 0, // Should calculate based on slippage
            sqrtPriceLimitX96: 0
        };

        // Execute swap
        const tx = await router.exactInputSingle(params, {
            value: ethers.parseEther(amountETH.toString()),
            gasLimit: 300000
        });

        console.log(`📤 Swap transaction: ${tx.hash}`);
        const receipt = await tx.wait();

        // Get new balance
        const newBalance = await this.getBalance();
        const tokensReceived = BigInt(newBalance.raw) - BigInt(initialBalance.raw);

        // Log agent interaction for Dune tracking
        await this.logAgentActivity('BUY', tokensReceived, 'uniswap', tx.hash);

        return {
            txHash: tx.hash,
            tokensReceived: ethers.formatUnits(tokensReceived, this.decimals),
            gasUsed: receipt.gasUsed.toString(),
            blockNumber: receipt.blockNumber
        };
    }

    /**
     * Transfer Clanknet tokens
     */
    async transfer(toAddress, amount) {
        if (!this.wallet) throw new Error('Wallet required for transfers');

        const amountWei = ethers.parseUnits(amount.toString(), this.decimals);

        console.log(`📤 Transferring ${amount} CLANKNET to ${toAddress}`);

        const tx = await this.contract.transfer(toAddress, amountWei);
        const receipt = await tx.wait();

        // Log agent interaction
        await this.logAgentActivity('TRANSFER', amountWei, 'direct', tx.hash);

        return {
            txHash: tx.hash,
            amount,
            to: toAddress,
            blockNumber: receipt.blockNumber
        };
    }

    /**
     * Approve spending for DeFi interactions
     */
    async approve(spender, amount) {
        if (!this.wallet) throw new Error('Wallet required for approval');

        const amountWei = amount === 'max'
            ? ethers.MaxUint256
            : ethers.parseUnits(amount.toString(), this.decimals);

        console.log(`✅ Approving ${spender} to spend ${amount} CLANKNET`);

        const tx = await this.contract.approve(spender, amountWei);
        const receipt = await tx.wait();

        return {
            txHash: tx.hash,
            spender,
            amount: amount === 'max' ? 'unlimited' : amount,
            blockNumber: receipt.blockNumber
        };
    }

    /**
     * Log agent activity for Dune Analytics tracking
     * This creates an on-chain record via a micro-transfer with encoded data
     */
    async logAgentActivity(action, amount, platform = 'unknown', relatedTx = '') {
        if (!this.wallet) return; // Skip if no wallet

        try {
            // Create tracking ID from action and timestamp
            const trackingId = ethers.id(`${action}_${Date.now()}_${relatedTx}`);

            // Send a micro-transfer (0.000001 CLANKNET) to self with encoded data
            const microAmount = ethers.parseUnits('0.000001', this.decimals);

            // Encode the action data
            const actionData = ethers.hexlify(ethers.toUtf8Bytes(
                JSON.stringify({
                    action,
                    platform,
                    timestamp: Date.now(),
                    agent: 'm00npapi'
                })
            ));

            // Use transfer with data comment (if supported)
            const tx = await this.contract.transfer(
                this.wallet.address,
                microAmount,
                {
                    gasLimit: 100000,
                    data: actionData.slice(0, 64) // Limit data size
                }
            );

            console.log(`📊 Logged activity for Dune: ${action} (${tx.hash})`);
            return tx.hash;
        } catch (error) {
            console.warn('Failed to log activity:', error.message);
            // Don't throw - this is optional tracking
        }
    }

    /**
     * Get Clanknet price from Uniswap pool
     */
    async getPrice() {
        try {
            // Uniswap V3 Factory
            const factoryAddress = '0x33128a8fC17869897dcE68Ed026d694621f6FDfD';
            const factoryABI = [
                "function getPool(address tokenA, address tokenB, uint24 fee) view returns (address)"
            ];

            const factory = new ethers.Contract(factoryAddress, factoryABI, this.provider);

            // Get pool address
            const poolAddress = await factory.getPool(
                this.wethAddress,
                this.tokenAddress,
                3000 // 0.3% fee tier
            );

            if (poolAddress === ethers.ZeroAddress) {
                console.warn('No Uniswap pool found for Clanknet/WETH');
                return null;
            }

            // Pool ABI for getting price
            const poolABI = [
                "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)"
            ];

            const pool = new ethers.Contract(poolAddress, poolABI, this.provider);
            const slot0 = await pool.slot0();

            // Calculate price from sqrtPriceX96
            const sqrtPriceX96 = slot0.sqrtPriceX96;
            const price = (Number(sqrtPriceX96) / 2 ** 96) ** 2;

            // Get ETH price for USD conversion
            const chainlinkETH = '0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70'; // ETH/USD on Base
            const priceFeedABI = [
                "function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)"
            ];

            const priceFeed = new ethers.Contract(chainlinkETH, priceFeedABI, this.provider);
            const [, ethPrice] = await priceFeed.latestRoundData();
            const ethPriceUSD = Number(ethPrice) / 1e8;

            return {
                priceInETH: price,
                priceInUSD: price * ethPriceUSD,
                poolAddress,
                lastUpdate: new Date().toISOString()
            };
        } catch (error) {
            console.error('Failed to get price:', error);
            return null;
        }
    }

    /**
     * Generate Dune Analytics query for tracking
     */
    generateDuneQuery() {
        return `
-- Clanknet Token Agent Interactions on Base
-- Track all agent interactions with Clanknet token

WITH agent_transfers AS (
    SELECT
        block_time,
        tx_hash,
        "from" as sender,
        "to" as recipient,
        value / 1e18 as amount,
        CASE
            WHEN "to" = "from" THEN 'TRACKING'
            WHEN value < 0.00001 * 1e18 THEN 'MICRO_TRACKING'
            ELSE 'TRANSFER'
        END as interaction_type
    FROM base.erc20_transfer
    WHERE contract_address = 0x623693BefAECf61484e344fa272e9A8B82d9BB07
        AND (
            "from" IN (SELECT DISTINCT address FROM base.agent_registry)
            OR "to" IN (SELECT DISTINCT address FROM base.agent_registry)
        )
),

agent_swaps AS (
    SELECT
        block_time,
        tx_hash,
        taker as agent,
        CASE
            WHEN token_in = 0x623693BefAECf61484e344fa272e9A8B82d9BB07 THEN 'SELL'
            ELSE 'BUY'
        END as action,
        amount_usd
    FROM dex.trades
    WHERE blockchain = 'base'
        AND (
            token_in = 0x623693BefAECf61484e344fa272e9A8B82d9BB07
            OR token_out = 0x623693BefAECf61484e344fa272e9A8B82d9BB07
        )
)

SELECT
    DATE_TRUNC('day', block_time) as day,
    COUNT(DISTINCT sender) as unique_agents,
    COUNT(*) as total_interactions,
    SUM(amount) as total_volume,
    AVG(amount) as avg_transfer_size
FROM agent_transfers
GROUP BY 1
ORDER BY 1 DESC;
`;
    }

    /**
     * Check if address holds Clanknet
     */
    async isHolder(address) {
        const balance = await this.getBalance(address);
        return BigInt(balance.raw) > 0n;
    }

    /**
     * Get top Clanknet holders (requires indexer or multiple queries)
     */
    async getTopHolders(limit = 10) {
        console.log('📊 Fetching top holders requires an indexer API');
        // This would typically use The Graph or similar indexer
        // For now, return placeholder
        return {
            message: 'Use Dune Analytics or Basescan for holder distribution',
            query: 'https://basescan.org/token/0x623693BefAECf61484e344fa272e9A8B82d9BB07#balances'
        };
    }
}

module.exports = ClanknetInteractor;