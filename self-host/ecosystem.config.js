module.exports = {
  apps: [
    {
      name: "funnel-api",
      script: "/opt/funnel-app/api-server.js",
      cwd: "/opt/funnel-app",
      watch: false,
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      // env vars are inherited from shell (set -a; source .env; set +a)
    },
    {
      name: "funnel-postgrest",
      script: "/usr/local/bin/postgrest",
      args: "/opt/funnel-app/postgrest.conf",
      watch: false,
      autorestart: true,
      max_restarts: 10,
    },
  ],
};
