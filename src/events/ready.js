const { startScheduler } = require('../utils/scheduler');

module.exports = {
  name: 'clientReady',
  once: true,
  execute(client) {
    console.log(`[Clark] Logged in as ${client.user.tag}`);
    startScheduler(client);
  },
};
