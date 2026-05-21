const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('See all available commands for your role.'),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('📖 Clark — Your Commands')
      .setDescription('Here\'s everything you can do with Clark.')
      .addFields(
        {
          name: '🟢 `/clockin`',
          value: 'Start your shift. Clark records the exact time you clock in.',
        },
        {
          name: '🔴 `/clockout`',
          value: 'End your shift. You\'ll fill in a quick summary of what you worked on. Clark logs everything and posts it to your department\'s log channel.',
        },
        {
          name: '📊 `/mystats`',
          value: 'Check your hours and earnings for the current week at any time.',
        },
      )
      .setFooter({ text: 'All responses are private — only you can see them.' });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
