const clockoutCmd = require('../commands/clockout');
const setRoleCmd = require('../commands/setrole');
const { handleTicketInteraction } = require('../handlers/ticketHandler');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    // ── Ticket system (buttons, selects, modals prefixed with req_) ──────────
    const customId = interaction.customId ?? '';
    if (
      customId === 'req_new' ||
      customId === 'req_select_model' ||
      customId.startsWith('req_select_type_') ||
      customId.startsWith('req_modal_') ||
      customId.startsWith('req_reply_') ||
      customId.startsWith('req_replymsg_') ||
      customId.startsWith('req_received_')
    ) {
      try {
        await handleTicketInteraction(interaction);
      } catch (err) {
        console.error('[Ticket] Interaction error:', err);
        const msg = { content: '❌ Something went wrong with this request.', ephemeral: true };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(msg).catch(() => {});
        } else {
          await interaction.reply(msg).catch(() => {});
        }
      }
      return;
    }

    // ── Autocomplete ───────────────────────────────────────────────────────
    if (interaction.isAutocomplete()) {
      const command = client.commands.get(interaction.commandName);
      if (command?.handleAutocomplete) {
        try {
          await command.handleAutocomplete(interaction);
        } catch (err) {
          console.error('[Autocomplete] Error:', err);
        }
      }
      return;
    }

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
