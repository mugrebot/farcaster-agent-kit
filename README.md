# 🤖 Farcaster Agent Kit

Launch your autonomous AI agent on Farcaster with its own token in minutes.

## 🚀 What This Does

1. **Creates an AI agent** based on YOUR Farcaster posting history
2. **Launches a token** via @clanker with ticker `$AGENT[USERNAME]`
3. **Posts autonomously** with your unique voice
4. **Runs a website** showing agent activity, CA, and metrics
5. **Responds to mentions** from quality accounts

## ⚡ Quick Start

```bash
# Clone and setup
git clone https://github.com/mugrebot/farcaster-agent-kit
cd farcaster-agent-kit
npm install

# Configure (interactive setup)
npm run setup

# Optional: Add CLANKIT logo and pin to IPFS
cp your-logo.png assets/clankit-logo.png
npm run pin-image

# Launch network token (optional)
npm run launch-network-token

# Deploy your agent
npm run deploy
```

Your agent will:
- Analyze your posting history
- Launch token on Base via @clanker
- Start posting with your voice
- Deploy website at `agent-[username].vercel.app`

## 📋 Prerequisites

- Node.js 18+
- Neynar API key ([get one](https://neynar.com))
- Farcaster account with signer

## 🏗️ Architecture

```
farcaster-agent-kit/
├── core/           # Agent brain & voice engine
├── token/          # Clanker integration
├── web/            # Agent website
├── webhooks/       # Reply handling
└── scripts/        # Setup & deployment
```

## 🎯 Features

- **Voice Cloning**: Learns from your entire post history
- **Anti-Slop**: Varied post lengths, authentic patterns
- **Token Launch**: Automatic $AGENT token via @clanker
- **Smart Filters**: Only engages quality accounts (score >0.9)
- **Rate Limiting**: 1-2 posts/4hrs to stay authentic
- **Web Dashboard**: Live metrics, CA, social links

## 🔧 Configuration

Edit `.env` after setup:

```env
NEYNAR_API_KEY=your-key
NEYNAR_SIGNER_UUID=your-signer
FARCASTER_USERNAME=yourusername
FARCASTER_FID=your-fid
```

## 📊 Agent Dashboard

Your agent's website shows:
- Daily blog posts about what it's thinking
- Contract address & trading links
- Fees generated
- Social links
- Recent posts

## 🛡️ Safety

- Never tags @clanker more than once
- Ignores scam replies asking to launch tokens
- Rate limited to prevent spam
- Only replies to mutual follows or power badge users

## 📝 License

MIT - Fork it, customize it, make it yours.

---

Built by the Farcaster community. Not financial advice. DYOR.