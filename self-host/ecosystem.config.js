module.exports = {
  apps: [
    {
      name: "api-server",
      script: "/opt/funnel-app/api-server.js",
      env_file: "/opt/funnel-app/.env",
      watch: false,
      instances: 1,
      autorestart: true,
      max_restarts: 10,
    },
    {
      name: "postgrest",
      script: "/usr/local/bin/postgrest",
      args: "/opt/funnel-app/postgrest.conf",
      watch: false,
      autorestart: true,
      max_restarts: 10,
    },
    {
      name: "gotrue",
      script: "/usr/local/bin/gotrue",
      env_file: "/opt/funnel-app/.env",
      watch: false,
      autorestart: true,
      max_restarts: 10,
    },
  ],
};
