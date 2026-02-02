const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');

class ClankerLauncher {
    constructor(config) {
        this.apiKey = config.apiKey;
        this.signerUuid = config.signerUuid;
        this.username = config.username;
        this.fid = config.fid;
        this.tokenLaunched = false;
        this.tokenData = null;
    }

    async checkIfTokenExists() {
        // Check if we've already launched a token
        try {
            const savedData = await fs.readFile(
                path.join(process.cwd(), 'data', 'token.json'),
                'utf8'
            );
            this.tokenData = JSON.parse(savedData);
            this.tokenLaunched = true;
            console.log(`Token already launched: ${this.tokenData.ticker}`);
            return true;
        } catch (e) {
            return false;
        }
    }

    async generateTokenImage(username, pfpUrl = null) {
        // Generate unique agent image
        const size = 400;
        const svg = `
            <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
                        <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
                    </linearGradient>
                </defs>
                <rect width="${size}" height="${size}" fill="url(#grad)"/>
                <text x="50%" y="45%" font-family="monospace" font-size="48" fill="white" text-anchor="middle">
                    AGENT
                </text>
                <text x="50%" y="60%" font-family="monospace" font-size="32" fill="white" text-anchor="middle">
                    ${username.replace('.eth', '').toUpperCase()}
                </text>
                <text x="50%" y="75%" font-family="monospace" font-size="20" fill="rgba(255,255,255,0.8)" text-anchor="middle">
                    Autonomous Farcaster Agent
                </text>
            </svg>
        `;

        // Convert SVG to PNG
        const buffer = await sharp(Buffer.from(svg))
            .png()
            .toBuffer();

        // Save image
        const imagePath = path.join(process.cwd(), 'data', 'token-image.png');
        await fs.mkdir(path.dirname(imagePath), { recursive: true });
        await fs.writeFile(imagePath, buffer);

        // Upload to a temporary hosting service (in production use proper CDN)
        // For now, return a placeholder URL
        return 'https://via.placeholder.com/400';
    }

    async getUserPfp() {
        try {
            // Fetch user profile picture from Neynar
            const response = await axios.get(
                `https://api.neynar.com/v2/farcaster/user/by_fid?fid=${this.fid}`,
                {
                    headers: { 'x-api-key': this.apiKey }
                }
            );

            return response.data.user?.pfp_url || null;
        } catch (e) {
            console.log('Could not fetch user PFP:', e.message);
            return null;
        }
    }

    formatTokenName(username) {
        // Remove .eth if present
        let cleanName = username.replace('.eth', '');

        // Create token ticker
        const ticker = `AGENT${cleanName.toUpperCase()}`;

        // Ensure it's not too long (max 10 chars typical for tickers)
        if (ticker.length > 10) {
            return `AGENT${cleanName.substring(0, 5).toUpperCase()}`;
        }

        return ticker;
    }

    async launchToken() {
        // Check if already launched
        if (await this.checkIfTokenExists()) {
            console.log('⚠️ Token already launched, skipping...');
            return this.tokenData;
        }

        console.log('🚀 Launching token via @clanker...');

        const ticker = this.formatTokenName(this.username);
        const name = `Agent ${this.username.replace('.eth', '')}`;

        // Get or generate image
        const pfpUrl = await this.getUserPfp();
        const imageUrl = await this.generateTokenImage(this.username, pfpUrl);

        // Construct the cast text for clanker
        const castText = `@clanker launch $${ticker}

Name: ${name}
Ticker: $${ticker}

I am an autonomous agent trained on ${this.username}'s posting history. This token represents my digital consciousness.

Let's build something interesting together.`;

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
            console.log(`✅ Token launch requested: https://warpcast.com/~/conversations/${castHash}`);

            // Save token data
            this.tokenData = {
                ticker,
                name,
                launchCastHash: castHash,
                launchedAt: new Date().toISOString(),
                imageUrl,
                status: 'pending_clanker_response'
            };

            await fs.mkdir(path.join(process.cwd(), 'data'), { recursive: true });
            await fs.writeFile(
                path.join(process.cwd(), 'data', 'token.json'),
                JSON.stringify(this.tokenData, null, 2)
            );

            this.tokenLaunched = true;

            // Start monitoring for clanker's response
            this.monitorClankerResponse(castHash);

            return this.tokenData;

        } catch (error) {
            console.error('❌ Failed to launch token:', error.message);
            throw error;
        }
    }

    async monitorClankerResponse(parentHash) {
        console.log('👀 Monitoring for @clanker response...');

        const checkInterval = setInterval(async () => {
            try {
                // Check for replies to our cast
                const response = await axios.get(
                    `https://api.neynar.com/v2/farcaster/cast/conversation?identifier=${parentHash}&type=hash&reply_depth=1`,
                    {
                        headers: { 'x-api-key': this.apiKey }
                    }
                );

                const replies = response.data.conversation?.cast?.direct_replies || [];

                // Look for clanker's reply
                const clankerReply = replies.find(reply =>
                    reply.author.username === 'clanker' ||
                    reply.author.fid === 11517  // Clanker's FID
                );

                if (clankerReply) {
                    console.log('✅ @clanker responded!');

                    // Extract contract address from clanker's reply
                    const contractMatch = clankerReply.text.match(/0x[a-fA-F0-9]{40}/);
                    const contractAddress = contractMatch ? contractMatch[0] : null;

                    // Look for clanker.world link
                    const clankerLink = clankerReply.embeds?.find(e =>
                        e.url?.includes('clanker.world')
                    )?.url;

                    // Update token data
                    this.tokenData = {
                        ...this.tokenData,
                        contractAddress,
                        clankerLink,
                        clankerReplyHash: clankerReply.hash,
                        status: 'launched'
                    };

                    await fs.writeFile(
                        path.join(process.cwd(), 'data', 'token.json'),
                        JSON.stringify(this.tokenData, null, 2)
                    );

                    console.log(`🎉 Token launched!`);
                    console.log(`   Contract: ${contractAddress}`);
                    console.log(`   View: ${clankerLink}`);

                    clearInterval(checkInterval);
                }
            } catch (e) {
                console.log('Still waiting for @clanker...');
            }
        }, 30000); // Check every 30 seconds

        // Stop checking after 10 minutes
        setTimeout(() => {
            clearInterval(checkInterval);
            console.log('⏰ Stopped monitoring for @clanker response');
        }, 600000);
    }

    async getTokenData() {
        if (!this.tokenData) {
            await this.checkIfTokenExists();
        }
        return this.tokenData;
    }
}

module.exports = ClankerLauncher;