module.exports = {
  apps: [
    {
      name: 'aurastudio-api',
      cwd: __dirname,
      script: './node_modules/tsx/dist/cli.mjs',
      args: 'server/index.ts',
      interpreter: 'node',
      instances: 1,
      autorestart: true,
      max_memory_restart: '1G',
      time: true,
      env: {
        NODE_ENV: 'production',
        PORT: '8787',
      },
    },
  ],
}
