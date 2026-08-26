module.exports = {
  apps: [
    {
      name: 'frimps-mail-sync',
      script: './dist/index.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      restart_delay: 5000,
      max_restarts: 20,
      min_uptime: '30s',
      env: {
        NODE_ENV: 'production',
      },
      // Write logs to files for production
      log_file: '/var/log/frimps-mail-sync/combined.log',
      out_file: '/var/log/frimps-mail-sync/out.log',
      error_file: '/var/log/frimps-mail-sync/err.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      // Graceful shutdown
      kill_timeout: 15000,
      wait_ready: false,
      // Health check via heartbeat file
      exp_backoff_restart_delay: 100,
      // Ensure env is loaded
      env_file: '.env',
    },
  ],
};
