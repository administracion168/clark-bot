const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../database');
const { isAdmin } = require('../utils/roles');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unlinkmodel')
    .setDescription('(Admin) Unlink a model from the bot — she will no longer receive requests or appear in selectors.')
    .addStringOption(opt =>
      opt.setName('model')
        .setDescription('Model to unlink')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async handleAutocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const models = db.getAllModels();
    const choices = models
      .filter(m => m.name.toLowerCase().includes(focused))
      .map(m => ({
        name: `${m.name}${m.linked ? ' ✅ linked' : ' ⏳ not linked'}`,
        value: String(m.id),
      }));
    await interaction.respond(choices.slice(0, 25));
  },

  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({ content: '❌ No permission.', ephemeral: true });
    }

    const modelId = parseInt(interaction.options.getString('model'), 10);
    const model = db.getModel(modelId);

    if (!model) {
      return interaction.reply({ content: '❌ Model not found.', ephemeral: true });
    }

    db.deactivateModel(modelId);

    return interaction.reply({
      content:
        `✅ **${model.name}** has been unlinked from Clark.\n\n` +
        `She will no longer appear in request or ideas selectors, and her Telegram connection has been removed.\n` +
        `Her ticket history is preserved. If you want to re-link her in the future, use \`/setupmodel\` again.`,
      ephemeral: true,
    });
  },
};
