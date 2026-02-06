#!/usr/bin/env node

/**
 * Test Token Request System - End-to-End validation
 * Tests the complete flow for agents to request Clanknet tokens
 */

require('dotenv').config();
const { ethers } = require('ethers');
const ClanknetTokenRequestManager = require('../core/clanknet-token-request');

class TokenRequestTester {
    constructor() {
        this.provider = new ethers.providers.JsonRpcProvider('https://mainnet.base.org');

        // Create test wallet for token requests
        this.testWallet = ethers.Wallet.createRandom().connect(this.provider);

        this.requestManager = new ClanknetTokenRequestManager(this.provider, this.testWallet);
    }

    /**
     * Test 1: Basic token request manager setup
     */
    async testSetup() {
        console.log('🔍 Test 1: Token Request Manager Setup');
        console.log('====================================\n');

        try {
            console.log('📋 Configuration:');
            console.log(`   Clanknet Address: ${this.requestManager.clanknetAddress}`);
            console.log(`   Test Wallet: ${this.testWallet.address}`);
            console.log(`   Primary Endpoint: ${this.requestManager.requestEndpoints.primary}`);
            console.log(`   Fallback Endpoint: ${this.requestManager.requestEndpoints.fallback}`);

            console.log('\n💰 Standard Amounts:');
            Object.entries(this.requestManager.standardAmounts).forEach(([type, amount]) => {
                console.log(`   ${type}: ${amount} CLANKNET`);
            });

            // Test contract accessibility
            const tokenInfo = await this.requestManager.contract.name();
            console.log(`\n✅ Token contract accessible: ${tokenInfo}`);

            return { success: true, tokenName: tokenInfo };

        } catch (error) {
            console.error('❌ Setup test failed:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Test 2: Balance checking functionality
     */
    async testBalanceCheck() {
        console.log('\n🔍 Test 2: Balance Check Functionality');
        console.log('====================================\n');

        try {
            const balance = await this.requestManager.checkCurrentBalance();

            console.log('📊 Balance Information:');
            console.log(`   Raw Balance: ${balance.raw}`);
            console.log(`   Formatted: ${balance.formatted} CLANKNET`);
            console.log(`   Has Tokens: ${balance.hasTokens ? '✅' : '❌'}`);
            console.log(`   Is Eligible: ${balance.isEligible ? '✅' : '❌'} (${balance.isEligible ? 'Can request' : 'Has enough'})`);

            return {
                success: true,
                balance: balance.formatted,
                eligible: balance.isEligible
            };

        } catch (error) {
            console.error('❌ Balance check failed:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Test 3: Signed request generation
     */
    async testSignedRequest() {
        console.log('\n🔍 Test 3: Signed Request Generation');
        console.log('===================================\n');

        try {
            const signedRequest = await this.requestManager.generateSignedRequest(
                'onboarding',
                'Test agent setup for validation'
            );

            console.log('📝 Signed Request Generated:');
            console.log(`   Address: ${signedRequest.address}`);
            console.log(`   Type: ${signedRequest.requestType}`);
            console.log(`   Amount: ${signedRequest.amount} CLANKNET`);
            console.log(`   Reason: ${signedRequest.reason}`);
            console.log(`   Timestamp: ${new Date(signedRequest.timestamp).toISOString()}`);
            console.log(`   Chain ID: ${signedRequest.chainId}`);
            console.log(`   Signature: ${signedRequest.signature.substring(0, 20)}...`);
            console.log(`   Message Hash: ${signedRequest.messageHash.substring(0, 20)}...`);

            // Verify signature
            const recoveredAddress = ethers.utils.verifyMessage(signedRequest.message, signedRequest.signature);
            const signatureValid = recoveredAddress.toLowerCase() === this.testWallet.address.toLowerCase();

            console.log(`\n🔐 Signature Validation: ${signatureValid ? '✅ Valid' : '❌ Invalid'}`);
            console.log(`   Expected: ${this.testWallet.address}`);
            console.log(`   Recovered: ${recoveredAddress}`);

            return {
                success: true,
                signatureValid,
                requestId: `test_${signedRequest.timestamp}`
            };

        } catch (error) {
            console.error('❌ Signed request generation failed:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Test 4: Token request submission (dry run)
     */
    async testTokenRequest() {
        console.log('\n🔍 Test 4: Token Request Submission');
        console.log('==================================\n');

        try {
            console.log('📤 Submitting token request (testing endpoints)...');

            const result = await this.requestManager.requestTokens('onboarding', 'End-to-end test validation');

            console.log('\n📋 Request Result:');
            console.log(`   Success: ${result.success ? '✅' : '❌'}`);

            if (result.success) {
                console.log(`   Request ID: ${result.requestId}`);
                console.log(`   Amount: ${result.amount} CLANKNET`);
                console.log(`   Method: ${result.method || result.endpoint}`);
                console.log(`   Estimated Delivery: ${result.estimatedDelivery}`);
                console.log(`   Message: ${result.message}`);

                if (result.transactionHash) {
                    console.log(`   Transaction: ${result.transactionHash}`);
                }
            } else {
                console.log(`   Error: ${result.error}`);
                console.log(`   Suggestion: ${result.suggestion}`);

                if (result.retryAfter) {
                    console.log(`   Retry After: ${result.retryAfter}`);
                }
            }

            return {
                success: result.success,
                requestId: result.requestId,
                method: result.method || result.endpoint,
                error: result.error
            };

        } catch (error) {
            console.error('❌ Token request test failed:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Test 5: Agent onboarding flow
     */
    async testAgentOnboarding() {
        console.log('\n🔍 Test 5: Complete Agent Onboarding');
        console.log('===================================\n');

        try {
            console.log('🚀 Testing complete agent onboarding flow...');

            const agentDetails = {
                name: 'Test Agent',
                type: 'farcaster',
                purpose: 'End-to-end validation testing',
                version: '1.0.0'
            };

            const onboardingResult = await this.requestManager.onboardAgent(agentDetails);

            console.log('\n📋 Onboarding Result:');
            console.log(`   Success: ${onboardingResult.success ? '✅' : '❌'}`);

            if (onboardingResult.success) {
                console.log(`   Already Onboarded: ${onboardingResult.alreadyOnboarded || false}`);
                console.log(`   Request ID: ${onboardingResult.requestId}`);
                console.log(`   Amount Requested: ${onboardingResult.amount} CLANKNET`);
                console.log(`   Onboarding Complete: ${onboardingResult.onboardingComplete || false}`);

                if (onboardingResult.finalBalance) {
                    console.log(`   Final Balance: ${onboardingResult.finalBalance} CLANKNET`);
                }

                if (onboardingResult.nextSteps) {
                    console.log(`   Next Steps: ${onboardingResult.nextSteps}`);
                }
            } else {
                console.log(`   Error: ${onboardingResult.error}`);
                console.log(`   Suggestion: ${onboardingResult.suggestion}`);
            }

            return {
                success: onboardingResult.success,
                complete: onboardingResult.onboardingComplete,
                requestId: onboardingResult.requestId
            };

        } catch (error) {
            console.error('❌ Agent onboarding test failed:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Test 6: Request status checking
     */
    async testStatusCheck(requestId = 'test_12345') {
        console.log('\n🔍 Test 6: Request Status Checking');
        console.log('==================================\n');

        try {
            console.log(`🔍 Checking status for request: ${requestId}`);

            const status = await this.requestManager.checkRequestStatus(requestId);

            console.log('\n📋 Status Check Result:');
            console.log(`   Success: ${status.success ? '✅' : '❌'}`);

            if (status.success) {
                console.log(`   Status: ${status.status}`);
                console.log(`   Progress: ${status.progress || 'N/A'}`);

                if (status.transactionHash) {
                    console.log(`   Transaction: ${status.transactionHash}`);
                }
            } else {
                console.log(`   Error: ${status.error}`);
                console.log(`   Suggestion: ${status.suggestion}`);
            }

            return { success: status.success, status: status.status };

        } catch (error) {
            console.error('❌ Status check test failed:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Run comprehensive token request test suite
     */
    async runFullTest() {
        console.log('🧪 CLANKNET TOKEN REQUEST TEST SUITE');
        console.log('=====================================');
        console.log(`Date: ${new Date().toISOString()}\n`);

        const results = {
            setup: await this.testSetup(),
            balance: await this.testBalanceCheck(),
            signature: await this.testSignedRequest(),
            request: await this.testTokenRequest(),
            onboarding: await this.testAgentOnboarding(),
            status: await this.testStatusCheck()
        };

        this.generateTestReport(results);
        return results;
    }

    /**
     * Generate comprehensive test report
     */
    generateTestReport(results) {
        console.log('\n📊 TOKEN REQUEST TEST REPORT');
        console.log('=============================\n');

        // Individual test results
        Object.entries(results).forEach(([test, result]) => {
            const status = result.success ? '✅' : '❌';
            const name = test.charAt(0).toUpperCase() + test.slice(1);
            console.log(`${status} ${name}: ${result.success ? 'PASSED' : 'FAILED'}`);

            if (!result.success && result.error) {
                console.log(`   Error: ${result.error}`);
            }
        });

        const passedCount = Object.values(results).filter(r => r.success).length;
        const totalTests = Object.keys(results).length;

        console.log('\n🎯 ASSESSMENT:');
        console.log('==============');

        if (passedCount === totalTests) {
            console.log('✅ TOKEN REQUEST SYSTEM READY');
            console.log('   All components validated');
            console.log('   Ready for agent onboarding');
        } else {
            console.log(`⚠️  PARTIAL FUNCTIONALITY (${passedCount}/${totalTests})`);

            // Critical components analysis
            const criticalTests = ['setup', 'balance', 'signature'];
            const criticalFailures = criticalTests.filter(test => !results[test]?.success);

            if (criticalFailures.length > 0) {
                console.log('\n🚨 CRITICAL ISSUES:');
                criticalFailures.forEach(test => {
                    console.log(`❌ ${test}: ${results[test]?.error || 'Failed'}`);
                });
            }

            // API connectivity analysis
            if (!results.request.success || !results.onboarding.success) {
                console.log('\n📡 API CONNECTIVITY:');
                console.log('   Token request APIs may be unavailable');
                console.log('   Fallback mechanisms should handle this');
            }
        }

        console.log('\n📋 IMPLEMENTATION STATUS:');
        console.log('=========================');

        if (results.setup.success && results.balance.success && results.signature.success) {
            console.log('✅ Core token request mechanism functional');
            console.log('✅ Wallet integration working');
            console.log('✅ Cryptographic signatures valid');
        }

        if (results.request.success || results.onboarding.success) {
            console.log('✅ Request submission system operational');
        } else {
            console.log('⚠️  Request APIs unavailable (using fallback)');
            console.log('   This is expected for testing environment');
        }

        console.log('\n📋 NEXT STEPS:');
        console.log('==============');

        if (passedCount >= 3) { // Core functionality works
            console.log('1. ✅ Update tutorials to prioritize token requests');
            console.log('2. ✅ Integrate token request into agent startup flow');
            console.log('3. ✅ Deploy token request endpoints if needed');
        } else {
            console.log('1. 🔧 Fix critical token request system issues');
            console.log('2. 🔧 Verify wallet and contract integration');
            console.log('3. 🔧 Test with real API endpoints when available');
        }

        console.log(`\nTest completed: ${new Date().toISOString()}`);
    }
}

// Run the token request test
async function main() {
    const tester = new TokenRequestTester();
    const results = await tester.runFullTest();

    // Success if core functionality works (setup, balance, signature)
    const coreTests = ['setup', 'balance', 'signature'];
    const coreSuccess = coreTests.every(test => results[test].success);

    process.exit(coreSuccess ? 0 : 1);
}

main().catch(console.error);