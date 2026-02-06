#!/usr/bin/env node

/**
 * Verify Clanknet Contract - Test if the contract actually exists and is functional
 */

require('dotenv').config();
const ClanknetInteractor = require('../core/clanknet-interactor');
const { ethers } = require('ethers');

async function verifyClanknetContract() {
    console.log('🔍 Verifying Clanknet Token Contract');
    console.log('====================================\n');

    try {
        // Setup provider for Base network
        const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');

        // Initialize ClanknetInteractor (without wallet for read-only operations)
        const clanknet = new ClanknetInteractor(provider);

        console.log('🔗 Contract Details:');
        console.log(`   Address: ${clanknet.tokenAddress}`);
        console.log(`   Network: Base (8453)`);
        console.log(`   Provider: ${provider._getConnection().url}`);

        // Test 1: Get token information
        console.log('\n📋 Test 1: Getting token information...');
        try {
            const tokenInfo = await clanknet.getTokenInfo();
            console.log('✅ Token info retrieved successfully:');
            console.log(`   Name: ${tokenInfo.name}`);
            console.log(`   Symbol: ${tokenInfo.symbol}`);
            console.log(`   Decimals: ${tokenInfo.decimals}`);
            console.log(`   Total Supply: ${tokenInfo.totalSupply}`);
        } catch (error) {
            console.log('❌ Failed to get token info:', error.message);
            return false;
        }

        // Test 2: Check if contract has valid code
        console.log('\n🔍 Test 2: Checking contract code...');
        try {
            const code = await provider.getCode(clanknet.tokenAddress);
            if (code === '0x') {
                console.log('❌ No contract code found at this address');
                return false;
            } else {
                console.log(`✅ Contract code exists (${code.length} bytes)`);
            }
        } catch (error) {
            console.log('❌ Failed to check contract code:', error.message);
            return false;
        }

        // Test 3: Check balance of a random address (should work for any ERC-20)
        console.log('\n💰 Test 3: Testing balance query...');
        try {
            const testAddress = '0x0000000000000000000000000000000000000001';
            const balance = await clanknet.getBalance(testAddress);
            console.log(`✅ Balance query works: ${balance.formatted} ${balance.symbol}`);
        } catch (error) {
            console.log('❌ Failed to get balance:', error.message);
            return false;
        }

        // Test 4: Check Uniswap V3 router address
        console.log('\n🦄 Test 4: Verifying Uniswap V3 Router...');
        try {
            const routerCode = await provider.getCode(clanknet.uniswapRouter);
            if (routerCode === '0x') {
                console.log('❌ Uniswap router address has no contract code');
                console.log(`   Address: ${clanknet.uniswapRouter}`);
            } else {
                console.log(`✅ Uniswap router exists: ${clanknet.uniswapRouter}`);
            }
        } catch (error) {
            console.log('❌ Failed to check Uniswap router:', error.message);
        }

        // Test 5: Check WETH address on Base
        console.log('\n💎 Test 5: Verifying WETH address...');
        try {
            const wethCode = await provider.getCode(clanknet.wethAddress);
            if (wethCode === '0x') {
                console.log('❌ WETH address has no contract code');
                console.log(`   Address: ${clanknet.wethAddress}`);
            } else {
                console.log(`✅ WETH contract exists: ${clanknet.wethAddress}`);
            }
        } catch (error) {
            console.log('❌ Failed to check WETH address:', error.message);
        }

        // Test 6: Try to get price (this will test Uniswap integration)
        console.log('\n📈 Test 6: Testing price retrieval...');
        try {
            const price = await clanknet.getPrice();
            if (price) {
                console.log('✅ Price retrieval works:');
                console.log(`   Price in ETH: ${price.priceInETH}`);
                console.log(`   Price in USD: $${price.priceInUSD}`);
                console.log(`   Pool Address: ${price.poolAddress}`);
            } else {
                console.log('⚠️  Price retrieval returned null (may be no pool)');
            }
        } catch (error) {
            console.log('❌ Failed to get price:', error.message);
        }

        console.log('\n📊 Verification Summary:');
        console.log('========================');
        console.log('✅ Contract exists and is functional');
        console.log('✅ Basic ERC-20 operations work');
        console.log('⚠️  Check individual test results above for infrastructure components');

        return true;

    } catch (error) {
        console.error('❌ Fatal error during verification:', error);
        return false;
    }
}

// Run verification
verifyClanknetContract()
    .then(success => {
        if (success) {
            console.log('\n🎉 Clanknet contract verification completed!');
        } else {
            console.log('\n💥 Clanknet contract verification failed!');
            process.exit(1);
        }
    })
    .catch(error => {
        console.error('💥 Verification script error:', error);
        process.exit(1);
    });