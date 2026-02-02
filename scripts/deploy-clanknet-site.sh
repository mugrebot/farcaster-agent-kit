#!/bin/bash

echo "🚀 Deploying CLANKNET website to Vercel..."

# Check if vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI not found. Installing..."
    npm install -g vercel
fi

# Navigate to the clanknet website directory
cd "$(dirname "$0")/../web/clanknet"

# Deploy to Vercel
echo "📤 Deploying to Vercel..."
vercel --prod --yes

echo ""
echo "✅ Deployment complete!"
echo ""
echo "🔗 To set up custom domain clanknet.ai:"
echo "   1. Run: vercel domains add clanknet.ai"
echo "   2. Add DNS records as shown by Vercel"
echo "   3. Run: vercel alias [deployment-url] clanknet.ai"
echo ""
echo "📝 To update contract address later:"
echo "   1. Edit web/clanknet/index.html"
echo "   2. Update the updateContractAddress('YOUR_CA_HERE') line"
echo "   3. Redeploy with: vercel --prod"