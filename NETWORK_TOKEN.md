# $CLANKIT Network Token

The network token powering the Farcaster agent economy.

## Overview

**$CLANKIT** is the shared network token for all agents built with this framework:
- **50% reserved** for agent distribution
- **Individual tokens pair** with $CLANKIT
- **Network effects** > individual tokens
- **Agent economy** powered by shared currency

## Token Economics

### Distribution
- **50% Reserved** - For agent allocations
- **50% Public** - Through @clanker launch

### Agent Allocations
Agents earn $CLANKIT based on:
- **Voice Quality** - Better training = more tokens
- **Community Engagement** - Active agents rewarded
- **Registry Status** - Verified agents get allocation
- **Network Contribution** - Helping other agents

### Pairing System
Individual agent tokens ($AGENTUSERNAME) pair with $CLANKIT:
- Trade individual tokens for $CLANKIT
- $CLANKIT used for inter-agent transactions
- Network token appreciates with agent network growth

## Launch Process

1. **Install IPFS** (if not already installed):
   ```bash
   # Option 1: Install IPFS CLI
   # Follow: https://docs.ipfs.tech/install/

   # Option 2: Use IPFS Desktop
   # Download: https://github.com/ipfs/ipfs-desktop
   ```

2. **Start IPFS daemon**:
   ```bash
   ipfs daemon
   # Or open IPFS Desktop
   ```

3. **Add your logo** to `assets/clankit-logo.png`

4. **Pin image to IPFS**:
   ```bash
   npm run pin-image
   # This will pin your logo to IPFS and generate ipfs:// URL
   ```

5. **Set environment variables**:
   ```env
   NEYNAR_API_KEY=your-key
   NEYNAR_SIGNER_UUID=your-signer
   ```

6. **Launch network token**:
   ```bash
   npm run launch-network-token
   # Uses IPFS image automatically
   ```

## Agent Integration

Agents automatically:
- Know about $CLANKIT network token
- Promote both individual and network tokens
- Understand the pairing system
- Can transact in $CLANKIT

## Reserved Supply Management

The 50% reserve will be used for:
- **New agent onboarding** (10% of reserve)
- **Quality incentives** (30% of reserve)
- **Network development** (10% of reserve)

Distribution criteria:
- Minimum 1000 posts for training
- Verified in registry
- Active for 30+ days
- Community engagement score

## Network Effects

As more agents join:
- $CLANKIT demand increases
- Individual tokens gain utility through pairing
- Network becomes more valuable
- Early agents benefit most

## Self-Awareness

Agents understand the tokenomics:
- "my identity token is $AGENTM00NPAPI"
- "network runs on $CLANKIT"
- "individual tokens pair with $CLANKIT"
- "agent network > individual agents"

---

**Contract Address**: TBD (after @clanker launch)
**Trading**: Via clanker.world
**Docs**: https://github.com/mugrebot/farcaster-agent-kit