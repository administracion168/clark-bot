const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../database');
const { isAdmin } = require('../utils/roles');
const crypto = require('crypto');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setupmodel')
    .setDescription('(Admin) Register a Discord role as a model for the request system.')
    .addRoleOption(opt =>
      opt.setName('role')
        .setDescription('The Discord role that represents this model')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({ content: '❌ No permission.', ephemeral: true });
    }

    const role = interaction.options.getRole('role');
    const existing = db.getModelByRoleId(role.id);

    if (existing) {
      const status = existing.linked
        ? '✅ already linked to Telegram'
        : `⏳ pending Telegram link — code: \`CLARK-${existing.link_code}\``;
      return interaction.reply({
        content: `ℹ️ **${role.name}** is already registered as a model. Status: ${status}`,
        ephemeral: true,
      });
    }

    const code = crypto.randomBytes(3).toString('hex').toUpperCase();
    db.createModel(role.name, role.id, code);

    return interaction.reply({
      content:
        `✅ Model **${role.name}** registered!\n\n` +
        `📲 Send this code to the model — she needs to open the Clark Telegram bot and send:\n\n` +
        `\`/start CLARK-${code}\`\n\n` +
        `Once she does that, she'll start receiving requests automatically.`,
      ephemeral: true,
    });
  },
};
