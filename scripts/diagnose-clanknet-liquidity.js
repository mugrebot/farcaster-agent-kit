#!/usr/bin/env node

/**
 * Diagnose Clanknet Liquidity - Deep investigation of trading routes and availability
 */

require('dotenv').config();
const axios = require('axios');
const { ethers } = require('ethers');

class ClanknetLiquidityDiagnoser {
    constructor() {
        this.clanknetAddress = '0x623693BefAECf61484e344fa272e9A8B82d9BB07';
        this.poolAddress = '0x4cb72df111fad6f48cd981d40ec7c76f6800624c1202252b2ece17044852afaf';
        this.wethAddress = '0x4200000000000000000000000000000000000006';
        this.provider = new ethers.JsonRpcProvider('https://mainnet.base.org');

        // Different API endpoints to test
        this.apiEndpoints = {
            zeroX: 'https://base.api.0x.org',
            oneInch: 'https://api.1inch.dev/swap/v5.2/8453', // Base chain ID
            paraswap: 'https://apiv5.paraswap.io',
        };
    }

    /**
     * Test 1: Check token accessibility across multiple aggregators
     */
    async testMultipleAggregators() {
        console.log('🔍 Test 1: Multiple DEX Aggregator Analysis');
        console.log('===========================================\n');

        const testAmount = ethers.parseEther('0.01').toString();
        const results = {};

        // Test 0x API (Matcha)
        console.log('📊 Testing 0x API (Matcha)...');
        try {
            const response = await axios.get(`${this.apiEndpoints.zeroX}/swap/v1/quote`, {
                params: {
                    sellToken: 'ETH',
                    buyToken: this.clanknetAddress,
                    sellAmount: testAmount
                }
            });
            results.zeroX = { success: true, data: response.data };
            console.log('✅ 0x API: Routes available');
        } catch (error) {
            results.zeroX = { success: false, error: error.response?.data || error.message };
            console.log('❌ 0x API:', error.response?.data?.message || error.message);
        }

        // Test 1inch
        console.log('📊 Testing 1inch API...');
        try {
            const response = await axios.get(`${this.apiEndpoints.oneInch}/quote`, {
                params: {
                    fromTokenAddress: this.wethAddress,
                    toTokenAddress: this.clanknetAddress,
                    amount: testAmount
                }
            });
            results.oneInch = { success: true, data: response.data };
            console.log('✅ 1inch API: Routes available');
        } catch (error) {
            results.oneInch = { success: false, error: error.response?.data || error.message };
            console.log('❌ 1inch API:', error.response?.data?.message || error.message);
        }

        // Test ParaSwap
        console.log('📊 Testing ParaSwap API...');
        try {
            const response = await axios.get(`${this.apiEndpoints.paraswap}/prices`, {
                params: {
                    srcToken: this.wethAddress,
                    destToken: this.clanknetAddress,
                    amount: testAmount,
                    srcDecimals: 18,
                    destDecimals: 18,
                    network: 8453 // Base
                }
            });
            results.paraswap = { success: true, data: response.data };
            console.log('✅ ParaSwap API: Routes available');
        } catch (error) {
            results.paraswap = { success: false, error: error.response?.data || error.message };
            console.log('❌ ParaSwap API:', error.response?.data?.message || error.message);
        }

        return results;
    }

    /**
     * Test 2: Direct Uniswap V4 pool investigation
     */
    async testDirectV4Pool() {
        console.log('\n🔍 Test 2: Direct Uniswap V4 Pool Analysis');
        console.log('==========================================\n');

        try {
            // Check if pool exists and has liquidity
            console.log(`📊 Investigating pool: ${this.poolAddress}`);

            // Try to get pool data directly
            const poolContract = new ethers.Contract(
                this.poolAddress,
                [
                    "function liquidity() external view returns (uint128)",
                    "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)"
                ],
                this.provider
            );

            // Try different approaches to read pool data
            let poolData = null;
            try {
                const code = await this.provider.getCode(this.poolAddress);
                console.log(`📋 Pool contract code: ${code.length} bytes`);

                if (code === '0x') {
                    console.log('⚠️  Pool address has no contract code - may not be deployed');
                    return { success: false, error: 'Pool contract not found' };
                }

                // Try to call functions
                try {
                    const liquidity = await poolContract.liquidity();
                    const slot0 = await poolContract.slot0();
                    poolData = { liquidity: liquidity.toString(), slot0 };
                    console.log('✅ Pool data retrieved via direct calls');
                } catch (callError) {
                    console.log('⚠️  Direct pool calls failed:', callError.message);
                }

            } catch (error) {
                console.log('❌ Pool investigation failed:', error.message);
            }

            // Check V4 PoolManager approach
            console.log('\n📊 Testing V4 PoolManager approach...');

            // V4 uses singleton PoolManager - pools are not separate contracts
            const poolManagerAddress = '0x...'; // TODO: Get correct V4 PoolManager address for Base
            console.log('⚠️  V4 PoolManager address needed for proper pool data access');

            return {
                success: !!poolData,
                poolData,
                note: 'V4 pools are managed by singleton PoolManager, not separate contracts'
            };

        } catch (error) {
            console.error('❌ V4 pool analysis failed:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Test 3: Check available DEX sources for Clanknet
     */
    async testAvailableSources() {
        console.log('\n🔍 Test 3: Available DEX Sources Analysis');
        console.log('========================================\n');

        const results = {};

        // Check 0x sources
        try {
            console.log('📊 Checking 0x aggregated sources...');
            const sourcesResponse = await axios.get(`${this.apiEndpoints.zeroX}/swap/v1/sources`);
            results.zeroXSources = sourcesResponse.data.sources;
            console.log(`✅ 0x aggregates ${results.zeroXSources?.length || 0} sources`);

            if (results.zeroXSources) {
                const uniswapSources = results.zeroXSources.filter(s =>
                    s.toLowerCase().includes('uniswap') || s.toLowerCase().includes('v4')
                );
                console.log(`   📋 Uniswap-related sources: ${uniswapSources.join(', ') || 'none'}`);
            }
        } catch (error) {
            console.log('❌ Failed to get 0x sources:', error.message);
            results.zeroXSources = null;
        }

        // Check token info on different DEXes
        const commonDEXes = [
            'Uniswap V4',
            'Uniswap V3',
            'SushiSwap',
            'Curve',
            'Balancer'
        ];

        console.log('\n📊 Checking DEX availability:');
        results.dexAvailability = {};

        for (const dex of commonDEXes) {
            // This would require specific DEX APIs or subgraph queries
            results.dexAvailability[dex] = 'unknown - requires specific API calls';
            console.log(`   ${dex}: Unknown (requires specific investigation)`);
        }

        return results;
    }

    /**
     * Test 4: Alternative routing strategies
     */
    async testAlternativeRouting() {
        console.log('\n🔍 Test 4: Alternative Routing Strategies');
        console.log('=========================================\n');

        const strategies = [
            {
                name: 'Multi-hop via USDC',
                path: 'ETH → USDC → CLANKNET',
                test: async () => {
                    // Test ETH → USDC first
                    const usdcAddress = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'; // USDC on Base
                    try {
                        const ethToUsdc = await axios.get(`${this.apiEndpoints.zeroX}/swap/v1/quote`, {
                            params: {
                                sellToken: 'ETH',
                                buyToken: usdcAddress,
                                sellAmount: ethers.parseEther('0.01').toString()
                            }
                        });
                        return { success: true, note: 'ETH→USDC route available' };
                    } catch (error) {
                        return { success: false, error: 'ETH→USDC route failed' };
                    }
                }
            },
            {
                name: 'Direct V4 Universal Router',
                path: 'ETH → CLANKNET via V4 Universal Router',
                test: async () => {
                    // Would need V4 SDK implementation
                    return { success: false, note: 'Requires V4 SDK implementation' };
                }
            },
            {
                name: 'Custom Route via Pool Manager',
                path: 'Direct interaction with V4 PoolManager',
                test: async () => {
                    return { success: false, note: 'Requires V4 PoolManager integration' };
                }
            }
        ];

        const results = {};
        for (const strategy of strategies) {
            console.log(`📊 Testing: ${strategy.name}`);
            console.log(`   Path: ${strategy.path}`);

            results[strategy.name] = await strategy.test();

            if (results[strategy.name].success) {
                console.log(`   ✅ ${strategy.name}: Viable`);
            } else {
                console.log(`   ❌ ${strategy.name}: ${results[strategy.name].error || results[strategy.name].note}`);
            }
        }

        return results;
    }

    /**
     * Run comprehensive liquidity diagnosis
     */
    async runDiagnosis() {
        console.log('🔬 CLANKNET LIQUIDITY DIAGNOSIS');
        console.log('================================');
        console.log(`Token: ${this.clanknetAddress}`);
        console.log(`Pool: ${this.poolAddress}`);
        console.log(`Date: ${new Date().toISOString()}\n`);

        const results = {
            aggregators: await this.testMultipleAggregators(),
            v4Pool: await this.testDirectV4Pool(),
            sources: await this.testAvailableSources(),
            alternatives: await this.testAlternativeRouting()
        };

        this.generateDiagnosisReport(results);
        return results;
    }

    /**
     * Generate comprehensive diagnosis report
     */
    generateDiagnosisReport(results) {
        console.log('\n📊 LIQUIDITY DIAGNOSIS REPORT');
        console.log('=============================\n');

        // Aggregator Analysis
        console.log('🔍 Aggregator Availability:');
        const aggregatorSuccess = Object.values(results.aggregators).some(r => r.success);
        console.log(`   Overall: ${aggregatorSuccess ? '✅ Available' : '❌ Not Available'}`);

        Object.entries(results.aggregators).forEach(([name, result]) => {
            console.log(`   ${name}: ${result.success ? '✅' : '❌'}`);
        });

        // V4 Pool Analysis
        console.log('\n🏊 V4 Pool Analysis:');
        console.log(`   Direct access: ${results.v4Pool.success ? '✅' : '❌'}`);
        if (results.v4Pool.note) {
            console.log(`   Note: ${results.v4Pool.note}`);
        }

        // Alternative Routes
        console.log('\n🛣️  Alternative Routes:');
        Object.entries(results.alternatives).forEach(([name, result]) => {
            console.log(`   ${name}: ${result.success ? '✅' : '❌'}`);
            if (result.note) {
                console.log(`      ${result.note}`);
            }
        });

        // Final Recommendation
        console.log('\n🎯 RECOMMENDED APPROACH:');
        console.log('========================');

        if (aggregatorSuccess) {
            console.log('✅ Use working DEX aggregator for purchases');
        } else if (results.v4Pool.success) {
            console.log('🔧 Implement direct V4 Universal Router integration');
        } else {
            console.log('⚠️  CRITICAL: No viable purchase routes found');
            console.log('   Options:');
            console.log('   1. 🔧 Implement direct V4 SDK integration');
            console.log('   2. 💰 Add liquidity to aggregator-covered DEXes');
            console.log('   3. 🎯 Use token request mechanism instead of purchases');
        }

        console.log(`\nDiagnosis completed: ${new Date().toISOString()}`);
    }
}

// Run the diagnosis
async function main() {
    const diagnoser = new ClanknetLiquidityDiagnoser();
    await diagnoser.runDiagnosis();
}

main().catch(console.error);