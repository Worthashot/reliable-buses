module.exports = {
  apps: [
    {
      name: 'reliable-bususe-api', // Choose a descriptive name for your API
      script: 'dist/main.js',
      instances: 'max', // Use all available CPU cores
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3000, // Make sure this matches your server's port
      },
    },
  ],
};