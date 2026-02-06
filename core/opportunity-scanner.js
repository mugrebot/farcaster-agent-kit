/**
 * Opportunity Scanner - Finds real DeFi opportunities using market data
 * Replaces naive LLM guessing with data-driven decisions
 */

const { ethers } = require('ethers');
const DeFiOracle = require('./defi-oracle');
const SafetyAnalyzer = require('./safety-analyzer');
const ProtocolValidator = require('./protocol-validator');
const ScamRegistry = require('./scam-registry');

class OpportunityScanner {
    constructor(provider, llm) {
        this.oracle = new DeFiOracle(provider);
        this.llm = llm;

        // Initialize safety modules
        this.safetyAnalyzer = new SafetyAnalyzer(provider);
        this.protocolValidator = new ProtocolValidator(provider);
        this.scamRegistry = new ScamRegistry();

        // Opportunity thresholds
        this.thresholds = {
            minAPY: 0.05, // 5% minimum
            minArbitrage: 0.005, // 0.5% profit after gas
            maxRisk: 5, // Risk score out of 10
            minTVL: 100000, // $100k minimum TVL
            gasThreshold: 50 // Max gas price in gwei
        };

        // Track found opportunities
        this.opportunities = [];
        this.lastScan = 0;
    }

    /**
     * Scan for all opportunities
     */
    async scanForOpportunities() {
        console.log('🔍 Scanning for DeFi opportunities...');

        // Update scam registry
        await this.scamRegistry.updateFromSecurityFeeds();

        const [
            yieldOps,
            arbOps,
            newPools,
            trending
        ] = await Promise.all([
            this.findYieldOpportunities(),
            this.findArbitrageOpportunities(),
            this.findNewLiquidityPools(),
            this.findTrendingOpportunities()
        ]);

        const allOpportunities = [
            ...yieldOps,
            ...arbOps,
            ...newPools,
            ...trending
        ];

        // Validate each opportunity for safety
        const validatedOpportunities = [];
        for (const opp of allOpportunities) {
            const validated = await this.validateOpportunity(opp);
            if (validated.safe) {
                validatedOpportunities.push(validated);
            } else {
                console.log(`⚠️ Rejected unsafe opportunity: ${opp.protocol} - ${validated.reason}`);
            }
        }

        this.opportunities = validatedOpportunities.sort((a, b) => b.score - a.score);
        this.lastScan = Date.now();

        console.log(`📊 Found ${this.opportunities.length} safe opportunities (rejected ${allOpportunities.length - this.opportunities.length} unsafe)`);
        return this.opportunities;
    }

    /**
     * Validate opportunity for safety
     */
    async validateOpportunity(opportunity) {
        // Skip validation for known safe protocols
        const safeProtocols = ['aave', 'compound', 'uniswap', 'curve', 'aerodrome'];
        if (safeProtocols.includes(opportunity.protocol?.toLowerCase())) {
            opportunity.safe = true;
            opportunity.safetyScore = 10;
            return opportunity;
        }

        // Check protocol validation
        const protocolCheck = await this.protocolValidator.validateProtocol(opportunity.protocol);
        if (!protocolCheck.valid) {
            return {
                ...opportunity,
                safe: false,
                reason: protocolCheck.warnings.join(', ')
            };
        }

        // Check for scam patterns if address provided
        if (opportunity.address) {
            const scamCheck = await this.scamRegistry.checkSafety(opportunity.address, opportunity.protocol);
            if (!scamCheck.safe) {
                return {
                    ...opportunity,
                    safe: false,
                    reason: scamCheck.reason
                };
            }

            // Analyze contract if it's a token
            if (opportunity.type === 'liquidity' || opportunity.type === 'new_pool') {
                const contractAnalysis = await this.safetyAnalyzer.analyzeContract(opportunity.address);
                if (!contractAnalysis.safe || contractAnalysis.honeypot) {
                    return {
                        ...opportunity,
                        safe: false,
                        reason: contractAnalysis.warnings.join(', ')
                    };
                }
            }
        }

        // Additional risk checks
        let safetyScore = 10;
        const warnings = [];

        // Check APY suspiciously high
        const apy = opportunity.apy || (opportunity.profitPercent / 100);
        if (apy > 5) { // >500% APY is suspicious
            safetyScore -= 3;
            warnings.push('Suspiciously high APY');
        }

        // Check TVL
        if (opportunity.tvl && opportunity.tvl < 100000) { // <$100k TVL
            safetyScore -= 2;
            warnings.push('Low TVL');
        }

        // New protocol penalty
        if (opportunity.type === 'new_pool' || opportunity.type === 'trending') {
            safetyScore -= 1;
            warnings.push('New/trending protocol - higher risk');
        }

        opportunity.safe = safetyScore >= 5;
        opportunity.safetyScore = safetyScore;
        opportunity.safetyWarnings = warnings;

        if (!opportunity.safe) {
            opportunity.reason = warnings.join(', ');
        }

        return opportunity;
    }

    /**
     * Find high-yield opportunities
     */
    async findYieldOpportunities() {
        const opportunities = [];

        try {
            const yields = await this.oracle.getYieldComparison();

            // Check Aave yields
            if (yields.aave && yields.aave.usdc > this.thresholds.minAPY) {
                opportunities.push({
                    type: 'lending',
                    protocol: 'Aave V3',
                    asset: 'USDC',
                    apy: yields.aave.usdc,
                    risk: 2,
                    score: this.calculateScore(yields.aave.usdc, 2),
                    action: 'supply',
                    reasoning: `Aave offering ${(yields.aave.usdc * 100).toFixed(2)}% APY on USDC with low risk`
                });
            }

            // Check DeFiLlama yields
            if (yields.others && Array.isArray(yields.others)) {
                for (const pool of yields.others) {
                    if (pool.apy > this.thresholds.minAPY * 100 && pool.tvl > this.thresholds.minTVL) {
                        const risk = this.assessPoolRisk(pool);
                        if (risk <= this.thresholds.maxRisk) {
                            opportunities.push({
                                type: 'liquidity',
                                protocol: pool.project,
                                pool: pool.symbol,
                                apy: pool.apy / 100,
                                tvl: pool.tvl,
                                risk,
                                score: this.calculateScore(pool.apy / 100, risk),
                                action: 'provide_liquidity',
                                reasoning: `${pool.project} pool offering ${pool.apy.toFixed(2)}% APY with $${(pool.tvl/1e6).toFixed(2)}M TVL`
                            });
                        }
                    }
                }
            }
        } catch (error) {
            console.warn('Failed to find yield opportunities:', error.message);
        }

        return opportunities;
    }

    /**
     * Find arbitrage opportunities
     */
    async findArbitrageOpportunities() {
        const opportunities = [];

        try {
            const arbs = await this.oracle.findArbitrageOpportunities();

            for (const arb of arbs) {
                if (arb.profitPercent > this.thresholds.minArbitrage * 100) {
                    // Estimate gas costs
                    const gasPrice = await this.oracle.provider.getFeeData();
                    const gasCostETH = (gasPrice.gasPrice * 300000n) / 1e18; // Estimate 300k gas
                    const ethPrice = await this.oracle.getChainlinkPrice('ETH/USD');
                    const gasCostUSD = Number(gasCostETH) * ethPrice;

                    const expectedProfit = (arb.profitPercent / 100) * 1000; // Assume $1000 trade
                    const netProfit = expectedProfit - gasCostUSD;

                    if (netProfit > 0) {
                        opportunities.push({
                            type: 'arbitrage',
                            buyFrom: arb.buyFrom,
                            sellTo: arb.sellTo,
                            token: arb.token,
                            profitPercent: arb.profitPercent,
                            netProfitUSD: netProfit,
                            risk: 3,
                            score: this.calculateScore(arb.profitPercent / 100, 3),
                            action: 'arbitrage',
                            reasoning: `${arb.profitPercent.toFixed(2)}% arbitrage between ${arb.buyFrom} and ${arb.sellTo} for ${arb.token}`
                        });
                    }
                }
            }
        } catch (error) {
            console.warn('Failed to find arbitrage opportunities:', error.message);
        }

        return opportunities;
    }

    /**
     * Find new liquidity pools with potential
     */
    async findNewLiquidityPools() {
        const opportunities = [];

        try {
            // Monitor Uniswap factory for new pools
            const factory = new ethers.Contract(
                this.oracle.dexContracts.uniswapV3Factory,
                [
                    'event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)'
                ],
                this.oracle.provider
            );

            // Get recent pool creations (last 100 blocks)
            const currentBlock = await this.oracle.provider.getBlockNumber();
            const events = await factory.queryFilter(
                factory.filters.PoolCreated(),
                currentBlock - 100,
                currentBlock
            );

            for (const event of events) {
                const pool = event.args.pool;
                const metrics = await this.oracle.getPoolMetrics(pool);

                if (metrics && metrics.tvl > this.thresholds.minTVL) {
                    opportunities.push({
                        type: 'new_pool',
                        protocol: 'Uniswap V3',
                        pool: pool,
                        tvl: metrics.tvl,
                        fee: metrics.feePercent,
                        risk: 7, // New pools are risky
                        score: this.calculateScore(metrics.feePercent, 7),
                        action: 'provide_liquidity',
                        reasoning: `New Uniswap pool with ${metrics.feePercent}% fees and growing TVL`
                    });
                }
            }
        } catch (error) {
            console.warn('Failed to find new pools:', error.message);
        }

        return opportunities;
    }

    /**
     * Find trending opportunities based on social signals
     */
    async findTrendingOpportunities() {
        const opportunities = [];

        // This would integrate with social data from Farcaster
        // For now, we'll use market data trends

        try {
            const overview = await this.oracle.getMarketOverview();

            // Check if yields are trending up
            if (overview.yields && Object.keys(overview.yields).length > 0) {
                const topYield = Object.values(overview.yields)
                    .filter(y => y && y.usdc)
                    .sort((a, b) => (b.usdc || 0) - (a.usdc || 0))[0];

                if (topYield && topYield.usdc > this.thresholds.minAPY) {
                    opportunities.push({
                        type: 'trending',
                        protocol: topYield.protocol,
                        apy: topYield.usdc,
                        risk: 4,
                        score: this.calculateScore(topYield.usdc, 4),
                        action: 'investigate',
                        reasoning: `${topYield.protocol} showing strong yields, worth investigating`
                    });
                }
            }
        } catch (error) {
            console.warn('Failed to find trending opportunities:', error.message);
        }

        return opportunities;
    }

    /**
     * Assess risk of a liquidity pool
     */
    assessPoolRisk(pool) {
        let risk = 5; // Base risk

        // Lower TVL = higher risk
        if (pool.tvl < 1000000) risk += 2;
        if (pool.tvl < 100000) risk += 2;

        // IL risk
        if (pool.ilRisk === 'high') risk += 2;
        if (pool.ilRisk === 'low') risk -= 1;

        // Known protocols are safer
        const safeProtocols = ['aave', 'compound', 'uniswap', 'curve'];
        if (safeProtocols.includes(pool.project?.toLowerCase())) {
            risk -= 2;
        }

        return Math.min(10, Math.max(1, risk));
    }

    /**
     * Calculate opportunity score
     */
    calculateScore(returnRate, risk) {
        // Simple Sharpe-like ratio: return / risk
        // Higher returns and lower risk = higher score
        return (returnRate * 100) / Math.max(risk, 1);
    }

    /**
     * Get best opportunity based on strategy
     */
    async getBestOpportunity(strategy = 'balanced') {
        if (Date.now() - this.lastScan > 60000) { // Rescan if data is >1 minute old
            await this.scanForOpportunities();
        }

        const strategies = {
            'conservative': { maxRisk: 3, minAPY: 0.02 },
            'balanced': { maxRisk: 5, minAPY: 0.05 },
            'aggressive': { maxRisk: 8, minAPY: 0.10 }
        };

        const config = strategies[strategy] || strategies.balanced;

        // Filter opportunities by strategy
        const suitable = this.opportunities.filter(opp =>
            opp.risk <= config.maxRisk &&
            (opp.apy || opp.profitPercent / 100) >= config.minAPY
        );

        if (suitable.length === 0) {
            return {
                action: 'hold',
                reasoning: 'No suitable opportunities found matching risk profile'
            };
        }

        // Return best opportunity
        const best = suitable[0]; // Already sorted by score
        return {
            action: best.action,
            opportunity: best,
            reasoning: best.reasoning,
            confidence: Math.min(95, best.score * 10)
        };
    }

    /**
     * Enhanced analysis using both data and LLM
     */
    async analyzeWithContext(opportunities) {
        if (!this.llm || opportunities.length === 0) {
            return opportunities[0];
        }

        const prompt = `
Analyze these real DeFi opportunities and pick the best one:

${opportunities.slice(0, 5).map((opp, i) => `
${i + 1}. ${opp.type.toUpperCase()}
   Protocol: ${opp.protocol}
   APY/Profit: ${(opp.apy || opp.profitPercent / 100) * 100}%
   Risk: ${opp.risk}/10
   TVL: ${opp.tvl ? `$${(opp.tvl/1e6).toFixed(2)}M` : 'N/A'}
   Action: ${opp.action}
   ${opp.reasoning}
`).join('\n')}

Current market conditions:
- Gas prices: ${await this.oracle.provider.getFeeData().then(d => (Number(d.gasPrice) / 1e9).toFixed(0))} gwei
- ETH price: $${await this.oracle.getChainlinkPrice('ETH/USD').then(p => p?.toFixed(0)) || 'unknown'}

Pick the best opportunity (1-${Math.min(5, opportunities.length)}) considering risk/reward.
Explain your reasoning in one sentence.
`;

        try {
            const response = await this.llm.generateCoordination(prompt, {
                mode: 'opportunity_selection'
            });

            // Parse LLM choice
            const choice = parseInt(response.content.match(/\d/)?.[0]) || 1;
            const selected = opportunities[Math.min(choice - 1, opportunities.length - 1)];

            return {
                ...selected,
                llmReasoning: response.content
            };
        } catch (error) {
            console.warn('LLM analysis failed, using pure data approach:', error.message);
            return opportunities[0];
        }
    }
}

module.exports = OpportunityScanner;