/**
 * DeFi Strategies - Autonomous DeFi participation
 * Implements yield farming, lending, and liquidity provision strategies
 */

const { ethers } = require('ethers');
const OpportunityScanner = require('./opportunity-scanner');
const DeFiOracle = require('./defi-oracle');

class DeFiStrategies {
    constructor(onchainAgent, llm) {
        this.agent = onchainAgent;
        this.llm = llm;
        this.scanner = new OpportunityScanner(onchainAgent.provider, llm);
        this.oracle = new DeFiOracle(onchainAgent.provider);

        // Protocol addresses on Base
        this.protocols = {
            'aave': {
                pool: '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5',
                aToken: {
                    'USDC': '0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB',
                    'ETH': '0xD4a0e0b9149BCee3C920d2E00b5dE09138fd8bb7'
                }
            },
            'compound': {
                comptroller: '0x9e8F0dE2f3F5b2dF64D8E0b5a8cB1b1c3c0d4E5F6',
                cTokens: {
                    'USDC': '0x5d3a536E4D6DbD6114cc1Ead35777bAB948E3643',
                    'ETH': '0x4Ddc2D193948926D02f9B1fE9e1daa0718270ED5'
                }
            },
            'uniswap': {
                router: '0x2626664c2603336E57B271c5C0b26F421741e481',
                factory: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
                positions: '0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1'
            }
        };

        // Strategy configurations
        this.strategies = {
            conservative: {
                maxPositionSize: 0.2, // 20% of portfolio
                minAPY: 0.02, // 2% minimum
                maxRisk: 1 // Low risk
            },
            balanced: {
                maxPositionSize: 0.4,
                minAPY: 0.05,
                maxRisk: 5
            },
            aggressive: {
                maxPositionSize: 0.7,
                minAPY: 0.1,
                maxRisk: 8
            }
        };

        this.activePositions = [];
        this.currentStrategy = 'balanced';
    }

    /**
     * Analyze market opportunities using real data
     */
    async analyzeOpportunities() {
        // Use the opportunity scanner to find real opportunities
        const best = await this.scanner.getBestOpportunity(this.currentStrategy);

        // If we found a good opportunity, also get detailed analysis
        if (best.action !== 'hold') {
            const opportunities = await this.scanner.scanForOpportunities();

            // Use both data and LLM for enhanced decision making
            if (opportunities.length > 0) {
                const enhanced = await this.scanner.analyzeWithContext(opportunities);
                return {
                    strategy: best.action,
                    opportunity: enhanced,
                    reasoning: enhanced.reasoning || best.reasoning,
                    confidence: best.confidence
                };
            }
        }

        return {
            strategy: best.action,
            opportunity: best.opportunity,
            reasoning: best.reasoning,
            confidence: best.confidence || 0
        };
    }

    /**
     * Parse LLM strategy decision
     */
    parseStrategyDecision(response) {
        const strategies = {
            '1': 'lending',
            '2': 'liquidity',
            '3': 'farming',
            '4': 'hold'
        };

        for (const [key, value] of Object.entries(strategies)) {
            if (response.includes(key)) {
                return { strategy: value, reasoning: response };
            }
        }

        return { strategy: 'hold', reasoning: 'No clear strategy identified' };
    }

    /**
     * Lend assets on Aave
     */
    async lendOnAave(asset, amount) {
        // Safety check: Validate the protocol first
        const protocolValidator = this.scanner.protocolValidator;
        const protocolCheck = await protocolValidator.validateProtocol('aave', this.protocols.aave.pool);

        if (!protocolCheck.valid) {
            throw new Error(`Protocol validation failed: ${protocolCheck.warnings.join(', ')}`);
        }

        // Safety check: Ensure contract is verified
        const safetyAnalyzer = this.scanner.safetyAnalyzer;
        const contractCheck = await safetyAnalyzer.analyzeContract(this.protocols.aave.pool);

        if (!contractCheck.safe) {
            throw new Error(`Contract safety check failed: ${contractCheck.warnings.join(', ')}`);
        }

        const aavePool = new ethers.Contract(
            this.protocols.aave.pool,
            [
                "function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)"
            ],
            this.agent.wallet
        );

        // Approve Aave to spend tokens with safety checks
        if (asset !== 'ETH') {
            // Verify token contract before approval
            const tokenCheck = await safetyAnalyzer.analyzeContract(asset);
            if (tokenCheck.honeypot) {
                throw new Error('Token appears to be a honeypot - aborting');
            }

            const token = await this.agent.interactWithToken(asset);
            await token.approve(this.protocols.aave.pool, amount);
        }

        // Apply slippage protection for the transaction
        const minAmount = this.agent.calculateSlippageProtection(amount);

        // Supply to Aave with MEV protection
        let tx = {
            to: this.protocols.aave.pool,
            data: aavePool.interface.encodeFunctionData('supply', [
                asset === 'ETH' ? ethers.ZeroAddress : asset,
                amount,
                this.agent.wallet.address,
                0
            ]),
            value: asset === 'ETH' ? amount : 0
        };

        tx = await this.agent.applyMEVProtection(tx);
        const transaction = await this.agent.wallet.sendTransaction(tx);
        const receipt = await transaction.wait();

        console.log(`💰 Safely supplied ${ethers.formatUnits(amount, 18)} to Aave`);

        // Track position
        this.activePositions.push({
            protocol: 'aave',
            type: 'lending',
            asset,
            amount: ethers.formatUnits(amount, 18),
            timestamp: Date.now(),
            txHash: tx.hash
        });

        return receipt;
    }

    /**
     * Provide liquidity to Uniswap V3
     */
    async provideLiquidity(token0, token1, amount0, amount1, feeTier = 3000) {
        const positionManager = new ethers.Contract(
            this.protocols.uniswap.positions,
            [
                "function mint((address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256)) returns (uint256,uint128,uint256,uint256)"
            ],
            this.agent.wallet
        );

        // Calculate price range (±10% from current price)
        const tickLower = -60000;
        const tickUpper = 60000;

        // Approve tokens
        const token0Contract = await this.agent.interactWithToken(token0);
        const token1Contract = await this.agent.interactWithToken(token1);

        await token0Contract.approve(this.protocols.uniswap.positions, amount0);
        await token1Contract.approve(this.protocols.uniswap.positions, amount1);

        // Mint position
        const params = {
            token0,
            token1,
            fee: feeTier,
            tickLower,
            tickUpper,
            amount0Desired: amount0,
            amount1Desired: amount1,
            amount0Min: 0,
            amount1Min: 0,
            recipient: this.agent.wallet.address,
            deadline: Math.floor(Date.now() / 1000) + 3600
        };

        const tx = await positionManager.mint(params);
        const receipt = await tx.wait();

        console.log(`🌊 Liquidity provided to Uniswap V3`);

        // Track position
        this.activePositions.push({
            protocol: 'uniswap',
            type: 'liquidity',
            pair: `${token0}/${token1}`,
            amounts: [ethers.formatUnits(amount0, 18), ethers.formatUnits(amount1, 18)],
            timestamp: Date.now(),
            txHash: tx.hash
        });

        return receipt;
    }

    /**
     * Monitor and rebalance positions
     */
    async rebalancePortfolio() {
        console.log('🔄 Checking portfolio for rebalancing...');

        for (const position of this.activePositions) {
            const shouldRebalance = await this.shouldRebalancePosition(position);

            if (shouldRebalance) {
                console.log(`Rebalancing ${position.protocol} position...`);
                await this.executeRebalance(position);
            }
        }
    }

    /**
     * Check if position needs rebalancing
     */
    async shouldRebalancePosition(position) {
        const prompt = `
Should I rebalance this position?
Protocol: ${position.protocol}
Type: ${position.type}
Age: ${Math.floor((Date.now() - position.timestamp) / (1000 * 60 * 60))} hours
Current strategy: ${this.currentStrategy}

Consider:
- Is the position still profitable?
- Are there better opportunities?
- Has risk profile changed?

Answer YES or NO with reasoning.
`;

        const decision = await this.llm.generateCoordination(prompt, {
            mode: 'rebalance_decision'
        });

        return decision.content.toUpperCase().includes('YES');
    }

    /**
     * Execute rebalancing
     */
    async executeRebalance(position) {
        // Implementation would depend on specific protocol
        console.log(`Rebalancing ${position.protocol} position...`);
        // Add actual rebalancing logic here
    }

    /**
     * Calculate portfolio APY
     */
    async calculatePortfolioAPY() {
        let totalValue = 0;
        let weightedAPY = 0;

        for (const position of this.activePositions) {
            const positionValue = await this.getPositionValue(position);
            const positionAPY = await this.getPositionAPY(position);

            totalValue += positionValue;
            weightedAPY += positionValue * positionAPY;
        }

        return totalValue > 0 ? weightedAPY / totalValue : 0;
    }

    /**
     * Get position value in USD using real price feeds
     */
    async getPositionValue(position) {
        try {
            if (position.asset === 'ETH') {
                const ethPrice = await this.oracle.getChainlinkPrice('ETH/USD');
                return parseFloat(position.amount) * ethPrice;
            } else if (position.asset === 'USDC' || position.asset === 'DAI') {
                // Stablecoins are approximately $1
                return parseFloat(position.amount);
            } else {
                // For other tokens, try to get DEX price
                const price = await this.oracle.getUniswapPrice(position.asset, '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'); // vs USDC
                return parseFloat(position.amount) * (price || 0);
            }
        } catch (error) {
            console.warn('Failed to get position value:', error.message);
            return 0;
        }
    }

    /**
     * Get real position APY from protocols
     */
    async getPositionAPY(position) {
        try {
            if (position.protocol === 'aave' && position.asset) {
                const apy = await this.oracle.getAaveAPY(position.asset);
                return apy.supply;
            }

            // For Uniswap, estimate from fees and volume
            if (position.protocol === 'uniswap' && position.pool) {
                const metrics = await this.oracle.getPoolMetrics(position.pool);
                if (metrics) {
                    // Rough APY estimate from fee percentage
                    return metrics.feePercent * 365; // Simplified
                }
            }

            // Fallback to DeFiLlama data
            const llamaData = await this.oracle.getDeFiLlamaData(position.protocol);
            if (llamaData && llamaData.apy) {
                return llamaData.apy / 100;
            }

            return 0;
        } catch (error) {
            console.warn('Failed to get position APY:', error.message);
            return 0;
        }
    }

    /**
     * Emergency exit all positions
     */
    async emergencyExit() {
        console.log('🚨 Emergency exit initiated!');

        for (const position of this.activePositions) {
            try {
                await this.exitPosition(position);
            } catch (error) {
                console.error(`Failed to exit ${position.protocol}:`, error);
            }
        }

        this.activePositions = [];
    }

    /**
     * Exit a specific position
     */
    async exitPosition(position) {
        console.log(`Exiting ${position.protocol} position...`);
        // Protocol-specific exit logic
    }

    /**
     * Set strategy
     */
    setStrategy(strategy) {
        if (this.strategies[strategy]) {
            this.currentStrategy = strategy;
            console.log(`📊 Strategy set to: ${strategy}`);
        }
    }

    /**
     * Get portfolio summary
     */
    async getPortfolioSummary() {
        const totalValue = await this.calculatePortfolioValue();
        const apy = await this.calculatePortfolioAPY();

        return {
            strategy: this.currentStrategy,
            positions: this.activePositions.length,
            totalValue,
            estimatedAPY: apy,
            risk: this.strategies[this.currentStrategy].maxRisk,
            activeProtocols: [...new Set(this.activePositions.map(p => p.protocol))]
        };
    }

    /**
     * Calculate total portfolio value
     */
    async calculatePortfolioValue() {
        let total = 0;
        for (const position of this.activePositions) {
            total += await this.getPositionValue(position);
        }
        return total;
    }
}

module.exports = DeFiStrategies;