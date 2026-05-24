const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db       = require('../database');
const { isAdmin } = require('../utils/roles');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setigname')
    .setDescription('(Admin) Link a bot model to their exact name in the Airtable Instagram Tracker.')
    .addRoleOption(opt =>
      opt.setName('model')
        .setDescription('The Discord role of the model')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('ig_name')
        .setDescription('Exact name as it appears in the "Model" column in Airtable (e.g. AINARA)')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({ content: '❌ No permission.', ephemeral: true });
    }

    const role   = interaction.options.getRole('model');
    const igName = interaction.options.getString('ig_name').trim();

    const model = db.getModelByRoleId(role.id);
    if (!model) {
      return interaction.reply({
        content: `❌ **${role.name}** is not registered as a model. Use \`/setupmodel\` first.`,
        ephemeral: true,
      });
    }

    db.setModelAirtableIgName(model.id, igName);

    return interaction.reply({
      content:
        `✅ **${model.name}** → Airtable Instagram name set to \`${igName}\`\n\n` +
        `From now on, when this model views her stats in Telegram, the bot will look for \`${igName}\` in the Airtable Instagram Tracker.`,
      ephemeral: true,
    });
  },
};
