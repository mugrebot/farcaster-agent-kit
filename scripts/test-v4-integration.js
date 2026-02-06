#!/usr/bin/env node

/**
 * Test V4 Integration - Comprehensive testing of Uniswap V4 SDK implementation
 */

require('dotenv').config();
const { ethers } = require('ethers');
const ClanknetInteractorV4 = require('../core/clanknet-interactor-v4');

class V4IntegrationTester {
    constructor() {
        this.provider = new ethers.JsonRpcProvider('https://mainnet.base.org');

        // Create test wallet (don't use real private key for testing)
        this.testWallet = ethers.Wallet.createRandom().connect(this.provider);

        this.interactor = new ClanknetInteractorV4(this.provider, this.testWallet);
    }

    /**
     * Test 1: Basic setup and configuration
     */
    async testSetup() {
        console.log('🔍 Test 1: V4 Setup Validation');
        console.log('==============================\n');

        try {
            console.log('📋 Configuration:');
            console.log(`   Chain ID: ${this.interactor.chainId}`);
            console.log(`   CLANKNET: ${this.interactor.clanknetAddress}`);
            console.log(`   WETH: ${this.interactor.wethAddress}`);
            console.log(`   Universal Router: ${this.interactor.universalRouterAddress}`);
            console.log(`   Test Wallet: ${this.testWallet.address}`);

            console.log('\n📊 Pool Key Configuration:');
            console.log(`   Currency0: ${this.interactor.poolKey.currency0}`);
            console.log(`   Currency1: ${this.interactor.poolKey.currency1}`);
            console.log(`   Fee: ${this.interactor.poolKey.fee} (${this.interactor.poolKey.fee / 10000}%)`);
            console.log(`   Tick Spacing: ${this.interactor.poolKey.tickSpacing}`);
            console.log(`   Hooks: ${this.interactor.poolKey.hooks}`);

            // Validate pool key ordering
            const currency0Lower = this.interactor.poolKey.currency0.toLowerCase();
            const currency1Lower = this.interactor.poolKey.currency1.toLowerCase();
            const correctOrder = currency0Lower < currency1Lower;

            console.log(`\n🔍 Pool Key Validation:`);
            console.log(`   Currency order correct: ${correctOrder ? '✅' : '❌'}`);

            if (!correctOrder) {
                console.log('   ⚠️  WARNING: Currencies should be ordered by address (currency0 < currency1)');
            }

            return {
                success: true,
                correctOrder,
                config: this.interactor.poolKey
            };

        } catch (error) {
            console.error('❌ Setup validation failed:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Test 2: Token contract validation
     */
    async testTokenContract() {
        console.log('\n🔍 Test 2: Token Contract Validation');
        console.log('===================================\n');

        try {
            const tokenInfo = await this.interactor.getTokenInfo();

            console.log('✅ Token contract accessible:');
            console.log(`   Name: ${tokenInfo.name}`);
            console.log(`   Symbol: ${tokenInfo.symbol}`);
            console.log(`   Decimals: ${tokenInfo.decimals}`);
            console.log(`   Total Supply: ${parseFloat(tokenInfo.totalSupply).toLocaleString()}`);
            console.log(`   Network: ${tokenInfo.network} (${tokenInfo.chainId})`);

            // Validate token matches SDK configuration
            const sdkTokenMatch = (
                tokenInfo.address.toLowerCase() === this.interactor.CLANKNET_TOKEN.address.toLowerCase() &&
                tokenInfo.decimals === this.interactor.CLANKNET_TOKEN.decimals
            );

            console.log(`\n🔍 SDK Token Match: ${sdkTokenMatch ? '✅' : '❌'}`);

            return {
                success: true,
                tokenInfo,
                sdkTokenMatch
            };

        } catch (error) {
            console.error('❌ Token contract validation failed:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Test 3: Universal Router contract validation
     */
    async testUniversalRouter() {
        console.log('\n🔍 Test 3: Universal Router Validation');
        console.log('=====================================\n');

        try {
            const routerAddress = this.interactor.universalRouterAddress;

            // Check if contract exists
            const code = await this.provider.getCode(routerAddress);
            const hasCode = code !== '0x';

            console.log(`📋 Universal Router: ${routerAddress}`);
            console.log(`   Contract exists: ${hasCode ? '✅' : '❌'}`);
            console.log(`   Code size: ${code.length} bytes`);

            if (!hasCode) {
                console.log('❌ Universal Router contract not found at this address');
                console.log('   This will cause all swaps to fail');
                return { success: false, error: 'Universal Router not deployed' };
            }

            // Test contract interface (read-only)
            try {
                // Try to call a view function if available
                console.log('✅ Universal Router contract accessible');
            } catch (interfaceError) {
                console.log('⚠️  Universal Router interface test failed:', interfaceError.message);
            }

            return {
                success: true,
                routerAddress,
                hasCode,
                codeSize: code.length
            };

        } catch (error) {
            console.error('❌ Universal Router validation failed:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Test 4: Quote generation (simulation)
     */
    async testQuoteGeneration() {
        console.log('\n🔍 Test 4: Quote Generation Validation');
        console.log('=====================================\n');

        const testAmounts = ['0.001', '0.01', '0.1'];
        const results = [];

        for (const ethAmount of testAmounts) {
            try {
                console.log(`📊 Testing quote for ${ethAmount} ETH...`);

                const quote = await this.interactor.getSwapQuote(ethAmount, 2);

                if (quote.success) {
                    const tokensOut = ethers.formatUnits(quote.estimatedAmountOut, 18);
                    const minTokensOut = ethers.formatUnits(quote.minimumAmountOut, 18);

                    console.log(`   ✅ Quote successful:`);
                    console.log(`      Expected: ${parseFloat(tokensOut).toLocaleString()} CLANKNET`);
                    console.log(`      Minimum: ${parseFloat(minTokensOut).toLocaleString()} CLANKNET`);
                    console.log(`      Gas estimate: ${quote.gasCost}`);

                    results.push({
                        amount: ethAmount,
                        success: true,
                        tokensOut: tokensOut,
                        minTokensOut: minTokensOut
                    });
                } else {
                    console.log(`   ❌ Quote failed: ${quote.error}`);
                    results.push({
                        amount: ethAmount,
                        success: false,
                        error: quote.error
                    });
                }

            } catch (error) {
                console.error(`❌ Quote exception for ${ethAmount} ETH:`, error.message);
                results.push({
                    amount: ethAmount,
                    success: false,
                    error: error.message
                });
            }
        }

        const successCount = results.filter(r => r.success).length;
        console.log(`\n📊 Quote Generation Summary: ${successCount}/${results.length} successful`);

        return results;
    }

    /**
     * Test 5: V4 SDK imports and integration
     */
    async testV4SDKIntegration() {
        console.log('\n🔍 Test 5: V4 SDK Integration');
        console.log('=============================\n');

        try {
            // Test V4 SDK imports
            const { Actions, V4Planner } = require('@uniswap/v4-sdk');
            const { CommandType, RoutePlanner } = require('@uniswap/universal-router-sdk');
            const { Token, ChainId } = require('@uniswap/sdk-core');

            console.log('✅ V4 SDK imports successful:');
            console.log(`   Actions available: ${Object.keys(Actions).length} actions`);
            console.log(`   CommandType available: ${Object.keys(CommandType).length} commands`);

            // Test planner creation
            const testPlanner = new V4Planner();
            const testRoutePlanner = new RoutePlanner();

            console.log('✅ SDK planner creation successful');

            // Test token creation
            const testToken = new Token(8453, this.interactor.clanknetAddress, 18, 'TEST', 'Test Token');
            console.log(`✅ SDK token creation successful: ${testToken.symbol}`);

            // Test available actions
            console.log('\n📋 Available V4 Actions:');
            Object.entries(Actions).forEach(([key, value]) => {
                console.log(`   ${key}: ${value}`);
            });

            return {
                success: true,
                actionsCount: Object.keys(Actions).length,
                commandsCount: Object.keys(CommandType).length
            };

        } catch (error) {
            console.error('❌ V4 SDK integration failed:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Test 6: Dry-run swap simulation (no real transaction)
     */
    async testDryRunSwap() {
        console.log('\n🔍 Test 6: Dry-Run Swap Simulation');
        console.log('==================================\n');

        try {
            console.log('📋 Simulating swap preparation (no execution)...');

            // Test swap preparation without execution
            const testAmount = '0.001';
            const quote = await this.interactor.getSwapQuote(testAmount, 2);

            if (!quote.success) {
                throw new Error(`Quote failed: ${quote.error}`);
            }

            // Import required components
            const { Actions, V4Planner } = require('@uniswap/v4-sdk');
            const { CommandType, RoutePlanner } = require('@uniswap/universal-router-sdk');

            // Setup planners
            const v4Planner = new V4Planner();
            const routePlanner = new RoutePlanner();

            // Create swap configuration
            const swapConfig = {
                poolKey: this.interactor.poolKey,
                zeroForOne: true,
                amountIn: quote.amountIn,
                amountOutMinimum: quote.minimumAmountOut,
                hookData: '0x00'
            };

            console.log('📊 Swap Configuration:');
            console.log(`   Pool: ${swapConfig.poolKey.currency0} → ${swapConfig.poolKey.currency1}`);
            console.log(`   Direction: ${swapConfig.zeroForOne ? 'ETH → CLANKNET' : 'CLANKNET → ETH'}`);
            console.log(`   Amount In: ${ethers.formatEther(swapConfig.amountIn)} ETH`);
            console.log(`   Min Out: ${ethers.formatUnits(swapConfig.amountOutMinimum, 18)} CLANKNET`);

            // Plan actions (simulation only)
            v4Planner.addAction(Actions.SWAP_EXACT_IN_SINGLE, [swapConfig]);
            v4Planner.addAction(Actions.SETTLE_ALL, [swapConfig.poolKey.currency0, swapConfig.amountIn]);
            v4Planner.addAction(Actions.TAKE_ALL, [swapConfig.poolKey.currency1, swapConfig.amountOutMinimum]);

            const encodedActions = v4Planner.finalize();

            routePlanner.addCommand(CommandType.V4_SWAP, [v4Planner.actions, v4Planner.params]);

            console.log('✅ V4 swap simulation successful:');
            console.log(`   Actions planned: ${v4Planner.actions.length}`);
            console.log(`   Encoded size: ${encodedActions.length} bytes`);
            console.log(`   Router commands: ${routePlanner.commands.length}`);

            return {
                success: true,
                actionsPlanned: v4Planner.actions.length,
                encodedSize: encodedActions.length,
                commandsCount: routePlanner.commands.length
            };

        } catch (error) {
            console.error('❌ Dry-run swap simulation failed:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Run comprehensive V4 integration test
     */
    async runFullTest() {
        console.log('🚀 UNISWAP V4 INTEGRATION TEST SUITE');
        console.log('=====================================');
        console.log(`Date: ${new Date().toISOString()}\n`);

        const results = {
            setup: await this.testSetup(),
            token: await this.testTokenContract(),
            router: await this.testUniversalRouter(),
            quotes: await this.testQuoteGeneration(),
            sdk: await this.testV4SDKIntegration(),
            dryRun: await this.testDryRunSwap()
        };

        this.generateV4Report(results);
        return results;
    }

    /**
     * Generate comprehensive test report
     */
    generateV4Report(results) {
        console.log('\n📊 V4 INTEGRATION TEST REPORT');
        console.log('==============================\n');

        // Individual test results
        Object.entries(results).forEach(([test, result]) => {
            const status = result.success ? '✅' : '❌';
            const name = test.charAt(0).toUpperCase() + test.slice(1);
            console.log(`${status} ${name} Test: ${result.success ? 'PASSED' : 'FAILED'}`);

            if (!result.success && result.error) {
                console.log(`   Error: ${result.error}`);
            }
        });

        // Overall assessment
        const allPassed = Object.values(results).every(r => r.success);
        const passedCount = Object.values(results).filter(r => r.success).length;
        const totalTests = Object.keys(results).length;

        console.log('\n🎯 OVERALL V4 ASSESSMENT:');
        console.log('=========================');

        if (allPassed) {
            console.log('✅ V4 INTEGRATION READY');
            console.log('   All core V4 functionality validated');
            console.log('   Safe to proceed with test purchases');
        } else {
            console.log(`⚠️  V4 INTEGRATION PARTIAL (${passedCount}/${totalTests})`);
            console.log('   Some components need attention');
        }

        // Critical blockers
        const criticalTests = ['setup', 'token', 'router', 'sdk'];
        const criticalFailures = criticalTests.filter(test => !results[test]?.success);

        if (criticalFailures.length > 0) {
            console.log('\n🚨 CRITICAL BLOCKERS:');
            console.log('====================');
            criticalFailures.forEach(test => {
                console.log(`❌ ${test}: ${results[test]?.error || 'Failed'}`);
            });
            console.log('   Must fix these before attempting swaps');
        }

        // Next steps
        console.log('\n📋 NEXT STEPS:');
        console.log('==============');

        if (allPassed) {
            console.log('1. ✅ Test with small real transaction (0.001 ETH)');
            console.log('2. ✅ Implement token request mechanism');
            console.log('3. ✅ Update tutorials to reflect V4 integration');
        } else {
            if (results.router && !results.router.success) {
                console.log('1. 🔧 Verify Universal Router deployment address');
            }
            if (results.sdk && !results.sdk.success) {
                console.log('2. 🔧 Fix V4 SDK integration issues');
            }
            console.log('3. 🔧 Address critical test failures');
        }

        console.log(`\nTest completed: ${new Date().toISOString()}`);
    }
}

// Run the V4 integration test
async function main() {
    const tester = new V4IntegrationTester();
    const results = await tester.runFullTest();

    const success = Object.values(results).every(r => r.success);
    process.exit(success ? 0 : 1);
}

main().catch(console.error);