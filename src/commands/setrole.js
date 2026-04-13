const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const db = require('../database');
const { isAdmin } = require('../utils/roles');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setrole')
    .setDescription('(Admin) Set the Clark role for a user.')
    .addUserOption(opt =>
      opt.setName('user').setDescription('The user to update').setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('role')
        .setDescription('Role to assign')
        .setRequired(true)
        .addChoices(
          { name: 'Chatter', value: 'chatter' },
          { name: 'Marketing', value: 'marketing' },
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
    }

    const target = interaction.options.getUser('user');
    const role = interaction.options.getString('role');

    if (role === 'marketing') {
      // Show modal to collect weekly salary
      const modal = new ModalBuilder()
        .setCustomId(`setrole_salary_${target.id}_${role}`)
        .setTitle('Set Weekly Salary');

      const salaryInput = new TextInputBuilder()
        .setCustomId('weekly_salary')
        .setLabel('Weekly Salary ($)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g. 300.00')
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(salaryInput));
      return interaction.showModal(modal);
    }

    // Chatter: no salary needed
    db.setEmployeeRole(target.id, target.username, role, null);
    return interaction.reply({
      content: `✅ Role for **${target.username}** set to **${role}**.`,
      ephemeral: true,
    });
  },

  async handleModal(interaction) {
    // customId: setrole_salary_{userId}_{role}
    const parts = interaction.customId.split('_');
    const userId = parts[2];
    const role = parts[3];

    const rawSalary = interaction.fields.getTextInputValue('weekly_salary').trim();
    const salary = parseFloat(rawSalary);

    if (isNaN(salary) || salary < 0) {
      return interaction.reply({
        content: '❌ Invalid salary amount.',
        ephemeral: true,
      });
    }

    // Fetch the username if we can; fall back to the stored username
    let username = userId;
    try {
      const user = await interaction.client.users.fetch(userId);
      username = user.username;
    } catch (_) {}

    db.setEmployeeRole(userId, username, role, salary);
    return interaction.reply({
      content: `✅ Role for **${username}** set to **${role}**. Weekly salary: **$${salary.toFixed(2)}**`,
      ephemeral: true,
    });
  },
};
