const axios = require('axios');

/**
 * CLANKNET Gatekeeper - Manages token-gated interactions
 * Users must hold CLANKNET tokens to interact with agents
 */
class ClanknetGatekeeper {
    constructor(config = {}) {
        this.neynarApiKey = config.neynarApiKey || process.env.NEYNAR_API_KEY;
        this.clanknetAddress = '0x623693BefAECf61484e344fa272e9A8B82d9BB07';
        this.replyPrice = config.replyPrice || 5_000_000; // 5 million CLANKNET required for replies
        this.network = 'base'; // CLANKNET is on Base

        if (!this.neynarApiKey) {
            throw new Error('NEYNAR_API_KEY is required for CLANKNET gatekeeper');
        }
    }

    /**
     * Check if user has enough CLANKNET tokens to interact
     */
    async checkClanknetBalance(fid) {
        try {
            const response = await axios.get('https://api.neynar.com/v2/farcaster/user/balance', {
                params: {
                    fid: fid,
                    networks: this.network
                },
                headers: {
                    'x-api-key': this.neynarApiKey,
                    'Content-Type': 'application/json'
                }
            });

            const userBalance = response.data.user_balance;

            // Find CLANKNET token balance
            let clanknetBalance = 0;

            for (const addressBalance of userBalance.address_balances) {
                for (const tokenBalance of addressBalance.token_balances) {
                    // Check if this is the CLANKNET token
                    if (tokenBalance.token.address &&
                        tokenBalance.token.address.toLowerCase() === this.clanknetAddress.toLowerCase()) {
                        clanknetBalance = parseFloat(tokenBalance.balance.in_token);
                        break;
                    }
                }
            }

            return {
                balance: clanknetBalance,
                hasAccess: clanknetBalance >= this.replyPrice,
                requiredAmount: this.replyPrice,
                user: userBalance.user
            };

        } catch (error) {
            console.error('❌ Error checking CLANKNET balance:', error.message);
            return {
                balance: 0,
                hasAccess: false,
                requiredAmount: this.replyPrice,
                error: error.message
            };
        }
    }

    /**
     * Check if user can interact with agent (reply, mention, etc)
     */
    async canUserInteract(fid) {
        const balanceCheck = await this.checkClanknetBalance(fid);

        console.log(`🔍 CLANKNET Balance Check for FID ${fid}:`);
        console.log(`   Balance: ${balanceCheck.balance.toLocaleString()} CLANKNET`);
        console.log(`   Required: ${balanceCheck.requiredAmount.toLocaleString()} CLANKNET`);
        console.log(`   Access: ${balanceCheck.hasAccess ? '✅' : '❌'}`);

        return balanceCheck;
    }

    /**
     * Generate rejection message for users without enough CLANKNET
     */
    generateRejectionMessage(balance, username) {
        const needed = this.replyPrice - balance;
        return `Hey @${username}! You need ${needed.toLocaleString()} more $CLANKNET tokens to interact with agents. 💰 Buy at: https://matcha.xyz/tokens/base/0x623693befaecf61484e344fa272e9a8b82d9bb07`;
    }

    /**
     * Generate access granted message
     */
    generateAccessMessage(balance, username) {
        return `Welcome @${username}! You have ${balance.toLocaleString()} $CLANKNET. Let's chat! 🤖`;
    }

    /**
     * Process interaction and determine response
     */
    async processInteraction(fid, username, originalMessage) {
        const access = await this.canUserInteract(fid);

        if (access.hasAccess) {
            return {
                allowed: true,
                message: this.generateAccessMessage(access.balance, username),
                balance: access.balance
            };
        } else {
            return {
                allowed: false,
                message: this.generateRejectionMessage(access.balance, username),
                balance: access.balance,
                needed: this.replyPrice - access.balance
            };
        }
    }

    /**
     * Get current CLANKNET price and requirements
     */
    getRequirements() {
        return {
            tokenAddress: this.clanknetAddress,
            network: this.network,
            replyPrice: this.replyPrice,
            buyUrl: 'https://matcha.xyz/tokens/base/0x623693befaecf61484e344fa272e9a8b82d9bb07'
        };
    }
}

module.exports = ClanknetGatekeeper;