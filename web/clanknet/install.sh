#!/usr/bin/env bash
set -euo pipefail

# Colors
R='\033[0;31m' G='\033[0;32m' Y='\033[1;33m' B='\033[0;34m' C='\033[0;36m' W='\033[1;37m' D='\033[0;90m' N='\033[0m'

print_banner() {
  echo ""
  echo -e "${C}   _____ _             _    _   _      _   ${N}"
  echo -e "${C}  / ____| |           | |  | \\ | |    | |  ${N}"
  echo -e "${C} | |    | | __ _ _ __ | | _|  \\| | ___| |_ ${N}"
  echo -e "${C} | |    | |/ _\` | '_ \\| |/ / . \` |/ _ \\ __|${N}"
  echo -e "${C} | |____| | (_| | | | |   <| |\\  |  __/ |_ ${N}"
  echo -e "${C}  \\_____|_|\\__,_|_| |_|_|\\_\\_| \\_|\\___|\\__|${N}"
  echo ""
  echo -e "${W} Farcaster Agent Kit${D} -- autonomous AI agents on Farcaster${N}"
  echo -e "${D} https://clanknet.ai${N}"
  echo ""
}

fail() { echo -e "${R}ERROR: $1${N}" >&2; exit 1; }
info() { echo -e "${C}>>>${N} $1"; }
ok()   { echo -e "${G}>>>${N} $1"; }
warn() { echo -e "${Y}>>>${N} $1"; }

print_banner

# -- Prerequisites -----------------------------------------------------------
info "Checking prerequisites..."

command -v node >/dev/null 2>&1 || fail "Node.js is not installed. Install v18+ from https://nodejs.org"
NODE_MAJOR=$(node -e "process.stdout.write(String(process.versions.node.split('.')[0]))")
[ "$NODE_MAJOR" -ge 18 ] || fail "Node.js v18+ required (found v$(node -v | tr -d 'v'))"
ok "Node.js v$(node -v | tr -d 'v') detected"

command -v npm >/dev/null 2>&1 || fail "npm is not installed"
ok "npm v$(npm -v) detected"

command -v git >/dev/null 2>&1 || fail "git is not installed"

# -- Clone or use current directory ------------------------------------------
echo ""
echo -e "${W}Where do you want to set up?${N}"
echo -e "  ${G}1)${N} Clone fresh into ./farcaster-agent-kit"
echo -e "  ${G}2)${N} Use current directory (already cloned)"
echo ""
printf "Choose [1/2]: "
read -r CHOICE

if [ "${CHOICE:-1}" = "1" ]; then
  info "Cloning repository..."
  git clone https://github.com/m00npapi/farcaster-agent-kit.git
  cd farcaster-agent-kit
  ok "Cloned into $(pwd)"
else
  if [ ! -f "package.json" ]; then
    fail "No package.json found -- are you inside the farcaster-agent-kit directory?"
  fi
  ok "Using current directory: $(pwd)"
fi

# -- Install dependencies ----------------------------------------------------
info "Installing dependencies..."
npm install
ok "Dependencies installed"

# -- Run setup wizard ---------------------------------------------------------
echo ""
info "Launching setup wizard..."
echo -e "${D}This will configure your Neynar keys, Farcaster identity, and LLM provider.${N}"
echo ""
node scripts/setup.js

# -- Optional PM2 production setup -------------------------------------------
echo ""
echo -e "${W}Would you like to set up PM2 for production? (auto-restart, logs, monitoring)${N}"
printf "Set up PM2? [y/N]: "
read -r PM2_CHOICE

if [[ "${PM2_CHOICE:-n}" =~ ^[Yy]$ ]]; then
  if ! command -v pm2 >/dev/null 2>&1; then
    info "Installing PM2 globally..."
    npm install -g pm2
  fi
  ok "PM2 v$(pm2 -v) ready"

  cat > ecosystem.config.js <<'PMEOF'
module.exports = {
  apps: [{
    name: 'clanknet-agent',
    script: 'scripts/start-agent.js',
    env: { NODE_ENV: 'production' },
    max_memory_restart: '500M',
    restart_delay: 5000,
    max_restarts: 10,
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }],
};
PMEOF
  ok "Created ecosystem.config.js"
fi

# -- Done ---------------------------------------------------------------------
echo ""
echo -e "${G}============================================${N}"
echo -e "${G}  Setup complete!${N}"
echo -e "${G}============================================${N}"
echo ""
echo -e "  ${W}Start your agent:${N}"
echo -e "    ${C}npm start${N}"
echo ""
if [[ "${PM2_CHOICE:-n}" =~ ^[Yy]$ ]]; then
  echo -e "  ${W}Or run with PM2:${N}"
  echo -e "    ${C}pm2 start ecosystem.config.js${N}"
  echo -e "    ${C}pm2 logs clanknet-agent${N}"
  echo ""
fi
echo -e "  ${W}Chat with your agent:${N}"
echo -e "    ${C}npm run chat${N}"
echo ""
echo -e "  ${W}Docs:${N} ${D}https://clanknet.ai${N}"
echo -e "  ${W}GitHub:${N} ${D}https://github.com/m00npapi/farcaster-agent-kit${N}"
echo ""
