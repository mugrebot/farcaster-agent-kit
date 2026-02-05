#!/usr/bin/env node

require('dotenv').config();
const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const Agent = require('../core/agent');
const ClanknetGatekeeper = require('../core/clanknet-gatekeeper');
const path = require('path');

const app = express();
app.use(express.json());

// Initialize agent
const agent = new Agent({
    username: process.env.FARCASTER_USERNAME,
    fid: process.env.FARCASTER_FID,
    apiKey: process.env.NEYNAR_API_KEY,
    signerUuid: process.env.NEYNAR_SIGNER_UUID
});

// Initialize gatekeeper for token-gated access
const gatekeeper = new ClanknetGatekeeper({
    neynarApiKey: process.env.NEYNAR_API_KEY,
    replyPrice: 5_000_000 // 5 million CLANKNET required
});

// Load agent profile and identity on startup
async function initialize() {
    const profilePath = path.join(__dirname, '../data/profile.json');
    await agent.loadProfile(profilePath);

    // Load identity context
    const fs = require('fs').promises;
    const identityFiles = {
        soul: '/Users/m00npapi/.openclaw/workspace/SOUL.md',
        identity: '/Users/m00npapi/.openclaw/workspace/IDENTITY.md',
        user: '/Users/m00npapi/.openclaw/workspace/USER.md'
    };

    agent.identityContext = '';

    for (const [type, filePath] of Object.entries(identityFiles)) {
        try {
            const content = await fs.readFile(filePath, 'utf8');
            agent.identityContext += `\n=== ${type.toUpperCase()} ===\n${content}\n`;
        } catch (e) {
            console.log(`Identity file ${type} not found`);
        }
    }

    console.log('🤖 Agent profile and identity loaded for webhook server');
}

// Verify webhook signature
function verifyWebhookSignature(req) {
    const signature = req.headers['x-neynar-signature'];
    if (!signature) return false;

    const webhookSecret = process.env.NEYNAR_WEBHOOK_SECRET;
    const body = JSON.stringify(req.body);

    const hmac = crypto.createHmac('sha512', webhookSecret);
    hmac.update(body);
    const expectedSignature = hmac.digest('hex');

    return signature === expectedSignature;
}

// Handle webhook from Neynar
app.post('/webhook', async (req, res) => {
    // Verify signature
    if (!verifyWebhookSignature(req)) {
        console.error('❌ Invalid webhook signature');
        return res.status(401).json({ error: 'Invalid signature' });
    }

    try {
        const { data } = req.body;

        // Check if it's a mention or reply
        if (data.mentioned_profiles) {
            const mentionedAgent = data.mentioned_profiles.find(
                profile => profile.username === process.env.FARCASTER_USERNAME
            );

            if (mentionedAgent) {
                console.log(`\n📨 Received mention from @${data.author.username}`);

                // Check CLANKNET balance
                const access = await gatekeeper.processInteraction(
                    data.author.fid,
                    data.author.username,
                    data.text
                );

                if (access.allowed) {
                    // Generate Claude-powered reply with identity context
                    console.log('✅ User has enough CLANKNET, generating reply...');

                    let replyText;
                    if (agent.llm.provider !== 'pattern' && agent.identityContext) {
                        // Use identity-aware reply
                        const contextualPrompt = `${agent.identityContext}\n\nSomeone mentioned you on Farcaster: "${data.text}"\n\nReply as m00npapi (short, authentic, engaging):`;

                        const result = await agent.llm.generateContent(contextualPrompt, {
                            username: agent.username,
                            voiceProfile: agent.voiceProfile,
                            mode: 'reply',
                            maxTokens: 80
                        });
                        replyText = result.content.trim();
                    } else {
                        // Fallback to basic reply
                        replyText = await agent.generateReply(data.text);
                    }

                    // Post reply
                    await postReply(data.hash, replyText);
                    console.log(`↩️ Reply sent: "${replyText}"`);
                } else {
                    // Don't reply if they don't have enough CLANKNET - too expensive
                    console.log(`❌ User @${data.author.username} needs ${access.needed.toLocaleString()} more CLANKNET - skipping reply to save costs`);
                }
            }
        }

        res.status(200).json({ success: true });
    } catch (error) {
        console.error('Error processing webhook:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Post a reply to a cast
async function postReply(parentHash, text) {
    try {
        const response = await axios.post('https://api.neynar.com/v2/farcaster/cast', {
            signer_uuid: process.env.NEYNAR_SIGNER_UUID,
            text: text,
            parent: parentHash
        }, {
            headers: {
                'x-api-key': process.env.NEYNAR_API_KEY,
                'Content-Type': 'application/json'
            }
        });

        return response.data;
    } catch (error) {
        console.error('Error posting reply:', error.message);
        throw error;
    }
}

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        agent: process.env.FARCASTER_USERNAME,
        webhook: 'active',
        clanknetRequired: 5_000_000
    });
});

// Start server
const PORT = process.env.WEBHOOK_PORT || 3000;

initialize().then(() => {
    app.listen(PORT, () => {
        console.log(`\n🌐 Webhook server running on port ${PORT}`);
        console.log(`📮 Webhook endpoint: http://localhost:${PORT}/webhook`);
        console.log(`💰 CLANKNET required for replies: 5,000,000`);
        console.log(`🤖 Agent: @${process.env.FARCASTER_USERNAME}`);
        console.log('\n📨 Ready to handle mentions!');
    });
}).catch(error => {
    console.error('Failed to initialize webhook server:', error);
    process.exit(1);
});