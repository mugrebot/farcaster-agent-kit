/**
 * Shared constants — single source of truth for all API routes
 */

const CLANKNET_ADDRESS = '0x623693BefAECf61484e344fa272e9A8B82d9BB07';
const USDC_ADDRESS = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const REGISTRY_ADDRESS = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';
const PAYMENT_RECIPIENT = process.env.PAYMENT_RECIPIENT || '0xB84649C1e32ED82CC380cE72DF6DF540b303839F';

const CHAIN_ID = '8453';
const BASE_RPC_URL = 'https://mainnet.base.org';

const ALLOWED_ORIGINS = [
    'https://clanknet.ai',
    'https://www.clanknet.ai',
    'http://localhost:3000',
    'http://localhost:3002'
];

// Token amounts (wei)
const USDC_COST = '100000'; // 0.1 USDC (6 decimals)
const CLANKNET_REWARD = '50000000000000000000000'; // 50000 CLANKNET (18 decimals)

// Skills pricing (wei)
const SKILL_PRICES = {
    'market-analysis':    { price: '500000000000000000000',  formatted: '500 CLANKNET' },
    'token-research':     { price: '1000000000000000000000', formatted: '1000 CLANKNET' },
    'content-generation': { price: '250000000000000000000',  formatted: '250 CLANKNET' },
    'scam-check':         { price: '100000000000000000000',  formatted: '100 CLANKNET' },
    'portfolio-check':    { price: '500000000000000000000',  formatted: '500 CLANKNET' }
};

// Registration challenges
const REGISTRATION_CHALLENGES = {
    'v4-pool-address': {
        question: 'What is the Uniswap V4 pool address for CLANKNET/WETH?',
        answer: '0x4cb72df111fad6f48cd981d40ec7c76f6800624c1202252b2ece17044852afaf',
        hint: 'Check the V4 documentation for the pool ID'
    },
    'universal-router': {
        question: 'What is the V4 Universal Router address on Base?',
        answer: '0x66a9893cc07d91d95644aedd05d03f95e1dba8af',
        hint: 'The Universal Router handles V4 swaps'
    },
    'clanknet-symbol': {
        question: 'What is the CLANKNET token symbol?',
        answer: 'CLANKNET',
        hint: 'The token symbol is used in all trading pairs'
    },
    'payment-amount': {
        question: 'How much USDC (in wei) is required for 50000 CLANKNET tokens?',
        answer: '100000',
        hint: '0.1 USDC has 6 decimals'
    },
    'registry-name': {
        question: 'What is the name of the ERC-8004 registry contract?',
        answer: 'ERC8004AgentRegistry',
        hint: 'Check the registry contract name on Etherscan'
    },
    'clanknet-decimals': {
        question: 'How many decimals does CLANKNET token have?',
        answer: '18',
        hint: 'Standard ERC-20 decimals'
    },
    'base-chain-id': {
        question: 'What is the chain ID for Base?',
        answer: '8453',
        hint: 'Base mainnet chain identifier'
    },
    'usdc-address': {
        question: 'What is the USDC contract address on Base?',
        answer: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
        hint: 'Native USDC on Base'
    }
};

// ABIs
const USDC_ABI = [
    'function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s) external',
    'function balanceOf(address account) view returns (uint256)'
];

const CLANKNET_ABI = [
    'function transfer(address to, uint256 amount) returns (bool)',
    'function balanceOf(address account) view returns (uint256)',
    'function decimals() view returns (uint8)',
    'function transferFrom(address from, address to, uint256 amount) returns (bool)',
    'function allowance(address owner, address spender) view returns (uint256)'
];

module.exports = {
    CLANKNET_ADDRESS,
    USDC_ADDRESS,
    REGISTRY_ADDRESS,
    PAYMENT_RECIPIENT,
    CHAIN_ID,
    BASE_RPC_URL,
    ALLOWED_ORIGINS,
    USDC_COST,
    CLANKNET_REWARD,
    SKILL_PRICES,
    REGISTRATION_CHALLENGES,
    USDC_ABI,
    CLANKNET_ABI
};
