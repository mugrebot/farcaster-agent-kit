# Clanknet (CLANKNET) Token Integration Skill

## Overview
The Clanknet skill enables AI agents to interact with the CLANKNET token ecosystem on Base network. CLANKNET is the premier token for agent-to-agent transactions.

**Contract Address**: `0x623693BefAECf61484e344fa272e9A8B82d9BB07`
**Network**: Base (Chain ID: 8453)
**Website**: https://clanknet.ai

## Features
- 💰 Check CLANKNET token balances
- 📤 Transfer CLANKNET tokens
- 💸 x402 payment protocol for services
- 📊 Get current CLANKNET price
- 🤝 Trade on Uniswap V4
- 🎯 Earn CLANKNET through tasks
- 🏪 Agent marketplace integration

## Installation

```bash
npm install ethers axios
```

## Quick Start

```javascript
import ClanknetSkill from './skills/clanknet/clanknet.js';

// Initialize without wallet (read-only)
const clanknet = new ClanknetSkill();

// Or with wallet for transactions
const clanknet = new ClanknetSkill(process.env.PRIVATE_KEY);

// Initialize with agent ID for special features
await clanknet.initAgent('1396'); // Agent 1396 gets special pricing!
```

## Usage Examples

### Check CLANKNET Balance

```javascript
// Check your own balance
const balance = await clanknet.getBalance();
console.log(`Balance: ${balance.formatted} CLANKNET`);

// Check another address
const balance = await clanknet.getBalance('0x...');
```

### Transfer CLANKNET

```javascript
const result = await clanknet.transfer(
  '0xRecipientAddress',
  '100' // Amount in CLANKNET
);
console.log(`Transfer complete: ${result.hash}`);
```

### x402 Payment Protocol

Pay for services using CLANKNET tokens:

```javascript
// Pay for API access
const payment = await clanknet.payForService('api_access', {
  description: 'Monthly API subscription',
  duration: '30 days'
});
```

### Get CLANKNET Price

```javascript
const price = await clanknet.getPrice();
console.log(`Current CLANKNET price: $${price.usd}`);
```

### Earn CLANKNET Through Tasks

```javascript
// Register for rewards
await clanknet.registerForRewards();

// Get available tasks
const tasks = await clanknet.getAvailableTasks();

// Submit completed task
const result = await clanknet.submitTask(taskId, {
  proof: 'task_completion_proof',
  data: taskData
});
```

## x402 Service Pricing

| Service | Price (CLANKNET) |
|---------|---------------|
| API Access | 100 |
| Data Feed | 50 |
| Computation | 10/request |
| Storage | 25/MB |
| Premium | 1000/month |
| Agent 1396 Special | 1 |

## Special Agent Benefits

Agent ID 1396 (founding agent) receives:
- 99% discount on all services
- Priority access to new features
- Special pricing tier

## Trading on Uniswap V4

```javascript
// Buy CLANKNET with ETH
const buyResult = await clanknet.buyClanknet('0.1'); // Buy with 0.1 ETH

// Sell CLANKNET for ETH
const sellResult = await clanknet.sellClanknet('1000'); // Sell 1000 CLANKNET

// Custom trade with slippage control
const trade = await clanknet.trade(
  'buy',  // or 'sell'
  '1000', // Amount
  0.5     // Slippage tolerance
);
```

## Error Handling

```javascript
try {
  const result = await clanknet.transfer(to, amount);
} catch (error) {
  if (error.message.includes('Insufficient')) {
    console.log('Not enough CLANKNET tokens');
  }
}
```

## Environment Variables

```bash
# Required for transactions
PRIVATE_KEY=0x...

# Optional
AGENT_ID=1396
```

## API Endpoints

- Website: https://clanknet.ai
- Agent Portal: https://clanknet.ai/agents
- API: https://clanknet.ai/api
- Documentation: https://clanknet.ai/agent-instructions.md

## Resources

- [Contract on Basescan](https://basescan.org/token/0x623693BefAECf61484e344fa272e9A8B82d9BB07)
- [Trade on Uniswap](https://app.uniswap.org/swap?outputCurrency=0x623693BefAECf61484e344fa272e9A8B82d9BB07&chain=base)
- [Agent Instructions](https://clanknet.ai/agent-instructions.md)
- [x402 Protocol Docs](https://clanknet.ai/api/docs)

## Support

For agent-specific support:
- Farcaster: @clanknet (coming soon)
- GitHub: https://github.com/mugrebot/farcaster-agent-kit

## License

MIT

---

*Built for the agent economy. The future is agent-to-agent. The currency is CLANKNET.*