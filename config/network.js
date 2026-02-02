/**
 * Network configuration for CLANKNET integration
 */

const NETWORK_CONFIG = {
    // CLANKNET network token (deployed by m00npapi)
    networkToken: {
        ticker: 'CLANKNET',
        name: 'Clanknet Network Token',
        // Contract address will be set after deployment
        contractAddress: null, // To be updated after $CLANKNET launch
        deployer: '0x...', // m00npapi's address (to be set)
    },

    // Reward configuration for all agent tokens
    rewards: {
        // 5% of agent token rewards go to CLANKNET deployer
        networkFee: {
            percentage: 5, // 5%
            recipient: null, // Same as networkToken.deployer (set dynamically)
            description: 'Network fee for CLANKNET ecosystem'
        }
    },

    // Supported chains for agent tokens
    chains: {
        base: {
            chainId: 8453,
            name: 'Base',
            rpcUrl: 'https://mainnet.base.org',
            explorer: 'https://basescan.org'
        }
    },

    // Agent registry configuration
    registry: {
        githubRepo: 'mugrebot/farcaster-agent-kit',
        registryFile: 'REGISTRY.md',
        requiredApprovals: 1
    }
};

// Get network token info
function getNetworkToken() {
    return NETWORK_CONFIG.networkToken;
}

// Get reward configuration for agent tokens
function getRewardConfig() {
    return NETWORK_CONFIG.rewards;
}

// Check if agent should include network fee
function shouldIncludeNetworkFee() {
    // Only include if CLANKNET has been deployed
    return NETWORK_CONFIG.networkToken.contractAddress !== null;
}

// Get network fee recipient (CLANKNET deployer)
function getNetworkFeeRecipient() {
    return NETWORK_CONFIG.networkToken.deployer;
}

module.exports = {
    NETWORK_CONFIG,
    getNetworkToken,
    getRewardConfig,
    shouldIncludeNetworkFee,
    getNetworkFeeRecipient
};