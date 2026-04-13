const clockoutCmd = require('../commands/clockout');
const setRoleCmd = require('../commands/setrole');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    // ── Slash commands ─────────────────────────────────────────────────────
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;

      try {
        await command.execute(interaction, client);
      } catch (err) {
        console.error(`[Command] Error in /${interaction.commandName}:`, err);
        const msg = { content: '❌ An error occurred while running this command.', ephemeral: true };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(msg).catch(() => {});
        } else {
          await interaction.reply(msg).catch(() => {});
        }
      }
      return;
    }

    // ── Modal submits ──────────────────────────────────────────────────────
    if (interaction.isModalSubmit()) {
      try {
        if (interaction.customId.startsWith('clockout_modal_')) {
          await clockoutCmd.handleModal(interaction, client);
          return;
        }

        if (interaction.customId.startsWith('setrole_salary_')) {
          await setRoleCmd.handleModal(interaction, client);
          return;
        }
      } catch (err) {
        console.error('[Modal] Error handling modal submit:', err);
        const msg = { content: '❌ An error occurred while processing your submission.', ephemeral: true };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(msg).catch(() => {});
        } else {
          await interaction.reply(msg).catch(() => {});
        }
      }
    }
  },
};
