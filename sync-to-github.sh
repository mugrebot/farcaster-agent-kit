#!/bin/bash

# Create GitHub issues to track what needs to be uploaded
echo "📋 Files that need to be synced to GitHub:"
echo ""

# Check for missing files
echo "Core files:"
echo "- core/llm-provider.js (LLM integration)"
echo "- core/anti-clanker.js (Anti-clanker protection)"
echo "- scripts/test-llm.js (LLM testing)"
echo "- AGENT_RULES.md (Agent guidelines)"
echo ""

echo "Updated files:"
echo "- README.md (with LLM documentation)"
echo "- core/agent.js (with LLM integration)"
echo "- package.json (with test-llm script)"
echo ""

echo "🚨 CRITICAL: GitHub repo is missing LLM integration!"
echo "Users cloning mugrebot/farcaster-agent-kit will get broken version"
echo ""
echo "Manual fix required:"
echo "1. Create new files via GitHub web interface"
echo "2. Copy content from local files"
echo "3. Update existing files with new content"