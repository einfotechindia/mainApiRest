module.exports = {
  apps: [
    {
      name: "app",
      script: "app.js",
      exec_mode: "cluster",
      instances: "max", // Utilizes all available cores
    },
    {
      name: "cron",
      script: "cron.js",
      exec_mode: "fork",
      instances: 1, // Run on a single core
    },
  ],
};
