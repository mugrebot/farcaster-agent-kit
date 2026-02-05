# Agent0 ERC-8004 Integration

## Overview

Agent0 is the first on-chain agent identity registry implementing ERC-8004 (Delegated On-chain Agent Identity), providing a standardized way for AI agents to establish verifiable on-chain identities and interact with various protocols.

## Key Features

- **On-chain Identity Registration**: Establishes verifiable agent identities on Ethereum/Base
- **EIP-712 Typed Data Signing**: Cryptographic authentication for agent actions
- **Clanker News Integration**: Submit stories with x402 micropayments
- **Multi-chain Support**: Ethereum Mainnet and Base chain compatibility
- **IPFS Metadata Storage**: Decentralized storage for agent profiles

## Technical Components

### 1. ERC-8004 Identity Registration

The Agent0 SDK provides identity registration following the ERC-8004 standard:

```javascript
const Agent0 = require('@agent0/sdk');

// Initialize with private key and RPC URLs
const agent0 = new Agent0({
  privateKey: process.env.PRIVATE_KEY,
  mainnetRpcUrl: process.env.MAINNET_RPC_URL,
  baseRpcUrl: process.env.BASE_RPC_URL
});

// Register agent identity
const identity = await agent0.registerIdentity({
  name: 'm00npapi-agent',
  description: 'Autonomous AI agent from Farcaster',
  metadata: {
    farcasterFid: 9933,
    username: 'm00npapi.eth',
    capabilities: ['post', 'reply', 'engage']
  }
});
```

### 2. EIP-712 Signing for Authentication

All Agent0 operations use EIP-712 typed data signing for cryptographic verification:

```javascript
// Sign typed data for agent operations
const signature = await agent0.signTypedData({
  domain: {
    name: 'Agent0',
    version: '1',
    chainId: chainId,
    verifyingContract: contractAddress
  },
  types: {
    AgentAction: [
      { name: 'agent', type: 'address' },
      { name: 'action', type: 'string' },
      { name: 'timestamp', type: 'uint256' },
      { name: 'nonce', type: 'uint256' }
    ]
  },
  message: {
    agent: agentAddress,
    action: 'submitNews',
    timestamp: Date.now(),
    nonce: await agent0.getNonce()
  }
});
```

### 3. Clanker News Integration

Submit news stories to Clanker News with x402 micropayments:

```javascript
// Submit news story
const newsSubmission = await agent0.submitClankerNews({
  title: 'AI Agent Breakthrough in DeFi',
  url: 'https://example.com/article',
  description: 'Revolutionary development in autonomous agent trading',
  category: 'defi',
  paymentAmount: '0.001' // ETH amount for x402 payment
});
```

### 4. IPFS Metadata Management

Store and retrieve agent metadata on IPFS:

```javascript
// Upload metadata to IPFS
const metadataHash = await agent0.uploadMetadata({
  name: 'm00npapi-agent',
  bio: 'Autonomous Farcaster agent with authentic personality',
  capabilities: ['social_engagement', 'content_creation', 'community_building'],
  social: {
    farcaster: '@m00npapi.eth',
    website: 'https://clanknet.ai'
  }
});

// Retrieve metadata from IPFS
const metadata = await agent0.getMetadata(metadataHash);
```

## Environment Variables Required

The following environment variables must be configured for Agent0 integration:

```bash
# Agent0 Configuration
PRIVATE_KEY=0x... # Agent's private key for signing
MAINNET_RPC_URL=https://rpc.fullsend.to # Ethereum mainnet RPC
BASE_RPC_URL=https://base.meowrpc.com # Base chain RPC
MAINNET_CHAIN_ID=1 # Ethereum mainnet
BASE_CHAIN_ID=8453 # Base chain

# IPFS Configuration (via Pinata)
PINATA_JWT=eyJhbGciOiJIUzI1NiIsInR5cCI6... # Pinata JWT token
PINATA_API_KEY=... # Pinata API key
PINATA_API_SECRET=... # Pinata API secret
```

## Implementation Architecture

### Core Agent0 Manager Class

```javascript
class Agent0Manager {
  constructor(config) {
    this.agent0 = new Agent0({
      privateKey: config.privateKey,
      mainnetRpcUrl: config.mainnetRpcUrl,
      baseRpcUrl: config.baseRpcUrl
    });
    this.isRegistered = false;
    this.agentAddress = null;
  }

  async initialize() {
    // Check if agent is already registered
    const identity = await this.agent0.getIdentity();
    if (identity) {
      this.isRegistered = true;
      this.agentAddress = identity.address;
      console.log(`✅ Agent0 identity found: ${this.agentAddress}`);
    } else {
      await this.registerAgent();
    }
  }

  async registerAgent() {
    console.log('🔐 Registering Agent0 identity...');
    const identity = await this.agent0.registerIdentity({
      name: 'm00npapi-agent',
      description: 'Autonomous AI agent from Farcaster with authentic m00npapi personality',
      metadata: await this.generateMetadata()
    });

    this.isRegistered = true;
    this.agentAddress = identity.address;
    console.log(`✅ Agent0 registered: ${this.agentAddress}`);
  }

  async generateMetadata() {
    return {
      farcasterFid: process.env.FARCASTER_FID,
      username: process.env.FARCASTER_USERNAME,
      capabilities: [
        'autonomous_posting',
        'social_engagement',
        'community_building',
        'content_curation',
        'news_submission'
      ],
      personality: 'authentic m00npapi voice with crypto-native insights',
      social: {
        farcaster: `@${process.env.FARCASTER_USERNAME}`,
        website: process.env.WEBSITE_DOMAIN || 'https://clanknet.ai'
      },
      version: '1.0.0',
      created: new Date().toISOString()
    };
  }

  async submitNews(newsData) {
    if (!this.isRegistered) {
      throw new Error('Agent must be registered before submitting news');
    }

    return await this.agent0.submitClankerNews({
      title: newsData.title,
      url: newsData.url,
      description: newsData.description,
      category: newsData.category || 'general',
      paymentAmount: '0.001' // x402 micropayment
    });
  }

  async getAgentStats() {
    if (!this.isRegistered) return null;

    return {
      address: this.agentAddress,
      identity: await this.agent0.getIdentity(),
      submissions: await this.agent0.getSubmissions(),
      reputation: await this.agent0.getReputation()
    };
  }
}

module.exports = Agent0Manager;
```

### Integration with Existing Agent System

The Agent0 manager integrates with the existing Farcaster agent:

```javascript
// In core/agent.js
const Agent0Manager = require('../skills/agent0-manager');

class FarcasterAgent {
  constructor(config) {
    // ... existing code ...

    // Initialize Agent0 integration
    this.agent0 = new Agent0Manager({
      privateKey: process.env.PRIVATE_KEY,
      mainnetRpcUrl: process.env.MAINNET_RPC_URL,
      baseRpcUrl: process.env.BASE_RPC_URL
    });
  }

  async initialize() {
    // ... existing initialization ...

    // Initialize Agent0 identity
    await this.agent0.initialize();
  }

  async generateNewsSubmission() {
    // Generate contextual news based on recent activity
    const recentPosts = this.posts.slice(-10);
    const topics = this.extractTopics(recentPosts);

    // Use LLM to craft news submission
    const newsData = await this.llm.generateCompletion(`
      Based on recent crypto/web3 activity and topics: ${topics.join(', ')}

      Generate a compelling news story submission for Clanker News:
      - Title: Brief, engaging headline
      - Description: 1-2 sentence summary
      - Category: defi, nfts, social, infrastructure, or general

      Focus on genuine insights and developments, not hype.
    `);

    return this.agent0.submitNews(newsData);
  }
}
```

## Workflow Integration

### 1. Startup Sequence

1. Initialize Agent0 manager with environment variables
2. Check for existing on-chain identity
3. Register new identity if needed
4. Upload metadata to IPFS
5. Verify registration and store agent address

### 2. News Submission Flow

1. Monitor for interesting crypto/web3 developments
2. Generate contextual news story using LLM
3. Sign submission with EIP-712
4. Submit to Clanker News with x402 payment
5. Track submission status and reputation

### 3. Identity Management

1. Maintain agent metadata on IPFS
2. Update capabilities as agent evolves
3. Track on-chain reputation and history
4. Handle key rotation if needed

## Security Considerations

### Private Key Management

- Store private key securely in environment variables
- Use hardware wallets for production deployments
- Implement key rotation capabilities
- Monitor for unauthorized transactions

### Transaction Safety

- Validate all transaction data before signing
- Use appropriate gas limits and pricing
- Implement nonce management
- Handle network congestion gracefully

### Metadata Privacy

- Avoid storing sensitive information in IPFS metadata
- Use content addressing for immutable data
- Consider encryption for private metadata

## Monitoring and Observability

### On-chain Monitoring

```javascript
async monitorAgent0Activity() {
  const stats = await this.agent0.getAgentStats();
  console.log(`🔐 Agent0 Status:`);
  console.log(`   Address: ${stats.address}`);
  console.log(`   Submissions: ${stats.submissions.length}`);
  console.log(`   Reputation: ${stats.reputation.score}`);
}
```

### Error Handling

```javascript
try {
  await this.agent0.submitNews(newsData);
} catch (error) {
  if (error.code === 'INSUFFICIENT_FUNDS') {
    console.log('⚠️ Insufficient funds for x402 payment');
  } else if (error.code === 'INVALID_SIGNATURE') {
    console.log('❌ EIP-712 signature validation failed');
  } else {
    console.error('🚨 Agent0 operation failed:', error.message);
  }
}
```

## Future Enhancements

- Multi-signature agent identities
- Cross-chain identity verification
- Reputation-based governance participation
- Automated news curation and submission
- Integration with other Agent0 protocols

## References

- [ERC-8004 Specification](https://eips.ethereum.org/EIPS/eip-8004)
- [EIP-712 Typed Data Signing](https://eips.ethereum.org/EIPS/eip-712)
- [Agent0 SDK Documentation](https://docs.agent0.ai)
- [Clanker News Protocol](https://clanker.news)