const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { isAdmin } = require('../utils/roles');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('postreelsideas')
    .setDescription('(Admin) Post the "New Reels Ideas" notification button in this channel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({ content: '❌ No permission.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setColor(0xe1306c)
      .setTitle('💡 New Instagram Reels Ideas Available')
      .setDescription(
        'Click the button below to notify a model that new Instagram Reels content ideas are ready for her in **Notion**.'
      )
      .setFooter({ text: 'The model will receive a Telegram notification instantly.' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ideas_reels_btn')
        .setLabel('New Reels Ideas')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🎬')
    );

    await interaction.reply({ content: '✅ Posted.', ephemeral: true });
    await interaction.channel.send({ embeds: [embed], components: [row] });
  },
};
