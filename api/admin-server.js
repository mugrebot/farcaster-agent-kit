#!/usr/bin/env node

require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const ToolsManager = require('../core/tools-manager');
const Agent = require('../core/agent');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '../web')));

// Initialize tools manager
const toolsManager = new ToolsManager();

// Load saved tools config
async function loadToolsConfig() {
    try {
        const configPath = path.join(__dirname, '../data/tools-config.json');
        const data = await fs.readFile(configPath, 'utf8');
        const config = JSON.parse(data);

        for (const [toolId, toolConfig] of Object.entries(config)) {
            try {
                toolsManager.registerTool(toolId, toolConfig);
            } catch (error) {
                console.error(`Failed to load tool ${toolId}:`, error.message);
            }
        }
    } catch (error) {
        console.log('No existing tools config found');
    }
}

// Save tools config
async function saveToolsConfig() {
    const config = {};
    const tools = toolsManager.getTools();

    for (const tool of tools) {
        // Don't save sensitive keys in plain text
        // In production, use proper encryption
        config[tool.id] = {
            enabled: tool.enabled
        };
    }

    const configPath = path.join(__dirname, '../data/tools-config.json');
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
}

// Middleware to check auth
function requireAuth(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];

    // Simple auth check - in production use proper JWT validation
    if (!token || token !== 'clanknet-admin') {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    next();
}

// CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

// Admin API endpoints
app.get('/api/admin/stats', requireAuth, async (req, res) => {
    try {
        // Get recent posts
        const recentPostsPath = path.join(__dirname, '../data/recent_posts.json');
        let recentPosts = [];
        try {
            recentPosts = JSON.parse(await fs.readFile(recentPostsPath, 'utf8'));
        } catch (e) {}

        // Get tools status
        const tools = toolsManager.getTools();

        res.json({
            totalPosts: recentPosts.length,
            postsToday: recentPosts.filter(p => {
                const postDate = new Date(p.timestamp);
                const today = new Date();
                return postDate.toDateString() === today.toDateString();
            }).length,
            activeTools: tools.filter(t => t.enabled).length,
            platforms: [...new Set(tools.filter(t => t.type === 'social' && t.enabled).map(t => t.id))].length,
            recentActivity: recentPosts.slice(0, 10)
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/admin/tools', requireAuth, (req, res) => {
    const tools = toolsManager.getTools();
    res.json(tools);
});

app.post('/api/admin/tools/:toolId/configure', requireAuth, async (req, res) => {
    try {
        const { toolId } = req.params;
        const config = req.body;

        toolsManager.registerTool(toolId, config);
        await saveToolsConfig();

        res.json({ success: true });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.post('/api/admin/tools/:toolId/toggle', requireAuth, async (req, res) => {
    try {
        const { toolId } = req.params;
        const { enabled } = req.body;

        toolsManager.setToolEnabled(toolId, enabled);
        await saveToolsConfig();

        res.json({ success: true });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.post('/api/admin/post', requireAuth, async (req, res) => {
    try {
        const { text, platforms } = req.body;

        // Initialize agent
        const agent = new Agent({
            username: process.env.FARCASTER_USERNAME,
            fid: process.env.FARCASTER_FID,
            apiKey: process.env.NEYNAR_API_KEY,
            signerUuid: process.env.NEYNAR_SIGNER_UUID
        });

        const results = [];

        // Post to Farcaster if included
        if (platforms.includes('farcaster')) {
            try {
                const axios = require('axios');
                const response = await axios.post(
                    'https://api.neynar.com/v2/farcaster/cast',
                    {
                        signer_uuid: process.env.NEYNAR_SIGNER_UUID,
                        text: text
                    },
                    {
                        headers: {
                            'x-api-key': process.env.NEYNAR_API_KEY,
                            'Content-Type': 'application/json'
                        }
                    }
                );
                results.push({
                    platform: 'farcaster',
                    success: true,
                    hash: response.data.cast.hash
                });
            } catch (error) {
                results.push({
                    platform: 'farcaster',
                    success: false,
                    error: error.message
                });
            }
        }

        // Cross-post to other platforms
        const otherPlatforms = platforms.filter(p => p !== 'farcaster');
        if (otherPlatforms.length > 0) {
            const crossPostResults = await toolsManager.crossPost(text, otherPlatforms);
            results.push(...crossPostResults);
        }

        res.json({ results });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/admin/config', requireAuth, async (req, res) => {
    try {
        const envPath = path.join(__dirname, '../.env');
        const envContent = await fs.readFile(envPath, 'utf8');
        const config = {};

        envContent.split('\n').forEach(line => {
            const [key, value] = line.split('=');
            if (key && value) {
                // Don't send sensitive keys
                if (!key.includes('KEY') && !key.includes('SECRET')) {
                    config[key] = value;
                }
            }
        });

        res.json(config);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/admin/config', requireAuth, async (req, res) => {
    try {
        const updates = req.body;
        const envPath = path.join(__dirname, '../.env');
        let envContent = await fs.readFile(envPath, 'utf8');

        for (const [key, value] of Object.entries(updates)) {
            const regex = new RegExp(`^${key}=.*$`, 'm');
            if (regex.test(envContent)) {
                envContent = envContent.replace(regex, `${key}=${value}`);
            } else {
                envContent += `\n${key}=${value}`;
            }
        }

        await fs.writeFile(envPath, envContent);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get agent status
app.get('/api/admin/agent-status', requireAuth, async (req, res) => {
    try {
        // Check PM2 processes
        const { spawn } = require('child_process');
        const pm2Status = spawn('pm2', ['jlist']);
        let output = '';

        pm2Status.stdout.on('data', (data) => {
            output += data.toString();
        });

        pm2Status.on('close', (code) => {
            try {
                const processes = JSON.parse(output);
                const agentProcess = processes.find(p => p.name === 'farcaster-agent');
                const webhookProcess = processes.find(p => p.name === 'farcaster-webhook');

                res.json({
                    agent: {
                        status: agentProcess?.pm2_env?.status || 'stopped',
                        uptime: agentProcess?.pm2_env?.pm_uptime || 0,
                        memory: agentProcess?.monit?.memory || 0,
                        cpu: agentProcess?.monit?.cpu || 0,
                        restarts: agentProcess?.pm2_env?.restart_time || 0
                    },
                    webhook: {
                        status: webhookProcess?.pm2_env?.status || 'stopped',
                        uptime: webhookProcess?.pm2_env?.pm_uptime || 0,
                        memory: webhookProcess?.monit?.memory || 0,
                        cpu: webhookProcess?.monit?.cpu || 0,
                        restarts: webhookProcess?.pm2_env?.restart_time || 0
                    }
                });
            } catch (error) {
                res.json({
                    agent: { status: 'unknown' },
                    webhook: { status: 'unknown' }
                });
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Manual agent actions
app.post('/api/admin/agent/action', requireAuth, async (req, res) => {
    try {
        const { action } = req.body;
        const { spawn } = require('child_process');

        let command, args;
        switch (action) {
            case 'restart':
                command = 'pm2';
                args = ['restart', 'farcaster-agent'];
                break;
            case 'stop':
                command = 'pm2';
                args = ['stop', 'farcaster-agent'];
                break;
            case 'start':
                command = 'pm2';
                args = ['start', 'farcaster-agent'];
                break;
            default:
                return res.status(400).json({ error: 'Invalid action' });
        }

        const process = spawn(command, args);

        process.on('close', (code) => {
            if (code === 0) {
                res.json({ success: true, action });
            } else {
                res.status(500).json({ error: 'Action failed' });
            }
        });

        process.on('error', (error) => {
            res.status(500).json({ error: error.message });
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get posting schedule
app.get('/api/admin/schedule', requireAuth, async (req, res) => {
    try {
        // This would need to be extracted from the running agent
        // For now, return basic schedule info
        res.json({
            nextPost: null, // Would need to get this from agent state
            interval: '30-180 minutes',
            type: 'random',
            enabled: true
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Serve admin panel
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, '../web/admin.html'));
});

// Load tools config on startup
loadToolsConfig().then(() => {
    const PORT = process.env.ADMIN_PORT || 3002;
    app.listen(PORT, () => {
        console.log(`\n🔐 Admin server running on port ${PORT}`);
        console.log(`📊 Admin dashboard: http://localhost:${PORT}/admin`);
        console.log(`🔧 Tools loaded: ${toolsManager.getTools().length}`);
        console.log('\n⚡ Admin Features:');
        console.log('  - Farcaster sign-in authentication');
        console.log('  - Configure multiple platform integrations');
        console.log('  - Manual cross-posting to all platforms');
        console.log('  - Real-time activity monitoring');
        console.log('  - Agent configuration management');
    });
});