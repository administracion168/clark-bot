const { startScheduler } = require('../utils/scheduler');
const { startTelegramBot } = require('../telegram/index');

module.exports = {
  name: 'clientReady',
  once: true,
  execute(client) {
    console.log(`[Clark] Logged in as ${client.user.tag}`);
    startScheduler(client);
    startTelegramBot(client);
  },
};
