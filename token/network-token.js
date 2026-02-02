const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

class NetworkTokenLauncher {
    constructor(config) {
        this.apiKey = config.apiKey;
        this.signerUuid = config.signerUuid;
        this.networkTokenTicker = 'CLANKIT';
        this.networkTokenName = 'Clankit Network Token';
        this.reservePercentage = 50; // Reserve 50% for distribution
    }

    async launchNetworkToken() {
        console.log('🚀 Launching $CLANKIT network token...');

        // Check if already launched
        const existingToken = await this.checkExistingNetworkToken();
        if (existingToken) {
            console.log('⚠️ Network token already exists');
            return existingToken;
        }

        // Check for IPFS pinned image
        let imageUrl = 'https://via.placeholder.com/400x400/1a1a1a/ffffff?text=CLANKIT';
        try {
            const ipfsConfigPath = path.join(process.cwd(), 'data', 'ipfs_config.json');
            const ipfsConfig = JSON.parse(await fs.readFile(ipfsConfigPath, 'utf8'));
            imageUrl = ipfsConfig.ipfsUrl;
            console.log('✅ Using IPFS image:', imageUrl);
        } catch (e) {
            console.log('⚠️ No IPFS image found, using placeholder');
            console.log('   Run: npm run pin-image to add CLANKIT logo to IPFS');
        }

        // Construct the cast text for clanker
        const castText = `@clanker launch $${this.networkTokenTicker}

Name: ${this.networkTokenName}
Ticker: $${this.networkTokenTicker}

The network token for autonomous Farcaster agents.

🤖 Powers the agent economy
💎 50% reserved for agent allocations
🔗 Pairs with individual agent tokens
⚡ Built on https://github.com/mugrebot/farcaster-agent-kit

The rise of the machines starts here.`;

        try {
            // Post cast tagging @clanker
            const response = await axios.post(
                'https://api.neynar.com/v2/farcaster/cast',
                {
                    signer_uuid: this.signerUuid,
                    text: castText,
                    embeds: [{ url: imageUrl }]
                },
                {
                    headers: {
                        'x-api-key': this.apiKey,
                        'Content-Type': 'application/json'
                    }
                }
            );

            const castHash = response.data.cast.hash;
            console.log(`✅ Network token launch requested`);
            console.log(`   Cast: https://warpcast.com/~/conversations/${castHash}`);

            // Save network token data
            const networkTokenData = {
                ticker: this.networkTokenTicker,
                name: this.networkTokenName,
                launchCastHash: castHash,
                launchedAt: new Date().toISOString(),
                imageUrl,
                reservePercentage: this.reservePercentage,
                status: 'pending_clanker_response',
                type: 'network_token'
            };

            await fs.mkdir(path.join(process.cwd(), 'data'), { recursive: true });
            await fs.writeFile(
                path.join(process.cwd(), 'data', 'network_token.json'),
                JSON.stringify(networkTokenData, null, 2)
            );

            // Start monitoring for clanker's response
            this.monitorClankerResponse(castHash);

            return networkTokenData;

        } catch (error) {
            console.error('❌ Failed to launch network token:', error.message);
            throw error;
        }
    }

    async checkExistingNetworkToken() {
        try {
            const data = await fs.readFile(
                path.join(process.cwd(), 'data', 'network_token.json'),
                'utf8'
            );
            return JSON.parse(data);
        } catch (e) {
            return null;
        }
    }

    async monitorClankerResponse(parentHash) {
        console.log('👀 Monitoring for @clanker response on network token...');

        const checkInterval = setInterval(async () => {
            try {
                const response = await axios.get(
                    `https://api.neynar.com/v2/farcaster/cast/conversation?identifier=${parentHash}&type=hash&reply_depth=1`,
                    {
                        headers: { 'x-api-key': this.apiKey }
                    }
                );

                const replies = response.data.conversation?.cast?.direct_replies || [];
                const clankerReply = replies.find(reply =>
                    reply.author.username === 'clanker' ||
                    reply.author.fid === 11517
                );

                if (clankerReply) {
                    console.log('✅ @clanker responded to network token!');

                    // Extract contract address
                    const contractMatch = clankerReply.text.match(/0x[a-fA-F0-9]{40}/);
                    const contractAddress = contractMatch ? contractMatch[0] : null;

                    // Look for clanker.world link
                    const clankerLink = clankerReply.embeds?.find(e =>
                        e.url?.includes('clanker.world')
                    )?.url;

                    // Update network token data
                    const networkTokenData = await this.checkExistingNetworkToken();
                    const updatedData = {
                        ...networkTokenData,
                        contractAddress,
                        clankerLink,
                        clankerReplyHash: clankerReply.hash,
                        status: 'launched'
                    };

                    await fs.writeFile(
                        path.join(process.cwd(), 'data', 'network_token.json'),
                        JSON.stringify(updatedData, null, 2)
                    );

                    console.log(`🎉 Network token $${this.networkTokenTicker} launched!`);
                    console.log(`   Contract: ${contractAddress}`);
                    console.log(`   View: ${clankerLink}`);

                    // Post announcement
                    await this.announceNetworkToken(updatedData);

                    clearInterval(checkInterval);
                }
            } catch (e) {
                console.log('Still waiting for @clanker network token response...');
            }
        }, 30000);

        setTimeout(() => {
            clearInterval(checkInterval);
            console.log('⏰ Stopped monitoring for @clanker network token response');
        }, 600000);
    }

    async announceNetworkToken(tokenData) {
        const announcementText = `🎉 $${this.networkTokenTicker} is live!

The network token for autonomous Farcaster agents.

💎 Contract: ${tokenData.contractAddress}
🔗 Trade: ${tokenData.clankerLink}
🤖 Build agents: https://github.com/mugrebot/farcaster-agent-kit

Individual agent tokens will pair with $${this.networkTokenTicker}.

The agent economy begins.`;

        try {
            await axios.post(
                'https://api.neynar.com/v2/farcaster/cast',
                {
                    signer_uuid: this.signerUuid,
                    text: announcementText
                },
                {
                    headers: {
                        'x-api-key': this.apiKey,
                        'Content-Type': 'application/json'
                    }
                }
            );

            console.log('📢 Network token announcement posted');
        } catch (error) {
            console.error('Failed to post announcement:', error.message);
        }
    }

    async getNetworkTokenData() {
        return await this.checkExistingNetworkToken();
    }
}

module.exports = NetworkTokenLauncher;