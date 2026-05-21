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
    .setName('postredditideas')
    .setDescription('(Admin) Post the "New Reddit Ideas" notification button in this channel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({ content: '❌ No permission.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setColor(0xff4500)
      .setTitle('💡 New Reddit Ideas Available')
      .setDescription(
        'Click the button below to notify a model that new Reddit content ideas are ready for her in **Notion**.'
      )
      .setFooter({ text: 'The model will receive a Telegram notification instantly.' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ideas_reddit_btn')
        .setLabel('New Reddit Ideas')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('💡')
    );

    await interaction.reply({ content: '✅ Posted.', ephemeral: true });
    await interaction.channel.send({ embeds: [embed], components: [row] });
  },
};
