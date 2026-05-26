const clockoutCmd = require('../commands/clockout');
const setRoleCmd = require('../commands/setrole');
const { handleTicketInteraction } = require('../handlers/ticketHandler');
const { handleContentIdeasInteraction, handleIdeasModalSubmit } = require('../handlers/contentIdeasHandler');
const { handleGetNumberInteraction } = require('../handlers/getnumberHandler');

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
      customId.startsWith('req_received_') ||
      customId.startsWith('req_cancel_') ||
      customId.startsWith('req_cancelreason_')
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

    // ── GetNumber buttons (ig_get_number_btn / num_svc1 / num_svc2 / num_svc3 / num_use_ / num_cancel_) ──────
    if (
      customId === 'ig_get_number_btn' ||
      customId === 'num_svc1' ||
      customId === 'num_svc2' ||
      customId === 'num_svc3' ||
      customId.startsWith('num_use_') ||
      customId.startsWith('num_cancel_')
    ) {
      try {
        await handleGetNumberInteraction(interaction);
      } catch (err) {
        console.error('[GetNumber] Interaction error:', err);
        const msg = { content: '❌ Something went wrong.', ephemeral: true };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(msg).catch(() => {});
        } else {
          await interaction.reply(msg).catch(() => {});
        }
      }
      return;
    }

    // ── Content Ideas buttons/selects ──────────────────────────────────────
    if (
      customId === 'ideas_reddit_btn' ||
      customId === 'ideas_reels_btn' ||
      customId === 'ideas_select_reddit' ||
      customId === 'ideas_select_reels'
    ) {
      try {
        await handleContentIdeasInteraction(interaction);
      } catch (err) {
        console.error('[Ideas] Interaction error:', err);
        const msg = { content: '❌ Something went wrong.', ephemeral: true };
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

        if (
          interaction.customId.startsWith('ideas_modal_reddit_') ||
          interaction.customId.startsWith('ideas_modal_reels_')
        ) {
          await handleIdeasModalSubmit(interaction);
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
