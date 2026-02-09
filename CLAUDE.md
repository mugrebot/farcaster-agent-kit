# CLAUDE.md — CLANKNET Engineering Preferences

## Language & Runtime
- Node.js, CommonJS (`module.exports` / `require`), ethers v5
- Vercel serverless functions (Hobby plan: 12 max, 10s timeout)
- No TypeScript, no ESM `export default` in API routes

## Style
- Minimal dependencies; prefer stdlib + ethers
- No unnecessary abstractions; inline when it's clearer
- No comments on obvious code; comment only non-obvious "why"
- DRY: shared utilities live in `api/_shared/`
- Constants in `api/_shared/constants.js` — never duplicate addresses/prices

## Security
- ERC-8004 auth: 90-second timestamp window, ethers.utils.sha256 for body hash
- Never log private keys or secrets
- Rate limit all public endpoints (Upstash Redis, in-memory fallback)
- Validate all addresses with ethers.utils.isAddress()
- Nonce dedup persists in Redis (not just in-memory)

## Testing
- Jest, `testEnvironment: 'node'`
- Tests in `__tests__/` directory
- Mock ethers, Redis, fetch — never hit real RPCs in tests

## Deployment
- Deploy: `cd web/clanknet && vercel --prod`
- Routes consolidated: skills.js, auth.js, admin.js handle sub-routes by URL
- `api/_shared/` (underscore prefix) excluded from Vercel function count
