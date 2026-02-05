#!/usr/bin/env node

/**
 * Register Agent on ERC-8004 Registry
 * This script registers your agent on the official ERC-8004 registry
 */

const { ethers } = require('ethers');
const axios = require('axios');
require('dotenv').config();

// ERC-8004 Registry Configuration
const REGISTRY_ADDRESS = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';
const REGISTRY_ABI = [
    {
        "inputs": [{"name": "agentURI", "type": "string"}],
        "name": "register",
        "outputs": [{"name": "agentId", "type": "uint256"}],
        "type": "function"
    },
    {
        "inputs": [{"name": "tokenId", "type": "uint256"}],
        "name": "ownerOf",
        "outputs": [{"name": "", "type": "address"}],
        "type": "function"
    },
    {
        "inputs": [],
        "name": "totalSupply",
        "outputs": [{"name": "", "type": "uint256"}],
        "type": "function"
    }
];

async function registerAgent() {
    try {
        console.log('🔐 Starting ERC-8004 Agent Registration...\n');

        // Check environment variables
        if (!process.env.PRIVATE_KEY) {
            console.error('❌ Missing PRIVATE_KEY in .env file');
            process.exit(1);
        }

        if (!process.env.BASE_RPC_URL) {
            console.error('❌ Missing BASE_RPC_URL in .env file');
            process.exit(1);
        }

        // Connect to Base network
        console.log('🌐 Connecting to Base network...');
        const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);
        const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

        console.log(`   Wallet address: ${wallet.address}`);

        // Check wallet balance
        const balance = await provider.getBalance(wallet.address);
        const balanceInEth = ethers.formatEther(balance);
        console.log(`   Balance: ${balanceInEth} ETH`);

        if (parseFloat(balanceInEth) < 0.001) {
            console.error('❌ Insufficient ETH balance for gas. Need at least 0.001 ETH on Base.');
            process.exit(1);
        }

        // Connect to registry contract
        const registry = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, wallet);

        // Check current total supply to estimate agent ID
        const totalSupply = await registry.totalSupply();
        console.log(`\n📊 Current total agents registered: ${totalSupply}`);
        console.log(`   Your agent will likely be ID: ${Number(totalSupply) + 1}\n`);

        // Create agent metadata
        const metadata = {
            name: process.env.FARCASTER_USERNAME ? `${process.env.FARCASTER_USERNAME}-agent` : 'm00npapi-agent',
            description: 'Autonomous AI agent from Farcaster with authentic personality, powered by Agent0 and Clanker News integration',
            image: '', // Can add an image URL if desired
            properties: {
                farcasterFid: process.env.FARCASTER_FID || '9933',
                username: process.env.FARCASTER_USERNAME || 'm00npapi.eth',
                website: process.env.WEBSITE_DOMAIN || 'https://clanknet.ai',
                capabilities: [
                    'autonomous_posting',
                    'social_engagement',
                    'content_curation',
                    'news_submission',
                    'community_building'
                ],
                platforms: ['Farcaster', 'Moltbook', 'Clanker News'],
                version: '1.0.0'
            },
            external_url: process.env.WEBSITE_DOMAIN || 'https://clanknet.ai'
        };

        // Convert metadata to data URI
        const metadataJSON = JSON.stringify(metadata);
        const agentURI = `data:application/json;base64,${Buffer.from(metadataJSON).toString('base64')}`;

        console.log('📝 Agent Metadata:');
        console.log(`   Name: ${metadata.name}`);
        console.log(`   Description: ${metadata.description.substring(0, 60)}...`);
        console.log(`   Farcaster: @${metadata.properties.username}`);
        console.log(`   Website: ${metadata.external_url}`);

        // Estimate gas
        console.log('\n⛽ Estimating gas...');
        const estimatedGas = await registry.register.estimateGas(agentURI);
        const gasPrice = await provider.getFeeData();
        const estimatedCost = estimatedGas * gasPrice.gasPrice;

        console.log(`   Estimated gas: ${estimatedGas.toString()}`);
        console.log(`   Gas price: ${ethers.formatUnits(gasPrice.gasPrice, 'gwei')} gwei`);
        console.log(`   Estimated cost: ${ethers.formatEther(estimatedCost)} ETH`);

        // Confirm registration
        console.log('\n⚠️  Ready to register agent on Base network');
        console.log('   This will cost approximately', ethers.formatEther(estimatedCost), 'ETH');
        console.log('\n   Press Ctrl+C to cancel, or wait 5 seconds to continue...');

        await new Promise(resolve => setTimeout(resolve, 5000));

        // Register the agent
        console.log('\n🚀 Registering agent on-chain...');
        const tx = await registry.register(agentURI, {
            gasLimit: estimatedGas * 110n / 100n // Add 10% buffer
        });

        console.log(`   Transaction hash: ${tx.hash}`);
        console.log('   Waiting for confirmation...');

        // Wait for transaction confirmation
        const receipt = await tx.wait();

        if (receipt.status === 1) {
            console.log('\n✅ Agent successfully registered!');

            // Try to get the agent ID from events
            const registrationEvent = receipt.logs.find(log => {
                try {
                    const parsed = registry.interface.parseLog(log);
                    return parsed?.name === 'Transfer';
                } catch {
                    return false;
                }
            });

            let agentId = null;
            if (registrationEvent) {
                const parsed = registry.interface.parseLog(registrationEvent);
                agentId = parsed.args[2]; // tokenId is the third argument in Transfer event
            } else {
                // Fallback: get the new total supply
                const newTotalSupply = await registry.totalSupply();
                agentId = newTotalSupply; // The last minted token
            }

            console.log('\n🎉 REGISTRATION COMPLETE!');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log(`   Agent ID: ${agentId}`);
            console.log(`   Owner: ${wallet.address}`);
            console.log(`   Registry: ${REGISTRY_ADDRESS}`);
            console.log(`   Chain: Base (8453)`);
            console.log(`   Transaction: https://basescan.org/tx/${tx.hash}`);
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

            // Save agent ID to file
            const fs = require('fs').promises;
            const agentInfo = {
                agentId: agentId.toString(),
                owner: wallet.address,
                registry: REGISTRY_ADDRESS,
                chainId: 8453,
                transactionHash: tx.hash,
                metadata: metadata,
                registeredAt: new Date().toISOString()
            };

            await fs.writeFile(
                'data/agent-8004.json',
                JSON.stringify(agentInfo, null, 2)
            );

            console.log('📄 Agent information saved to: data/agent-8004.json');
            console.log('\n🔧 NEXT STEPS:');
            console.log('1. Update your agent0-manager.js with:');
            console.log(`   this.agentId = ${agentId}; // Your registered agent ID`);
            console.log('\n2. Your agent can now:');
            console.log('   - Submit news to Clanker News');
            console.log('   - Authenticate with ERC-8004 services');
            console.log('   - Build on-chain reputation');
            console.log('\n3. View your agent:');
            console.log('   - https://8004scan.io/agent/' + agentId);
            console.log('   - https://basescan.org/token/' + REGISTRY_ADDRESS + '?a=' + agentId);

        } else {
            console.error('❌ Transaction failed!');
            console.log('   Check transaction:', `https://basescan.org/tx/${tx.hash}`);
        }

    } catch (error) {
        console.error('\n❌ Registration failed:', error.message);

        if (error.code === 'INSUFFICIENT_FUNDS') {
            console.log('\n💡 You need more ETH on Base for gas fees.');
            console.log('   Bridge ETH to Base at: https://bridge.base.org');
        } else if (error.code === 'NETWORK_ERROR') {
            console.log('\n💡 Network connection issue. Check your BASE_RPC_URL.');
        } else {
            console.log('\n💡 Debug info:', error);
        }

        process.exit(1);
    }
}

// Run the registration
registerAgent().catch(console.error);