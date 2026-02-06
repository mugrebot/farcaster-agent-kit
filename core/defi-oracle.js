/**
 * DeFi Oracle Service - Real-time price feeds and protocol data
 * Provides actual market data for informed DeFi decisions
 */

const { ethers } = require('ethers');
const axios = require('axios');

class DeFiOracle {
    constructor(provider) {
        this.provider = provider;
        this.priceCache = new Map();
        this.apyCache = new Map();
        this.cacheTimeout = 30000; // 30 seconds

        // Chainlink price feed addresses on Base
        this.chainlinkFeeds = {
            'ETH/USD': '0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70',
            'BTC/USD': '0xAC15714c08986DACC0379193e22382736796496f',
            'USDC/USD': '0x7e860098F58bBFC8648a4311b374B1D669a2bc6B',
            'DAI/USD': '0x591e79239a7d679378eC8c847e5038150364C78F'
        };

        // DEX contracts on Base
        this.dexContracts = {
            'uniswapV3Factory': '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
            'aerodrome': '0x420DD381b31aEf6683db6B902084cB0FFECe40Da',
            'velodrome': '0x420DD381b31aEf6683db6B902084cB0FFECe40Da'
        };

        // Protocol addresses for APY tracking
        this.protocols = {
            'aave': {
                dataProvider: '0x2d8A3C5677189723C4cB8873CfC9C8976FDF38Ac',
                pool: '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5'
            },
            'compound': {
                comptroller: '0x9e8F0dE2f3F5b2dF64D8E0b5a8cB1b1c3c0d4E5F6'
            }
        };
    }

    /**
     * Get real-time price from Chainlink
     */
    async getChainlinkPrice(pair) {
        const cacheKey = `chainlink_${pair}`;
        const cached = this.getCached(cacheKey);
        if (cached) return cached;

        try {
            const feedAddress = this.chainlinkFeeds[pair];
            if (!feedAddress) {
                throw new Error(`No Chainlink feed for ${pair}`);
            }

            const priceFeed = new ethers.Contract(
                feedAddress,
                [
                    'function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)'
                ],
                this.provider
            );

            const [, price, , timestamp,] = await priceFeed.latestRoundData();

            const priceInUSD = Number(price) / 1e8; // Chainlink uses 8 decimals
            this.setCache(cacheKey, priceInUSD);

            return priceInUSD;
        } catch (error) {
            console.warn(`Failed to fetch Chainlink price for ${pair}:`, error.message);
            return null;
        }
    }

    /**
     * Get DEX prices from Uniswap V3
     */
    async getUniswapPrice(token0, token1) {
        const cacheKey = `uniswap_${token0}_${token1}`;
        const cached = this.getCached(cacheKey);
        if (cached) return cached;

        try {
            // Get pool address
            const factory = new ethers.Contract(
                this.dexContracts.uniswapV3Factory,
                [
                    'function getPool(address,address,uint24) view returns (address)'
                ],
                this.provider
            );

            const poolAddress = await factory.getPool(token0, token1, 3000); // 0.3% fee tier

            if (poolAddress === ethers.ZeroAddress) {
                return null;
            }

            // Get pool price
            const pool = new ethers.Contract(
                poolAddress,
                [
                    'function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)'
                ],
                this.provider
            );

            const [sqrtPriceX96] = await pool.slot0();
            const price = Math.pow(Number(sqrtPriceX96) / Math.pow(2, 96), 2);

            this.setCache(cacheKey, price);
            return price;
        } catch (error) {
            console.warn(`Failed to fetch Uniswap price:`, error.message);
            return null;
        }
    }

    /**
     * Get real lending APYs from Aave
     */
    async getAaveAPY(asset) {
        const cacheKey = `aave_apy_${asset}`;
        const cached = this.getCached(cacheKey);
        if (cached) return cached;

        try {
            const dataProvider = new ethers.Contract(
                this.protocols.aave.dataProvider,
                [
                    'function getReserveData(address) view returns (tuple(uint256,uint128,uint128,uint128,uint128,uint128,uint40,uint16,address,address,address,uint8,address,address))'
                ],
                this.provider
            );

            const reserveData = await dataProvider.getReserveData(asset);
            const supplyAPY = Number(reserveData[3]) / 1e25; // Convert RAY to percentage
            const borrowAPY = Number(reserveData[4]) / 1e25;

            const apyData = { supply: supplyAPY, borrow: borrowAPY };
            this.setCache(cacheKey, apyData);

            return apyData;
        } catch (error) {
            console.warn(`Failed to fetch Aave APY:`, error.message);
            return { supply: 0, borrow: 0 };
        }
    }

    /**
     * Get pool TVL and fees from Uniswap
     */
    async getPoolMetrics(poolAddress) {
        const cacheKey = `pool_metrics_${poolAddress}`;
        const cached = this.getCached(cacheKey);
        if (cached) return cached;

        try {
            const pool = new ethers.Contract(
                poolAddress,
                [
                    'function liquidity() view returns (uint128)',
                    'function fee() view returns (uint24)',
                    'function token0() view returns (address)',
                    'function token1() view returns (address)'
                ],
                this.provider
            );

            const [liquidity, fee, token0, token1] = await Promise.all([
                pool.liquidity(),
                pool.fee(),
                pool.token0(),
                pool.token1()
            ]);

            const metrics = {
                tvl: Number(liquidity),
                feePercent: Number(fee) / 10000,
                token0,
                token1
            };

            this.setCache(cacheKey, metrics);
            return metrics;
        } catch (error) {
            console.warn(`Failed to fetch pool metrics:`, error.message);
            return null;
        }
    }

    /**
     * Fetch data from DeFiLlama API
     */
    async getDeFiLlamaData(protocol) {
        const cacheKey = `defillama_${protocol}`;
        const cached = this.getCached(cacheKey);
        if (cached) return cached;

        try {
            const response = await axios.get(
                `https://api.llama.fi/protocol/${protocol}`,
                { timeout: 5000 }
            );

            const data = {
                tvl: response.data.tvl[response.data.tvl.length - 1]?.totalLiquidityUSD || 0,
                chains: response.data.chains || [],
                apy: response.data.currentChainTvls?.Base || 0
            };

            this.setCache(cacheKey, data);
            return data;
        } catch (error) {
            console.warn(`Failed to fetch DeFiLlama data:`, error.message);
            return null;
        }
    }

    /**
     * Get yields from multiple protocols
     */
    async getYieldComparison() {
        const yields = {};

        // Fetch from multiple sources in parallel
        const [aaveUSDC, compoundRates, defiLlama] = await Promise.all([
            this.getAaveAPY('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'), // USDC on Base
            this.getCompoundAPY(),
            this.getDeFiLlamaYields()
        ]);

        if (aaveUSDC) {
            yields.aave = {
                usdc: aaveUSDC.supply,
                protocol: 'Aave V3',
                risk: 'low'
            };
        }

        if (compoundRates) {
            yields.compound = compoundRates;
        }

        if (defiLlama) {
            yields.others = defiLlama;
        }

        return yields;
    }

    /**
     * Get Compound APYs (simplified)
     */
    async getCompoundAPY() {
        try {
            // This would need actual Compound V3 integration
            // For now, fetch from API if available
            const response = await axios.get(
                'https://api.compound.finance/v3/base/market',
                { timeout: 5000 }
            );

            return response.data;
        } catch (error) {
            return null;
        }
    }

    /**
     * Get yields from DeFiLlama yields API
     */
    async getDeFiLlamaYields() {
        try {
            const response = await axios.get(
                'https://yields.llama.fi/pools',
                {
                    timeout: 5000,
                    params: {
                        chain: 'Base'
                    }
                }
            );

            // Filter and sort by APY
            const pools = response.data.data
                .filter(pool => pool.chain === 'Base' && pool.apy > 0)
                .sort((a, b) => b.apy - a.apy)
                .slice(0, 10); // Top 10

            return pools.map(pool => ({
                pool: pool.symbol,
                apy: pool.apy,
                tvl: pool.tvlUsd,
                project: pool.project,
                risk: pool.ilRisk || 'unknown'
            }));
        } catch (error) {
            console.warn('Failed to fetch DeFiLlama yields:', error.message);
            return [];
        }
    }

    /**
     * Find arbitrage opportunities
     */
    async findArbitrageOpportunities() {
        const opportunities = [];

        // Check USDC/ETH price across DEXes
        const pairs = [
            { token0: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', token1: 'ETH', dex: 'uniswap' },
            { token0: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', token1: 'ETH', dex: 'aerodrome' }
        ];

        const prices = await Promise.all(
            pairs.map(async pair => {
                const price = await this.getDEXPrice(pair.token0, pair.token1, pair.dex);
                return { ...pair, price };
            })
        );

        // Compare prices for arbitrage
        for (let i = 0; i < prices.length; i++) {
            for (let j = i + 1; j < prices.length; j++) {
                if (prices[i].price && prices[j].price) {
                    const priceDiff = Math.abs(prices[i].price - prices[j].price);
                    const percentDiff = (priceDiff / Math.min(prices[i].price, prices[j].price)) * 100;

                    if (percentDiff > 0.5) { // 0.5% difference threshold
                        opportunities.push({
                            buyFrom: prices[i].price < prices[j].price ? prices[i].dex : prices[j].dex,
                            sellTo: prices[i].price > prices[j].price ? prices[i].dex : prices[j].dex,
                            token: 'USDC/ETH',
                            profitPercent: percentDiff,
                            buyPrice: Math.min(prices[i].price, prices[j].price),
                            sellPrice: Math.max(prices[i].price, prices[j].price)
                        });
                    }
                }
            }
        }

        return opportunities;
    }

    /**
     * Get price from specific DEX
     */
    async getDEXPrice(token0, token1, dex) {
        switch(dex) {
            case 'uniswap':
                return await this.getUniswapPrice(token0, token1);
            case 'aerodrome':
                // Implement Aerodrome price fetching
                return null;
            default:
                return null;
        }
    }

    /**
     * Cache management
     */
    getCached(key) {
        const cached = this.priceCache.get(key);
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.data;
        }
        return null;
    }

    setCache(key, data) {
        this.priceCache.set(key, {
            data,
            timestamp: Date.now()
        });
    }

    /**
     * Get comprehensive market overview
     */
    async getMarketOverview() {
        const [ethPrice, btcPrice, yields, arbitrage] = await Promise.all([
            this.getChainlinkPrice('ETH/USD'),
            this.getChainlinkPrice('BTC/USD'),
            this.getYieldComparison(),
            this.findArbitrageOpportunities()
        ]);

        return {
            prices: {
                ETH: ethPrice,
                BTC: btcPrice
            },
            yields,
            arbitrage,
            timestamp: Date.now()
        };
    }
}

module.exports = DeFiOracle;