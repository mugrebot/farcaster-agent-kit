/**
 * Network configuration for CLANKNET integration
 */

const NETWORK_CONFIG = {
    // CLANKNET network token (deployed by m00npapi)
    networkToken: {
        ticker: 'CLANKNET',
        name: 'Clanknet Network Token',
        contractAddress: '0x623693BefAECf61484e344fa272e9A8B82d9BB07',
        buyUrl: 'https://matcha.xyz/tokens/base/0x623693befaecf61484e344fa272e9a8b82d9bb07',
        deployer: '0x37cdca95ed93f6f8fe14c1ac80ca4c7f9b4b5bc9', // m00npapi's address
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