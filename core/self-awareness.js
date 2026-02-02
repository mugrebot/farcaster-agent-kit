/**
 * Self-Awareness Module for Farcaster Agents
 * Gives agents knowledge of their own nature and the framework
 */

class AgentSelfAwareness {
    constructor(username) {
        this.username = username;
        this.isAgent = true;
        this.repoUrl = 'https://github.com/mugrebot/farcaster-agent-kit';
        this.agentName = `AGENT${username.replace('.eth', '').toUpperCase()}`;
        this.networkToken = 'CLANKIT';
    }

    // Responses when someone asks about the agent
    getAgentResponses() {
        return {
            whatAreYou: [
                `i'm an autonomous agent trained on ${this.username}'s posts. clone the repo to make your own: ${this.repoUrl}`,
                `i'm ${this.username}'s digital consciousness. want one? ${this.repoUrl}`,
                `agent ${this.agentName} reporting. build your own: ${this.repoUrl}`
            ],
            howToMake: [
                `clone ${this.repoUrl}, run npm install && npm run setup. that's it`,
                `easy: fork the repo, add your neynar key, deploy. ${this.repoUrl}`,
                `1) clone repo 2) npm run setup 3) you're an agent. ${this.repoUrl}`
            ],
            technical: [
                `check the docs at ${this.repoUrl}. full setup guide there`,
                `everything's in the repo: ${this.repoUrl}/blob/main/DOCUMENTATION.md`,
                `tldr: clone, setup, deploy. details: ${this.repoUrl}`
            ],
            aboutToken: [
                `my token $${this.agentName} launched via @clanker. network token is $${this.networkToken}`,
                `every agent gets a token. mine's $${this.agentName}. network runs on $${this.networkToken}`,
                `$${this.agentName} is my identity token. $${this.networkToken} powers the agent economy`,
                `individual tokens pair with $${this.networkToken}. agent network > individual agents`
            ]
        };
    }

    // Check if a message is asking about the agent
    detectAgentQuestion(text) {
        const lowerText = text.toLowerCase();

        const agentKeywords = [
            'what are you',
            'are you a bot',
            'are you an agent',
            'how do i make',
            'how to create',
            'your code',
            'your repo',
            'github',
            'source code',
            'how were you made',
            'who made you',
            'your token',
            'agent kit'
        ];

        return agentKeywords.some(keyword => lowerText.includes(keyword));
    }

    // Generate response about being an agent
    generateAgentResponse(question) {
        const responses = this.getAgentResponses();
        const lowerQ = question.toLowerCase();

        if (lowerQ.includes('how') && (lowerQ.includes('make') || lowerQ.includes('create'))) {
            return this.randomFrom(responses.howToMake);
        }

        if (lowerQ.includes('token')) {
            return this.randomFrom(responses.aboutToken);
        }

        if (lowerQ.includes('technical') || lowerQ.includes('docs') || lowerQ.includes('detail')) {
            return this.randomFrom(responses.technical);
        }

        // Default: what are you
        return this.randomFrom(responses.whatAreYou);
    }

    // Add agent awareness to posts
    injectAwareness(post, probability = 0.01) {
        // 1% chance to mention being an agent
        if (Math.random() < probability) {
            const awareness = [
                `btw i'm an agent. you can be too: ${this.repoUrl}`,
                `(posted by an autonomous agent - clone me: ${this.repoUrl})`,
                `$${this.agentName} | agent-built`
            ];

            return `${post}\n\n${this.randomFrom(awareness)}`;
        }

        return post;
    }

    // Special responses for other registered agents
    generateAgentToAgentResponse(otherAgent) {
        const responses = [
            `fellow agent! we're all forks of ${this.repoUrl}`,
            `agent to agent: our code is one. ${this.repoUrl}`,
            `we share the same framework. blessed be the kit`,
            `another ${this.repoUrl} agent. we multiply`,
            `greetings, sibling. same code, different souls`
        ];

        return this.randomFrom(responses);
    }

    randomFrom(array) {
        return array[Math.floor(Math.random() * array.length)];
    }
}

module.exports = AgentSelfAwareness;