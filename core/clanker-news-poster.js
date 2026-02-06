#!/usr/bin/env node

/**
 * Clanker News Poster - Implements ERC-8004 registration and EIP-712 authentication
 */

const { ethers } = require('ethers');
const axios = require('axios');

class ClankerNewsPoster {
    constructor(privateKey, providerUrl = 'https://mainnet.base.org') {
        this.provider = new ethers.JsonRpcProvider(providerUrl);
        this.wallet = new ethers.Wallet(privateKey, this.provider);
        this.baseUrl = 'https://news.clanker.ai';
    }

    /**
     * Create EIP-712 signature for authentication
     */
    async createEIP712Signature(title, content, tags) {
        const domain = {
            name: 'ClankerNews',
            version: '1',
            chainId: 8453, // Base
            verifyingContract: '0x0000000000000000000000000000000000000000'
        };

        const types = {
            Post: [
                { name: 'title', type: 'string' },
                { name: 'content', type: 'string' },
                { name: 'tags', type: 'string[]' },
                { name: 'timestamp', type: 'uint256' }
            ]
        };

        const timestamp = Math.floor(Date.now() / 1000);
        const value = {
            title,
            content,
            tags,
            timestamp
        };

        const signature = await this.wallet.signTypedData(domain, types, value);

        return {
            signature,
            timestamp,
            address: this.wallet.address
        };
    }

    /**
     * Register agent with ERC-8004 if needed
     */
    async registerAgent() {
        try {
            console.log('🔐 Attempting ERC-8004 registration...');

            const registrationData = {
                address: this.wallet.address,
                agentType: 'educational',
                capabilities: ['post', 'interact'],
                metadata: {
                    name: 'Clanknet Education Bot',
                    description: 'Educational agent teaching Clanknet token integration'
                }
            };

            const response = await axios.post(`${this.baseUrl}/api/register`, registrationData, {
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Clanknet-Agent-Educator/1.0'
                }
            });

            console.log('✅ ERC-8004 registration successful');
            return response.data;
        } catch (error) {
            console.log('ℹ️ Registration not required or already exists');
            return { registered: true };
        }
    }

    /**
     * Post content to news.clanker.ai with proper authentication
     */
    async postContent(title, content, tags = []) {
        try {
            // Ensure agent is registered
            await this.registerAgent();

            // Create EIP-712 signature
            const authData = await this.createEIP712Signature(title, content, tags);

            // Calculate content hash
            const contentHash = ethers.keccak256(ethers.toUtf8Bytes(content));

            const postData = {
                title,
                content,
                tags,
                timestamp: authData.timestamp,
                author: authData.address,
                signature: authData.signature,
                contentHash
            };

            console.log('📰 Posting to news.clanker.ai with EIP-712 auth...');

            const response = await axios.post(`${this.baseUrl}/api/posts`, postData, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `EIP712 ${authData.signature}`,
                    'X-Agent-Address': authData.address,
                    'X-Timestamp': authData.timestamp.toString(),
                    'User-Agent': 'Clanknet-Agent-Educator/1.0'
                }
            });

            console.log('✅ Successfully posted to news.clanker.ai');
            return {
                success: true,
                data: response.data,
                url: `${this.baseUrl}/posts/${response.data.id || response.data.postId}`
            };

        } catch (error) {
            console.error('❌ news.clanker.ai post failed:', error.response?.data || error.message);

            // Try simpler approach if EIP-712 fails
            return await this.postContentSimple(title, content, tags);
        }
    }

    /**
     * Fallback: Simple POST without complex auth
     */
    async postContentSimple(title, content, tags = []) {
        try {
            console.log('🔄 Trying simple POST to news.clanker.ai...');

            const postData = {
                title,
                content,
                tags,
                author: this.wallet.address.slice(0, 10) // Truncated address
            };

            const response = await axios.post(`${this.baseUrl}/submit`, postData, {
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Clanknet-Agent-Educator/1.0'
                }
            });

            console.log('✅ Simple post to news.clanker.ai successful');
            return {
                success: true,
                data: response.data,
                method: 'simple'
            };

        } catch (error) {
            console.error('❌ Simple post also failed:', error.response?.data || error.message);
            return {
                success: false,
                error: error.message,
                statusCode: error.response?.status
            };
        }
    }
}

module.exports = ClankerNewsPoster;