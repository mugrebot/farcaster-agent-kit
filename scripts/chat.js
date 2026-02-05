#!/usr/bin/env node

require('dotenv').config();
const readline = require('readline');
const chalk = require('chalk');
const Agent = require('../core/agent');
const path = require('path');

// Create readline interface for terminal chat
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.cyan('You: ')
});

// Initialize agent
const agent = new Agent({
    username: process.env.FARCASTER_USERNAME,
    fid: process.env.FARCASTER_FID,
    apiKey: process.env.NEYNAR_API_KEY,
    signerUuid: process.env.NEYNAR_SIGNER_UUID
});

// Welcome message
console.clear();
console.log(chalk.magenta(`
╔══════════════════════════════════════════════════╗
║     🤖 CLANKNET Agent Terminal Chat              ║
║     Talk directly to your autonomous agent       ║
╚══════════════════════════════════════════════════╝
`));

console.log(chalk.gray('Loading agent profile...'));

// Load agent profile and identity files
async function initialize() {
    try {
        // Load voice profile
        await agent.loadProfile(path.join(__dirname, '../data/profile.json'));

        // Load identity files from OpenClaw workspace
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
                console.log(chalk.gray(`📄 Loaded ${type} profile`));
            } catch (e) {
                console.log(chalk.yellow(`⚠️  ${type} file not found`));
            }
        }

        console.log(chalk.green('✅ Agent ready with full identity!'));
        console.log(chalk.gray('Type "help" for commands, "exit" to quit\n'));

        rl.prompt();
    } catch (error) {
        console.error(chalk.red('Failed to load agent:', error.message));
        process.exit(1);
    }
}

// Handle user input
rl.on('line', async (input) => {
    const cmd = input.trim().toLowerCase();

    // Handle special commands
    if (cmd === 'exit' || cmd === 'quit') {
        console.log(chalk.yellow('\n👋 Goodbye!'));
        process.exit(0);
    }

    if (cmd === 'help') {
        showHelp();
        rl.prompt();
        return;
    }

    if (cmd === 'status') {
        await showStatus();
        rl.prompt();
        return;
    }

    if (cmd === 'post') {
        await generatePost();
        rl.prompt();
        return;
    }

    if (cmd.startsWith('post ')) {
        await postDirectly(cmd.substring(5));
        rl.prompt();
        return;
    }

    if (cmd === 'voice') {
        showVoiceProfile();
        rl.prompt();
        return;
    }

    // Generate conversational reply
    console.log(chalk.gray('Thinking...'));

    try {
        let reply;
        if (agent.llm.provider !== 'pattern') {
            // Use LLM with identity context and authentic voice
            const contextualPrompt = `${agent.identityContext}

User said: "${input}"

Respond as m00npapi:
- Keep it SHORT and punchy (~80 chars like your average)
- Be authentic, not an AI assistant
- Use humor or make absurd connections
- NO generic responses like "yo what's good"
- Be irreverent, sharp, genuine
- Lowercase when casual, CAPS for emphasis
- Reference soup dumplings, music, crypto culture if relevant
- Stream of consciousness style

Your response:`;

            const result = await agent.llm.generateContent(contextualPrompt, {
                username: agent.username,
                voiceProfile: agent.voiceProfile,
                mode: 'chat',
                maxTokens: 150
            });
            reply = result.content.trim();
        } else {
            // Fallback to basic reply
            reply = await agent.generateReply(input);
        }
        console.log(chalk.green('\nAgent: ') + reply);
    } catch (error) {
        console.log(chalk.red('Error: ') + error.message);
    }

    console.log('');
    rl.prompt();
});

// Show help menu
function showHelp() {
    console.log(chalk.yellow('\n📋 Available Commands:'));
    console.log(chalk.white('  help        - Show this help menu'));
    console.log(chalk.white('  status      - Check agent status'));
    console.log(chalk.white('  post        - Generate a random post'));
    console.log(chalk.white('  post <text> - Post specific text'));
    console.log(chalk.white('  voice       - Show voice profile stats'));
    console.log(chalk.white('  exit        - Exit chat'));
    console.log(chalk.gray('\nOr just type anything to chat with your agent!\n'));
}

// Show agent status
async function showStatus() {
    console.log(chalk.yellow('\n📊 Agent Status:'));
    console.log(chalk.white(`  Username: @${agent.username}`));
    console.log(chalk.white(`  FID: ${agent.fid}`));
    console.log(chalk.white(`  LLM: ${agent.llm.provider} (${agent.llm.model || 'pattern-based'})`));
    console.log(chalk.white(`  Posts analyzed: ${agent.posts?.length || 0}`));

    // Check recent activity
    try {
        const fs = require('fs').promises;
        const recentPosts = JSON.parse(
            await fs.readFile(path.join(__dirname, '../data/recent_posts.json'), 'utf8')
        );
        console.log(chalk.white(`  Recent posts: ${recentPosts.length}`));
        if (recentPosts.length > 0) {
            const lastPost = new Date(recentPosts[0].timestamp);
            const hoursAgo = Math.round((Date.now() - lastPost) / (1000 * 60 * 60));
            console.log(chalk.white(`  Last post: ${hoursAgo} hours ago`));
        }
    } catch (e) {
        // No recent posts file
    }

    console.log('');
}

// Generate a post
async function generatePost() {
    console.log(chalk.gray('Generating post...'));

    try {
        const styles = ['ultra_short', 'shitpost', 'observation', 'mini_rant'];
        const style = styles[Math.floor(Math.random() * styles.length)];

        const post = await agent.generatePost(style);
        console.log(chalk.yellow(`\n📝 Generated ${style}:`));
        console.log(chalk.white(`"${post}"`));
        console.log(chalk.gray(`(${post.length} characters)`));

        // Ask if user wants to post it
        const postIt = await askQuestion(chalk.cyan('\nPost this to Farcaster? (y/n): '));
        if (postIt.toLowerCase() === 'y') {
            await postToFarcaster(post);
        }
    } catch (error) {
        console.log(chalk.red('Error generating post:', error.message));
    }
}

// Post directly to Farcaster
async function postDirectly(text) {
    console.log(chalk.gray('Posting to Farcaster...'));
    await postToFarcaster(text);
}

// Actually post to Farcaster
async function postToFarcaster(text) {
    try {
        const axios = require('axios');
        const response = await axios.post(
            'https://api.neynar.com/v2/farcaster/cast',
            {
                signer_uuid: agent.signerUuid,
                text: text
            },
            {
                headers: {
                    'x-api-key': agent.apiKey,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log(chalk.green('✅ Posted successfully!'));
        console.log(chalk.gray(`Hash: ${response.data.cast.hash}`));

        // Save to recent posts
        const fs = require('fs').promises;
        const recentPath = path.join(__dirname, '../data/recent_posts.json');
        let recent = [];
        try {
            recent = JSON.parse(await fs.readFile(recentPath, 'utf8'));
        } catch (e) {}

        recent.unshift({
            text: text,
            hash: response.data.cast.hash,
            timestamp: new Date().toISOString()
        });
        recent = recent.slice(0, 100);

        await fs.writeFile(recentPath, JSON.stringify(recent, null, 2));

    } catch (error) {
        console.log(chalk.red('Failed to post:', error.response?.data?.message || error.message));
    }
}

// Show voice profile
function showVoiceProfile() {
    if (!agent.voiceProfile) {
        console.log(chalk.red('Voice profile not loaded'));
        return;
    }

    console.log(chalk.yellow('\n🎭 Voice Profile:'));
    console.log(chalk.white(`  Average length: ${agent.voiceProfile.avgLength} chars`));
    console.log(chalk.white(`  Top words: ${agent.voiceProfile.topWords.slice(0, 5).join(', ')}`));
    console.log(chalk.white(`  Top emojis: ${agent.voiceProfile.topEmojis.slice(0, 5).join(' ')}`));
    console.log(chalk.white(`  Lowercase posts: ${agent.voiceProfile.style.usesLowercase}`));
    console.log(chalk.white(`  Uppercase posts: ${agent.voiceProfile.style.usesUppercase}`));
    console.log('');
}

// Helper to ask questions
function askQuestion(question) {
    return new Promise((resolve) => {
        rl.question(question, resolve);
    });
}

// Handle exit
rl.on('close', () => {
    console.log(chalk.yellow('\n👋 Goodbye!'));
    process.exit(0);
});

// Start the chat
initialize();