#!/bin/bash

# Start Farcaster Agent with PM2
echo "🚀 Starting Farcaster Agent with PM2..."

# Kill any existing Node processes
echo "Cleaning up existing processes..."
pkill -f "start-agent.js" || true
pkill -f "webhook/server.js" || true

# Start with PM2
echo "Starting PM2 processes..."
pm2 delete all 2>/dev/null || true
pm2 start ecosystem.config.js

# Show status
pm2 status

echo "✅ Agent started successfully!"
echo ""
echo "📋 Useful PM2 Commands:"
echo "  pm2 status        - Check if processes are running"
echo "  pm2 logs          - View all logs"
echo "  pm2 logs 0        - View agent logs"
echo "  pm2 logs 1        - View webhook logs"
echo "  pm2 restart all   - Restart all processes"
echo "  pm2 stop all      - Stop all processes"
echo "  pm2 monit         - Interactive monitoring"
echo ""
echo "🔄 Your agent will now:"
echo "  - Keep running even when terminal closes"
echo "  - Restart automatically if it crashes"
echo "  - Post every 30 minutes"
echo "  - Reply to mentions (if they have 5M CLANKNET)"
echo ""
echo "💡 To make it start on system boot, run: pm2 startup"