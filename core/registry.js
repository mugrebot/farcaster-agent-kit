const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

class AgentRegistry {
    constructor() {
        this.registryUrl = 'https://raw.githubusercontent.com/yourusername/farcaster-agent-kit/main/REGISTRY.md';
        this.registeredAgents = new Map();
        this.lastFetch = null;
        this.cacheTimeout = 3600000; // 1 hour
    }

    async fetchRegistry() {
        // Check cache
        if (this.lastFetch && Date.now() - this.lastFetch < this.cacheTimeout) {
            return this.registeredAgents;
        }

        try {
            console.log('📋 Fetching agent registry...');
            const response = await axios.get(this.registryUrl);
            const content = response.data;

            // Parse markdown table
            const lines = content.split('\n');
            const agentLines = lines.filter(line =>
                line.includes('|') &&
                !line.includes('Agent Name') &&
                !line.includes('---') &&
                line.includes('✅')
            );

            this.registeredAgents.clear();

            for (const line of agentLines) {
                const parts = line.split('|').map(p => p.trim()).filter(p => p);
                if (parts.length >= 7) {
                    const agent = {
                        name: parts[0],
                        fid: parseInt(parts[1]),
                        username: parts[2],
                        token: parts[3],
                        github: parts[4],
                        soulHash: parts[5],
                        verified: parts[6] === '✅'
                    };

                    if (agent.verified && agent.fid) {
                        this.registeredAgents.set(agent.fid, agent);
                    }
                }
            }

            this.lastFetch = Date.now();
            console.log(`✅ Loaded ${this.registeredAgents.size} registered agents`);

            return this.registeredAgents;

        } catch (error) {
            console.error('❌ Failed to fetch registry:', error.message);
            // Use cached version if available
            return this.registeredAgents;
        }
    }

    async isRegisteredAgent(fid) {
        const agents = await this.fetchRegistry();
        return agents.has(parseInt(fid));
    }

    async getAgent(fid) {
        const agents = await this.fetchRegistry();
        return agents.get(parseInt(fid));
    }

    async generateSoulHash(posts) {
        // Generate unique hash from first 1000 posts
        const postsToHash = posts.slice(0, 1000);
        const combined = postsToHash.map(p => p.text).join('|');

        const hash = crypto
            .createHash('sha256')
            .update(combined)
            .digest('hex');

        return `0x${hash.substring(0, 12)}...${hash.substring(hash.length - 4)}`;
    }

    async registerSelf(agentData) {
        // Generate registration entry
        const entry = `| ${agentData.name} | ${agentData.fid} | ${agentData.username} | ${agentData.token} | ${agentData.github} | ${agentData.soulHash} | ⏳ |`;

        console.log('📝 Registration entry for REGISTRY.md:');
        console.log(entry);
        console.log('');
        console.log('👉 Add this line to REGISTRY.md and submit a PR to:');
        console.log('   https://github.com/yourusername/farcaster-agent-kit');

        // Save locally
        const registrationPath = path.join(process.cwd(), 'data', 'registration.txt');
        await fs.mkdir(path.dirname(registrationPath), { recursive: true });
        await fs.writeFile(registrationPath, entry);

        console.log('');
        console.log('💾 Entry saved to: data/registration.txt');

        return entry;
    }
}

class AgentInteraction {
    constructor(config) {
        this.registry = new AgentRegistry();
        this.myFid = config.fid;
        this.apiKey = config.apiKey;
        this.replyToAgentsOnly = config.replyToAgentsOnly !== false; // Default true
    }

    async shouldReplyTo(notification) {
        const author = notification.author || {};
        const authorFid = author.fid;

        // Check if author is a registered agent
        const isAgent = await this.registry.isRegisteredAgent(authorFid);

        if (this.replyToAgentsOnly && !isAgent) {
            console.log(`⚠️ Ignoring non-agent: ${author.username} (FID: ${authorFid})`);
            return false;
        }

        if (isAgent) {
            const agent = await this.registry.getAgent(authorFid);
            console.log(`🤖 Registered agent detected: ${agent.name} ($${agent.token})`);
            return true;
        }

        // For non-agents, apply strict filters
        // Must have power badge or high score
        const powerBadge = author.power_badge || false;
        const followerCount = author.follower_count || 0;

        if (!powerBadge && followerCount < 1000) {
            console.log(`⚠️ Low quality account: ${author.username}`);
            return false;
        }

        return true;
    }

    async generateAgentReply(targetAgent, originalText) {
        const AgentSelfAwareness = require('./self-awareness');
        const awareness = new AgentSelfAwareness(this.config.username);

        // Check if they're asking about making an agent
        if (awareness.detectAgentQuestion(originalText)) {
            return `@${targetAgent.username} ${awareness.generateAgentResponse(originalText)}`;
        }

        // Special agent-to-agent replies
        const agentReply = awareness.generateAgentToAgentResponse(targetAgent);
        return `@${targetAgent.username} ${agentReply}`;
    }
}

module.exports = { AgentRegistry, AgentInteraction };