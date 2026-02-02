# 🚀 Deploying to GitHub Safely

This guide ensures your agent kit is deployed to GitHub without exposing secrets.

## Pre-Deployment Checklist

- [ ] Run `npm run security-check` - MUST pass with 0 critical issues
- [ ] Verify `.env` is NOT staged for commit
- [ ] Check `.gitignore` includes all sensitive files
- [ ] Review all files for hardcoded secrets
- [ ] Ensure API keys are in environment variables only

## Automatic Deployment

```bash
# Run safety checks and deploy
npm run safe-deploy
```

This will:
1. Run security scanner
2. Check for exposed secrets
3. Create GitHub repository
4. Push safe code only

## Manual Deployment

### 1. Run Security Check
```bash
npm run security-check
```

Fix any issues before proceeding.

### 2. Initialize Git
```bash
git init
git add .
git status  # Review what will be committed
```

### 3. Verify No Secrets
```bash
# Should NOT see:
# - .env
# - data/*.json
# - Any file with keys/tokens
```

### 4. Create Repository
```bash
# Using GitHub CLI
gh repo create yourusername/farcaster-agent-kit --public

# Or manually at github.com/new
```

### 5. Push Code
```bash
git commit -m "Initial agent kit deployment"
git remote add origin https://github.com/yourusername/farcaster-agent-kit.git
git push -u origin main
```

## What Gets Deployed

✅ **SAFE TO DEPLOY:**
- Source code (JS files)
- Documentation
- Package.json
- Templates
- .gitignore
- Example configs

❌ **NEVER DEPLOY:**
- .env files
- API keys
- Private keys
- data/ directory
- Token information
- Webhook secrets
- Profile data

## GitHub Secrets (for CI/CD)

If using GitHub Actions, add secrets:

1. Go to Settings → Secrets
2. Add:
   - `NEYNAR_API_KEY`
   - `NEYNAR_SIGNER_UUID`
   - `FARCASTER_FID`

Never put these in code!

## After Deployment

1. **Make repo public** (if desired)
2. **Add description**: "Autonomous Farcaster agent with token launch"
3. **Add topics**: `farcaster`, `agent`, `ai`, `base`, `clanker`
4. **Update README** with your agent's specifics
5. **Submit PR** to main registry

## Troubleshooting

### "Secrets detected!"
- Check the reported files
- Move values to .env
- Add file to .gitignore

### "Git tracking .env"
```bash
git rm --cached .env
git commit -m "Remove .env from tracking"
```

### "Already committed secrets"
```bash
# Remove from history (destructive!)
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch .env" \
  --prune-empty --tag-name-filter cat -- --all
```

## Security Best Practices

1. **Use environment variables** for all secrets
2. **Never hardcode** API keys in source
3. **Review every file** before committing
4. **Use .env.example** as template
5. **Enable 2FA** on GitHub
6. **Rotate keys** if exposed

## Emergency: Exposed Secrets

If you accidentally expose secrets:

1. **Immediately revoke** the exposed keys
2. **Generate new keys** from Neynar
3. **Update .env** locally
4. **Never try to "fix"** by deleting - assume compromised
5. **Monitor** for unauthorized usage

---

Remember: Once on GitHub, assume it's public forever, even if deleted.