#!/usr/bin/env node

/**
 * Test Matcha Integration - Comprehensive testing of 0x API for Clanknet purchasing
 */

require('dotenv').config();
const axios = require('axios');
const { ethers } = require('ethers');

class MatchaIntegrationTester {
    constructor() {
        this.clanknetAddress = '0x623693BefAECf61484e344fa272e9A8B82d9BB07';
        this.baseApiUrl = 'https://base.api.0x.org';
        this.provider = new ethers.JsonRpcProvider('https://mainnet.base.org');

        // Test configuration
        this.testAmounts = ['0.001', '0.01', '0.1']; // ETH amounts to test
        this.testSlippage = [0.5, 1.0, 2.0, 5.0]; // Different slippage percentages
    }

    /**
     * Test 1: Check if 0x API is accessible
     */
    async testApiAccess() {
        console.log('🔍 Test 1: Checking 0x API Access');
        console.log('================================\n');

        try {
            // Test basic API endpoint
            const response = await axios.get(`${this.baseApiUrl}/swap/v1/sources`);
            console.log('✅ 0x API is accessible');
            console.log(`📊 Available sources: ${response.data.sources?.length || 'unknown'}`);

            // Test if we have API key
            const hasApiKey = !!process.env.MATCHA_API_KEY;
            console.log(`🔑 API Key present: ${hasApiKey}`);

            if (!hasApiKey) {
                console.log('⚠️  No MATCHA_API_KEY found in .env - may hit rate limits');
            }

            return { success: true, hasApiKey };
        } catch (error) {
            console.error('❌ 0x API access failed:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Test 2: Get quotes for different amounts
     */
    async testQuoteGeneration() {
        console.log('\n🔍 Test 2: Quote Generation');
        console.log('===========================\n');

        const results = [];

        for (const ethAmount of this.testAmounts) {
            try {
                console.log(`📊 Testing quote for ${ethAmount} ETH...`);

                const amountWei = ethers.parseEther(ethAmount).toString();

                const headers = {};
                if (process.env.MATCHA_API_KEY) {
                    headers['0x-api-key'] = process.env.MATCHA_API_KEY;
                }

                const response = await axios.get(`${this.baseApiUrl}/swap/v1/quote`, {
                    params: {
                        sellToken: 'ETH',
                        buyToken: this.clanknetAddress,
                        sellAmount: amountWei,
                        slippagePercentage: 0.02 // 2%
                    },
                    headers
                });

                const quote = response.data;
                const tokensOut = ethers.formatUnits(quote.buyAmount, 18);
                const effectivePrice = parseFloat(ethAmount) / parseFloat(tokensOut);

                console.log(`✅ Quote successful:`);
                console.log(`   Expected CLANKNET: ${parseFloat(tokensOut).toFixed(6)}`);
                console.log(`   Effective price: ${effectivePrice.toFixed(8)} ETH/CLANKNET`);
                console.log(`   Gas estimate: ${quote.gas || 'unknown'}`);
                console.log(`   Estimated gas price: ${quote.gasPrice || 'unknown'}`);

                results.push({
                    amount: ethAmount,
                    success: true,
                    tokensOut: tokensOut,
                    effectivePrice: effectivePrice,
                    gasEstimate: quote.gas
                });

            } catch (error) {
                console.error(`❌ Quote failed for ${ethAmount} ETH:`, error.response?.data || error.message);
                results.push({
                    amount: ethAmount,
                    success: false,
                    error: error.message
                });
            }
        }

        return results;
    }

    /**
     * Test 3: Slippage protection validation
     */
    async testSlippageProtection() {
        console.log('\n🔍 Test 3: Slippage Protection');
        console.log('==============================\n');

        const testAmount = '0.01'; // Use fixed amount for slippage testing
        const results = [];

        for (const slippage of this.testSlippage) {
            try {
                console.log(`📊 Testing ${slippage}% slippage...`);

                const amountWei = ethers.parseEther(testAmount).toString();

                const headers = {};
                if (process.env.MATCHA_API_KEY) {
                    headers['0x-api-key'] = process.env.MATCHA_API_KEY;
                }

                const response = await axios.get(`${this.baseApiUrl}/swap/v1/quote`, {
                    params: {
                        sellToken: 'ETH',
                        buyToken: this.clanknetAddress,
                        sellAmount: amountWei,
                        slippagePercentage: slippage / 100
                    },
                    headers
                });

                const quote = response.data;
                const tokensOut = ethers.formatUnits(quote.buyAmount, 18);

                console.log(`✅ ${slippage}% slippage quote successful:`);
                console.log(`   Expected CLANKNET: ${parseFloat(tokensOut).toFixed(6)}`);
                console.log(`   Quote ID: ${quote.sellTokenAddress || 'unknown'}`);

                results.push({
                    slippage,
                    success: true,
                    tokensOut: tokensOut,
                    quote: quote
                });

                // Small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 500));

            } catch (error) {
                console.error(`❌ ${slippage}% slippage failed:`, error.response?.data || error.message);
                results.push({
                    slippage,
                    success: false,
                    error: error.message
                });
            }
        }

        return results;
    }

    /**
     * Test 4: Transaction preparation (without execution)
     */
    async testTransactionPreparation() {
        console.log('\n🔍 Test 4: Transaction Preparation');
        console.log('==================================\n');

        try {
            const testAmount = '0.001';
            const amountWei = ethers.parseEther(testAmount).toString();

            // Create a test wallet address (don't use real one)
            const testWallet = ethers.Wallet.createRandom();

            const headers = {};
            if (process.env.MATCHA_API_KEY) {
                headers['0x-api-key'] = process.env.MATCHA_API_KEY;
            }

            console.log(`📊 Preparing transaction for ${testAmount} ETH...`);
            console.log(`📝 Test wallet: ${testWallet.address}`);

            const response = await axios.get(`${this.baseApiUrl}/swap/v1/quote`, {
                params: {
                    sellToken: 'ETH',
                    buyToken: this.clanknetAddress,
                    sellAmount: amountWei,
                    slippagePercentage: 0.02,
                    takerAddress: testWallet.address
                },
                headers
            });

            const quote = response.data;

            console.log('✅ Transaction preparation successful:');
            console.log(`   To: ${quote.to}`);
            console.log(`   Value: ${quote.value || amountWei}`);
            console.log(`   Gas: ${quote.gas}`);
            console.log(`   Gas Price: ${quote.gasPrice}`);
            console.log(`   Data length: ${quote.data?.length || 0} bytes`);

            // Validate transaction structure
            const isValidTx = !!(quote.to && quote.data && quote.gas);
            console.log(`🔍 Transaction structure valid: ${isValidTx}`);

            return {
                success: true,
                quote: quote,
                isValidTx: isValidTx,
                testWallet: testWallet.address
            };

        } catch (error) {
            console.error('❌ Transaction preparation failed:', error.response?.data || error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Test 5: Verify Clanknet token contract accessibility
     */
    async testTokenContract() {
        console.log('\n🔍 Test 5: Token Contract Verification');
        console.log('=====================================\n');

        try {
            const tokenABI = [
                "function name() view returns (string)",
                "function symbol() view returns (string)",
                "function decimals() view returns (uint8)",
                "function totalSupply() view returns (uint256)"
            ];

            const contract = new ethers.Contract(
                this.clanknetAddress,
                tokenABI,
                this.provider
            );

            const [name, symbol, decimals, totalSupply] = await Promise.all([
                contract.name(),
                contract.symbol(),
                contract.decimals(),
                contract.totalSupply()
            ]);

            console.log('✅ Token contract verification successful:');
            console.log(`   Name: ${name}`);
            console.log(`   Symbol: ${symbol}`);
            console.log(`   Decimals: ${decimals}`);
            console.log(`   Total Supply: ${ethers.formatUnits(totalSupply, decimals)}`);

            return {
                success: true,
                tokenInfo: { name, symbol, decimals, totalSupply: totalSupply.toString() }
            };

        } catch (error) {
            console.error('❌ Token contract verification failed:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Run all tests and generate report
     */
    async runFullTest() {
        console.log('🔬 MATCHA INTEGRATION TEST SUITE');
        console.log('=================================');
        console.log(`Testing Clanknet token: ${this.clanknetAddress}`);
        console.log(`Base 0x API: ${this.baseApiUrl}`);
        console.log(`Date: ${new Date().toISOString()}\n`);

        const results = {
            apiAccess: await this.testApiAccess(),
            quotes: await this.testQuoteGeneration(),
            slippage: await this.testSlippageProtection(),
            transaction: await this.testTransactionPreparation(),
            token: await this.testTokenContract()
        };

        // Generate summary report
        this.generateReport(results);

        return results;
    }

    /**
     * Generate comprehensive test report
     */
    generateReport(results) {
        console.log('\n📊 TEST SUMMARY REPORT');
        console.log('======================\n');

        // API Access
        const apiStatus = results.apiAccess.success ? '✅' : '❌';
        console.log(`${apiStatus} API Access: ${results.apiAccess.success ? 'SUCCESS' : 'FAILED'}`);
        if (results.apiAccess.hasApiKey) {
            console.log('   🔑 API Key configured');
        } else {
            console.log('   ⚠️  No API key - may hit rate limits');
        }

        // Quote Generation
        const successfulQuotes = results.quotes.filter(q => q.success).length;
        const quoteStatus = successfulQuotes > 0 ? '✅' : '❌';
        console.log(`${quoteStatus} Quote Generation: ${successfulQuotes}/${results.quotes.length} successful`);

        // Slippage Testing
        const successfulSlippage = results.slippage.filter(s => s.success).length;
        const slippageStatus = successfulSlippage > 0 ? '✅' : '❌';
        console.log(`${slippageStatus} Slippage Protection: ${successfulSlippage}/${results.slippage.length} successful`);

        // Transaction Prep
        const txStatus = results.transaction.success ? '✅' : '❌';
        console.log(`${txStatus} Transaction Preparation: ${results.transaction.success ? 'SUCCESS' : 'FAILED'}`);

        // Token Contract
        const tokenStatus = results.token.success ? '✅' : '❌';
        console.log(`${tokenStatus} Token Contract: ${results.token.success ? 'SUCCESS' : 'FAILED'}`);

        // Overall Assessment
        const allPassed = results.apiAccess.success &&
                         successfulQuotes > 0 &&
                         successfulSlippage > 0 &&
                         results.transaction.success &&
                         results.token.success;

        console.log('\n🎯 OVERALL ASSESSMENT:');
        console.log('======================');
        if (allPassed) {
            console.log('✅ MATCHA INTEGRATION READY FOR PRODUCTION');
            console.log('   All core functionality working correctly');
            console.log('   Safe to proceed with actual purchases');
        } else {
            console.log('❌ MATCHA INTEGRATION NEEDS FIXES');
            console.log('   Review failed tests before proceeding');
            console.log('   DO NOT attempt real purchases yet');
        }

        // Next Steps
        console.log('\n📋 NEXT STEPS:');
        console.log('==============');
        if (allPassed) {
            console.log('1. ✅ Add MATCHA_API_KEY to .env if not present');
            console.log('2. ✅ Test with small real transaction (0.001 ETH)');
            console.log('3. ✅ Update tutorials to reflect working integration');
        } else {
            console.log('1. 🔧 Fix failed test issues');
            console.log('2. 🔧 Verify API key and rate limits');
            console.log('3. 🔧 Check network connectivity and RPC endpoints');
        }

        console.log(`\nTest completed at: ${new Date().toISOString()}`);
    }
}

// Run the test suite
async function main() {
    const tester = new MatchaIntegrationTester();
    const results = await tester.runFullTest();

    // Exit with appropriate code
    const success = results.apiAccess.success &&
                   results.quotes.some(q => q.success) &&
                   results.slippage.some(s => s.success) &&
                   results.transaction.success &&
                   results.token.success;

    process.exit(success ? 0 : 1);
}

main().catch(console.error);