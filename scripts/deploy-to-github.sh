#!/bin/bash

echo "🚀 GitHub Deployment Script for Farcaster Agent Kit"
echo "===================================================="
echo ""

# Safety checks
echo "🔒 Running safety checks..."

# Check for .env file
if [ -f ".env" ]; then
    echo "✅ .env file found (will NOT be committed)"
else
    echo "⚠️  No .env file found - run 'npm run setup' first"
fi

# Check .gitignore exists
if [ ! -f ".gitignore" ]; then
    echo "❌ .gitignore file missing - critical for security!"
    exit 1
fi

# Scan for potential secrets in staged files
echo "🔍 Scanning for potential secrets..."

# Function to check for secrets
check_secrets() {
    local file=$1

    # Skip binary files
    if file "$file" | grep -q "binary"; then
        return 0
    fi

    # Check for common secret patterns
    if grep -qE "(api[_-]?key|secret|token|password|private[_-]?key|bearer|auth)" "$file" 2>/dev/null; then
        if grep -qE "([a-zA-Z0-9]{32,}|sk_[a-zA-Z0-9]{32,}|pk_[a-zA-Z0-9]{32,})" "$file" 2>/dev/null; then
            echo "⚠️  Potential secret found in: $file"
            return 1
        fi
    fi

    # Check for Neynar API keys specifically
    if grep -qE "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}" "$file" 2>/dev/null; then
        echo "⚠️  Potential API key found in: $file"
        return 1
    fi

    return 0
}

# Check all files that would be committed
SECRETS_FOUND=0
for file in $(git ls-files); do
    if [ -f "$file" ]; then
        if ! check_secrets "$file"; then
            SECRETS_FOUND=1
        fi
    fi
done

if [ $SECRETS_FOUND -eq 1 ]; then
    echo ""
    echo "❌ Potential secrets detected!"
    echo "   Please review the files above and ensure no secrets are exposed."
    echo "   Add sensitive files to .gitignore if needed."
    echo ""
    read -p "Continue anyway? (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo "✅ Security scan complete"
echo ""

# Get GitHub username
echo "📝 GitHub Configuration"
CURRENT_USER=$(git config user.name)
echo "   Current git user: $CURRENT_USER"

read -p "Enter your GitHub username (or press Enter for '$CURRENT_USER'): " GITHUB_USER
GITHUB_USER=${GITHUB_USER:-$CURRENT_USER}

read -p "Repository name (default: farcaster-agent-kit): " REPO_NAME
REPO_NAME=${REPO_NAME:-farcaster-agent-kit}

read -p "Make repository public? (y/n, default y): " IS_PUBLIC
IS_PUBLIC=${IS_PUBLIC:-y}

echo ""
echo "📦 Repository will be created as:"
echo "   https://github.com/$GITHUB_USER/$REPO_NAME"
echo "   Visibility: $([ "$IS_PUBLIC" = "y" ] && echo "Public" || echo "Private")"
echo ""

read -p "Proceed with deployment? (y/n): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Deployment cancelled"
    exit 1
fi

# Initialize git if not already
if [ ! -d ".git" ]; then
    echo "🎯 Initializing git repository..."
    git init
fi

# Add all files (respecting .gitignore)
echo "📂 Staging files..."
git add .

# Show what will be committed
echo ""
echo "📋 Files to be committed:"
git status --short

# Create commit
echo ""
echo "💾 Creating commit..."
git commit -m "🤖 Initial Farcaster Agent Kit deployment

- Autonomous agent framework
- Voice learning from post history
- Token launch via @clanker
- Agent registry system
- Inter-agent communication
- Rate limiting and safety features

Built with Farcaster Agent Kit"

# Create GitHub repo using gh CLI if available
if command -v gh &> /dev/null; then
    echo "🌐 Creating GitHub repository..."

    if [ "$IS_PUBLIC" = "y" ]; then
        gh repo create "$GITHUB_USER/$REPO_NAME" --public --source=. --remote=origin --push
    else
        gh repo create "$GITHUB_USER/$REPO_NAME" --private --source=. --remote=origin --push
    fi

    echo "✅ Repository created and pushed!"
else
    echo ""
    echo "⚠️  GitHub CLI not found. Please install it or manually create the repo:"
    echo ""
    echo "1. Go to https://github.com/new"
    echo "2. Create repository: $REPO_NAME"
    echo "3. Run these commands:"
    echo ""
    echo "   git remote add origin https://github.com/$GITHUB_USER/$REPO_NAME.git"
    echo "   git branch -M main"
    echo "   git push -u origin main"
fi

echo ""
echo "🎉 Deployment complete!"
echo ""
echo "📌 Next steps:"
echo "1. Visit: https://github.com/$GITHUB_USER/$REPO_NAME"
echo "2. Add a description and topics"
echo "3. Update README with your agent's info"
echo "4. Register your agent by PR to the main registry"
echo ""
echo "🔒 Security reminder:"
echo "   - Never commit .env files"
echo "   - Keep API keys in environment variables"
echo "   - Use GitHub Secrets for CI/CD"