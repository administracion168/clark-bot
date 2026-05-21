const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { isAdmin } = require('../utils/roles');

const ANNOUNCEMENT_CHANNEL_ID = '1435073772460969994';
const CUSTOM_REQUEST_CHANNEL_ID = '1501717844981977150';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('postannouncement')
    .setDescription('(Admin) Post the Clark introduction announcement for chatters.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({ content: '❌ No permission.', ephemeral: true });
    }

    // Find Chatter role by name
    const chatterRole = interaction.guild.roles.cache.find(
      r => r.name.toLowerCase() === 'chatter'
    );
    const roleMention = chatterRole ? `<@&${chatterRole.id}>` : '@Chatter';

    const message =
      `👋 Hey ${roleMention} —\n\n` +
      `I'm **Clark** — you already know me as the one tracking your shifts every time you clock in and clock out. Same bot, just got a new job.\n\n` +
      `Starting now, I'm also handling **custom content requests**. Whenever a client wants something custom from a model, you go through me instead of coordinating it manually.\n\n` +
      `**Here's how it works:**\n\n` +
      `**1 —** Head over to <#${CUSTOM_REQUEST_CHANNEL_ID}> and click the **+ New Request** button.\n` +
      `**2 —** Choose the model the request is for.\n` +
      `**3 —** Fill in a quick form — what the client wants, the price, how urgent it is, and the client's timeframe.\n` +
      `**4 —** I send it straight to the model's Telegram. She'll accept or decline, and I'll let you know immediately.\n` +
      `**5 —** If she accepts, I'll open a private channel for that request where you can talk to her directly. Once the content is delivered, I close everything automatically.\n\n` +
      `That's it. No chasing, no back and forth outside the server.\n\n` +
      `🔒 All requests are private — only your team sees them.\n` +
      `⚡ Need it fast? Mark it as **Urgent** and the model will see it right away.`;

    try {
      const channel = await interaction.client.channels.fetch(ANNOUNCEMENT_CHANNEL_ID);
      await channel.send({ content: message });
      await interaction.reply({ content: '✅ Announcement posted.', ephemeral: true });
    } catch (err) {
      console.error('[postannouncement] Error:', err);
      await interaction.reply({ content: `❌ Failed to post: ${err.message}`, ephemeral: true });
    }
  },
};
