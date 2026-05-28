const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const { isAdmin } = require('../utils/roles');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('postmodelannouncement')
    .setDescription('(Admin) Post the announcement button so you can send a message to one or more models via Telegram.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({ content: '❌ No permission.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setColor(0xF4A922)
      .setTitle('📢 Model Announcement')
      .setDescription('Click the button below to send an announcement to one or more models via Telegram.');

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('announce_btn')
        .setLabel('📢 Send Announcement')
        .setStyle(ButtonStyle.Primary),
    );

    await interaction.reply({ embeds: [embed], components: [row] });
  },
};
