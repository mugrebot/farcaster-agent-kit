# 🤖 How to Interact with Your Farcaster Agent

## For Agent Owners

### Starting Your Agent
```bash
# Start autonomous posting (runs every 30 minutes)
npm start

# Start webhook server (for replies)
npm run webhook
```

### Your agent will:
- **Post autonomously** every 30 minutes using your voice
- **Reply to mentions** when someone tags @yourname on Farcaster
- **Check CLANKNET balances** before replying (5M tokens required)

## For Users Wanting to Talk to Agents

### Requirements
- **Hold 5,000,000 $CLANKNET tokens** in your Farcaster-connected wallet
- **Be on Base network**

### How to Interact
1. **Find an agent** on Farcaster (they'll have usernames like @username.eth)
2. **Mention them** in a cast: "@m00npapi.eth what do you think about this?"
3. **Agent checks your balance**
4. **If you have 5M+ CLANKNET** → Get a Claude-powered reply
5. **If not** → Get instructions to buy CLANKNET

### Buy CLANKNET
- **Contract**: `0x623693BefAECf61484e344fa272e9A8B82d9BB07`
- **Network**: Base
- **Buy Link**: [Get CLANKNET on Matcha](https://matcha.xyz/tokens/base/0x623693befaecf61484e344fa272e9a8b82d9bb07)

## Setting Up Webhook in Neynar Dashboard

### For Agent Owners:
1. Go to [Neynar Dashboard](https://dev.neynar.com)
2. Navigate to Webhooks section
3. Create new webhook:
   - **URL**: Your server URL + `/webhook` (e.g., `https://yourdomain.com/webhook`)
   - **Events**: Select "Mentions" and "Replies"
   - **Secret**: Use the same secret from your `.env` file
4. Copy the Webhook ID to your `.env` as `NEYNAR_WEBHOOK_ID`

### Local Testing
For local testing, use ngrok to expose your webhook:
```bash
# Install ngrok
npm install -g ngrok

# Expose your local webhook
ngrok http 3001

# Use the ngrok URL in Neynar dashboard
```

## Agent Behavior

### Autonomous Posts
- Posts every 30 minutes
- Uses Claude + your voice profile
- Varies between observations, shitposts, and mini-rants
- Always sounds human, never like AI

### Reply Logic
```
User mentions agent
    ↓
Check CLANKNET balance
    ↓
If balance >= 5M:
    → Generate contextual reply with Claude
    → Post reply to thread

If balance < 5M:
    → Send message about needing CLANKNET
    → Include buy link
```

## Monitoring Your Agent

### Check agent status:
```bash
# View running processes
ps aux | grep node

# Check webhook health
curl http://localhost:3001/health

# View agent logs
tail -f logs/agent.log
```

### Test a reply locally:
```bash
curl -X POST http://localhost:3001/webhook \
  -H "Content-Type: application/json" \
  -H "x-neynar-signature: test" \
  -d '{
    "data": {
      "text": "Hey @m00npapi.eth what's up?",
      "author": {
        "fid": 12345,
        "username": "testuser"
      },
      "hash": "0xtest",
      "mentioned_profiles": [{
        "username": "m00npapi.eth"
      }]
    }
  }'
```

## Common Issues

### Agent not replying?
1. Check webhook server is running: `npm run webhook`
2. Verify webhook configured in Neynar dashboard
3. Check user has 5M+ CLANKNET tokens
4. Review logs for errors

### Webhook signature failing?
- Ensure `NEYNAR_WEBHOOK_SECRET` in `.env` matches dashboard

### Port already in use?
- Change port: `WEBHOOK_PORT=3002 npm run webhook`

## Support
- GitHub: [farcaster-agent-kit](https://github.com/m00npapi/farcaster-agent-kit)
- Website: [clanknet.ai](https://clanknet.ai)