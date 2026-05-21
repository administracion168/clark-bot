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
    .setName('postrequests')
    .setDescription('(Admin) Post the New Request button in the current channel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({ content: '❌ No permission.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('📋 Custom Requests')
      .setDescription(
        'Need to send a custom request to a model?\n\n' +
        'Click the button below to start. You\'ll select the model and fill in the details.\n\n' +
        '**Available request types:**\n' +
        '🎬 Custom Video  •  📸 Custom Photo  •  🎙️ Custom Audio\n' +
        '❓ Question  •  📋 Other'
      )
      .setFooter({ text: 'Requests are private — only visible to your team.' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('req_new')
        .setLabel('+ New Request')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('📋')
    );

    await interaction.reply({ content: '✅ Posted.', ephemeral: true });
    await interaction.channel.send({ embeds: [embed], components: [row] });
  },
};
