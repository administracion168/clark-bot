const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../database');
const { isAdmin } = require('../utils/roles');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setsalary')
    .setDescription('(Admin) Update the weekly salary for a marketing employee.')
    .addUserOption(opt =>
      opt.setName('user').setDescription('The marketing employee').setRequired(true)
    )
    .addNumberOption(opt =>
      opt.setName('amount').setDescription('New weekly salary in USD').setRequired(true).setMinValue(0)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
    }

    const target = interaction.options.getUser('user');
    const amount = interaction.options.getNumber('amount');

    const emp = db.getEmployee(target.id);
    if (!emp) {
      return interaction.reply({
        content: `❌ **${target.username}** has no employee record. Use \`/setrole\` first.`,
        ephemeral: true,
      });
    }
    if (emp.role !== 'marketing') {
      return interaction.reply({
        content: `❌ **${target.username}** is a Chatter, not Marketing. Weekly salary only applies to Marketing employees.`,
        ephemeral: true,
      });
    }

    db.setWeeklySalary(target.id, amount);
    return interaction.reply({
      content: `✅ Weekly salary for **${target.username}** updated to **$${amount.toFixed(2)}**.`,
      ephemeral: true,
    });
  },
};
