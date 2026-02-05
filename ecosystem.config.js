module.exports = {
  apps: [
    {
      name: 'farcaster-agent',
      script: './scripts/start-agent.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production'
      },
      cron_restart: '0 */6 * * *', // Restart every 6 hours to prevent memory leaks
      error_file: './logs/pm2-agent-error.log',
      out_file: './logs/pm2-agent-out.log',
      time: true
    },
    {
      name: 'farcaster-webhook',
      script: './webhooks/server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        WEBHOOK_PORT: 3001
      },
      error_file: './logs/pm2-webhook-error.log',
      out_file: './logs/pm2-webhook-out.log',
      time: true
    },
    {
      name: 'farcaster-admin',
      script: './api/admin-server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        ADMIN_PORT: 3002
      },
      error_file: './logs/pm2-admin-error.log',
      out_file: './logs/pm2-admin-out.log',
      time: true
    }
  ]
};