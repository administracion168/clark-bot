const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const db = require('../database');
const { isAdmin } = require('../utils/roles');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setrole')
    .setDescription('(Admin) Set the Clark department for a user.')
    .addUserOption(opt =>
      opt.setName('user').setDescription('The user to update').setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('department')
        .setDescription('Department to assign')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async handleAutocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const departments = db.getAllDepartments();
    const choices = departments
      .filter(d => d.name.includes(focused) || d.display_name.toLowerCase().includes(focused))
      .map(d => ({ name: d.display_name, value: d.name }));
    await interaction.respond(choices.slice(0, 25));
  },

  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
    }

    const target = interaction.options.getUser('user');
    const deptName = interaction.options.getString('department');
    const dept = db.getDepartment(deptName);

    if (!dept) {
      return interaction.reply({
        content: `❌ Department **${deptName}** doesn't exist. Use \`/newdepartment\` to create it first.`,
        ephemeral: true,
      });
    }

    db.setEmployeeRole(target.id, target.username, dept.name, null);
    return interaction.reply({
      content: `✅ **${target.username}** assigned to department **${dept.display_name}**.`,
      ephemeral: true,
    });
  },
};
