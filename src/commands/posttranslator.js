const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} = require('discord.js');
const { isAdmin } = require('../utils/roles');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('posttranslator')
    .setDescription('(Admin) Post the AI translator panel in this channel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({ content: '❌ No permission.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🌐 AI Translator')
      .setDescription(
        'Translate your message with AI.\n\n' +
        '🇺🇸 **English → Spanish** — Translate from English to Spanish\n' +
        '🇪🇸 **Spanish → English** — Translate from Spanish to English\n\n' +
        '*Your translation will only be visible to you.*',
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('translate_en_es')
        .setLabel('🇺🇸 → 🇪🇸  English to Spanish')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('translate_es_en')
        .setLabel('🇪🇸 → 🇺🇸  Spanish to English')
        .setStyle(ButtonStyle.Secondary),
    );

    await interaction.reply({ embeds: [embed], components: [row] });
  },
};
