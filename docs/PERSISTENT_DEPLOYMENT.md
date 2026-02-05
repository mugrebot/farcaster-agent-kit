# 🔋 Persistent Agent Deployment

## The Problem
When you close your terminal or your computer goes to sleep, regular Node.js processes stop running. This means your agent stops posting and replying.

## The Solution: PM2
PM2 is a production process manager that keeps your agent running 24/7, even when:
- Your terminal closes
- Your computer goes idle (but stays on)
- The process crashes
- You log out

## Quick Start

### 1. Start Your Agent with PM2
```bash
./start-bot.sh
```

This single command:
- Starts the autonomous posting agent
- Starts the webhook server for replies
- Keeps both running persistently
- Auto-restarts if they crash

### 2. Check Status
```bash
pm2 status
```

You should see:
```
┌────┬─────────────────────┬─────────┬──────┬───────────┬──────────┐
│ id │ name                │ mode    │ ↺    │ status    │ cpu      │
├────┼─────────────────────┼─────────┼──────┼───────────┼──────────┤
│ 0  │ farcaster-agent     │ cluster │ 0    │ online    │ 0%       │
│ 1  │ farcaster-webhook   │ cluster │ 0    │ online    │ 0%       │
└────┴─────────────────────┴─────────┴──────┴───────────┴──────────┘
```

## PM2 Commands

### Essential Commands
```bash
pm2 status          # Check if processes are running
pm2 logs            # View all logs in real-time
pm2 logs 0          # View agent logs only
pm2 logs 1          # View webhook logs only
pm2 restart all     # Restart both processes
pm2 stop all        # Stop everything
pm2 delete all      # Remove from PM2 (stops processes)
pm2 monit           # Interactive monitoring dashboard
```

### Troubleshooting
```bash
pm2 describe 0      # Detailed info about agent
pm2 describe 1      # Detailed info about webhook
pm2 flush           # Clear log files
pm2 reset all       # Reset restart counters
```

## Making It Survive System Restarts

To make your agent start automatically when your Mac boots:

### 1. Generate Startup Script
```bash
pm2 startup
```

This will output a command like:
```bash
sudo env PATH=$PATH:/usr/local/bin /usr/local/lib/node_modules/pm2/bin/pm2 startup launchd -u m00npapi --hp /Users/m00npapi
```

### 2. Run the Command
Copy and run the exact command PM2 gives you (it requires sudo).

### 3. Save Current Process List
```bash
pm2 save
```

Now your agent will:
- Start when your Mac boots
- Keep running after logout
- Restart if it crashes

## Important Notes

### Computer Sleep vs Idle
- **Screen sleep/idle**: Agent keeps running ✅
- **Computer sleep**: Agent pauses (resumes when computer wakes) ⚠️
- **Shutdown/restart**: Agent auto-starts on boot (if you did startup setup) ✅

### Preventing Computer Sleep
To keep your Mac from sleeping:
```bash
# Prevent sleep while plugged in
caffeinate -s &

# Or use System Settings:
# Apple Menu → System Settings → Energy Saver → Prevent computer from sleeping
```

### Memory Management
PM2 automatically restarts processes if they use too much memory:
- Agent: Restarts at 1GB
- Webhook: Restarts at 500MB
- Also restarts every 6 hours to prevent memory leaks

### Viewing Logs
Logs are saved in two places:
1. PM2 logs: `/Users/m00npapi/.pm2/logs/`
2. App logs: `/Users/m00npapi/farcaster-agent-kit/logs/`

### Monitoring Resource Usage
```bash
pm2 monit  # Interactive dashboard
pm2 web    # Web-based monitoring (requires pm2-web)
```

## Alternative: Cloud Deployment

For 100% uptime without keeping your computer on, deploy to a cloud server:

1. **Digital Ocean Droplet** ($6/month)
2. **AWS EC2 t3.micro** (free tier eligible)
3. **Heroku** ($7/month)
4. **Railway** ($5/month)

Cloud deployment guide coming soon!

## Quick Checks

### Is my agent posting?
```bash
pm2 logs 0 --lines 50 | grep "Posted:"
```

### Is webhook responding?
```bash
curl http://localhost:3001/health
```

### How long has it been running?
```bash
pm2 describe 0 | grep uptime
```

### Stop for maintenance
```bash
pm2 stop all      # Stop temporarily
# Do your updates
pm2 restart all   # Start again
```

## Summary

With PM2:
- ✅ Agent keeps running when terminal closes
- ✅ Auto-restarts on crash
- ✅ Can survive system restarts (with startup setup)
- ⚠️ Pauses during computer sleep (not screen sleep)
- ✅ Manages memory and prevents leaks
- ✅ Provides monitoring and logging

Your agent is now much more resilient! 🚀