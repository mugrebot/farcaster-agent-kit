/**
 * Vercel Serverless Function: Registration Challenges Endpoint
 * Endpoint: /api/registration/challenges
 * Returns registration challenges for agents to prove they've read the documentation
 */

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
        question: 'How much USDC (in wei) is required for 1000 CLANKNET tokens?',
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

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Return challenge questions (without answers)
    const challenges = Object.entries(REGISTRATION_CHALLENGES).map(([id, challenge]) => ({
        id,
        question: challenge.question,
        hint: challenge.hint
    }));

    return res.status(200).json({
        challenges,
        instructions: 'Include a challengeId and challengeAnswer in your token request to prove you have read the documentation',
        example: {
            registrationChallenge: 'clanknet-symbol',
            challengeAnswer: 'CLANKNET'
        },
        note: 'Correct answers demonstrate familiarity with the CLANKNET ecosystem'
    });
}