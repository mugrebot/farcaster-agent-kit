/**
 * Test script for on-chain agent capabilities
 * Demonstrates autonomous wallet management and DeFi interactions
 */

require('dotenv').config();
const OnChainAgent = require('../core/onchain-agent');
const DeFiStrategies = require('../core/defi-strategies');
const LLMProvider = require('../core/llm-provider');

async function testOnChain() {
    console.log('🔗 Testing On-Chain Agent Capabilities');
    console.log('=====================================\n');

    // Initialize LLM for decision making
    const llm = new LLMProvider({
        provider: process.env.LLM_PROVIDER || 'anthropic',
        apiKey: process.env.ANTHROPIC_API_KEY,
        model: process.env.ANTHROPIC_MODEL || 'claude-opus-4-6',
        subModel: process.env.SUB_MODEL || 'claude-sonnet-4-5',
        maxTokens: 150,
        temperature: 0.7
    });

    // Initialize on-chain agent
    const onchainAgent = new OnChainAgent({
        network: process.env.CHAIN_NETWORK || 'base',
        rpcUrl: process.env.RPC_URL,
        maxTransactionValue: '0.01', // 0.01 ETH max per tx
        dailySpendLimit: '0.1', // 0.1 ETH daily limit
        llm
    });

    console.log('📊 Configuration:');
    console.log(`   Network: ${onchainAgent.network}`);
    console.log(`   RPC: ${onchainAgent.rpcUrl}`);
    console.log(`   Max TX Value: 0.01 ETH`);
    console.log(`   Daily Limit: 0.1 ETH\n`);

    // Initialize or load wallet
    console.log('💰 Wallet Setup:');
    try {
        const walletAddress = await onchainAgent.initializeWallet(
            process.env.PRIVATE_KEY // Use your existing PRIVATE_KEY from env
        );
        console.log(`   Address: ${walletAddress}\n`);
    } catch (error) {
        console.error(`   ❌ Wallet setup failed: ${error.message}\n`);
    }

    // Check gas prices
    console.log('⛽ Gas Prices:');
    try {
        const gasPrices = await onchainAgent.getGasPrice();
        console.log(`   Standard: ${gasPrices.gasPrice} gwei`);
        console.log(`   Max Fee: ${gasPrices.maxFeePerGas} gwei`);
        console.log(`   Priority: ${gasPrices.maxPriorityFeePerGas} gwei\n`);
    } catch (error) {
        console.error(`   ❌ Failed to fetch gas prices: ${error.message}\n`);
    }

    // Initialize DeFi strategies
    console.log('📈 DeFi Strategy Engine:');
    const defiStrategies = new DeFiStrategies(onchainAgent, llm);
    defiStrategies.setStrategy('conservative');
    console.log(`   Strategy: ${defiStrategies.currentStrategy}`);
    console.log(`   Risk Level: ${defiStrategies.strategies.conservative.maxRisk}/10`);
    console.log(`   Min APY Target: ${defiStrategies.strategies.conservative.minAPY * 100}%\n`);

    // Analyze opportunities (using cheaper model)
    console.log('🔍 Analyzing DeFi Opportunities:');
    try {
        console.time('Analysis time');
        const opportunity = await defiStrategies.analyzeOpportunities();
        console.timeEnd('Analysis time');
        console.log(`   Strategy: ${opportunity.strategy}`);
        console.log(`   Reasoning: ${opportunity.reasoning.substring(0, 100)}...\n`);
    } catch (error) {
        console.error(`   ❌ Analysis failed: ${error.message}\n`);
    }

    // Test token interaction (if wallet funded)
    if (onchainAgent.wallet) {
        console.log('🪙 Token Capabilities:');

        // Example: Check USDC balance on Base
        const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
        try {
            const balance = await onchainAgent.getTokenBalance(USDC_BASE);
            console.log(`   USDC Balance: ${balance.balance} ${balance.symbol}\n`);
        } catch (error) {
            console.log(`   Note: Token queries require RPC access\n`);
        }
    }

    // Demonstrate safety features
    console.log('🛡️ Safety Features:');
    console.log('   ✅ Transaction validation with LLM');
    console.log('   ✅ Daily spending limits');
    console.log('   ✅ Max transaction size limits');
    console.log('   ✅ Encrypted wallet storage');
    console.log('   ✅ Emergency exit capability\n');

    // Show example transaction flow (not executed)
    console.log('📋 Example Transaction Flow:');
    console.log('   1. Agent identifies opportunity');
    console.log('   2. LLM validates transaction logic');
    console.log('   3. Check against safety limits');
    console.log('   4. Execute if approved');
    console.log('   5. Track in history');
    console.log('   6. Post results to Farcaster\n');

    // Portfolio summary
    console.log('💼 Portfolio Summary:');
    const summary = await defiStrategies.getPortfolioSummary();
    console.log(`   Strategy: ${summary.strategy}`);
    console.log(`   Active Positions: ${summary.positions}`);
    console.log(`   Total Value: $${summary.totalValue.toFixed(2)}`);
    console.log(`   Estimated APY: ${(summary.estimatedAPY * 100).toFixed(2)}%`);
    console.log(`   Risk Level: ${summary.risk}/10`);
    console.log(`   Protocols: ${summary.activeProtocols.join(', ') || 'None'}\n`);

    console.log('✅ On-chain capabilities ready!');
    console.log('\n💡 Next Steps:');
    console.log('   1. Fund the wallet address shown above');
    console.log('   2. Set AGENT_PRIVATE_KEY in .env (optional)');
    console.log('   3. Configure RPC_URL for your network');
    console.log('   4. Enable on-chain features in agent.js');
}

// Run the test
testOnChain().catch(console.error);