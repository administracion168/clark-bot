const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { isAdmin } = require('../utils/roles');
const { sendWeeklyReport } = require('../utils/report');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('weekreport')
    .setDescription('(Admin) Manually trigger the weekly report.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      await sendWeeklyReport(interaction.client);
      return interaction.editReply('✅ Weekly report sent to the report channel.');
    } catch (err) {
      console.error('[/weekreport]', err);
      return interaction.editReply('❌ Failed to generate the report. Check the bot logs.');
    }
  },
};
