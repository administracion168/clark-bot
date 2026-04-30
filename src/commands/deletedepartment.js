const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const db = require('../database');
const { isAdmin } = require('../utils/roles');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('deletedepartment')
    .setDescription('(Admin) Delete a department and all its Discord channels, category and role.')
    .addStringOption(opt =>
      opt.setName('department')
        .setDescription('Department to delete')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async handleAutocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const departments = db.getAllDepartments().filter(d => d.name !== 'chatter');
    const choices = departments
      .filter(d => d.name.includes(focused) || d.display_name.toLowerCase().includes(focused))
      .map(d => ({ name: d.display_name, value: d.name }));
    await interaction.respond(choices.slice(0, 25));
  },

  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
    }

    const deptName = interaction.options.getString('department');

    if (deptName === 'chatter') {
      return interaction.reply({
        content: '❌ The **chatter** department cannot be deleted.',
        ephemeral: true,
      });
    }

    const dept = db.getDepartment(deptName);
    if (!dept) {
      return interaction.reply({
        content: `❌ Department **${deptName}** not found.`,
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    const guild = interaction.guild;
    const results = [];
    const errors = [];

    // Delete channels
    for (const [label, channelId] of [
      ['chat', dept.chat_channel_id],
      ['logs', dept.log_channel_id],
      ['info', dept.info_channel_id],
    ]) {
      if (!channelId) continue;
      try {
        const ch = await guild.channels.fetch(channelId).catch(() => null);
        if (ch) {
          await ch.delete(`Clark: department "${deptName}" deleted by ${interaction.user.username}`);
          results.push(`✅ #${deptName}-${label} deleted`);
        } else {
          results.push(`⚠️ #${deptName}-${label} not found (already deleted?)`);
        }
      } catch (err) {
        errors.push(`❌ Failed to delete #${deptName}-${label}: ${err.message}`);
      }
    }

    // Delete category (after channels, so it's empty)
    // Find category by name since we don't store it
    try {
      const category = guild.channels.cache.find(
        c => c.name === dept.display_name.toUpperCase() && c.type === 4
      );
      if (category) {
        await category.delete(`Clark: department "${deptName}" deleted`);
        results.push(`✅ Category **${dept.display_name.toUpperCase()}** deleted`);
      }
    } catch (err) {
      errors.push(`❌ Failed to delete category: ${err.message}`);
    }

    // Delete role
    if (dept.role_id) {
      try {
        const role = await guild.roles.fetch(dept.role_id).catch(() => null);
        if (role) {
          await role.delete(`Clark: department "${deptName}" deleted by ${interaction.user.username}`);
          results.push(`✅ Role **${dept.display_name}** deleted`);
        } else {
          results.push(`⚠️ Role not found (already deleted?)`);
        }
      } catch (err) {
        errors.push(`❌ Failed to delete role: ${err.message}`);
      }
    }

    // Remove from database
    db.deleteDepartment(deptName);
    results.push(`✅ Department **${dept.display_name}** removed from database`);

    const allLines = [...results, ...errors].join('\n');
    return interaction.editReply(
      `🗑️ Department **${dept.display_name}** deletion complete:\n\n${allLines}`
    );
  },
};
